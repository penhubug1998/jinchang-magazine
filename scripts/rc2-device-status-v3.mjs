import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { V3_VERSION, exists, parseArgs, root } from './lib-v3-production.mjs';
const args=parseArgs();const file=path.join(root,'reports','v3-rc1-device-acceptance.json');let report={records:[]};if(await exists(file))report=JSON.parse(await readFile(file,'utf8'));
const types=['edge-desktop','mac-safari','iphone-safari'];for(const type of types){const rows=(report.records||[]).filter(x=>x.deviceType===type).sort((a,b)=>String(b.recordedAt).localeCompare(String(a.recordedAt)));const current=rows.find(x=>x.passed&&x.version===V3_VERSION);const latest=rows[0];console.log(`${current?'READY':'PENDING'} ${type}: ${current?`${current.deviceName||'device'} · ${current.recordedAt}`:latest?`最近记录 ${latest.recordedAt} (${latest.version||'legacy'})，需用 ${V3_VERSION} 重新验收`:'暂无记录'}`)}
if(args.strict&&!types.every(type=>(report.records||[]).some(x=>x.deviceType===type&&x.passed&&x.version===V3_VERSION)))process.exit(1);
