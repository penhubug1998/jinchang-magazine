import crypto from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { V3_VERSION, V3_STABLE_VERSION, exists, normalizeIssueId, parseArgs, posix, root } from './lib-v3-production.mjs';

const args = parseArgs();
const strict = Boolean(args.strict);
const predeploy = Boolean(args.predeploy);
const id = normalizeIssueId(args.issue || '003');
const REQUIRED_VERSION = '3.0.0';
if (V3_STABLE_VERSION !== REQUIRED_VERSION) {
  console.error(`正式版门禁要求 version=${REQUIRED_VERSION}，当前稳定版为 ${V3_STABLE_VERSION}`);
  process.exit(1);
}
async function json(file){ try { return JSON.parse(await readFile(path.join(root,file),'utf8')); } catch { return null; } }
async function sha256File(file){try{return crypto.createHash('sha256').update(await readFile(file)).digest('hex')}catch{return null}}
async function latestMtime(target){
  if(!(await exists(target)))return 0;
  const s=await stat(target);let latest=s.mtimeMs;
  if(!s.isDirectory())return latest;
  for(const entry of await readdir(target,{withFileTypes:true})){
    if(entry.name==='.DS_Store'||entry.name==='.gitkeep')continue;
    const t=await latestMtime(path.join(target,entry.name));if(t>latest)latest=t;
  }
  return latest;
}
function evidenceFresh(generatedAt, latestMs){const t=Date.parse(generatedAt||'');return Number.isFinite(t)&&(!latestMs||t+1000>=latestMs)}
const gates=[];
function gate(id,label,passed,detail,action,evidence=null){gates.push({id,label,status:passed?'READY':'PENDING',detail,action,evidence});}

// Gate 1: historical media. A strict PASS is valid only while the checked source files stay unchanged.
const media=await json('reports/v3-full-media-check.json');
const mediaRows=new Map((media?.issues||[]).map(x=>[x.id,x]));
let mediaLatest=0;
for(const target of ['baselines/v3-rc1-media.json','issues/001/issue.json','issues/002/issue.json','1/assets','2/assets']){
  mediaLatest=Math.max(mediaLatest,await latestMtime(path.join(root,target)));
}
const mediaFresh=evidenceFresh(media?.generatedAt,mediaLatest);
const mediaReady=Boolean(media?.version===V3_STABLE_VERSION&&media?.strict&&media?.summary?.errors===0&&['001','002'].every(x=>mediaRows.get(x)?.baseline&&mediaRows.get(x)?.actual)&&mediaFresh);
const hydration=await json('reports/v3-rc2-media-hydration.json');
let mediaDetail;
if(mediaReady) mediaDetail='001/002 已严格对照固定 GitHub baseline，且检查后源文件未变化';
else if(media?.strict&&media?.summary?.errors===0&&!mediaFresh) mediaDetail='历史媒体曾严格通过，但检查后媒体/issue/baseline 又发生变化，必须重新核验';
else mediaDetail='尚未完成 1/assets、2/assets 严格核对';
gate('historical-media','完整历史媒体仓库',mediaReady,mediaDetail,
  mediaReady?'npm run rc:media':'npm run rc:media:hydrate -- --confirm && npm run rc:media',
  {hydration:hydration?.summary||null,mediaSummary:media?.summary||null,checkedAt:media?.generatedAt||null,latestSourceMtime:mediaLatest?new Date(mediaLatest).toISOString():null,fresh:mediaFresh});

// Gate 2/3: real Safari devices. Records are version-bound and UA-validated at submission time.
const devices=await json('reports/v3-rc1-device-acceptance.json');
const current=(devices?.records||[]).filter(x=>x.passed&&x.version===V3_STABLE_VERSION);
for(const [type,label] of [['mac-safari','Mac Safari 实机'],['iphone-safari','iPhone Safari 实机']]){
  const row=current.find(x=>x.deviceType===type);
  gate(type,label,Boolean(row),row?`${row.deviceName||type} · ${row.recordedAt}`:`尚无绑定 ${V3_STABLE_VERSION} 的真实设备通过记录`,'npm run rc:safari',row||null);
}

