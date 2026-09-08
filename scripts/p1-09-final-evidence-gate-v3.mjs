import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { V3_VERSION, V31_SCHEMA_VERSION, exists, root } from './lib-v3-production.mjs';

const strict=process.argv.includes('--strict');
const read=async rel=>JSON.parse(await readFile(path.join(root,rel),'utf8'));
const gates=[];
const gate=(id,label,ok,detail,evidence=null)=>gates.push({id,label,status:ok?'READY':'PENDING',detail,evidence});
const parseTime=value=>{const n=Date.parse(String(value||''));return Number.isFinite(n)?n:null};
const freshAfter=(value,threshold)=>{const a=parseTime(value),b=parseTime(threshold);return a!=null&&b!=null&&a>=b};

function sourceIdentity(){
  const sha=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
  const at=spawnSync('git',['show','-s','--format=%cI','HEAD'],{cwd:root,encoding:'utf8'});
  const commit=sha.status===0?String(sha.stdout||'').trim():'';
  const committedAt=at.status===0?String(at.stdout||'').trim():'';
  return {commit:/^[0-9a-f]{40}$/i.test(commit)?commit:null,committedAt:parseTime(committedAt)!=null?committedAt:null,available:Boolean(/^[0-9a-f]{40}$/i.test(commit)&&parseTime(committedAt)!=null)};
}
const source=sourceIdentity();
gate('source-identity','当前源码身份',source.available,source.available?`${source.commit.slice(0,12)}… · ${source.committedAt}`:'当前目录缺少可验证的 Git HEAD/提交时间；Final Gate 按 fail-closed 处理',source);

if(V31_SCHEMA_VERSION!=='3.1-alpha24')throw new Error(`Schema Freeze 漂移：${V31_SCHEMA_VERSION}`);
if(V3_VERSION!=='3.1.0')throw new Error(`P1-09 当前源码 Final Gate 仅接受 3.1.0，当前 ${V3_VERSION}`);

const p108File='reports/p1-08-production-e2e-last.json';
let p108=null;if(await exists(path.join(root,p108File)))p108=await read(p108File);
const p108Ok=Boolean(source.available&&p108?.version===V3_VERSION&&p108?.ok===true&&Number(p108?.checkpoints?.length)>=26&&p108?.checkpoints?.every(x=>x.ok)&&freshAfter(p108?.completedAt,source.committedAt));
gate('current-e2e','当前源码整刊生产 E2E',p108Ok,p108Ok?`${p108.checkpoints.length} checkpoints · ${p108.completedAt}`:'需要基于当前源码重新执行 npm run test:p1-08；历史 E2E 不替当前提交背书',p108);

const mediaFile='reports/v31-final-media-receipt.json';let media=null;if(await exists(path.join(root,mediaFile)))media=await read(mediaFile);
const mediaOk=Boolean(source.available&&media?.version===V3_VERSION&&media?.strict===true&&media?.files===51&&media?.bytes===122533642&&freshAfter(media?.generatedAt,source.committedAt));
gate('media','完整历史媒体 byte-level strict',mediaOk,mediaOk?`51 文件 / 116.9 MB · ${media.generatedAt}`:'需在当前 3.1.0 完整媒体仓库重新执行 npm run test:v31-rc2-media-local；旧 RC2 receipt 不再接受',media);

const deviceFile='reports/v3-rc1-device-acceptance.json';let devices={records:[]};if(await exists(path.join(root,deviceFile)))devices=await read(deviceFile);
const uaOk=(type,ua='')=>{const s=String(ua);const safari=/Safari/i.test(s)&&!/(Chrome|Chromium|CriOS|Edg|EdgiOS|FxiOS|OPiOS)/i.test(s);if(type==='edge-desktop')return /Edg\//i.test(s)&&!/EdgiOS/i.test(s);if(type==='mac-safari')return safari&&/Macintosh/i.test(s)&&!/Mobile\//i.test(s);if(type==='iphone-safari')return safari&&/iPhone/i.test(s);if(type==='android-wechat')return /Android/i.test(s)&&/MicroMessenger/i.test(s);return false};
for(const [type,label] of [['edge-desktop','Microsoft Edge actual binary'],['mac-safari','macOS Safari 实机'],['iphone-safari','iPhone Safari 实机'],['android-wechat','Android 微信内置浏览器实机']]){
  const row=(devices.records||[]).filter(x=>x.deviceType===type&&x.version===V3_VERSION&&x.passed===true).sort((a,b)=>String(b.recordedAt).localeCompare(String(a.recordedAt)))[0];
  const checks=row?.checks&&Object.values(row.checks).length>0&&Object.values(row.checks).every(Boolean);const auto=row?.auto?.corePass===true;
  const ok=Boolean(source.available&&row&&uaOk(type,row.userAgent)&&checks&&auto&&freshAfter(row.recordedAt,source.committedAt));
  gate(type,label,ok,ok?`${row.deviceName||type} · ${row.recordedAt}`:`需要使用当前 ${V3_VERSION} 在源码提交 ${source.commit?.slice(0,12)||'unknown'}… 之后重新提交真实设备通过记录`,row||null);
}

const prodFile='reports/v31-final-production-receipt.json';let prod=null;if(await exists(path.join(root,prodFile)))prod=await read(prodFile);
const prodOk=Boolean(source.available&&prod?.version===V3_VERSION&&prod?.status==='passed'&&prod?.rollbackVerified&&prod?.redeployVerified&&prod?.httpsVerified&&String(prod?.base||'').startsWith('https://')&&freshAfter(prod?.generatedAt,source.committedAt));
gate('production-https','正式 HTTPS 部署 / 回滚 / 再部署',prodOk,prodOk?`${prod.base} · ${prod.generatedAt}`:'需基于当前 3.1.0 源码重新完成 deploy → online → rollback → redeploy → online 并生成 receipt',prod);

const pending=gates.filter(x=>x.status!=='READY');
const report={stage:'P1-09',version:V3_VERSION,schema:V31_SCHEMA_VERSION,generatedAt:new Date().toISOString(),source,status:pending.length?'HOLD':'READY_FOR_CURRENT_3_1_0_RELEASE',ready:gates.length-pending.length,total:gates.length,gates,promotion:{ready:pending.length===0,next:pending.length?'完成当前源码对应的真实环境 Gate':'当前源码具备重新发布/封包资格'}};
await mkdir(path.join(root,'reports'),{recursive:true});
await writeFile(path.join(root,'reports/p1-09-final-evidence-gate.json'),JSON.stringify(report,null,2)+'\n');
const md=['# P1-09 Current-source Final Evidence Gate','',`**${report.status}** · ${report.ready}/${report.total} READY`,``, `源码：${source.commit||'unavailable'} · ${source.committedAt||'unavailable'}`,'',...gates.map(x=>`${x.status==='READY'?'✅':'⏳'} **${x.label}**：${x.detail}`),'',`下一步：${report.promotion.next}`,''].join('\n');
await writeFile(path.join(root,'reports/p1-09-final-evidence-gate.md'),md);
console.log(md);
if(strict&&pending.length)process.exit(1);
