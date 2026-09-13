// 多用户存储层（SQLite）。
//
// 设计要点：
//   - 用 Node 22 自带的 node:sqlite，不引入原生依赖（生产 Node v22.18.0 已实测可用）。
//   - 只存密码哈希（scrypt + 每用户随机盐），永不存明文；会话只存 token 的 sha256。
//   - 会话落库，服务重启不掉线；支持按用户吊销（禁用/改密即踢下线）。
//   - 管理操作写审计表，便于事后追溯。
//
// 数据库位置：<root>/.v3-users/users.db（目录 700、文件 600，仅服务账号可读）。
import crypto from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;           // 与既有管理端一致：8 小时滑动过期
const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/;   // 3–32 位，字母数字开头
export const ROLE_ADMIN = 'admin';
export const ROLE_EDITOR = 'editor';
export const STATUS_PENDING = 'pending';
export const STATUS_ACTIVE = 'active';
export const STATUS_DISABLED = 'disabled';

// V3_USERS_DIR 用来把账号库挪出工程目录：浏览器/端到端套件跑在仓库根目录上，
// 一旦真的在仓库里建出 admin 账号，后续依赖"本地免登录"的套件会全部 401。
// 生产不设置这个变量，仍然落在 <root>/.v3-users。
export function userDbDir(root) { return process.env.V3_USERS_DIR ? path.resolve(process.env.V3_USERS_DIR) : path.join(root, '.v3-users'); }
export function userDbFile(root) { return path.join(userDbDir(root), 'users.db'); }

// ---------- 密码 ----------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  let actual;
  try {
    actual = crypto.scryptSync(String(password), salt, expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  } catch { return false; }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function passwordProblem(password) {
  const value = String(password || '');
  if (value.length < 8) return '密码至少 8 位';
  if (value.length > 200) return '密码过长';
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) return '密码需同时包含字母和数字';
  return null;
}

export function usernameProblem(username) {
  const value = String(username || '').trim();
  if (!USERNAME_RE.test(value)) return '用户名需 3–32 位，只能用字母、数字、下划线、点或短横线，且以字母或数字开头';
  return null;
}

// ---------- 数据库 ----------
export function openUserDb(root) {
  const dir = userDbDir(root);
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true, mode: 0o700 }); }
    catch (error) {
      // 生产实测：应用根目录属主是 root、权限 755 时，以 www-data 运行的服务
      // 无法在根目录下新建目录，服务会在启动时直接退出。这里给出可操作的提示，
      // 而不是让运维去猜 EACCES。
      if (error?.code === 'EACCES' || error?.code === 'EPERM') {
        throw new Error(`无法创建用户数据库目录 ${dir}（${error.code}）。请先以 root 执行：`
          + `mkdir -p ${dir} && chown www-data:www-data ${dir} && chmod 700 ${dir}`);
      }
      throw error;
    }
  }
  try { chmodSync(dir, 0o700); } catch { }
  const file = userDbFile(root);
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 4000');
  ensureSchema(db);
  // users.db 之外，SQLite 还会创建 -wal / -shm（预写日志与共享内存），
  // 它们同样可能含有密码哈希与会话令牌。默认 umask 下是 644，必须一并收紧。
  try { chmodSync(file, 0o600); } catch { }
  for (const suffix of ['-wal', '-shm', '-journal']) {
    try { if (existsSync(file + suffix)) chmodSync(file + suffix, 0o600); } catch { }
  }
  return db;
}