// Gate 4: real third-issue rehearsal. The evidence must still match the current issue source and assets.
const third=await json(`reports/v3-rc1-third-issue-trial-${id}.json`);
const thirdIssueFile=path.join(root,'issues',id,'issue.json');
const currentIssueSha=await sha256File(thirdIssueFile);
let thirdLatest=await latestMtime(thirdIssueFile);
if(await exists(thirdIssueFile)){
  try{const issue=JSON.parse(await readFile(thirdIssueFile,'utf8'));const assetRoot=path.resolve(root,String(issue.assetSource||`issues/${id}/assets`));thirdLatest=Math.max(thirdLatest,await latestMtime(assetRoot));}catch{}
}
const thirdFresh=evidenceFresh(third?.checkedAt,thirdLatest);
const thirdSourceMatch=Boolean(third?.issueSha256&&currentIssueSha&&third.issueSha256===currentIssueSha);
const thirdReady=Boolean(third?.status==='passed'&&third?.confirmedRealMaterial===true&&third?.version===V3_STABLE_VERSION&&thirdSourceMatch&&thirdFresh);
let thirdDetail;
if(thirdReady) thirdDetail=`${third.pageCount} 页真实材料试制通过，且当前制作源未变化`;
else if(third?.status==='passed'&&third?.version===V3_STABLE_VERSION&&!thirdSourceMatch) thirdDetail='第三期曾完成真实试制，但当前 issue.json 已变化，必须重新试制';
else if(third?.status==='passed'&&third?.version===V3_STABLE_VERSION&&!thirdFresh) thirdDetail='第三期曾完成真实试制，但试制后媒体/源文件发生变化，必须重新试制';
else thirdDetail=`尚未以 ${V3_STABLE_VERSION} 完成真实材料全链路试制`;
gate('third-real','第三期真实材料试制',thirdReady,thirdDetail,
  `npm run rc:third -- --issue ${id} --confirm-real-material`,
  third?{...third,currentIssueSha256:currentIssueSha,currentSourceFresh:thirdFresh,sourceMatch:thirdSourceMatch}:null);

// Gate 5: deployment rehearsal, tied to current stable code version.
const deploy=await json('reports/v3-rc1-deployment-rehearsal.json');
const deployReady=deploy?.status==='passed'&&deploy?.version===V3_STABLE_VERSION;
gate('deployment-rehearsal','部署/回滚自动演练',deployReady,
  deployReady?'V3.0.0 原子部署、缓存、篡改检测、回滚通过':'当前正式版部署演练尚未通过',
  'npm run test:rc1-deployment',deploy||null);

// Gate 6: real HTTPS verification. The remote evidence must still match the current local release tree.
const online=await json(`reports/v3-rc1-online-verification-${id}.json`);
const currentIntegrity=await json(`release-v3/${id}/integrity.json`);
const onlineTreeMatch=Boolean(online?.localTreeSha256&&currentIntegrity?.treeSha256&&online.localTreeSha256===currentIntegrity.treeSha256&&(!online.remoteTreeSha256||online.remoteTreeSha256===currentIntegrity.treeSha256));
const onlineReady=Boolean(online?.ok===true&&online?.version===V3_STABLE_VERSION&&String(online?.base||'').startsWith('https://')&&onlineTreeMatch);
let onlineDetail;
if(onlineReady) onlineDetail=`已验证 ${online.base}，且当前 release treeSha256 未变化`;
else if(online?.ok===true&&online?.version===V3_STABLE_VERSION&&!onlineTreeMatch) onlineDetail='线上曾验证通过，但当前本地 release tree 已变化，必须重新部署/校验';
else onlineDetail='尚未以 V3.0.0 对正式 HTTPS 地址完成线上校验';
gate('online','真实线上缓存与完整性',onlineReady,onlineDetail,
  `npm run online:check -- --base https://www.jilv.online/jinchang-magazine --issue ${id} --strict`,
  online?{...online,currentTreeSha256:currentIntegrity?.treeSha256||null,treeMatch:onlineTreeMatch}:null);

const pending=gates.filter(x=>x.status!=='READY');
const predeployGates=gates.filter(x=>x.id!=='online');
const predeployPending=predeployGates.filter(x=>x.status!=='READY');
const report={version:V3_STABLE_VERSION,release:'V3.0.0',issue:id,generatedAt:new Date().toISOString(),status:pending.length?'PENDING':'READY',ready:gates.length-pending.length,total:gates.length,preDeployStatus:predeployPending.length?'PENDING':'READY',preDeployReady:predeployGates.length-predeployPending.length,preDeployTotal:predeployGates.length,gates};
await mkdir(path.join(root,'reports'),{recursive:true});
await writeFile(path.join(root,'reports/v3-final-readiness.json'),JSON.stringify(report,null,2)+'\n');
const md=[`# V3.0.0 正式发布门禁`,``,`**总状态 ${report.status}** · ${report.ready}/${report.total} gates READY`,`**部署前状态 ${report.preDeployStatus}** · ${report.preDeployReady}/${report.preDeployTotal} pre-deploy gates READY`,``,...gates.map(x=>`- ${x.status==='READY'?'✅':'⏳'} **${x.label}**：${x.detail}${x.status==='PENDING'?`  \n  下一步：\`${x.action}\``:''}`),``,`> 正式门禁采用“证据绑定”：通过后若对应源稿、媒体或 release tree 再发生变化，旧 PASS 会自动失效并重新变为 PENDING。`,`> 版本号为 V3.0.0 不等于已经完成正式上线；部署前 5 项 READY 后 final:release 才允许生成可部署正式包，六项全部 READY 后 final:seal 才允许正式封版。`,` `].join('\n');
await writeFile(path.join(root,'reports/v3-final-readiness.md'),md,'utf8');
console.log(md);
console.log(`报告：${posix('reports/v3-final-readiness.json')}`);
if(strict&&((predeploy?predeployPending:pending).length))process.exit(1);
