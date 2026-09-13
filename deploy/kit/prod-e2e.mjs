// 生产端到端验证：按用户分区的三个边界问题（在服务器本机运行）。
// 只通过 HTTP 接口操作，结束后把测试期刊移入隔离区、删除测试账号。
const BASE = 'http://127.0.0.1:4180';
// 公网校验必须走真实域名：fetch 规范禁止覆盖 Host 头，
// 用 127.0.0.1 + Host 头会落到默认 server 块，得到一堆假 404。
const PUBLIC = 'https://www.jilv.online/new-jc-magazine';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PW = process.env.ADMIN_PW;
const TEST_USER = 'spacecheck';
const TEST_PW = 'SpaceCheck123';
const NEW_PW = 'SpaceCheck456';
if (!ADMIN_PW) { console.error('缺少 ADMIN_PW'); process.exit(2); }

const results = [];
const ok = (label, detail = '') => { results.push({ ok: true, label, detail }); console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); };
const bad = (label, detail = '') => { results.push({ ok: false, label, detail }); console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); };
const check = (cond, label, detail = '') => cond ? ok(label, detail) : bad(label, detail);

async function api(route, { method = 'GET', cookie = '', data, raw = false } = {}) {
  const res = await fetch(BASE + route, {
    method,
    headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const setCookie = (res.headers.get('set-cookie') || '').split(';')[0];
  const body = raw ? await res.text() : await res.json().catch(() => ({}));
  return { status: res.status, body, cookie: setCookie };
}
async function pub(pathname) {
  try {
    const res = await fetch(PUBLIC + pathname, { redirect: 'manual' });
    return { status: res.status, text: await res.text() };
  } catch (error) { return { status: 0, text: String(error) }; }
}
const login = async (username, password) => api('/api/auth/login', { method: 'POST', data: { username, password } });

console.log('生产端到端验证（按用户分区）：');

// ---------- 前置：管理员登录 ----------
const admin = await login(ADMIN_USER, ADMIN_PW);
check(admin.status === 200, '管理员登录', `HTTP ${admin.status}`);
if (admin.status !== 200) process.exit(1);
const adminCookie = admin.cookie;

const issuesBefore = await api('/api/issues', { cookie: adminCookie });
const beforeIds = (issuesBefore.body || []).map(x => String(x.id));
ok('既有期刊列表', beforeIds.join(', '));

// ---------- 1) 素材库分区 ----------
const adminStyle = await api('/api/design-library', { method: 'POST', cookie: adminCookie, data: { name: `分区验证-管理员样式-${Date.now()}`, scope: 'theme', contextType: 'theme', payload: { accent: '#8d1f1c' } } });
check(adminStyle.status === 201, '管理员保存样式');
const adminStyleId = adminStyle.body?.id;

// 测试账号：存在就复用，不存在就创建
let users = await api('/api/admin/users', { cookie: adminCookie });
let testUser = (users.body.users || []).find(u => u.username === TEST_USER);
if (!testUser) {
  const created = await api('/api/auth/register', { method: 'POST', data: { username: TEST_USER, password: TEST_PW, displayName: '分区验证临时账号' } });
  check(created.status === 201, '注册临时账号', `HTTP ${created.status}`);
  users = await api('/api/admin/users', { cookie: adminCookie });
  testUser = (users.body.users || []).find(u => u.username === TEST_USER);
} else {
  await api(`/api/admin/users/${testUser.id}/password`, { method: 'POST', cookie: adminCookie, data: { password: TEST_PW } });
  ok('复用已存在的临时账号');
}
check(Boolean(testUser), '临时账号出现在用户列表');
await api(`/api/admin/users/${testUser.id}/status`, { method: 'POST', cookie: adminCookie, data: { status: 'active' } });
let userSession = await login(TEST_USER, TEST_PW);
check(userSession.status === 200, '临时账号登录', `HTTP ${userSession.status}`);

const userStyles = await api('/api/design-library', { cookie: userSession.cookie });
check((userStyles.body.styles || []).length === 0, '用户看不到管理员的样式库', `实际 ${(userStyles.body.styles || []).length} 条`);
const userStyle = await api('/api/design-library', { method: 'POST', cookie: userSession.cookie, data: { name: `分区验证-用户样式-${Date.now()}`, scope: 'theme', contextType: 'theme', payload: { accent: '#315f4a' } } });
check(userStyle.status === 201, '用户保存自己的样式');
const adminStylesNow = await api('/api/design-library', { cookie: adminCookie });
check(!(adminStylesNow.body.styles || []).some(x => x.id === userStyle.body?.id), '用户样式不出现在管理员库里');
const crossDelete = await api(`/api/design-library/${encodeURIComponent(adminStyleId)}`, { method: 'DELETE', cookie: userSession.cookie });
check(crossDelete.status === 404, '用户跨账号删除样式被拒绝', `HTTP ${crossDelete.status}`);

// ---------- 2) 发布命名空间 ----------
await api('/api/me/profile', { method: 'PUT', cookie: userSession.cookie, data: { displayName: '分区验证临时账号', journalName: '分区验证临时刊' } });
let mine = await api('/api/issues', { cookie: userSession.cookie });
check((mine.body || []).length === 0, '新账号的创作空间是空的', `实际 ${(mine.body || []).length} 期`);

const createIssue = await api('/api/issues', { method: 'POST', cookie: userSession.cookie, data: { subtitle: '分区验证临时刊', label: '分区验证', startMode: 'blank' } });
check(createIssue.status === 201, '用户新建期刊', `HTTP ${createIssue.status} ${JSON.stringify(createIssue.body).slice(0, 160)}`);
const issueId = String(createIssue.body?.issue?.id || '');
check(Boolean(issueId), '拿到新期刊期号', issueId);
const publication = await api(`/api/issues/${issueId}`, { cookie: userSession.cookie });
check(publication.body?.publication === '分区验证临时刊', '自定义刊名成为该期 publication', String(publication.body?.publication));

const noGrant = await api(`/api/issues/${issueId}/publication/deploy`, { method: 'POST', cookie: userSession.cookie, data: {} });
check(noGrant.status === 403 && noGrant.body?.code === 'PUBLISH_FORBIDDEN', '未授权账号不能调用部署接口', `HTTP ${noGrant.status} ${noGrant.body?.code || ''}`);

await api(`/api/admin/users/${testUser.id}/publish`, { method: 'POST', cookie: adminCookie, data: { canPublish: true } });
console.log('  … 生成正式发布包（可能需要 1–3 分钟）');
const release = await api(`/api/issues/${issueId}/publication/release`, { method: 'POST', cookie: userSession.cookie, data: {} });
check(release.status === 200, '用户生成正式发布包', `HTTP ${release.status} ${JSON.stringify(release.body).slice(0, 200)}`);
const deploy = await api(`/api/issues/${issueId}/publication/deploy`, { method: 'POST', cookie: userSession.cookie, data: {} });
check(deploy.status === 200, '用户部署到公开网站', `HTTP ${deploy.status} ${JSON.stringify(deploy.body).slice(0, 200)}`);
const remotePath = String(deploy.body?.deployment?.remotePath || '');
const publicUrl = String(deploy.body?.deployment?.url || '');
check(remotePath.startsWith(`u/${TEST_USER}/`), '发布路径落在用户分区', remotePath);
check(publicUrl.includes(`/u/${TEST_USER}/`), '公开链接指向用户分区', publicUrl);
check(deploy.body?.deployment?.verified === true, '在线校验通过');

const pageResp = await pub(`/u/${TEST_USER}/${remotePath.split('/').pop()}/`);
check(pageResp.status === 200 && pageResp.text.includes('reader.js'), '公网地址可打开该期', `HTTP ${pageResp.status}`);
const spaceResp = await pub(`/u/${TEST_USER}/`);
check(spaceResp.status === 200 && spaceResp.text.includes('分区验证临时刊'), '作者分区归档页可打开并显示刊名', `HTTP ${spaceResp.status}`);
const spacesIndex = await pub('/u/');
check(spacesIndex.status === 200 && spacesIndex.text.includes(`./${TEST_USER}/`), '作者空间索引列出该作者', `HTTP ${spacesIndex.status}`);
const rootPage = await pub('/');
check(rootPage.status === 200, '平台首页可打开', `HTTP ${rootPage.status}`);
check(!rootPage.text.includes(`./${remotePath.split('/').pop()}/`), '平台首页没有混入用户期刊');
check(rootPage.text.includes('./01/') || !beforeIds.includes('001'), '平台首页仍列出平台期刊');

// ---------- 3) 忘记密码 ----------
const forgot = await api('/api/auth/forgot', { method: 'POST', data: { username: TEST_USER } });
check(forgot.status === 200 && forgot.body?.registered === true, '提交忘记密码申请', `HTTP ${forgot.status}`);
const reqs = await api('/api/admin/reset-requests', { cookie: adminCookie });
const pending = (reqs.body.requests || []).find(x => x.username === TEST_USER);
check(Boolean(pending), '管理员看到待处理申请');
const code = await api(`/api/admin/users/${testUser.id}/reset-code`, { method: 'POST', cookie: adminCookie });
check(code.status === 200 && /^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(code.body?.code || ''), '管理员签发一次性重置码', code.body?.code);
const reset = await api('/api/auth/reset', { method: 'POST', data: { username: TEST_USER, code: code.body.code.toLowerCase(), newPassword: NEW_PW } });
check(reset.status === 200, '用户用重置码自助改密', `HTTP ${reset.status} ${JSON.stringify(reset.body).slice(0, 120)}`);
const oldSession = await api('/api/issues', { cookie: userSession.cookie });
check(oldSession.status === 401, '改密后旧会话失效', `HTTP ${oldSession.status}`);
userSession = await login(TEST_USER, NEW_PW);
check(userSession.status === 200, '新密码可以登录');
const codeReuse = await api('/api/auth/reset', { method: 'POST', data: { username: TEST_USER, code: code.body.code, newPassword: TEST_PW } });
check(codeReuse.status === 403, '重置码不可重复使用', `HTTP ${codeReuse.status}`);

// ---------- 4) 删除期刊 ----------
const ownerDelete = await api(`/api/issues/${issueId}`, { method: 'DELETE', cookie: userSession.cookie });
check(ownerDelete.status === 403 && ownerDelete.body?.code === 'ISSUE_PUBLISHED', '已上线期刊不能由作者自行删除', `HTTP ${ownerDelete.status}`);
const adminNoForce = await api(`/api/issues/${issueId}`, { method: 'DELETE', cookie: adminCookie });
check(adminNoForce.status === 409, '管理员删除已上线期刊需要显式确认', `HTTP ${adminNoForce.status}`);
const adminDelete = await api(`/api/issues/${issueId}?force=1`, { method: 'DELETE', cookie: adminCookie });
check(adminDelete.status === 200, '管理员确认删除', `HTTP ${adminDelete.status} ${JSON.stringify(adminDelete.body).slice(0, 200)}`);
check(!adminDelete.body?.publicError, '公开副本迁移没有报错', String(adminDelete.body?.publicError || ''));
check(String(adminDelete.body?.quarantined || '').startsWith('.v3-trash/issues/'), '期刊源隔离区在应用目录内', String(adminDelete.body?.quarantined || ''));
const derived = adminDelete.body?.derived || {};
check(Array.isArray(derived.failed) && derived.failed.length === 0, '派生数据隔离没有失败项', JSON.stringify(derived.failed || []));
check((derived.moved || []).length >= 5, '派生数据已一并隔离（构建/发布包/输出/报告/回执）', `moved=${(derived.moved || []).length} ${(derived.moved || []).slice(0, 8).join(',')}`);
check(String(adminDelete.body?.quarantined || '').includes('.v3-trash/issues/'), '期刊进入隔离区', String(adminDelete.body?.quarantined || ''));
check(adminDelete.body?.publicRemoved === true, '公开目录一并隔离');
const gone = await pub(`/u/${TEST_USER}/${remotePath.split('/').pop()}/`);
check(gone.status === 404 || gone.status === 200 && !gone.text.includes('reader.js'), '公网已撤下该期', `HTTP ${gone.status}`);
const spaceAfter = await pub(`/u/${TEST_USER}/`);
check(spaceAfter.status === 404 || !spaceAfter.text.includes('reader.js'), '作者分区页已撤销', `HTTP ${spaceAfter.status}`);

// ---------- 收尾 ----------
const cleanupStyle = await api(`/api/design-library/${encodeURIComponent(userStyle.body?.id)}`, { method: 'DELETE', cookie: userSession.cookie });
check(cleanupStyle.status === 200, '清理临时样式');
const cleanupAdminStyle = await api(`/api/design-library/${encodeURIComponent(adminStyleId)}`, { method: 'DELETE', cookie: adminCookie });
check(cleanupAdminStyle.status === 200, '清理管理员临时样式');
// 重置码试错必须只锁重置接口，不能把登录一起锁掉（两者已拆成独立限速桶）
for (let i = 0; i < 8; i += 1) await api('/api/auth/reset', { method: 'POST', data: { username: TEST_USER, code: 'ZZZZZ-ZZZZZ', newPassword: 'SpaceWrong123' } });
const resetLocked = await api('/api/auth/reset', { method: 'POST', data: { username: TEST_USER, code: 'ZZZZZ-ZZZZZ', newPassword: 'SpaceWrong123' } });
check(resetLocked.status === 429, '重置码连错后重置接口被限速', `HTTP ${resetLocked.status}`);
const loginAfter = await login(ADMIN_USER, ADMIN_PW);
check(loginAfter.status === 200, '重置码试错不影响登录（独立限速桶）', `HTTP ${loginAfter.status}`);

const dropUser = await api(`/api/admin/users/${testUser.id}`, { method: 'DELETE', cookie: adminCookie });
check(dropUser.status === 200, '删除临时账号', `HTTP ${dropUser.status}`);

const issuesAfter = await api('/api/issues', { cookie: adminCookie });
check(JSON.stringify((issuesAfter.body || []).map(x => String(x.id)).sort()) === JSON.stringify([...beforeIds].sort()), '既有期刊列表保持原样', (issuesAfter.body || []).map(x => x.id).join(', '));

const failed = results.filter(x => !x.ok);
console.log(`\n结果：${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) { console.log('失败项：'); failed.forEach(x => console.log(`  - ${x.label} ${x.detail}`)); process.exit(1); }
console.log('生产端到端验证全部通过。');