export function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      display_name  TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'editor',
      status        TEXT NOT NULL DEFAULT 'pending',
      can_publish   INTEGER NOT NULL DEFAULT 0,
      journal_name  TEXT NOT NULL DEFAULT '',
      publisher     TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL,
      approved_at   TEXT,
      approved_by   TEXT,
      last_login_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash   TEXT PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   TEXT NOT NULL,
      expires_at   INTEGER NOT NULL,
      last_seen_at TEXT NOT NULL,
      user_agent   TEXT NOT NULL DEFAULT '',
      ip           TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    -- 期刊归属：多用户的"独立创作空间"以这张表为准（issue.json 保持原样，
    -- 不把内部元数据写进会被发布的文件）。
    CREATE TABLE IF NOT EXISTS issue_owners (
      issue_id   TEXT PRIMARY KEY,
      owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_issue_owners_owner ON issue_owners(owner_id);
    CREATE TABLE IF NOT EXISTS audit_log (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      at       TEXT NOT NULL,
      actor    TEXT NOT NULL DEFAULT '',
      actor_id INTEGER,
      action   TEXT NOT NULL,
      target   TEXT NOT NULL DEFAULT '',
      detail   TEXT NOT NULL DEFAULT ''
    );
    -- 忘记密码：用户先提交申请，管理员再签发一次性重置码。
    -- 系统没有邮件/短信通道，所以重置码必须由管理员当面或电话转达；
    -- 这也和"注册需要管理员审批"的账号策略保持一致。
    -- 只存重置码的 sha256，管理员界面之外无法再读出明文码。
    CREATE TABLE IF NOT EXISTS password_resets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      ip         TEXT NOT NULL DEFAULT '',
      code_hash  TEXT,
      issued_at  TEXT,
      issued_by  TEXT NOT NULL DEFAULT '',
      expires_at INTEGER,
      used_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
    CREATE INDEX IF NOT EXISTS idx_password_resets_open ON password_resets(used_at);
  `);
}

const now = () => new Date().toISOString();
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');

export function audit(db, { actor = '', actorId = null, action, target = '', detail = '' }) {
  try { db.prepare('INSERT INTO audit_log(at,actor,actor_id,action,target,detail) VALUES (?,?,?,?,?,?)').run(now(), String(actor), actorId, String(action), String(target), String(detail).slice(0, 500)); } catch { }
}

// 去掉密码哈希等敏感字段，可安全回给前端
export function publicUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    username: String(row.username),
    displayName: String(row.display_name || ''),
    role: String(row.role),
    status: String(row.status),
    canPublish: Number(row.can_publish) === 1,
    journalName: String(row.journal_name || ''),
    publisher: String(row.publisher || ''),
    createdAt: String(row.created_at || ''),
    approvedAt: row.approved_at || null,
    lastLoginAt: row.last_login_at || null,
  };
}

export function isAdmin(user) { return Boolean(user && user.role === ROLE_ADMIN); }

// ---------- 用户 ----------
// 用户名按不区分大小写查找：公开分区用 username.toLowerCase() 作为 slug，
// 若允许 "Alice" 与 "alice" 并存，两个账号会抢同一个 /u/<slug>/ 命名空间。
export function findUserByName(db, username) {
  return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(String(username || '').trim()) || null;
}
export function findUserById(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id)) || null;
}
export function listUsers(db) {
  return db.prepare('SELECT * FROM users ORDER BY (role=\'admin\') DESC, id ASC').all().map(publicUser);
}
export function countUsers(db, { status } = {}) {
  const row = status
    ? db.prepare('SELECT COUNT(*) AS n FROM users WHERE status = ?').get(status)
    : db.prepare('SELECT COUNT(*) AS n FROM users').get();
  return Number(row?.n || 0);
}

export function createUser(db, { username, password, displayName = '', journalName = '', publisher = '', role = ROLE_EDITOR, status = STATUS_PENDING, canPublish = false, approvedBy = null }) {
  const name = String(username || '').trim();
  const bad = usernameProblem(name);
  if (bad) throw Object.assign(new Error(bad), { code: 'INVALID_USERNAME' });
  const badPw = passwordProblem(password);
  if (badPw) throw Object.assign(new Error(badPw), { code: 'INVALID_PASSWORD' });
  if (findUserByName(db, name)) throw Object.assign(new Error('该用户名已被使用'), { code: 'USERNAME_TAKEN' });
  const active = status === STATUS_ACTIVE;
  db.prepare(`INSERT INTO users(username,display_name,password_hash,role,status,can_publish,journal_name,publisher,created_at,approved_at,approved_by)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(name, String(displayName || name).slice(0, 60), hashPassword(password), role, status,
      canPublish ? 1 : 0, String(journalName || '').slice(0, 120), String(publisher || '').slice(0, 120),
      now(), active ? now() : null, approvedBy);
  return findUserByName(db, name);
}

