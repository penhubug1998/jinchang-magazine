// 收尾验证：公网页面（走真实域名）+ 删除已上线期刊（隔离区/归档重建）+ 清理临时账号。
const BASE = 'http://127.0.0.1:4180';
const PUBLIC = 'https://www.jilv.online/new-jc-magazine';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PW = process.env.ADMIN_PW;
const TEST_USER = 'spacecheck';
const ISSUE = process.env.ISSUE || '006';
if (!ADMIN_PW) { console.error('缺少 ADMIN_PW'); process.exit(2); }

const results = [];
const ok = (l, d = '') => { results.push(true); console.log(`  ✓ ${l}${d ? ' — ' + d : ''}`); };
const bad = (l, d = '') => { results.push(false); console.log(`  ✗ ${l}${d ? ' — ' + d : ''}`); };
const check = (c, l, d = '') => c ? ok(l, d) : bad(l, d);

async function api(route, { method = 'GET', cookie = '', data } = {}) {
  const res = await fetch(BASE + route, { method, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  return { status: res.status, body: await res.json().catch(() => ({})), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
async function pub(pathname) {
  const res = await fetch(PUBLIC + pathname, { redirect: 'manual' });
  return { status: res.status, text: await res.text() };
}
const login = (u, p) => api('/api/auth/login', { method: 'POST', data: { username: u, password: p } });

console.log('生产收尾验证：');
const admin = await login(ADMIN_USER, ADMIN_PW);
check(admin.status === 200, '管理员登录');
const adminCookie = admin.cookie;

const spaceIssue = `${PUBLIC}/u/${TEST_USER}/${String(Number(ISSUE)).padStart(2, '0')}/`;
const page = await pub(`/u/${TEST_USER}/${String(Number(ISSUE)).padStart(2, '0')}/`);
check(page.status === 200 && page.text.includes('reader.js'), '用户分区期刊公网可读', `${spaceIssue} HTTP ${page.status}`);
const space = await pub(`/u/${TEST_USER}/`);
check(space.status === 200 && space.text.includes('分区验证临时刊'), '作者分区归档页显示自定义刊名', `HTTP ${space.status}`);
const spaces = await pub('/u/');
check(spaces.status === 200 && spaces.text.includes(`./${TEST_USER}/`), '作者空间索引列出该作者', `HTTP ${spaces.status}`);
const root = await pub('/');
check(root.status === 200, '平台首页可打开', `HTTP ${root.status}`);
check(root.text.includes('./01/') && root.text.includes('./03/'), '平台首页仍列出平台期刊');
check(!root.text.includes(`./${String(Number(ISSUE)).padStart(2, '0')}/`), '平台首页没有混入用户分区期刊');

const del = await api(`/api/issues/${ISSUE}?force=1`, { method: 'DELETE', cookie: adminCookie });
check(del.status === 200, '管理员确认删除已上线期刊', `HTTP ${del.status} ${JSON.stringify(del.body).slice(0, 160)}`);
check(String(del.body?.quarantined || '').includes('.v3-trash/issues/'), '期刊进入隔离区', String(del.body?.quarantined || ''));
check(del.body?.publicRemoved === true, '公开目录一并隔离');
const gone = await pub(`/u/${TEST_USER}/${String(Number(ISSUE)).padStart(2, '0')}/`);
check(gone.status === 404, '公网已撤下该期', `HTTP ${gone.status}`);
const rootAfter = await pub('/');
check(rootAfter.status === 200 && rootAfter.text.includes('./01/'), '删除后平台首页仍正常');
check(!rootAfter.text.includes('spacecheck'), '删除后平台首页不再出现该作者');

const users = await api('/api/admin/users', { cookie: adminCookie });
const testUser = (users.body.users || []).find(u => u.username === TEST_USER);
if (testUser) {
  const drop = await api(`/api/admin/users/${testUser.id}`, { method: 'DELETE', cookie: adminCookie });
  check(drop.status === 200, '删除临时账号', `HTTP ${drop.status} ${JSON.stringify(drop.body).slice(0, 120)}`);
} else ok('临时账号已不存在');

const issues = await api('/api/issues', { cookie: adminCookie });
const ids = (issues.body || []).map(x => String(x.id));
check(ids.length === 5 && !ids.includes(ISSUE), '期刊列表恢复为原有 5 期', ids.join(', '));

const resetReqs = await api('/api/admin/reset-requests', { cookie: adminCookie });
check((resetReqs.body.requests || []).length === 0, '没有遗留的重置申请');

const failed = results.filter(x => !x).length;
console.log(`\n结果：${results.length - failed}/${results.length} 项通过`);
process.exit(failed ? 1 : 0);
