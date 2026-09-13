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

export function userDbDir(root) { return path.join(root, '.v3-users'); }
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
  try { chmodSync(file, 0o600); } catch { }
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
    CREATE TABLE IF NOT EXISTS audit_log (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      at       TEXT NOT NULL,
      actor    TEXT NOT NULL DEFAULT '',
      actor_id INTEGER,
      action   TEXT NOT NULL,
      target   TEXT NOT NULL DEFAULT '',
      detail   TEXT NOT NULL DEFAULT ''
    );
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
export function findUserByName(db, username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim()) || null;
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

export function sessionCountForUser(db, userId) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(Number(userId));
  return Number(row?.n || 0);
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
    bytes,
  };
}
