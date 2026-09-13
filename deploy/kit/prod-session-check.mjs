// 生产验证：登录设备可见性 + 退出其他设备（自服务）。
const BASE='http://127.0.0.1:4180';
const ADMIN_PW=process.env.ADMIN_PW, USER=process.env.ADMIN_USER||'admin';
const out=[];const check=(c,l,d='')=>{out.push(c);console.log(`  ${c?'✓':'✗'} ${l}${d?' — '+d:''}`)};
const api=async(route,{method='GET',cookie='',data}={})=>{const r=await fetch(BASE+route,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});return{status:r.status,body:await r.json().catch(()=>({})),cookie:(r.headers.get('set-cookie')||'').split(';')[0]}};
const login=async()=>{const r=await fetch(BASE+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:USER,password:ADMIN_PW})});return{status:r.status,cookie:(r.headers.get('set-cookie')||'').split(';')[0]}};

const a=await login(); check(a.status===200,'设备 A 登录');
const b=await login(); check(b.status===200,'设备 B 登录');
const list=await api('/api/me/sessions',{cookie:b.cookie});
check(list.status===200,'读取登录设备列表',`HTTP ${list.status}`);
check(list.body.sessions.length>=2,`列表包含多台设备`, `count=${list.body.sessions.length}`);
check(list.body.sessions.filter(x=>x.current).length===1,'恰好标记一个当前设备');
check(list.body.sessions.every(x=>x.device&&x.ip!==undefined&&!JSON.stringify(x).includes('token')),'设备信息完整且不含令牌');
const before=list.body.sessions.length;
const revoke=await api('/api/me/sessions/logout-others',{method:'POST',cookie:b.cookie});
check(revoke.status===200&&revoke.body.revoked===before-1,`退出其他设备（吊销 ${revoke.body?.revoked} 个）`);
check((await api('/api/me/sessions',{cookie:a.cookie})).status===401,'被吊销的设备立即失效');
check((await api('/api/me/sessions',{cookie:b.cookie})).status===200,'当前设备保持登录');
const after=await api('/api/me/sessions',{cookie:b.cookie});
check(after.body.sessions.length===1,'列表只剩当前设备');
console.log(`\n结果：${out.filter(Boolean).length}/${out.length} 项通过`);
process.exit(out.every(Boolean)?0:1);
