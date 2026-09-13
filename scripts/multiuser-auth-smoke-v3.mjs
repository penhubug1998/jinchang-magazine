// 多用户认证与账号生命周期回归。
//
// 覆盖：管理员引导、注册→待审批、待审批拒绝登录、审批后可登录、角色隔离、
// 不能自助提权、管理员授权发布、改密吊销旧会话、禁用立即踢下线、删除用户、
// 审计留痕、数据库权限、**服务重启后会话仍然有效**。
//
// 用法：node scripts/multiuser-auth-smoke-v3.mjs
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import path from 'node:path';
import { createTestWorkspace, writePublicationFixture, startTestStudio, stopTestStudio, removeTestWorkspace } from './lib-v3-test-workspace.mjs';

const ADMIN_PW = 'AdminPass123';
const USER_PW = 'UserPass123';
const dir = await createTestWorkspace('multiuser-auth');
let studio;

const login = async (base, username, password) => {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const body = await r.json().catch(() => ({}));
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return { status: r.status, body, cookie };
};
const call = async (base, route, { method = 'GET', cookie = '', data } = {}) => {
  const r = await fetch(base + route, { method, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const body = await r.json().catch(() => ({}));
  const setCookie = (r.headers.get('set-cookie') || '').split(';')[0];
  // 必须回传"响应里新签发的 cookie"，而不是调用方传进来的那个：
  // 改密接口会吊销全部会话并重新签发，用旧值会误判成失败。
  return { status: r.status, body, cookie: setCookie };
};

try {
  await writePublicationFixture(dir);
  studio = await startTestStudio(dir, { STUDIO_ADMIN_PASSWORD: ADMIN_PW });
  let base = studio.base;

  console.log('多用户认证回归：');

  // 1) 数据库与引导
  const dbFile = path.join(dir, '.v3-users', 'users.db');
  assert.equal(statSync(dbFile).mode & 0o777, 0o600, '用户数据库权限必须是 600（含密码哈希）');
  assert.equal(statSync(path.join(dir, '.v3-users')).mode & 0o777, 0o700, '用户数据库目录权限必须是 700');

  // 2) 未登录不能访问
  assert.equal((await call(base, '/api/issues')).status, 401, '未登录必须 401');

  // 2.5) 公开登录页：未登录也必须能打开，且带注册入口
  for (const route of ['/login', '/']) {
    const r = await fetch(base + route, { redirect: 'manual' });
    const html = await r.text();
    assert.equal(r.status, 200, `${route} 作为登录页必须免登录可访问`);
    assert(/paneRegister|registerForm/.test(html), `${route} 应包含注册表单`);
    assert(!/registerJournalName/.test(html), `${route} 注册表单不应再要求填写期刊名`);
    // 自包含：公开地址下相对资源会解析到杂志静态目录，所以样式与脚本必须内联
    assert(/<style>/.test(html) && /login-tabs/.test(html), `${route} 应内联登录页样式`);
    assert(/API_BASE/.test(html) && !/src="\.\/login\.js/.test(html), `${route} 应内联脚本且不引用外部 login.js`);
  }
  // 公开地址（nginx 反代 /new-jc-magazine/login 到 /login）走的就是这个页面，
  // 页面内的接口基址必须能在两种路径下都算对：见 login.js 的 API_BASE 推导。
  const loginPageHtml = await (await fetch(base + '/login')).text();
  assert(loginPageHtml.includes("'/new-jc-magazine-admin/api'"), '公开路径下的接口基址必须指向管理端前缀');
  console.log('  公开登录/注册页免登录可访问 ✓');

  // 3) 管理员登录
  const admin = await login(base, 'admin', ADMIN_PW);
  assert.equal(admin.status, 200, `管理员登录失败 ${JSON.stringify(admin.body)}`);
  assert.equal(admin.body.role, 'admin', '管理员角色应为 admin');
  assert.ok(admin.cookie, '登录应下发会话 cookie');
  console.log('  管理员引导与登录 ✓');

  // 4) 注册校验
  const badPw = await call(base, '/api/auth/register', { method: 'POST', data: { username: 'editor1', password: 'short' } });
  assert.equal(badPw.status, 400, `弱密码应被拒绝：${JSON.stringify(badPw.body)}`);
  const badName = await call(base, '/api/auth/register', { method: 'POST', data: { username: 'a', password: USER_PW } });
  assert.equal(badName.status, 400, '非法用户名应被拒绝');

  // 5) 注册 → 待审批
  const reg = await call(base, '/api/auth/register', { method: 'POST', data: { username: 'editor1', password: USER_PW, displayName: '编辑一号' } });
  assert.equal(reg.status, 201, `注册失败 ${JSON.stringify(reg.body)}`);
  assert.equal(reg.body.status, 'pending', '新注册账号必须是待审批');
  const dup = await call(base, '/api/auth/register', { method: 'POST', data: { username: 'editor1', password: USER_PW } });
  assert.equal(dup.status, 409, '重复用户名应返回 409');

  // 6) 待审批不能登录
  const pending = await login(base, 'editor1', USER_PW);
  assert.equal(pending.status, 403, '待审批账号不应能登录');
  assert.equal(pending.body.code, 'AUTH_PENDING', `待审批错误码应为 AUTH_PENDING：${JSON.stringify(pending.body)}`);
  console.log('  注册→待审批→拒绝登录 ✓');

  // 7) 审批
  const users = await call(base, '/api/admin/users', { cookie: admin.cookie });
  assert.equal(users.status, 200, '管理员应能读取用户列表');
  const editor = users.body.users.find(x => x.username === 'editor1');
  assert.ok(editor && editor.status === 'pending', '用户列表应包含待审批账号');
  assert.equal(users.body.stats.pending, 1, '待审批计数应为 1');
  const approve = await call(base, `/api/admin/users/${editor.id}/status`, { method: 'POST', cookie: admin.cookie, data: { status: 'active' } });
  assert.equal(approve.status, 200, `审批失败 ${JSON.stringify(approve.body)}`);
  assert.equal(approve.body.user.status, 'active', '审批后状态应为 active');

  // 8) 登录 + 角色隔离
  const user = await login(base, 'editor1', USER_PW);
  assert.equal(user.status, 200, `审批后应能登录 ${JSON.stringify(user.body)}`);
  assert.equal(user.body.role, 'editor', '普通用户角色应为 editor');
  assert.equal(user.body.canPublish, false, '新用户默认不可发布');
  assert.equal(user.body.journalName, '', '注册不再填写刊名，初始应为空');
  const forbidden = await call(base, '/api/admin/users', { cookie: user.cookie });
  assert.equal(forbidden.status, 403, '普通用户不得访问用户管理接口');
  console.log('  审批→登录→角色隔离 ✓');

  // 9) 不能自助提权
  await call(base, '/api/me/profile', { method: 'PUT', cookie: user.cookie, data: { canPublish: true, role: 'admin', journalName: '改名后的期刊' } });
  const self = await call(base, '/api/me/profile', { cookie: user.cookie });
  assert.equal(self.body.account.canPublish, false, '普通用户不得通过资料接口给自己提权');
  assert.equal(self.body.account.role, 'editor', '普通用户不得改自己的角色');
  assert.equal(self.body.account.journalName, '改名后的期刊', '用户应能修改自己的刊名');
  console.log('  自助资料（可改刊名、不可提权）✓');

  // 10) 管理员授权发布
  const grant = await call(base, `/api/admin/users/${editor.id}/publish`, { method: 'POST', cookie: admin.cookie, data: { canPublish: true } });
  assert.equal(grant.body.user.canPublish, true, '管理员应能授予发布权');

  // 11) 会话在服务重启后仍然有效（会话落库）
  await stopTestStudio(studio);
  studio = await startTestStudio(dir, { STUDIO_ADMIN_PASSWORD: ADMIN_PW });
  base = studio.base;
  const afterRestart = await call(base, '/api/me/profile', { cookie: user.cookie });
  assert.equal(afterRestart.status, 200, '服务重启后既有会话应仍然有效（会话必须落库）');
  assert.equal(afterRestart.body.account.username, 'editor1', '重启后应仍是同一用户');
  console.log('  服务重启后会话保持 ✓');

  // 12) 改密吊销其它会话
  const other = await login(base, 'editor1', USER_PW);
  assert.equal(other.status, 200, '改密前应能再登录一次');
  const change = await call(base, '/api/me/password', { method: 'POST', cookie: user.cookie, data: { currentPassword: USER_PW, newPassword: 'ChangedPass456' } });
  assert.equal(change.status, 200, `改密失败 ${JSON.stringify(change.body)}`);
  const stale = await call(base, '/api/me/profile', { cookie: other.cookie });
  assert.equal(stale.status, 401, '改密后其它会话必须失效');
  // 改密会吊销全部会话，并为发起改密的浏览器重新签发一个（否则用户会被自己踢出）
  assert.ok(change.cookie, '改密后应为当前浏览器重新签发会话');
  const reissued = await call(base, '/api/me/profile', { cookie: change.cookie });
  assert.equal(reissued.status, 200, '改密后当前浏览器应保持登录');
  const wrongCurrent = await call(base, '/api/me/password', { method: 'POST', cookie: change.cookie, data: { currentPassword: 'nope', newPassword: 'AnotherPass789' } });
  assert.equal(wrongCurrent.status, 403, '当前密码错误应被拒绝');
  user.cookie = change.cookie;
  console.log('  改密吊销旧会话（并为当前浏览器续签）✓');

  // 13) 禁用立即踢下线
  const disable = await call(base, `/api/admin/users/${editor.id}/status`, { method: 'POST', cookie: admin.cookie, data: { status: 'disabled' } });
  assert.equal(disable.status, 200);
  const kicked = await call(base, '/api/me/profile', { cookie: user.cookie });
  assert.equal(kicked.status, 401, '被禁用账号的会话必须立即失效');
  const disabledLogin = await login(base, 'editor1', 'ChangedPass456');
  assert.equal(disabledLogin.status, 403, '被禁用账号不应能登录');
  assert.equal(disabledLogin.body.code, 'AUTH_DISABLED', '禁用错误码应为 AUTH_DISABLED');
  console.log('  禁用→立即踢下线 ✓');

  // 14) 不能删除管理员；可以删除普通用户
  const adminRow = users.body.users.find(x => x.role === 'admin');
  const delAdmin = await call(base, `/api/admin/users/${adminRow.id}`, { method: 'DELETE', cookie: admin.cookie });
  assert.equal(delAdmin.status, 409, '不得删除管理员账号');
  const delUser = await call(base, `/api/admin/users/${editor.id}`, { method: 'DELETE', cookie: admin.cookie });
  assert.equal(delUser.status, 200, '应能删除普通用户');
  const afterDelete = await call(base, '/api/admin/users', { cookie: admin.cookie });
  assert.equal(afterDelete.body.users.filter(x => x.username === 'editor1').length, 0, '删除后不应再出现');

  // 14.5) 创作空间隔离
  // 既有期刊归属：管理员名下
  const adminIssues = await call(base, '/api/issues', { cookie: admin.cookie });
  assert.equal(adminIssues.status, 200, '管理员应能列出期刊');
  assert.ok(adminIssues.body.length >= 1, '管理员应能看到既有期刊（fixture 里是 003）');
  const owned = await call(base, '/api/admin/issues', { cookie: admin.cookie });
  assert.equal(owned.status, 200, '管理员应能查看归属总表');
  assert.ok(owned.body.issues.every(x => x.ownerId), '每一期都应有归属，不能有无主期刊');
  const plainId = owned.body.issues[0].id;

  // 新建一个普通用户并审批（上一段把它删掉了）
  await call(base, '/api/auth/register', { method: 'POST', data: { username: 'editor2', password: USER_PW, displayName: '编辑二号' } });
  const list2 = await call(base, '/api/admin/users', { cookie: admin.cookie });
  const ed2 = list2.body.users.find(x => x.username === 'editor2');
  await call(base, `/api/admin/users/${ed2.id}/status`, { method: 'POST', cookie: admin.cookie, data: { status: 'active' } });
  const ed2login = await login(base, 'editor2', USER_PW);
  assert.equal(ed2login.status, 200, '第二个用户应能登录');

  // 普通用户：看不到别人的期刊，直接访问被拒
  const mineList = await call(base, '/api/issues', { cookie: ed2login.cookie });
  assert.equal(mineList.status, 200, '普通用户应能列表（可能为空）');
  assert.equal(mineList.body.length, 0, `新用户不应看到任何既有期刊：${JSON.stringify(mineList.body)}`);
  for (const route of [`/api/issues/${plainId}`, `/api/issues/${plainId}/source-status`, `/api/issues/${plainId}/audit`, `/api/issues/${plainId}/publication/status`]) {
    const r = await call(base, route, { cookie: ed2login.cookie });
    assert.equal(r.status, 403, `${route} 应拒绝非归属用户（实际 ${r.status}）`);
  }
  const writeTry = await call(base, `/api/issues/${plainId}`, { method: 'PUT', cookie: ed2login.cookie, data: { issue: {} } });
  assert.equal(writeTry.status, 403, '非归属用户不得写入别人的期刊');
  // 运维级接口也不对普通用户开放
  assert.equal((await call(base, '/api/final/status', { cookie: ed2login.cookie })).status, 403, '运维检查应仅限管理员');
  assert.equal((await call(base, '/api/admin/issues', { cookie: ed2login.cookie })).status, 403, '归属总表应仅限管理员');
  // 自助空间概览
  const space = await call(base, '/api/me/space', { cookie: ed2login.cookie });
  assert.equal(space.status, 200, '用户应能读取自己的创作空间');
  assert.equal(space.body.space.issueCount, 0, '新用户空间应为空');

  // 新建的期刊自动归到自己名下，并且只见自己的
  // 审批后自助设置刊名，并确认它成为新期刊的 publication
  const prof = await call(base, '/api/me/profile', { method: 'PUT', cookie: ed2login.cookie, data: { journalName: '二号单位电子期刊' } });
  assert.equal(prof.body.account.journalName, '二号单位电子期刊', '用户应能自助设置刊名');
  const created = await call(base, '/api/issues', { method: 'POST', cookie: ed2login.cookie, data: { subtitle: '我的第一期', label: '试刊' } });
  assert.equal(created.status, 201, `普通用户应能创建自己的期刊：${JSON.stringify(created.body).slice(0, 160)}`);
  const afterCreate = await call(base, '/api/issues', { cookie: ed2login.cookie });
  assert.equal(afterCreate.body.length, 1, `新用户应只看到自己创建的 1 期：${JSON.stringify(afterCreate.body)}`);
  const myId = afterCreate.body[0].id;
  assert.notEqual(myId, plainId, '新期刊不应覆盖既有期号');
  assert.equal((await call(base, `/api/issues/${myId}`, { cookie: ed2login.cookie })).status, 200, '用户应能读取自己的期刊');
  // 管理员仍能看到全部，并且归属正确
  const owned2 = await call(base, '/api/admin/issues', { cookie: admin.cookie });
  const mineRow = owned2.body.issues.find(x => x.id === myId);
  assert.equal(mineRow.ownerName, 'editor2', `新期刊应归创建者所有：${JSON.stringify(mineRow)}`);
  const myIssue = await call(base, `/api/issues/${myId}`, { cookie: ed2login.cookie });
  assert.equal(myIssue.body.publication, '二号单位电子期刊', `新建期刊应使用用户自定义刊名：${myIssue.body.publication}`);
  console.log(`  创作空间隔离 ✓（既有 ${owned.body.issues.length} 期归管理员，新用户只看到自己创建的 ${myId}）`);

  // 15) 审计留痕
  const audit = await call(base, '/api/admin/audit?limit=100', { cookie: admin.cookie });
  assert.equal(audit.status, 200, '管理员应能读取审计记录');
  const actions = audit.body.entries.map(x => x.action);
  for (const expect of ['auth.register', 'auth.login', 'user.status.active', 'user.publish.grant', 'user.delete']) {
    assert.ok(actions.includes(expect), `审计缺少 ${expect}：${actions.join(',')}`);
  }
  console.log(`  删除保护与审计留痕 ✓（${audit.body.entries.length} 条记录）`);

  console.log('多用户认证回归通过：引导/注册/审批/登录/隔离/授权/改密/禁用/删除/审计/重启保持 全部成立。');
} finally {
  await stopTestStudio(studio);
  await removeTestWorkspace(dir);
}
