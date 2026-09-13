// 多用户"按用户分区"回归：素材库分区、发布命名空间、忘记密码、期刊删除。
//
// 覆盖三个此前明确记录下来的边界问题：
//   1) 样式 / 版式 / 模板库原本是全站共享文件，任何账号都能看到并删除别人的素材；
//   2) 普通用户发布的期刊落在公开站点根目录，和平台期刊共用一套归档与目录；
//   3) 没有自助找回密码的通道，也没有删除期刊的 API。
//
// 这里全部走真实 HTTP 接口，不做源码字符串断言；发布流程会真的写公开目录，
// 并用一个本地静态服务器冒充公开站点，让部署后的在线校验也真实执行。
//
// 用法：node scripts/multiuser-spaces-smoke-v3.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { statSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createTestWorkspace, startTestStudio, stopTestStudio, removeTestWorkspace, freePort } from './lib-v3-test-workspace.mjs';
import { V3_VERSION } from './lib-v3-production.mjs';
import { writeDeploymentArtifacts } from './lib-v3-deploy.mjs';
import { openUserDb, purgeStaleResetRequests } from './lib-v3-users.mjs';

const ADMIN_PW = 'AdminPass123';
const ALICE_PW = 'AlicePass123';
const dir = await createTestWorkspace('multiuser-spaces');
let studio, publicServer;

