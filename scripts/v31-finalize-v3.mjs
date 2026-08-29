import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './lib-v3-production.mjs';
if(!process.argv.includes('--confirm')){console.error('V3.1.0 Final 封版需要 --confirm');process.exit(2)}
const run=(script,args=[])=>{const r=spawnSync(process.execPath,[path.join(root,'scripts',script),...args],{cwd:root,stdio:'inherit'});if(r.status!==0)process.exit(r.status??1)};
run('v31-final-promotion-gate-v3.mjs',['--strict']);
const pkgPath=path.join(root,'package.json');const original=await readFile(pkgPath,'utf8');const pkg=JSON.parse(original);if(pkg.version!=='3.1.0-rc.2'){console.error(`期望 RC2，当前 ${pkg.version}`);process.exit(1)};if(pkg.v31SchemaVersion!=='3.1-alpha24'){console.error('Schema 已漂移，禁止 Final');process.exit(1)};
pkg.version='3.1.0';pkg.v31Release='3.1.0';pkg.v31ReleasedAt=new Date().toISOString();
const releaseFile=path.join(root,'reports/v31-final-release.json');
try{
  await writeFile(pkgPath,JSON.stringify(pkg,null,2)+'\n');
  const release={version:'3.1.0',schema:pkg.v31SchemaVersion,releasedAt:pkg.v31ReleasedAt,status:'RELEASED',sourceCandidate:'3.1.0-rc.2',gate:'reports/v31-final-promotion-gate.json',note:'V3.1.0 仅在 RC2 本地 Gate、完整媒体、真实 Edge/Safari/iPhone Safari、正式 HTTPS deploy/rollback/redeploy 全部 READY 后封版。'};
  await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(releaseFile,JSON.stringify(release,null,2)+'\n');
  run('check-v3.mjs');run('build-v3.mjs');run('v31-final-promotion-gate-v3.mjs',['--strict']);
  console.log('V3.1.0 Final 已封版并完成 check/build/证据复核。请生成最终 Full Source / deploy package 与 SHA-256。');
}catch(error){await writeFile(pkgPath,original);await rm(releaseFile,{force:true});throw error;}
