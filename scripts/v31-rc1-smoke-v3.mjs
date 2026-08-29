import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, V3_VERSION, V31_SCHEMA_VERSION } from './lib-v3-production.mjs';
const assert=(c,m)=>{if(!c)throw new Error(m)};
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
assert(V3_VERSION==='3.1.0-rc.1',`version=${V3_VERSION}`);
assert(pkg.v3StableVersion==='3.0.0','V3 stable lock changed');
assert(V31_SCHEMA_VERSION==='3.1-alpha24',`RC1 schema must remain frozen at alpha24, got ${V31_SCHEMA_VERSION}`);
const beta=JSON.parse(await readFile(path.join(root,'reports','v31-beta1-production-last.json'),'utf8'));
assert(beta.ok===true,'Beta1 production E2E evidence missing or failed');
assert(Array.isArray(beta.checkpoints)&&beta.checkpoints.length>=24,'Beta1 production evidence incomplete');
for(const n of ['正式发布','手机查看','回滚','生产证据复核'])assert(beta.checkpoints.some(x=>x.name===n&&x.ok),`Beta1 evidence missing ${n}`);
for(const f of ['scripts/v31-rc1-real-content-v3.mjs','scripts/v31-rc1-deployment-v3.mjs','scripts/v31-rc1-performance-v3.mjs'])await access(path.join(root,f));
for(const f of ['scripts/v31-rc1-smoke-v3.mjs','scripts/v31-rc1-real-content-v3.mjs','scripts/v31-rc1-deployment-v3.mjs','scripts/v31-rc1-performance-v3.mjs']){const r=spawnSync(process.execPath,['--check',path.join(root,f)],{encoding:'utf8'});assert(r.status===0,`${f} syntax failed: ${r.stderr}`)}
for(const id of ['001','002']){const issue=JSON.parse(await readFile(path.join(root,'issues',id,'issue.json'),'utf8'));assert(issue.engine==='v3',`${id} engine`);assert(issue.status==='published',`${id} published status`);assert(issue.pages?.length>=10,`${id} page count suspicious`);assert(issue.pages[0]?.type==='cover',`${id} cover missing`);}
console.log('V3.1 RC1 smoke 通过：版本冻结、Schema 冻结、Beta1 生产证据、候选版测试脚本与真实期刊基础结构均正常。');
