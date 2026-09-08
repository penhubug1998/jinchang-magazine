import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V3_VERSION, exists, root } from './lib-v3-production.mjs';
import { evidenceSha256, evidenceIntegrityStatus } from './lib-final-evidence-integrity-v3.mjs';

export { evidenceSha256 } from './lib-final-evidence-integrity-v3.mjs';

export const FINAL_ACCEPTANCE_GATES = [
  ['source-identity','当前源码身份'],
  ['current-e2e','当前源码整刊生产 E2E'],
  ['media','完整历史媒体 byte-level strict'],
  ['edge-desktop','Microsoft Edge actual binary'],
  ['mac-safari','macOS Safari 实机'],
  ['iphone-safari','iPhone Safari 实机'],
  ['android-wechat','Android 微信内置浏览器实机'],
  ['production-https','正式 HTTPS 部署 / 回滚 / 再部署']
];

const readJson=async rel=>JSON.parse(await readFile(path.join(root,rel),'utf8'));
export const parseTime=value=>{const n=Date.parse(String(value||''));return Number.isFinite(n)?n:null};
export const freshAfter=(value,threshold)=>{const a=parseTime(value),b=parseTime(threshold);return a!=null&&b!=null&&a>=b};

export function sourceIdentity(){
  const run=args=>spawnSync('git',args,{cwd:root,encoding:'utf8'});
  const sha=run(['rev-parse','HEAD']),at=run(['show','-s','--format=%cI','HEAD']),branch=run(['rev-parse','--abbrev-ref','HEAD']);
  const commit=sha.status===0?String(sha.stdout||'').trim():'';
  const committedAt=at.status===0?String(at.stdout||'').trim():'';
  return {commit:/^[0-9a-f]{40}$/i.test(commit)?commit:null,committedAt:parseTime(committedAt)!=null?committedAt:null,branch:branch.status===0?String(branch.stdout||'').trim():null,available:Boolean(/^[0-9a-f]{40}$/i.test(commit)&&parseTime(committedAt)!=null)};
}

export function uaMatches(type,ua=''){
  const s=String(ua);const safari=/Safari/i.test(s)&&!/(Chrome|Chromium|CriOS|Edg|EdgiOS|FxiOS|OPiOS)/i.test(s);
  if(type==='edge-desktop')return /Edg\//i.test(s)&&!/EdgiOS/i.test(s);
  if(type==='mac-safari')return safari&&/Macintosh/i.test(s)&&!/Mobile\//i.test(s);
  if(type==='iphone-safari')return safari&&/iPhone/i.test(s);
  if(type==='android-wechat')return /Android/i.test(s)&&/MicroMessenger/i.test(s);
  return false;
}

export function deviceEvidenceStatus(row,source,type){
  if(!row)return {status:'NOT_RUN',reason:'尚未提交当前设备的真实环境验收记录'};
  if(row.version!==V3_VERSION)return {status:'STALE',reason:`证据版本 ${row.version||'unknown'} 不是当前 ${V3_VERSION}`};
  if(!row.sourceCommit||row.sourceCommit!==source.commit)return {status:'STALE',reason:'证据未绑定当前源码 commit，或源码已发生变化'};
  if(!freshAfter(row.recordedAt,source.committedAt))return {status:'STALE',reason:'证据时间早于当前源码提交时间'};
  if(!uaMatches(type,row.userAgent))return {status:'FAILED',reason:'浏览器 User-Agent 与目标真实环境不匹配'};
  if(!row.checks||!Object.keys(row.checks).length||!Object.values(row.checks).every(Boolean))return {status:'FAILED',reason:'人工验收项未全部通过'};
  if(row.auto?.corePass!==true||row.passed!==true)return {status:'FAILED',reason:'自动探测或综合验收未通过'};
  const integrity=evidenceIntegrityStatus(row);
  if(!integrity.ok)return {status:integrity.status,reason:integrity.status==='STALE'?'旧设备证据缺少有效 SHA-256 绑定，请重新验收':'设备证据 SHA-256 校验失败，记录可能被改写'};
  return {status:'READY',reason:`${row.deviceName||type} · ${row.recordedAt}`};
}

