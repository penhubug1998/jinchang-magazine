// 管理端登录自测。
//
// 这里跑在临时工作区里（与其他套件一致），不再直接占用仓库根目录：
// 之前它会在仓库的 .v3-users/users.db 里真的建一个 admin 账号，导致后续
// 依赖"本地免登录"的套件（alpha4/alpha5 等）下一次运行时被登录层拦住。
// 密码也必须带上数字，否则会被多用户的密码强度校验直接拒绝启动。
import { createTestWorkspace, startTestStudio, stopTestStudio, removeTestWorkspace } from './lib-v3-test-workspace.mjs';

const password = 'local-admin-1-password';
const dir = await createTestWorkspace('admin-auth');
let studio = null;

const fail = (message) => { throw new Error(message); };
const expect = (condition, message) => { if (!condition) fail(message); };

async function json(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

try {
  studio = await startTestStudio(dir, { STUDIO_ADMIN_USER: 'admin', STUDIO_ADMIN_PASSWORD: password });
  const base = studio.base;
  const logs = () => studio.logs();

  const configSession = await fetch(`${base}/api/auth/session`);
  const configBody = await json(configSession);
  expect(configBody.enabled === true, `登录自测进程未读取 STUDIO_ADMIN_PASSWORD：HTTP ${configSession.status}，${JSON.stringify(configBody)}，日志 ${logs().slice(-500)}`);

  const loginPage = await fetch(`${base}/`);
  const loginHtml = await loginPage.text();
  expect(loginPage.status === 200 && loginHtml.includes('adminLoginForm'), `未登录访问根路径没有返回登录页：HTTP ${loginPage.status}，响应长度 ${loginHtml.length}，响应片段 ${loginHtml.slice(0, 180)}`);

  const protectedApi = await fetch(`${base}/api/issues`);
  const protectedBody = await json(protectedApi);
  expect(protectedApi.status === 401 && protectedBody.code === 'AUTH_REQUIRED', '未登录 API 没有返回 AUTH_REQUIRED');

  const health = await fetch(`${base}/api/health`);
  expect(health.status === 200, '健康检查不应被管理端登录层拦截');

  const badLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'wrong' }),
  });
  const badBody = await json(badLogin);
  expect(badLogin.status === 401 && badBody.code === 'AUTH_INVALID', '错误密码没有返回 AUTH_INVALID');

  const goodLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password }),
  });
  const goodBody = await json(goodLogin);
  const cookie = goodLogin.headers.get('set-cookie')?.split(';', 1)[0];
  expect(goodLogin.status === 200 && goodBody.ok === true && cookie, '正确凭据没有建立管理端会话');

  const session = await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookie } });
  const sessionBody = await json(session);
  expect(session.status === 200 && sessionBody.authenticated === true && sessionBody.user === 'admin', '会话查询结果不正确');

  const authorizedApi = await fetch(`${base}/api/issues`, { headers: { Cookie: cookie } });
  expect(authorizedApi.status === 200, '登录后仍无法访问管理端 API');

  const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
  expect(logout.status === 200, '退出登录接口失败');
  const afterLogout = await fetch(`${base}/api/issues`);
  expect(afterLogout.status === 401, '退出后管理端 API 仍可访问');

  console.log('管理端登录自测通过：未登录保护、错误反馈、登录会话、受保护 API、退出登录均正常。');
} finally {
  await stopTestStudio(studio);
  await removeTestWorkspace(dir);
}
