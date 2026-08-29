import crypto from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, V3_VERSION, exists } from './lib-v3-production.mjs';
const strictLocal=process.argv.includes('--strict-local');const assert=(c,m)=>{if(!c)throw new Error(m)};
const baseline=JSON.parse(await readFile(path.join(root,'baselines/v3-rc1-media.json'),'utf8'));
const source=baseline.source||{};assert(source.repository==='penhubug1998/jinchang-magazine','media baseline repo drift');assert(/^[0-9a-f]{40}$/.test(source.commit||''),'media baseline commit missing');
const issues={};let baselineFiles=0,baselineBytes=0;
for(const id of ['001','002']){const b=baseline.issues?.[id];assert(b&&b.files?.length===b.fileCount,`${id} baseline fileCount mismatch`);const paths=new Set();let bytes=0;for(const f of b.files){assert(!paths.has(f.path),`${id} duplicate media baseline ${f.path}`);paths.add(f.path);assert(f.bytes>0&&/^[0-9a-f]{40}$/.test(f.gitBlobSha1),`${id} bad media metadata ${f.path}`);bytes+=f.bytes;}assert(bytes===b.totalBytes,`${id} baseline totalBytes mismatch`);baselineFiles+=b.fileCount;baselineBytes+=b.totalBytes;issues[id]={files:b.fileCount,bytes:b.totalBytes,assetSource:b.assetSource};}
const localRoots=await Promise.all(['1/assets','2/assets'].map(async rel=>({rel,present:await exists(path.join(root,rel))})));const localAvailable=localRoots.every(x=>x.present);let localStrict='deferred-overlay';
if(localAvailable){const r=spawnSync(process.execPath,[path.join(root,'scripts/full-media-check-v3.mjs'),'--strict','--baseline','baselines/v3-rc1-media.json'],{cwd:root,encoding:'utf8',timeout:300000,maxBuffer:16*1024*1024});if(r.status!==0)throw new Error(`strict local media failed\n${r.stdout}\n${r.stderr}`);localStrict='passed';}else if(strictLocal)throw new Error('Full Source overlay 未包含 1/assets 与 2/assets；--strict-local 要求在完整媒体仓库中执行。');
const report={version:V3_VERSION,generatedAt:new Date().toISOString(),status:localAvailable?'passed':'passed-source-baseline-local-deferred',sourceBaseline:{repository:source.repository,commit:source.commit,capturedAt:source.capturedAt,files:baselineFiles,bytes:baselineBytes,integrity:'file-size + Git blob SHA1'},connectedGithubEvidence:{verifiedAt:'2026-08-24',issue001Roots:['music','tts','video'],issue002Roots:['music','tts','video'],note:'RC2 开发会话通过已连接 GitHub 在固定 commit 上复核两个历史媒体根目录；本报告不伪装成本地字节校验。'},issues,local:{available:localAvailable,roots:localRoots,strict:localStrict},finalPromotionRequiresLocalStrict:true};
await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,'reports/v31-rc2-media.json'),JSON.stringify(report,null,2)+'\n');
if(localStrict==='passed'){
  const baselineSha256=crypto.createHash('sha256').update(await readFile(path.join(root,'baselines/v3-rc1-media.json'))).digest('hex');
  const receipt={version:V3_VERSION,generatedAt:new Date().toISOString(),strict:true,files:baselineFiles,bytes:baselineBytes,baselineSha256,baselineCommit:source.commit,roots:localRoots.map(x=>x.rel),evidence:'full-media-check-v3 --strict + fixed baseline file-size/Git-blob-SHA1'};
  await writeFile(path.join(root,'reports/v31-final-media-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
}
console.log(`V3.1 RC2 媒体 Gate：GitHub 固定 baseline ${baselineFiles} 文件 / ${(baselineBytes/1024/1024).toFixed(1)} MB 完整；本地 strict=${localStrict}。`);