export function setUserStatus(db, id, status, actor = '') {
  if (![STATUS_ACTIVE, STATUS_PENDING, STATUS_DISABLED].includes(status)) throw Object.assign(new Error('状态无效'), { code: 'INVALID_STATUS' });
  const row = findUserById(db, id);
  if (!row) throw Object.assign(new Error('用户不存在'), { code: 'USER_NOT_FOUND' });
  const approving = status === STATUS_ACTIVE && row.status !== STATUS_ACTIVE;
  db.prepare('UPDATE users SET status = ?, approved_at = COALESCE(?, approved_at), approved_by = COALESCE(?, approved_by) WHERE id = ?')
    .run(status, approving ? now() : null, approving ? actor : null, Number(id));
  // 禁用立即踢下线
  if (status !== STATUS_ACTIVE) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(Number(id));
  audit(db, { actor, actorId: null, action: `user.status.${status}`, target: row.username });
  return findUserById(db, id);
}

export function setUserCanPublish(db, id, canPublish, actor = '') {
  const row = findUserById(db, id);
  if (!row) throw Object.assign(new Error('用户不存在'), { code: 'USER_NOT_FOUND' });
  db.prepare('UPDATE users SET can_publish = ? WHERE id = ?').run(canPublish ? 1 : 0, Number(id));
  audit(db, { actor, action: canPublish ? 'user.publish.grant' : 'user.publish.revoke', target: row.username });
  return findUserById(db, id);
}

export function setUserPassword(db, id, password, actor = '') {
  const bad = passwordProblem(password);
  if (bad) throw Object.assign(new Error(bad), { code: 'INVALID_PASSWORD' });
  const row = findUserById(db, id);
  if (!row) throw Object.assign(new Error('用户不存在'), { code: 'USER_NOT_FOUND' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), Number(id));
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(Number(id));   // 改密后旧会话全部失效
  audit(db, { actor, action: 'user.password.reset', target: row.username });
  return findUserById(db, id);
}

export function setUserProfile(db, id, { displayName, journalName, publisher } = {}, actor = '') {
  const row = findUserById(db, id);
  if (!row) throw Object.assign(new Error('用户不存在'), { code: 'USER_NOT_FOUND' });
  if (displayName !== undefined) db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(String(displayName).slice(0, 60), Number(id));
  if (journalName !== undefined) db.prepare('UPDATE users SET journal_name = ? WHERE id = ?').run(String(journalName).slice(0, 120), Number(id));
  if (publisher !== undefined) db.prepare('UPDATE users SET publisher = ? WHERE id = ?').run(String(publisher).slice(0, 120), Number(id));
  audit(db, { actor, action: 'user.profile.update', target: row.username });
  return findUserById(db, id);
}

export function deleteUser(db, id, actor = '') {
  const row = findUserById(db, id);
  if (!row) throw Object.assign(new Error('用户不存在'), { code: 'USER_NOT_FOUND' });
  if (row.role === ROLE_ADMIN) throw Object.assign(new Error('不能删除管理员账号'), { code: 'CANNOT_DELETE_ADMIN' });
  // 名下还有期刊时先别删：issue_owners 会随外键级联消失，期刊随即变成"无主"，
  // 下一次启动的归属对齐会把它挂到管理员名下 —— 已发布的用户分区也会因此变位置。
  const owned = Number(db.prepare('SELECT COUNT(*) AS n FROM issue_owners WHERE owner_id = ?').get(Number(id))?.n || 0);
  if (owned > 0) throw Object.assign(new Error(`该账号名下还有 ${owned} 期期刊，请先把这些期刊转移给其他账号或删除，再删除账号`), { code: 'USER_HAS_ISSUES', count: owned });
  db.prepare('DELETE FROM users WHERE id = ?').run(Number(id));   // 会话由外键级联删除
  audit(db, { actor, action: 'user.delete', target: row.username });
  return true;
}

export function touchLastLogin(db, id) {
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), Number(id));
}

// ---------- 会话 ----------
export function createSession(db, userId, { ttlMs = SESSION_TTL_MS, userAgent = '', ip = '' } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + ttlMs;
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at,user_agent,ip) VALUES (?,?,?,?,?,?,?)')
    .run(sha256(token), Number(userId), now(), expiresAt, now(), String(userAgent).slice(0, 200), String(ip).slice(0, 60));
  return { token, expiresAt, ttlMs };
}

