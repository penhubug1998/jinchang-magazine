import crypto from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { V3_VERSION, V31_SCHEMA_VERSION, exists, root } from './lib-v3-production.mjs';
const strict=process.argv.includes('--strict');
const read=async rel=>JSON.parse(await readFile(path.join(root,rel),'utf8'));
const sha=async rel=>crypto.createHash('sha256').update(await readFile(path.join(root,rel))).digest('hex');
const gates=[];const gate=(id,label,ok,detail,evidence=null)=>gates.push({id,label,status:ok?'READY':'PENDING',detail,evidence});
const CANDIDATE_VERSION='3.1.0-rc.2';const isFinal=V3_VERSION==='3.1.0';if(V3_VERSION!==CANDIDATE_VERSION&&!isFinal)throw new Error(`Final Promotion 仅接受 ${CANDIDATE_VERSION} 或已封版 3.1.0，当前 ${V3_VERSION}`);const evidenceVersion=CANDIDATE_VERSION;
if(V31_SCHEMA_VERSION!=='3.1-alpha24')throw new Error(`Schema Freeze 漂移：${V31_SCHEMA_VERSION}`);
const rc2=await read('reports/v31-rc2-gate.json');
gate('rc2-local','RC2 本地候选版 Gate',rc2.version===evidenceVersion&&rc2.releaseCandidate===true&&String(rc2.status).startsWith('passed-local'),rc2.status,rc2.generatedAt);

const mediaFile='reports/v31-final-media-receipt.json';let media=null;
if(await exists(path.join(root,mediaFile)))media=await read(mediaFile);
const baselineSha=await sha('baselines/v3-rc1-media.json');
const mediaOk=Boolean(media?.version===evidenceVersion&&media?.strict===true&&media?.files===51&&media?.bytes===122533642&&media?.baselineSha256===baselineSha);
gate('media','完整历史媒体 byte-level strict',mediaOk,mediaOk?'51 文件 / 116.9 MB 与固定 baseline 字节级一致':'需要在完整媒体仓库执行 npm run test:v31-rc2-media-local',media);

const deviceFile='reports/v3-rc1-device-acceptance.json';let devices={records:[]};if(await exists(path.join(root,deviceFile)))devices=await read(deviceFile);
const uaOk=(type,ua='')=>{const s=String(ua);const safari=/Safari/i.test(s)&&!/(Chrome|Chromium|CriOS|Edg|EdgiOS|FxiOS|OPiOS)/i.test(s);if(type==='edge-desktop')return /Edg\//i.test(s)&&!/EdgiOS/i.test(s);if(type==='mac-safari')return safari&&/Macintosh/i.test(s)&&!/Mobile\//i.test(s);if(type==='iphone-safari')return safari&&/iPhone/i.test(s);return false};
for(const [type,label] of [['edge-desktop','Microsoft Edge actual binary'],['mac-safari','macOS Safari 实机'],['iphone-safari','iPhone Safari 实机']]){
  const row=(devices.records||[]).filter(x=>x.deviceType===type&&x.version===evidenceVersion&&x.passed===true).sort((a,b)=>String(b.recordedAt).localeCompare(String(a.recordedAt)))[0];
  const checks=row?.checks&&Object.values(row.checks).length>0&&Object.values(row.checks).every(Boolean);const auto=row?.auto?.corePass===true;
  const ok=Boolean(row&&uaOk(type,row.userAgent)&&checks&&auto);
  gate(type,label,ok,ok?`${row.deviceName||type} · ${row.recordedAt}`:`需要使用 ${evidenceVersion} 在只读验收台提交真实设备通过记录`,row||null);
}

const prodFile='reports/v31-final-production-receipt.json';let prod=null;if(await exists(path.join(root,prodFile)))prod=await read(prodFile);
const prodOk=Boolean(prod?.version===evidenceVersion&&prod?.status==='passed'&&prod?.rollbackVerified&&prod?.redeployVerified&&prod?.httpsVerified&&String(prod?.base||'').startsWith('https://'));
gate('production-https','正式 HTTPS 部署/回滚/再部署',prodOk,prodOk?`${prod.base} · tree ${String(prod.treeSha256||'').slice(0,12)}…`:'需在正式服务器完成 deploy → online → rollback → redeploy → online，并生成 receipt',prod);

const pending=gates.filter(x=>x.status!=='READY');
let release=null;if(isFinal&&await exists(path.join(root,'reports/v31-final-release.json')))release=await read('reports/v31-final-release.json');const sealed=Boolean(isFinal&&release?.version==='3.1.0'&&release?.sourceCandidate===CANDIDATE_VERSION);const report={version:V3_VERSION,candidateVersion:evidenceVersion,schema:V31_SCHEMA_VERSION,generatedAt:new Date().toISOString(),status:pending.length?'HOLD':sealed?'V3_1_0_FINAL_SEALED':'READY_FOR_V3_1_0_FINAL',ready:gates.length-pending.length,total:gates.length,gates,promotion:{ready:pending.length===0,sealed,next:pending.length?'完成所有真实环境 Gate':sealed?'V3.1.0 已正式封版':'npm run final:v31 -- --confirm'}};
await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,'reports/v31-final-promotion-gate.json'),JSON.stringify(report,null,2)+'\n');
const md=['# V3.1 Final Promotion Gate','',`**${report.status}** · ${report.ready}/${report.total} READY`,'',...gates.map(x=>`${x.status==='READY'?'✅':'⏳'} **${x.label}**：${x.detail}`),'',`下一步：${report.promotion.next}`,''].join('\n');await writeFile(path.join(root,'reports/v31-final-promotion-gate.md'),md);console.log(md);if(strict&&pending.length)process.exit(1);
