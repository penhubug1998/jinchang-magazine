// 登录 / 注册页。
//
// 这个页面同时由两个入口提供：
//   1. 应用自身：/login（未登录访问 / 时也回落到它）
//   2. 公开地址：/new-jc-magazine/login（nginx 反代到应用的 /login）
// 因此接口基址不能写死成相对路径——公开地址下相对路径会落到 /new-jc-magazine/api/*。
// 这里按当前路径推导：公开路径 → 走管理端前缀；否则用同级 ./api。
const API_BASE = (() => {
  const path = location.pathname;
  if (path.startsWith('/new-jc-magazine/')) return '/new-jc-magazine-admin/api';
  return new URL('./api', location.href).pathname.replace(/\/$/, '');
})();

const $ = selector => document.querySelector(selector);
const loginForm = $('#adminLoginForm'), userInput = $('#adminUsername'), passwordInput = $('#adminPassword');
const loginSubmit = $('#adminLoginSubmit'), loginStatus = $('#adminLoginStatus');
const registerForm = $('#registerForm'), registerStatus = $('#registerStatus'), registerSubmit = $('#registerSubmit');
const tabLogin = $('#tabLogin'), tabRegister = $('#tabRegister'), paneLogin = $('#paneLogin'), paneRegister = $('#paneRegister');

function setStatus(node, message, kind = '') { if (!node) return; node.textContent = message; node.className = `login-status ${kind}`.trim(); }
async function readJson(response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return { error: text || response.statusText }; } }

function showTab(which) {
  const login = which === 'login';
  tabLogin?.classList.toggle('is-active', login);
  tabRegister?.classList.toggle('is-active', !login);
  tabLogin?.setAttribute('aria-selected', String(login));
  tabRegister?.setAttribute('aria-selected', String(!login));
  if (paneLogin) paneLogin.hidden = !login;
  if (paneRegister) paneRegister.hidden = login;
}
tabLogin?.addEventListener('click', () => showTab('login'));
tabRegister?.addEventListener('click', () => showTab('register'));

async function loadSession() {
  try {
    const response = await fetch(`${API_BASE}/auth/session`, { cache: 'no-store' });
    const data = await readJson(response);
    if (data.authenticated) { location.replace(new URL('./', location.href).pathname); return; }
    if (data.enabled === false) setStatus(loginStatus, '服务器尚未配置账号体系。');
  } catch { setStatus(loginStatus, '无法连接服务器，请稍后重试。'); }
}

loginForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const username = userInput.value.trim(), password = passwordInput.value;
  if (!username || !password) { setStatus(loginStatus, '请输入用户名和密码。'); return; }
  loginSubmit.disabled = true; loginSubmit.textContent = '登录中…'; setStatus(loginStatus, '');
  try {
    const response = await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data.error || '登录失败');
    setStatus(loginStatus, '登录成功，正在进入制作中心…', 'success');
    location.replace(new URL('./', location.href).pathname);
  } catch (error) {
    setStatus(loginStatus, error.message || '用户名或密码错误。');
    passwordInput.focus();
  } finally {
    loginSubmit.disabled = false; loginSubmit.textContent = '登录';
  }
});

registerForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const username = $('#registerUsername').value.trim();
  const displayName = $('#registerDisplayName').value.trim();
  const journalName = $('#registerJournalName').value.trim();
  const password = $('#registerPassword').value;
  const password2 = $('#registerPassword2').value;
  if (!username || !password) { setStatus(registerStatus, '请填写用户名和密码。'); return; }
  if (password !== password2) { setStatus(registerStatus, '两次输入的密码不一致。'); return; }
  registerSubmit.disabled = true; registerSubmit.textContent = '提交中…'; setStatus(registerStatus, '');
  try {
    const response = await fetch(`${API_BASE}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, displayName, journalName }) });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data.error || '注册失败');
    registerForm.reset();
    showTab('login');
    userInput.value = username;
    setStatus(loginStatus, data.message || '注册已提交，等待管理员审批通过后即可登录。', 'success');
  } catch (error) {
    setStatus(registerStatus, error.message || '注册失败，请稍后重试。');
  } finally {
    registerSubmit.disabled = false; registerSubmit.textContent = '提交注册申请';
  }
});

loadSession();