const call = async (base, route, { method = 'GET', cookie = '', data } = {}) => {
  const r = await fetch(base + route, { method, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const body = await r.json().catch(() => ({}));
  const setCookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return { status: r.status, body, cookie: setCookie };
};
const login = async (base, username, password) => {
  const r = await call(base, '/api/auth/login', { method: 'POST', data: { username, password } });
  return { ...r, cookie: r.cookie || '' };
};
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const exists = async file => { try { await stat(file); return true; } catch { return false; } };

// ---- 公开站点替身：真实按目录提供静态文件，部署后的在线校验才能通过 ----
function startStaticServer(root) {
  return new Promise(resolve => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1');
        let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        let file = path.join(root, rel);
        if (rel.endsWith('/') || !path.extname(file)) file = path.join(file, 'index.html');
        const bytes = await readFile(file);
        const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.json') ? 'application/json; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        res.end(bytes);
      } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ---- 造一份"已经正式发布"的发布包，让部署接口可以真实运行 ----
const READER_FILES = {
  'index.html': '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>__TITLE__</title></head><body><div id="reader"></div><script src="./reader.js"></script></body></html>',
  'reader.css': 'body{margin:0}',
  'reader.js': '/* reader */',
  'rich-text.js': 'export const x=1;',
  'layout-engine.js': 'export const y=1;',
};
async function writeRelease(id, { title, publication, status = 'published' }) {
  const target = path.join(dir, 'release-v3', id);
  await mkdir(target, { recursive: true });
  for (const [name, content] of Object.entries(READER_FILES)) await writeFile(path.join(target, name), content.replace('__TITLE__', title), 'utf8');
  await writeFile(path.join(target, 'issue.json'), JSON.stringify({ id, label: `第${id}期`, publication, subtitle: title, engine: 'v3', status, pages: [{ type: 'cover', title }] }, null, 2) + '\n', 'utf8');
  await writeFile(path.join(target, 'release.json'), JSON.stringify({ version: V3_VERSION, issue: id, sourceStatus: 'published', releasedAt: new Date().toISOString() }, null, 2) + '\n', 'utf8');
  await writeDeploymentArtifacts(target, { issue: id });
  return target;
}
async function writeIssue(id, { title, publication, status = 'ready' }) {
  const target = path.join(dir, 'issues', id);
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'issue.json'), JSON.stringify({
    id, label: `第${id}期`, publication, subtitle: title, engine: 'v3', status, theme: 'classic-red',
    features: {}, articles: {}, pages: [{ type: 'cover', navTitle: '封面', title, kicker: publication, blocks: [{ type: 'coverMeta', text: `${publication} · ${title}` }] }],
  }, null, 2) + '\n', 'utf8');
}

try {
  // 历史全局素材库：放在启动前，验证"迁移给管理员并归档"而不是"丢掉"或"继续共享"。
  const legacyDesign = path.join(dir, 'legacy-library', 'styles.json');
  await mkdir(path.dirname(legacyDesign), { recursive: true });
  await writeFile(legacyDesign, JSON.stringify([{ id: 'style-legacy', name: '历史共享样式', scope: 'theme', contextType: 'theme', createdAt: '2026-01-01T00:00:00.000Z', payload: { accent: '#8d1f1c' } }], null, 2) + '\n', 'utf8');

  const publicRoot = path.join(dir, 'public-site');
  await mkdir(publicRoot, { recursive: true });
  const staticServer = await startStaticServer(publicRoot);
  publicServer = staticServer.server;
  const baseUrl = `http://127.0.0.1:${staticServer.port}`;

  await writeIssue('001', { title: '平台第一期', publication: '金昌离退休干部电子期刊', status: 'published' });
  await writeIssue('003', { title: '爱丽丝的创刊号', publication: '银龄文苑', status: 'ready' });
  await writeIssue('005', { title: '爱丽丝的草稿', publication: '银龄文苑', status: 'draft' });
  await writeRelease('001', { title: '平台第一期', publication: '金昌离退休干部电子期刊' });
  await writeRelease('003', { title: '爱丽丝的创刊号', publication: '银龄文苑' });
  // 构建产物也要有：删除时应当和发布包、报告、回执一起进隔离区
  await mkdir(path.join(dir, 'dist-v3', '003'), { recursive: true });
  await writeFile(path.join(dir, 'dist-v3', '003', 'index.html'), '<!doctype html><title>build</title>', 'utf8');

  studio = await startTestStudio(dir, {
    STUDIO_ADMIN_PASSWORD: ADMIN_PW,
    V3_PUBLIC_MAGAZINE_ROOT: publicRoot,
    V3_PUBLIC_MAGAZINE_BASE_URL: baseUrl,
    V3_DESIGN_LIBRARY_FILE: legacyDesign,
  });
  const base = studio.base;
  console.log('按用户分区回归：');

  const admin = await login(base, 'admin', ADMIN_PW);
  assert.equal(admin.status, 200, `管理员登录失败 ${JSON.stringify(admin.body)}`);

  // ---------- 1) 素材库按账号分区 ----------
  const legacyMigrated = path.join(dir, '.v3-users', 'libraries', '1', 'styles.json');
  assert.ok(await exists(legacyMigrated), '历史全局样式库必须迁移到管理员私有库');
  assert.equal((await json(legacyMigrated))[0].id, 'style-legacy', '迁移内容不完整');
  const legacyArchived = (await readdir(path.dirname(legacyDesign))).some(name => name.startsWith('styles.json.migrated-'));
  assert.ok(legacyArchived, '历史全局样式文件必须重命名归档，而不是删除或继续被读取');
  const adminStyles = await call(base, '/api/design-library', { cookie: admin.cookie });
  assert.equal(adminStyles.body.styles.length, 1, '管理员应看到迁移过来的历史样式');

  // 注册 → 审批 → 授权发布
  assert.equal((await call(base, '/api/auth/register', { method: 'POST', data: { username: 'Alice', password: ALICE_PW, displayName: '爱丽丝' } })).status, 201);
  const users = await call(base, '/api/admin/users', { cookie: admin.cookie });
  const alice = users.body.users.find(u => u.username === 'Alice');
  assert.ok(alice, '注册用户应出现在管理员用户列表中');
  assert.equal((await call(base, `/api/admin/users/${alice.id}/status`, { method: 'POST', cookie: admin.cookie, data: { status: 'active' } })).status, 200);
  const aliceSession = await login(base, 'Alice', ALICE_PW);
  assert.equal(aliceSession.status, 200, `用户登录失败 ${JSON.stringify(aliceSession.body)}`);

  // 期刊归属：003/005 归 Alice，001 归管理员
  assert.equal((await call(base, `/api/admin/issues/003/owner`, { method: 'POST', cookie: admin.cookie, data: { userId: alice.id } })).status, 200);
  assert.equal((await call(base, `/api/admin/issues/005/owner`, { method: 'POST', cookie: admin.cookie, data: { userId: alice.id } })).status, 200);

  // 名下还有期刊时不允许删除账号（否则期刊归属会被级联清掉、已发布的用户分区会移位）
  const prematureDelete = await call(base, `/api/admin/users/${alice.id}`, { method: 'DELETE', cookie: admin.cookie });
  assert.equal(prematureDelete.status, 409, '名下还有期刊的账号不得被直接删除');
  assert.equal(prematureDelete.body.code, 'USER_HAS_ISSUES');

  const aliceStyle = { name: '爱丽丝主题', scope: 'theme', contextType: 'theme', payload: { accent: '#315f4a', paper: '#fbfcf7' } };
  const saved = await call(base, '/api/design-library', { method: 'POST', cookie: aliceSession.cookie, data: aliceStyle });
  assert.equal(saved.status, 201, `用户保存样式失败 ${JSON.stringify(saved.body)}`);
  const aliceLayout = await call(base, '/api/layout-library', { method: 'POST', cookie: aliceSession.cookie, data: { name: '爱丽丝版式', contextType: 'page', previewPreset: 'two-balanced', blueprint: { nodes: [{ kind: 'slot' }, { kind: 'slot' }] } } });
  assert.equal(aliceLayout.status, 201, `用户保存版式失败 ${JSON.stringify(aliceLayout.body)}`);
  const aliceTemplate = await call(base, '/api/templates', { method: 'POST', cookie: aliceSession.cookie, data: { name: '爱丽丝模板', page: { type: 'article', navTitle: '模板页', title: '模板页', blocks: [{ type: 'paragraph', text: '只属于爱丽丝的模板内容。' }] } } });
  assert.equal(aliceTemplate.status, 201, `用户保存模板失败 ${JSON.stringify(aliceTemplate.body)}`);

  const adminDesign = await call(base, '/api/design-library', { cookie: admin.cookie });
  assert.equal(adminDesign.body.styles.length, 1, '管理员不应看到用户保存的样式');
  assert.equal((await call(base, '/api/layout-library', { cookie: admin.cookie })).body.layouts.length, 0, '管理员不应看到用户保存的版式');
  assert.equal((await call(base, '/api/templates', { cookie: admin.cookie })).body.templates.length, 0, '管理员不应看到用户保存的模板');
  assert.equal((await call(base, '/api/design-library', { cookie: aliceSession.cookie })).body.styles.length, 1, '用户应只看到自己的样式（不含管理员的历史样式）');
  // 交叉删除：拿别人的素材 id 去删，必须 404 且不影响对方
  assert.equal((await call(base, `/api/design-library/${encodeURIComponent('style-legacy')}`, { method: 'DELETE', cookie: aliceSession.cookie })).status, 404, '用户不能删除管理员的样式');
  assert.equal((await call(base, `/api/layout-library/${encodeURIComponent(aliceLayout.body.id)}`, { method: 'DELETE', cookie: admin.cookie })).status, 404, '管理员也不能删除用户的版式（素材库是私有的）');
  assert.equal((await call(base, '/api/design-library', { cookie: admin.cookie })).body.styles.length, 1, '交叉删除后管理员样式必须还在');
  // 落盘位置与权限
  const aliceLib = path.join(dir, '.v3-users', 'libraries', String(alice.id), 'styles.json');
  assert.ok(await exists(aliceLib), '用户样式必须落在自己的账号目录下');
  assert.equal(statSync(aliceLib).mode & 0o777, 0o600, '用户素材库文件权限必须是 600');
  assert.equal((await json(aliceLib)).length, 1, '用户样式库文件内容异常');
  console.log('  素材库按账号分区、交叉删除拦截、历史库迁移归档 ✓');

  // ---------- 2) 发布命名空间按用户分区 ----------
  const mine = await call(base, '/api/issues', { cookie: aliceSession.cookie });
  assert.deepEqual(mine.body.map(x => x.id).sort(), ['003', '005'], '用户只能看到自己名下的期刊');

  // 未授权发布：接口必须直接拒绝（此前 canPublish 只是前端提示）
  const noGrant = await call(base, '/api/issues/003/publication/deploy', { method: 'POST', cookie: aliceSession.cookie, data: {} });
  assert.equal(noGrant.status, 403, `未授权账号不应能调用部署接口：${JSON.stringify(noGrant.body)}`);
  assert.equal(noGrant.body.code, 'PUBLISH_FORBIDDEN', '未授权发布应返回 PUBLISH_FORBIDDEN');
  assert.equal((await call(base, `/api/admin/users/${alice.id}/publish`, { method: 'POST', cookie: admin.cookie, data: { canPublish: true } })).status, 200);

  const aliceDeploy = await call(base, '/api/issues/003/publication/deploy', { method: 'POST', cookie: aliceSession.cookie, data: {} });
  assert.equal(aliceDeploy.status, 200, `用户部署失败 ${JSON.stringify(aliceDeploy.body)}`);
  assert.equal(aliceDeploy.body.deployment.remotePath, 'u/alice/03', '用户期刊必须发布到 /u/<用户名>/<期号>/ 命名空间');
  assert.ok(String(aliceDeploy.body.deployment.url).endsWith('/u/alice/03/'), `用户期刊公开链接异常：${aliceDeploy.body.deployment.url}`);
  assert.equal(aliceDeploy.body.deployment.verified, true, '公开校验必须通过');
  assert.ok(await exists(path.join(publicRoot, 'u', 'alice', '03', 'issue.json')), '用户期刊文件必须落在自己的分区目录');
  assert.equal(await exists(path.join(publicRoot, '03')), false, '用户期刊不得再占用平台根目录');

  // 平台期刊仍然留在根命名空间
  assert.equal((await call(base, '/api/issues/001/publication/deploy', { method: 'POST', cookie: admin.cookie, data: {} })).status, 200);
  assert.ok(await exists(path.join(publicRoot, '01', 'issue.json')), '平台期刊仍发布在站点根目录');

  // 归档页分区：平台首页只列平台期刊；作者空间索引与作者归档页各自独立
  const platformIndex = await readFile(path.join(publicRoot, 'index.html'), 'utf8');
  assert.ok(platformIndex.includes('href="./01/"'), '平台归档页应包含平台期刊');
  assert.equal(platformIndex.includes('href="./03/"'), false, '平台归档页不得混入用户期刊');
  assert.ok(platformIndex.includes('u/alice/'), '平台归档页应提供作者空间入口');
  const spacesIndex = await readFile(path.join(publicRoot, 'u', 'index.html'), 'utf8');
  assert.ok(spacesIndex.includes('href="./alice/"'), '作者空间索引应列出作者分区');
  const aliceIndex = await readFile(path.join(publicRoot, 'u', 'alice', 'index.html'), 'utf8');
  assert.ok(aliceIndex.includes('银龄文苑'), '作者归档页应显示作者自定义刊名');
  assert.ok(aliceIndex.includes('href="./03/"'), '作者归档页应列出自己的期刊');
  assert.equal(aliceIndex.includes('href="./01/"'), false, '作者归档页不得混入平台期刊');
  const spaceMeta = await json(path.join(publicRoot, 'u', 'alice', 'space.json'));
  assert.equal(spaceMeta.slug, 'alice');
  assert.equal(spaceMeta.journalName, '银龄文苑');
  assert.equal(spaceMeta.issueCount, 1);
  // 大小写归一：注册名是 Alice，公开分区目录名必须正好是全小写 alice。
  // 这里读目录名而不是 exists()，否则在大小写不敏感的文件系统（macOS）上会误判。
  const spaceDirs = (await readdir(path.join(publicRoot, 'u'), { withFileTypes: true })).filter(x => x.isDirectory()).map(x => x.name);
  assert.deepEqual(spaceDirs.filter(name => name.toLowerCase() === 'alice'), ['alice'], `公开分区必须使用归一化小写 slug，实际：${spaceDirs.join(',')}`);
  console.log('  发布命名空间 /u/<slug>/、分区归档页、发布权限拦截 ✓');

  // ---------- 3) 忘记密码：申请 + 一次性重置码 ----------
  const unknown = await call(base, '/api/auth/forgot', { method: 'POST', data: { username: 'nobody-here' } });
  assert.equal(unknown.status, 200, '不存在的用户名也必须返回 200（避免用户名枚举）');
  assert.equal(unknown.body.registered, false, '不存在的用户名不应登记申请');
  const requested = await call(base, '/api/auth/forgot', { method: 'POST', data: { username: 'alice' } });
  assert.equal(requested.status, 200);
  assert.equal(requested.body.registered, true, '存在的启用账号应登记申请');
  const requests = await call(base, '/api/admin/reset-requests', { cookie: admin.cookie });
  assert.equal(requests.body.requests.length, 1, '管理员应看到一条待处理申请');
  assert.equal(requests.body.requests[0].username, 'Alice');
  assert.equal(requests.body.requests[0].hasCode, false, '刚申请时不应有重置码');
  assert.equal((await call(base, '/api/admin/reset-requests', { cookie: aliceSession.cookie })).status, 403, '普通用户不能查看重置申请');
  assert.equal((await call(base, `/api/admin/users/${alice.id}/reset-code`, { method: 'POST', cookie: aliceSession.cookie })).status, 403, '普通用户不能签发重置码');

  const issued = await call(base, `/api/admin/users/${alice.id}/reset-code`, { method: 'POST', cookie: admin.cookie });
  assert.equal(issued.status, 200, `签发重置码失败 ${JSON.stringify(issued.body)}`);
  assert.match(issued.body.code, /^[A-Z0-9]{5}-[A-Z0-9]{5}$/, '重置码格式异常');
  assert.equal(issued.body.ttlMinutes, 30, '重置码有效期应为 30 分钟');
  const adminAfterIssue = await call(base, '/api/admin/reset-requests', { cookie: admin.cookie });
  assert.equal(adminAfterIssue.body.requests[0].hasCode, true, '签发后申请应标记为已签发');
  // 库里不存明文码
  const dbBytes = await readFile(path.join(dir, '.v3-users', 'users.db'));
  assert.equal(dbBytes.includes(Buffer.from(issued.body.code, 'utf8')), false, '数据库里绝不能出现明文重置码');

  const wrong = await call(base, '/api/auth/reset', { method: 'POST', data: { username: 'Alice', code: 'AAAAA-BBBBB', newPassword: 'AliceNew123' } });
  assert.equal(wrong.status, 403, '错误重置码必须被拒绝');
  assert.equal(wrong.body.code, 'RESET_CODE_INVALID');
  const weak = await call(base, '/api/auth/reset', { method: 'POST', data: { username: 'Alice', code: issued.body.code, newPassword: 'short' } });
  assert.equal(weak.body.code, 'INVALID_PASSWORD', '新密码强度不足应被拒绝，且不消耗重置码');
  const done = await call(base, '/api/auth/reset', { method: 'POST', data: { username: 'alice', code: issued.body.code.toLowerCase(), newPassword: 'AliceNew123' } });
  assert.equal(done.status, 200, `重置失败 ${JSON.stringify(done.body)}`);
  assert.equal((await call(base, '/api/issues', { cookie: aliceSession.cookie })).status, 401, '改密后旧会话必须失效');
  const reLogin = await login(base, 'Alice', 'AliceNew123');
  assert.equal(reLogin.status, 200, '必须能用新密码登录');
  const reuse = await call(base, '/api/auth/reset', { method: 'POST', data: { username: 'Alice', code: issued.body.code, newPassword: 'AliceOther123' } });
  assert.equal(reuse.status, 403, '重置码用过必须失效');
  assert.equal((await call(base, '/api/admin/reset-requests', { cookie: admin.cookie })).body.requests.length, 0, '已使用的申请应从待处理列表消失');

  // 重置码试错必须有自己的限速桶：连错几次不能把"登录"一起锁掉
  for (let i = 0; i < 8; i += 1) await call(base, '/api/auth/reset', { method: 'POST', data: { username: 'Alice', code: 'ZZZZZ-ZZZZZ', newPassword: 'AliceWrong123' } });
  const lockedReset = await call(base, '/api/auth/reset', { method: 'POST', data: { username: 'Alice', code: 'ZZZZZ-ZZZZZ', newPassword: 'AliceWrong123' } });
  assert.equal(lockedReset.status, 429, '重置码连错达到上限后应限速');
  const stillLogin = await login(base, 'Alice', 'AliceNew123');
  assert.equal(stillLogin.status, 200, '重置码试错不得连带锁死登录（共用限速桶会让用户彻底进不去）');

  // 没人处理的过期申请要能被清理（否则待办列表永远挂着）
  await call(base, '/api/auth/forgot', { method: 'POST', data: { username: 'Alice' } });
  const resetDb = openUserDb(dir);
  const stale = resetDb.prepare("SELECT COUNT(*) AS n FROM password_resets WHERE used_at IS NULL AND code_hash IS NULL").get();
  assert.ok(Number(stale.n) >= 1, '应有一条未签发的申请');
  resetDb.prepare("UPDATE password_resets SET created_at = '2026-01-01T00:00:00.000Z' WHERE used_at IS NULL AND code_hash IS NULL").run();
  const purged = purgeStaleResetRequests(resetDb, { days: 7 });
  assert.ok(purged >= 1, `过期申请应被清理，实际清理 ${purged} 条`);
  assert.equal(Number(resetDb.prepare('SELECT COUNT(*) AS n FROM password_resets WHERE used_at IS NULL').get().n), 0, '清理后不应残留待处理申请');
  resetDb.close();
  await call(base, `/api/admin/reset-requests/${1}`, { method: 'DELETE', cookie: admin.cookie }).catch(() => { });
  console.log('  忘记密码申请、一次性重置码、旧会话失效、码不可复用、独立限速、过期申请清理 ✓');

  // ---------- 4) 删除期刊：隔离区 + 公开目录回收 ----------
  const draftDelete = await call(base, '/api/issues/005', { method: 'DELETE', cookie: reLogin.cookie });
  assert.equal(draftDelete.status, 200, `草稿删除失败 ${JSON.stringify(draftDelete.body)}`);
  assert.ok(String(draftDelete.body.quarantined).startsWith('.v3-trash/issues/005-'), '删除必须移入 .v3-trash 隔离区');
  assert.equal(await exists(path.join(dir, 'issues', '005')), false, '删除后期刊目录不应留在 issues/');
  const trashDirs = (await readdir(path.join(dir, '.v3-trash', 'issues'))).filter(name => name.startsWith('005-'));
  assert.equal(trashDirs.length, 1, '隔离区应恰好有一个 005 目录');
  const deletedMeta = await json(path.join(dir, '.v3-trash', 'issues', trashDirs[0], '.deleted.json'));
  assert.equal(deletedMeta.issueId, '005');
  assert.equal(deletedMeta.actor, 'Alice', '隔离区 manifest 必须记录操作人');
  assert.ok(await exists(path.join(dir, '.v3-trash', 'issues', trashDirs[0], 'issue.json')), '隔离区必须保留完整期刊内容');
  assert.deepEqual((await call(base, '/api/issues', { cookie: reLogin.cookie })).body.map(x => x.id), ['003'], '删除后列表不应再出现该期');

  // 已上线期刊：作者删不掉，管理员不带 force 也必须被拦一次
  const liveByOwner = await call(base, '/api/issues/003', { method: 'DELETE', cookie: reLogin.cookie });
  assert.equal(liveByOwner.status, 403, '已上线期刊不能由作者自行删除');
  assert.equal(liveByOwner.body.code, 'ISSUE_PUBLISHED');
  const liveNoForce = await call(base, '/api/issues/003', { method: 'DELETE', cookie: admin.cookie });
  assert.equal(liveNoForce.status, 409, '已上线期刊删除必须显式确认');
  assert.equal(liveNoForce.body.code, 'ISSUE_PUBLISHED_CONFIRM');
  assert.ok(await exists(path.join(publicRoot, 'u', 'alice', '03', 'issue.json')), '未确认前不得动公开目录');

  const liveDelete = await call(base, '/api/issues/003?force=1', { method: 'DELETE', cookie: admin.cookie });
  assert.equal(liveDelete.status, 200, `管理员确认删除失败 ${JSON.stringify(liveDelete.body)}`);
  assert.equal(liveDelete.body.publicRemoved, true, '公开目录必须一并移入隔离区');
  assert.equal(await exists(path.join(publicRoot, 'u', 'alice', '03')), false, '公开目录必须已撤下');
  // 公开副本的隔离区必须留在公开根目录内部（同一文件系统）：生产上 /opt 与 /var/www
  // 是不同挂载点，把公开目录 rename 到应用目录会直接 EXDEV（真实踩过一次）。
  assert.ok((await readdir(path.join(publicRoot, '.v3-trash', 'public'))).some(name => name.startsWith('003-')), '公开目录必须进公开根目录内的隔离区（跨文件系统也成立）');
  assert.equal(await exists(path.join(dir, '.v3-trash', 'public')), false, '公开副本不得跨文件系统搬到应用目录');
  const publicDeleted = await json(path.join(dir, '.v3-trash', 'issues', (await readdir(path.join(dir, '.v3-trash', 'issues'))).find(n => n.startsWith('003-')), '.deleted.json'));
  assert.equal(publicDeleted.publicError, null, '删除回执里不应有公开目录迁移错误');
  assert.ok(String(publicDeleted.publicQuarantine || '').startsWith('.v3-trash/public/'), `隔离区路径必须记录在案：${publicDeleted.publicQuarantine}`);
  // 作者最后一期被删除后，作者分区目录（只剩归档页）也要一并隔离，
  // 否则 /u/<slug>/index.html 会永久留一条指向已删除期刊的死链接。
  assert.equal(await exists(path.join(publicRoot, 'u', 'alice')), false, '空的作者分区目录必须一并移入隔离区');
  assert.ok((await readdir(path.join(publicRoot, '.v3-trash', 'spaces'))).some(name => name.startsWith('alice-')), '作者分区目录也必须进隔离区而不是被 rm');
  const platformIndexAfter = await readFile(path.join(publicRoot, 'index.html'), 'utf8');
  assert.ok(platformIndexAfter.includes('href="./01/"'), '删除用户期刊不得影响平台归档页');
  assert.equal(platformIndexAfter.includes('alice'), false, '作者分区撤销后平台首页不应再出现该作者入口');
  const spacesIndexAfter = await readFile(path.join(publicRoot, 'u', 'index.html'), 'utf8');
  assert.equal(spacesIndexAfter.includes('href="./alice/"'), false, '作者空间索引不应再列出空分区');
  // 删除必须同时收拾这一期的派生数据：构建产物、发布包、发布证据、报告与部署回执
  assert.equal(await exists(path.join(dir, 'release-v3', '003')), false, '正式发布包应随期刊一起进隔离区');
  assert.equal(await exists(path.join(dir, 'dist-v3', '003')), false, '构建产物应随期刊一起进隔离区');
  assert.equal(await exists(path.join(dir, 'outputs-v3', '003')), false, '发布证据/输出应随期刊一起进隔离区');
  assert.equal(await exists(path.join(dir, 'reports', 'v3-public-deployment-003.json')), false, '带期号的报告应随期刊一起进隔离区');
  const derivedNames = (await readdir(path.join(dir, '.v3-trash', 'derived'))).filter(n => n.startsWith('003-'));
  assert.equal(derivedNames.length, 1, `派生数据隔离区应恰好一份，实际 ${JSON.stringify(derivedNames)}`);
  const derivedTrash = path.join(dir, '.v3-trash', 'derived', derivedNames[0]);
  for (const label of ['release-v3', 'dist-v3', 'outputs', 'reports']) {
    assert.ok(await exists(path.join(derivedTrash, label)), `隔离区里应保留 ${label}`);
  }
  assert.ok(await exists(path.join(derivedTrash, 'reports', 'v3-public-deployment-003.json')), '报告内容必须保留在隔离区');
  const derivedReceipts = await readdir(path.join(publicRoot, '.v3-trash', 'derived')).catch(() => []);
  assert.ok(derivedReceipts.some(n => n.startsWith('003-')), '公开根的部署回执应随期刊一起隔离');
  assert.equal((await readdir(path.join(publicRoot, '.v3-deployments', 'receipts')).catch(() => [])).some(n => n.startsWith('003-')), false, '公开根不应再留下这一期的回执');
  assert.equal(liveDelete.body?.derived?.failed?.length || 0, 0, `派生数据隔离不应有失败项：${JSON.stringify(liveDelete.body?.derived?.failed)}`);
  console.log('  期刊删除隔离区、作者/管理员权限分级、公开目录回收、派生数据清理与归档重建 ✓');

  // ---------- 4.5) 登录设备可见性与一键退出 ----------
  const second = await login(base, 'Alice', 'AliceNew123');
  assert.equal(second.status, 200, '同一账号第二个设备登录失败');
  const sessions = await call(base, '/api/me/sessions', { cookie: second.cookie });
  assert.equal(sessions.status, 200, '会话列表接口不可用');
  // 前面"重置码试错后仍能登录"那一步也留下了一个会话，所以这里不断言固定条数
  const sessionCount = sessions.body.sessions.length;
  assert.ok(sessionCount >= 2, `应看到多个登录设备，实际 ${sessionCount}`);
  assert.equal(sessions.body.sessions.filter(x => x.current).length, 1, '必须且只能标记一个当前设备');
  assert.ok(sessions.body.sessions.every(x => x.device && !('tokenHash' in x)), '会话列表应带设备描述且不含令牌信息');
  const revoked = await call(base, '/api/me/sessions/logout-others', { method: 'POST', cookie: second.cookie });
  assert.equal(revoked.status, 200, '退出其他设备失败');
  assert.equal(revoked.body.revoked, sessionCount - 1, `应吊销 ${sessionCount - 1} 个会话，实际 ${revoked.body.revoked}`);
  assert.equal((await call(base, '/api/me/sessions', { cookie: reLogin.cookie })).status, 401, '被吊销的设备应立即失效');
  assert.equal((await call(base, '/api/me/sessions', { cookie: second.cookie })).body.sessions.length, 1, '当前设备必须保留');

  // 管理员强制下线
  assert.equal((await call(base, `/api/admin/users/${alice.id}/sessions`, { cookie: second.cookie })).status, 403, '普通用户不能查看他人的登录设备');
  const adminSessions = await call(base, `/api/admin/users/${alice.id}/sessions`, { cookie: admin.cookie });
  assert.equal(adminSessions.body.sessions.length, 1, `管理员应看到该账号仅剩 1 个登录设备，实际 ${adminSessions.body.sessions.length}`);
  const kick = await call(base, `/api/admin/users/${alice.id}/logout`, { method: 'POST', cookie: admin.cookie });
  assert.equal(kick.body.revoked, 1, '管理员强制下线应吊销全部会话');
  assert.equal((await call(base, '/api/me/sessions', { cookie: second.cookie })).status, 401, '被强制下线的设备应立即失效');
  console.log('  登录设备可见性、退出其他设备、管理员强制下线 ✓');

  // ---------- 5) 账号删除时素材库一起进隔离区 ----------
  assert.ok(await exists(path.join(dir, '.v3-users', 'libraries', String(alice.id))), '删除账号前素材库目录应存在');
  const dropAlice = await call(base, `/api/admin/users/${alice.id}`, { method: 'DELETE', cookie: admin.cookie });
  assert.equal(dropAlice.status, 200, `删除账号失败 ${JSON.stringify(dropAlice.body)}`);
  assert.equal(dropAlice.body.libraryQuarantine?.moved, true, '删除账号时应把私有素材库搬进隔离区');
  assert.equal(await exists(path.join(dir, '.v3-users', 'libraries', String(alice.id))), false, '账号删除后不应留下素材库目录');
  const libTrash = (await readdir(path.join(dir, '.v3-trash', 'libraries'))).filter(name => name.startsWith(`${alice.id}-`));
  assert.equal(libTrash.length, 1, '素材库隔离区应恰好有一份');
  assert.equal((await json(path.join(dir, '.v3-trash', 'libraries', libTrash[0], 'styles.json'))).length, 1, '隔离区里必须保留素材内容');
  console.log('  账号删除时私有素材库一并隔离（不留在线上、也不物理删除）✓');

  console.log('多用户按用户分区回归通过：素材库隔离 / 发布命名空间 / 自助改密 / 期刊删除 全部符合预期。');
} finally {
  await stopTestStudio(studio);
  if (publicServer) await new Promise(resolve => publicServer.close(resolve));
  await removeTestWorkspace(dir);
}