// 取会话：滑动续期；过期/被删除返回 null
export function sessionUser(db, token, { ttlMs = SESSION_TTL_MS } = {}) {
  if (!token) return null;
  const key = sha256(token);
  const row = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(key);
  if (!row) return null;
  if (Number(row.expires_at) <= Date.now()) { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(key); return null; }
  const user = findUserById(db, row.user_id);
  if (!user || user.status !== STATUS_ACTIVE) { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(key); return null; }
  const expiresAt = Date.now() + ttlMs;
  db.prepare('UPDATE sessions SET expires_at = ?, last_seen_at = ? WHERE token_hash = ?').run(expiresAt, now(), key);
  return { user, token, expiresAt };
}

export function destroySession(db, token) {
  if (!token) return false;
  const info = db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  return Number(info.changes || 0) > 0;
}

export function purgeExpiredSessions(db) {
  const info = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  return Number(info.changes || 0);
}

// ---------- 会话可见性 ----------
// 会话表以 token_hash 为主键，这里用 rowid 作为对外可见的会话编号（不含任何令牌信息）。
function sessionRow(row, currentHash) {
  const ua = String(row.user_agent || '');
  return {
    id: Number(row.id),
    createdAt: String(row.created_at || ''),
    lastSeenAt: String(row.last_seen_at || ''),
    expiresAt: Number(row.expires_at || 0),
    expiresAtIso: row.expires_at ? new Date(Number(row.expires_at)).toISOString() : null,
    ip: String(row.ip || ''),
    userAgent: ua.slice(0, 200),
    device: describeUserAgent(ua),
    current: currentHash ? String(row.token_hash) === currentHash : false,
  };
}
// 只做粗分类，够用户认出"这是不是我自己的设备"即可。
export function describeUserAgent(ua) {
  const text = String(ua || '');
  if (!text) return '未知设备';
  const os = /iPhone|iPad|iPod/i.test(text) ? 'iOS' : /Android/i.test(text) ? 'Android'
    : /Macintosh|Mac OS X/i.test(text) ? 'macOS' : /Windows/i.test(text) ? 'Windows' : /Linux/i.test(text) ? 'Linux' : '其他系统';
  const browser = /Edg\//i.test(text) ? 'Edge' : /OPR\//i.test(text) ? 'Opera' : /Chrome\//i.test(text) ? 'Chrome'
    : /Safari\//i.test(text) ? 'Safari' : /Firefox\//i.test(text) ? 'Firefox' : '浏览器';
  return `${os} · ${browser}`;
}
export function listUserSessions(db, userId, { currentToken = '' } = {}) {
  const hash = currentToken ? sha256(currentToken) : '';
  const rows = db.prepare('SELECT rowid AS id, * FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC').all(Number(userId));
  return rows.map(row => sessionRow(row, hash));
}
// 退出其他设备：保留当前这条会话，其余全部吊销。
export function destroyOtherSessions(db, userId, currentToken = '') {
  const hash = currentToken ? sha256(currentToken) : '';
  const info = hash
    ? db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(Number(userId), hash)
    : db.prepare('DELETE FROM sessions WHERE user_id = ?').run(Number(userId));
  return Number(info.changes || 0);
}
export function destroyUserSession(db, userId, sessionId) {
  const info = db.prepare('DELETE FROM sessions WHERE user_id = ? AND rowid = ?').run(Number(userId), Number(sessionId));
  return Number(info.changes || 0) > 0;
}
export function destroyAllUserSessions(db, userId) {
  const info = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(Number(userId));
  return Number(info.changes || 0);
}

export function sessionCountForUser(db, userId) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(Number(userId));
  return Number(row?.n || 0);
}

// ---------- 忘记密码 / 一次性重置码 ----------
// 流程（没有邮件通道时的可行做法）：
//   1. 用户在登录页提交用户名 → requestPasswordReset() 记一条待处理申请；
//   2. 管理员在制作中心看到申请 → issueResetCode() 现场签发一次性重置码；
//   3. 用户拿着码 + 新密码 → consumeResetCode() 校验并改密，旧会话全部失效。
// 明文码只在签发的那一刻返回给管理员，库里只留 sha256。
const RESET_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 去掉 0/O/1/I 等易混字符
export const RESET_CODE_TTL_MS = 30 * 60 * 1000;
const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;                  // 同一账号 1 分钟内只记一条申请

function normalizeResetCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function newResetCode() {
  const bytes = crypto.randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += RESET_ALPHABET[bytes[i] % RESET_ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}
const resetCodeHash = code => sha256(normalizeResetCode(code));

// 永远不暴露"这个用户名是否存在"：不存在、未启用、冷却中都返回同一个结果。
export function requestPasswordReset(db, { username, ip = '' } = {}) {
  const key = String(username || '').trim();
  const user = key ? findUserByName(db, key) : null;
  if (!user || user.status !== STATUS_ACTIVE) return { requested: false, reason: 'NO_ACTIVE_USER' };
  const recent = db.prepare('SELECT * FROM password_resets WHERE user_id = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1').get(Number(user.id));
  if (recent && Date.now() - Date.parse(recent.created_at) < RESET_REQUEST_COOLDOWN_MS) {
    return { requested: true, id: Number(recent.id), deduplicated: true };
  }
  db.prepare('INSERT INTO password_resets(user_id,created_at,ip) VALUES (?,?,?)').run(Number(user.id), now(), String(ip).slice(0, 60));
  audit(db, { actor: user.username, actorId: Number(user.id), action: 'password.reset.request', target: user.username, detail: String(ip).slice(0, 60) });
  const row = db.prepare('SELECT id FROM password_resets WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(Number(user.id));
  return { requested: true, id: Number(row?.id || 0) };
}

// 管理员视图：一条申请一行，带"是否已签发 / 是否已使用"。
export function listPasswordResets(db, { limit = 50, includeClosed = false } = {}) {
  const rows = db.prepare(`SELECT r.*, u.username, u.display_name, u.status AS user_status
                           FROM password_resets r JOIN users u ON u.id = r.user_id
                           ${includeClosed ? '' : 'WHERE r.used_at IS NULL'}
                           ORDER BY r.id DESC LIMIT ?`).all(Math.max(1, Math.min(200, Number(limit) || 50)));
  return rows.map(row => ({
    id: Number(row.id),
    userId: Number(row.user_id),
    username: String(row.username),
    displayName: String(row.display_name || ''),
    userStatus: String(row.user_status || ''),
    requestedAt: String(row.created_at || ''),
    issuedAt: row.issued_at || null,
    issuedBy: String(row.issued_by || ''),
    expiresAt: row.expires_at ? Number(row.expires_at) : null,
    expired: row.expires_at ? Number(row.expires_at) <= Date.now() : false,
    usedAt: row.used_at || null,
    hasCode: Boolean(row.code_hash),
  }));
}

export function issueResetCode(db, userId, actor = '') {
  const row = findUserById(db, userId);
  if (!row) throw Object.assign(new Error('用户不存在'), { code: 'USER_NOT_FOUND' });
  if (row.status !== STATUS_ACTIVE) throw Object.assign(new Error('该账号当前不是启用状态，不能签发重置码'), { code: 'USER_NOT_ACTIVE' });
  const code = newResetCode();
  const expiresAt = Date.now() + RESET_CODE_TTL_MS;
  const stamp = now();
  db.prepare('UPDATE password_resets SET code_hash = NULL, expires_at = NULL, issued_at = NULL WHERE user_id = ? AND used_at IS NULL').run(Number(userId));
  const open = db.prepare('SELECT id FROM password_resets WHERE user_id = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1').get(Number(userId));
  if (open) db.prepare('UPDATE password_resets SET code_hash = ?, issued_at = ?, issued_by = ?, expires_at = ? WHERE id = ?')
    .run(resetCodeHash(code), stamp, String(actor), expiresAt, Number(open.id));
  else db.prepare('INSERT INTO password_resets(user_id,created_at,code_hash,issued_at,issued_by,expires_at) VALUES (?,?,?,?,?,?)')
    .run(Number(userId), stamp, resetCodeHash(code), stamp, String(actor), expiresAt);
  audit(db, { actor, action: 'password.reset.issue', target: row.username, detail: `expiresAt=${new Date(expiresAt).toISOString()}` });
  return { code, expiresAt, username: String(row.username), userId: Number(userId) };
}

export function cancelPasswordReset(db, id, actor = '') {
  const row = db.prepare('SELECT r.*, u.username FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.id = ?').get(Number(id));
  if (!row) throw Object.assign(new Error('重置申请不存在'), { code: 'RESET_NOT_FOUND' });
  const info = db.prepare('DELETE FROM password_resets WHERE id = ?').run(Number(id));
  audit(db, { actor, action: 'password.reset.cancel', target: String(row.username) });
  return Number(info.changes || 0) > 0;
}

// 用重置码设置新密码：码错、过期、已用过都返回同一个错误，不泄露细节。
export function consumeResetCode(db, { username, code, newPassword } = {}, actor = '') {
  const user = findUserByName(db, username);
  const invalid = () => Object.assign(new Error('重置码无效或已过期，请重新向管理员申请'), { code: 'RESET_CODE_INVALID' });
  if (!user || user.status !== STATUS_ACTIVE) throw invalid();
  const normalized = normalizeResetCode(code);
  if (normalized.length < 8) throw invalid();
  const row = db.prepare('SELECT * FROM password_resets WHERE user_id = ? AND code_hash IS NOT NULL AND used_at IS NULL ORDER BY id DESC LIMIT 1').get(Number(user.id));
  if (!row || !row.expires_at || Number(row.expires_at) <= Date.now()) throw invalid();
  const expected = String(row.code_hash), actual = resetCodeHash(code);
  let ok = false;
  // 这里必须用 crypto.timingSafeEqual：本模块只 import 了 crypto 默认导出，
  // 直接写裸函数名会抛 ReferenceError，被 catch 吞掉后表现成"重置码错误"。
  try { ok = crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex')); } catch (error) { ok = false; }
  if (!ok) { audit(db, { actor, action: 'password.reset.failed', target: user.username }); throw invalid(); }
  const badPw = passwordProblem(newPassword);
  if (badPw) throw Object.assign(new Error(badPw), { code: 'INVALID_PASSWORD' });
  setUserPassword(db, Number(user.id), newPassword, actor || user.username);
  db.prepare('UPDATE password_resets SET used_at = ?, code_hash = NULL WHERE id = ?').run(now(), Number(row.id));
  audit(db, { actor: actor || user.username, actorId: Number(user.id), action: 'password.reset.complete', target: user.username });
  return { ok: true, user: publicUser(findUserById(db, Number(user.id))) };
}

// 清理"没人管"的申请，避免待办列表一直挂着过期条目：
//   - 从未签发过重置码、且申请超过 7 天；
//   - 签发过但已过期超过 7 天且从未使用。
// 审计表里仍有 request/issue/complete 记录，历史不会丢。
export function purgeStaleResetRequests(db, { days = 7 } = {}) {
  const cutoff = new Date(Date.now() - Number(days) * 24 * 3600 * 1000).toISOString();
  const info = db.prepare(`DELETE FROM password_resets
                           WHERE used_at IS NULL
                             AND ((code_hash IS NULL AND created_at < ?)
                                  OR (code_hash IS NOT NULL AND expires_at IS NOT NULL AND expires_at < ?))`)
    .run(cutoff, Date.now() - Number(days) * 24 * 3600 * 1000);
  return Number(info.changes || 0);
}

export function pendingResetCount(db) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM password_resets WHERE used_at IS NULL').get();
  return Number(row?.n || 0);
}

// ---------- 期刊归属 ----------
export function issueOwnerId(db, issueId) {
  const row = db.prepare('SELECT owner_id FROM issue_owners WHERE issue_id = ?').get(String(issueId));
  return row ? Number(row.owner_id) : null;
}

export function setIssueOwner(db, issueId, ownerId, actor = '') {
  const id = String(issueId);
  const owner = Number(ownerId);
  if (!Number.isInteger(owner)) throw Object.assign(new Error('用户编号无效'), { code: 'INVALID_OWNER' });
  if (!findUserById(db, owner)) throw Object.assign(new Error('用户不存在'), { code: 'USER_NOT_FOUND' });
  db.prepare(`INSERT INTO issue_owners(issue_id,owner_id,created_at,updated_at) VALUES (?,?,?,?)
              ON CONFLICT(issue_id) DO UPDATE SET owner_id=excluded.owner_id, updated_at=excluded.updated_at`)
    .run(id, owner, now(), now());
  audit(db, { actor, action: 'issue.owner.set', target: id, detail: String(owner) });
  return owner;
}

export function removeIssueOwner(db, issueId) {
  db.prepare('DELETE FROM issue_owners WHERE issue_id = ?').run(String(issueId));
}

export function ownedIssueIds(db, ownerId) {
  return new Set(db.prepare('SELECT issue_id FROM issue_owners WHERE owner_id = ?').all(Number(ownerId)).map(r => String(r.issue_id)));
}

export function listIssueOwners(db) {
  const out = {};
  for (const row of db.prepare('SELECT issue_id, owner_id FROM issue_owners').all()) out[String(row.issue_id)] = Number(row.owner_id);
  return out;
}

export function countIssuesByOwner(db) {
  const out = {};
  for (const row of db.prepare('SELECT owner_id, COUNT(*) AS n FROM issue_owners GROUP BY owner_id').all()) out[Number(row.owner_id)] = Number(row.n);
  return out;
}

// 把磁盘上已有、但还没有归属记录的期刊挂到 fallbackOwner（通常是管理员）。
// 这样既有期刊不会因为引入多用户而"消失"，也不会被普通用户看到。
export function reconcileIssueOwners(db, issueIds = [], fallbackOwnerId = null) {
  const known = new Set(db.prepare('SELECT issue_id FROM issue_owners').all().map(r => String(r.issue_id)));
  const missing = issueIds.map(String).filter(id => id && !known.has(id));
  if (!missing.length) return [];
  let owner = fallbackOwnerId;
  if (!owner) {
    const admin = db.prepare("SELECT id FROM users WHERE role='admin' AND status='active' ORDER BY id LIMIT 1").get();
    owner = admin ? Number(admin.id) : null;
  }
  if (!owner) return [];
  for (const id of missing) {
    db.prepare('INSERT OR IGNORE INTO issue_owners(issue_id,owner_id,created_at,updated_at) VALUES (?,?,?,?)').run(id, owner, now(), now());
  }
  audit(db, { actor: 'bootstrap', action: 'issue.owner.reconcile', target: String(missing.length), detail: missing.slice(0, 20).join(',') });
  return missing;
}

// ---------- 初始化 ----------
// 用环境变量里的管理员凭据做引导：数据库里没有可用 admin 时补齐（避免把自己锁在门外）。
export function bootstrapAdmin(db, { username = 'admin', password = '' } = {}) {
  const name = String(username || 'admin').trim() || 'admin';
  const existing = db.prepare("SELECT * FROM users WHERE role = 'admin' AND status = 'active'").get();
  if (existing) return { created: false, user: publicUser(existing) };
  if (!password) return { created: false, user: null, reason: 'NO_ADMIN_PASSWORD' };
  const byName = findUserByName(db, name);
  if (byName) {
    db.prepare("UPDATE users SET role='admin', status='active', approved_at=COALESCE(approved_at,?), approved_by=COALESCE(approved_by,'bootstrap') WHERE id=?")
      .run(now(), Number(byName.id));
    audit(db, { actor: 'bootstrap', action: 'admin.promote', target: name });
    return { created: false, promoted: true, user: publicUser(findUserById(db, byName.id)) };
  }
  const row = createUser(db, { username: name, password, displayName: '系统管理员', role: ROLE_ADMIN, status: STATUS_ACTIVE, canPublish: true, approvedBy: 'bootstrap' });
  audit(db, { actor: 'bootstrap', action: 'admin.create', target: name });
  return { created: true, user: publicUser(row) };
}

export function dbStats(db, root) {
  const file = userDbFile(root);
  let bytes = 0;
  try { bytes = statSync(file).size; } catch { }
  return {
    users: countUsers(db),
    pending: countUsers(db, { status: STATUS_PENDING }),
    active: countUsers(db, { status: STATUS_ACTIVE }),
    disabled: countUsers(db, { status: STATUS_DISABLED }),
    sessions: Number(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()?.n || 0),
    resetRequests: pendingResetCount(db),
    bytes,
  };
}
