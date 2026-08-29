import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root, V3_VERSION } from './lib-v3-production.mjs';
const suites=[];for(const version of ['alpha26','alpha25','alpha24','alpha23','alpha22-1','alpha22','alpha21','alpha20','alpha19']){suites.push(`test:v31-${version}`);suites.push(`test:v31-${version}-browser`)}
const results=[];
for(const suite of suites){const r=spawnSync('npm',['run',suite],{cwd:root,encoding:'utf8',timeout:240000,maxBuffer:16*1024*1024});results.push({suite,ok:r.status===0,stdout:String(r.stdout||'').trim().split('\n').slice(-2).join('\n'),stderr:String(r.stderr||'').trim().split('\n').slice(-3).join('\n')});if(r.status!==0){await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,'reports','v31-rc1-compat.json'),JSON.stringify({version:V3_VERSION,status:'failed',results},null,2)+'\n');throw new Error(`${suite} failed\n${r.stdout}\n${r.stderr}`)}}
await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,'reports','v31-rc1-compat.json'),JSON.stringify({version:V3_VERSION,generatedAt:new Date().toISOString(),status:'passed',smoke:9,chromium:9,range:'alpha19-alpha26',results},null,2)+'\n');console.log('V3.1 RC1 兼容门禁通过：Alpha26 → Alpha19 共 9 组 Smoke + 9 组 Chromium 全部通过。');
