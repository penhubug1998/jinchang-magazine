import { spawn } from 'node:child_process';

const port = 43000 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const password = 'local-admin-test-password';
let child;
let logs = '';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message) => { throw new Error(message); };
const expect = (condition, message) => { if (!condition) fail(message); };

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {}
    await wait(100);
  }
  fail(`管理端登录自测服务启动失败：${logs.slice(-500)}`);
}

async function json(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

try {
  child = spawn(process.execPath, ['scripts/studio-v3.mjs', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, STUDIO_ADMIN_USER: 'admin', STUDIO_ADMIN_PASSWORD: password },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  await waitForHealth();

  const configSession = await fetch(`${base}/api/auth/session`);
  const configBody = await json(configSession);
  expect(configBody.enabled === true, `登录自测进程未读取 STUDIO_ADMIN_PASSWORD：HTTP ${configSession.status}，${JSON.stringify(configBody)}，日志 ${logs.slice(-500)}`);

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
  if (child && !child.killed) child.kill('SIGTERM');
  await wait(100);
}
