import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V3_VERSION, V31_SCHEMA_VERSION, exists, normalizeIssueId, parseArgs, root } from './lib-v3-production.mjs';
import { evidenceSha256 } from './lib-final-evidence-integrity-v3.mjs';

const args=parseArgs();
const id=normalizeIssueId(args.issue||args.id||args._[0]||'001');
const assert=(c,m)=>{if(!c)throw new Error(m)};
const sourceSha=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}),sourceAt=spawnSync('git',['show','-s','--format=%cI','HEAD'],{cwd:root,encoding:'utf8'});const currentSourceCommit=String(sourceSha.stdout||'').trim(),currentSourceCommittedAt=String(sourceAt.stdout||'').trim();assert(sourceSha.status===0&&/^[0-9a-f]{40}$/i.test(currentSourceCommit),'current source commit unavailable');assert(sourceAt.status===0&&Number.isFinite(Date.parse(currentSourceCommittedAt)),'current source commit time unavailable');
const read=async rel=>JSON.parse(await readFile(path.join(root,rel),'utf8'));
const deployFile=`reports/v3-rc1-deployment-${id}.json`;
const rollbackFile=`reports/v3-rc1-rollback-${id}.json`;
const onlineFile=`reports/v3-rc1-online-verification-${id}.json`;
assert(await exists(path.join(root,deployFile)),`缺少最终重新部署 receipt：${deployFile}`);
assert(await exists(path.join(root,rollbackFile)),`缺少正式目录 rollback receipt：${rollbackFile}`);
assert(await exists(path.join(root,onlineFile)),`缺少正式 HTTPS online receipt：${onlineFile}`);
const [deploy,rollback,online]=await Promise.all([read(deployFile),read(rollbackFile),read(onlineFile)]);
assert(deploy.version===V3_VERSION,`最终部署版本 ${deploy.version} != ${V3_VERSION}`);
assert(rollback.version===V3_VERSION,`回滚版本 ${rollback.version} != ${V3_VERSION}`);
assert(online.version===V3_VERSION,`线上验证版本 ${online.version} != ${V3_VERSION}`);
assert(deploy.issue===id&&rollback.issue===id&&online.issue===id,'部署/回滚/线上验证 issue 不一致');
assert(String(online.base||'').startsWith('https://'),'正式线上验证必须是 https://');
assert(online.ok===true,'正式 HTTPS online:check 尚未通过');
assert(deploy.treeSha256&&online.localTreeSha256===deploy.treeSha256,'线上校验 treeSha256 与最终重新部署不一致');
if(online.remoteTreeSha256)assert(online.remoteTreeSha256===deploy.treeSha256,'线上 remote treeSha256 与最终部署不一致');
const rollbackAt=Date.parse(rollback.rolledBackAt||'');
const redeployAt=Date.parse(deploy.deployedAt||'');
const onlineAt=Date.parse(online.checkedAt||'');
assert(Number.isFinite(rollbackAt)&&Number.isFinite(redeployAt)&&Number.isFinite(onlineAt),'部署时间证据缺失');
assert(rollbackAt<redeployAt,'Final Promotion 要求先回滚、再重新部署 RC2');
assert(redeployAt<=onlineAt,'Final Promotion 要求重新部署后再执行 online:check');
const firstReceipt=path.resolve(String(rollback.receipt||''));
assert(firstReceipt&&await exists(firstReceipt),'回滚引用的首次部署 receipt 不存在');
const first=JSON.parse(await readFile(firstReceipt,'utf8'));
assert(first.version===V3_VERSION&&first.issue===id,'首次正式部署 receipt 不是当前 RC2');
assert(Date.parse(first.deployedAt)<rollbackAt,'首次部署必须早于 rollback');
assert(first.targetRoot===deploy.targetRoot,'首次部署与重新部署 targetRoot 不一致');
assert(first.remotePath===deploy.remotePath,'首次部署与重新部署 remotePath 不一致');
const report={
  version:V3_VERSION,schema:V31_SCHEMA_VERSION,issue:id,generatedAt:new Date().toISOString(),sourceCommit:currentSourceCommit,sourceCommittedAt:currentSourceCommittedAt,status:'passed',
  base:online.base,targetRoot:deploy.targetRoot,remotePath:deploy.remotePath,treeSha256:deploy.treeSha256,
  sequence:{firstDeployAt:first.deployedAt,rollbackAt:rollback.rolledBackAt,redeployAt:deploy.deployedAt,onlineCheckedAt:online.checkedAt},
  rollbackVerified:true,redeployVerified:true,httpsVerified:true,
  evidence:{firstDeployReceipt:rollback.receipt,rollbackReport:rollbackFile,finalDeployReport:deployFile,onlineReport:onlineFile}
};
report.evidenceSha256=evidenceSha256(report);
await mkdir(path.join(root,'reports'),{recursive:true});
await writeFile(path.join(root,'reports/v31-final-production-receipt.json'),JSON.stringify(report,null,2)+'\n');
console.log(`V3.1 Final 正式环境 receipt PASS：${online.base} · rollback → redeploy → online strict · evidenceSha256=${report.evidenceSha256.slice(0,12)}…`);