export function receiptEvidenceStatus(receipt,source,{timeField='generatedAt',kind='receipt'}={}){
  if(!receipt)return {status:'NOT_RUN',reason:`尚未生成 ${kind}`};
  if(receipt.version!==V3_VERSION)return {status:'STALE',reason:`${kind} 版本不是当前 ${V3_VERSION}`};
  if(!receipt.sourceCommit||receipt.sourceCommit!==source.commit)return {status:'STALE',reason:`${kind} 未绑定当前源码 commit`};
  if(!freshAfter(receipt[timeField],source.committedAt))return {status:'STALE',reason:`${kind} 生成时间早于当前源码提交`};
  const integrity=evidenceIntegrityStatus(receipt);
  if(!integrity.ok)return {status:integrity.status,reason:integrity.status==='STALE'?`${kind} 缺少有效 evidenceSha256，请重新生成`:`${kind} evidenceSha256 校验失败，记录可能被改写`};
  return {status:'READY',reason:`${kind} 已绑定当前源码且 SHA-256 校验通过`};
}

async function runP109(){
  const run=spawnSync(process.execPath,[path.join(root,'scripts/p1-09-final-evidence-gate-v3.mjs')],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
  if(run.status!==0)throw new Error(`P1-09 current-source gate 执行失败\n${run.stdout||''}\n${run.stderr||''}`);
  return readJson('reports/p1-09-final-evidence-gate.json');
}

export async function buildFinalAcceptanceReport(){
  const source=sourceIdentity();
  const p109=await runP109();
  const byId=new Map((p109.gates||[]).map(x=>[x.id,x]));
  const gates=[];
  const push=(id,status,detail,evidence=null,action='')=>{const label=FINAL_ACCEPTANCE_GATES.find(x=>x[0]===id)?.[1]||id;gates.push({id,label,status,detail,evidence,action});};

  const src=byId.get('source-identity');push('source-identity',src?.status==='READY'?'READY':'FAILED',src?.detail||'无法确认当前源码身份',src?.evidence||source,'确保工作目录是完整 Git checkout');
  const e2e=byId.get('current-e2e');push('current-e2e',e2e?.status==='READY'?'READY':(e2e?.evidence?'STALE':'NOT_RUN'),e2e?.detail||'需要重新执行当前源码 E2E',e2e?.evidence||null,'npm run test:p1-08');

  const mediaFile='reports/v31-final-media-receipt.json';const media=await exists(path.join(root,mediaFile))?await readJson(mediaFile):null;
  let mediaState=receiptEvidenceStatus(media,source,{kind:'完整媒体 receipt'});
  if(mediaState.status==='READY'&&!(media.strict===true&&media.files===51&&media.bytes===122533642))mediaState={status:'FAILED',reason:'媒体文件数、字节数或 strict 标记不符合固定 baseline'};
  push('media',mediaState.status,mediaState.reason,media,'npm run test:v31-rc2-media-local');

  const deviceFile='reports/v3-rc1-device-acceptance.json';const devices=await exists(path.join(root,deviceFile))?await readJson(deviceFile):{records:[]};
  for(const [type] of FINAL_ACCEPTANCE_GATES.filter(([id])=>['edge-desktop','mac-safari','iphone-safari','android-wechat'].includes(id))){
    const row=(devices.records||[]).filter(x=>x.deviceType===type).sort((a,b)=>String(b.recordedAt||'').localeCompare(String(a.recordedAt||'')))[0]||null;
    const state=deviceEvidenceStatus(row,source,type);push(type,state.status,state.reason,row,`在 Final Acceptance 验收台用 ${type} 实机重新提交`);
  }

  const prodFile='reports/v31-final-production-receipt.json';const prod=await exists(path.join(root,prodFile))?await readJson(prodFile):null;
  let prodState=receiptEvidenceStatus(prod,source,{kind:'正式 HTTPS receipt'});
  if(prodState.status==='READY'&&!(prod.status==='passed'&&prod.rollbackVerified&&prod.redeployVerified&&prod.httpsVerified&&String(prod.base||'').startsWith('https://')))prodState={status:'FAILED',reason:'正式 HTTPS deploy → rollback → redeploy 链不完整'};
  push('production-https',prodState.status,prodState.reason,prod,'npm run final:v31:production-receipt -- --issue <期号>');

  const ready=gates.filter(x=>x.status==='READY').length;
  return {stage:'P1-10',version:V3_VERSION,generatedAt:new Date().toISOString(),source,status:ready===gates.length?'READY':'HOLD',ready,total:gates.length,gates,promotion:{allowed:ready===gates.length,required:'8/8 READY',next:ready===gates.length?'允许 Final 封包 / 晋级':'完成所有当前源码真实环境证据'},p109:{status:p109.status,ready:p109.ready,total:p109.total,generatedAt:p109.generatedAt}};
}

export function summarizeAcceptance(report){
  return {ready:report.gates.filter(x=>x.status==='READY').length,total:report.gates.length,allowed:report.gates.every(x=>x.status==='READY')};
}
