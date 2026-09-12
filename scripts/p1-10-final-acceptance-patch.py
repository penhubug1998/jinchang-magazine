from pathlib import Path
import json

root=Path(__file__).resolve().parents[1]

def replace(path,old,new,label):
    p=root/path
    text=p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'P1-10 patch target not found: {label} ({path})')
    p.write_text(text.replace(old,new,1),encoding='utf-8')
    print(f'patched {label}')

# package commands: preserve historical commands, but make the public Final status/gate
# aliases point at the current-source 8/8 acceptance contract.
p=root/'package.json'
pkg=json.loads(p.read_text(encoding='utf-8'))
s=pkg.setdefault('scripts',{})
s['test:p1-10']='node scripts/p1-10-final-acceptance-smoke-v3.mjs'
s['final:v31:acceptance:status']='node scripts/p1-10-final-acceptance-gate-v3.mjs'
s['final:v31:evidence:verify']='node scripts/p1-10-final-acceptance-gate-v3.mjs --strict'
s['final:v31:evidence:export']='node scripts/p1-10-final-acceptance-gate-v3.mjs --export'
s['final:v31:package-guard']='node scripts/p1-10-final-package-guard-v3.mjs'
s['final:v31:status']='node scripts/p1-10-final-acceptance-gate-v3.mjs'
s['final:v31:gate']='node scripts/p1-10-final-acceptance-gate-v3.mjs --strict'
p.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

studio=Path('scripts/studio-v3.mjs')
old="""async function writeRc1Acceptance(record){
  const report=await readRc1Acceptance();
  report.version=V3_VERSION;report.updatedAt=new Date().toISOString();report.records=Array.isArray(report.records)?report.records:[];
  const key=`${record.deviceType||'other'}:${record.deviceName||''}`;
  const normalized={...record,version:V3_VERSION,key,recordedAt:new Date().toISOString(),userAgent:String(record.userAgent||'').slice(0,1000)};
  const i=report.records.findIndex(x=>x.key===key);if(i>=0)report.records[i]=normalized;else report.records.push(normalized);
  await mkdir(path.dirname(rc1AcceptanceFile),{recursive:true});await writeFile(rc1AcceptanceFile,`${JSON.stringify(report,null,2)}\\n`,'utf8');return report;
}
"""
new="""async function currentAcceptanceSource(){
  const [sha,at,branch]=await Promise.all([runProcess('git',['rev-parse','HEAD']),runProcess('git',['show','-s','--format=%cI','HEAD']),runProcess('git',['rev-parse','--abbrev-ref','HEAD'])]);
  const commit=sha.ok?String(sha.output||'').trim():'';const committedAt=at.ok?String(at.output||'').trim():'';
  if(!/^[0-9a-f]{40}$/i.test(commit)||!Number.isFinite(Date.parse(committedAt)))throw Object.assign(new Error('当前工作目录缺少可验证的 Git 源码身份，禁止写入 Final Acceptance 证据'),{statusCode:409,code:'FINAL_SOURCE_IDENTITY_UNAVAILABLE'});
  return {commit,committedAt,branch:branch.ok?String(branch.output||'').trim():null};
}
function acceptanceEvidenceSha(record){const copy={...record};delete copy.evidenceSha256;return createHash('sha256').update(JSON.stringify(copy)).digest('hex');}
async function writeRc1Acceptance(record){
  const report=await readRc1Acceptance();const source=await currentAcceptanceSource();
  report.version=V3_VERSION;report.updatedAt=new Date().toISOString();report.sourceCommit=source.commit;report.records=Array.isArray(report.records)?report.records:[];
  const key=`${record.deviceType||'other'}:${record.deviceName||''}`;
  const normalized={...record,version:V3_VERSION,key,recordedAt:new Date().toISOString(),userAgent:String(record.userAgent||'').slice(0,1000),sourceCommit:source.commit,sourceCommittedAt:source.committedAt,sourceBranch:source.branch};
  normalized.evidenceSha256=acceptanceEvidenceSha(normalized);
  const i=report.records.findIndex(x=>x.key===key);if(i>=0)report.records[i]=normalized;else report.records.push(normalized);
  await mkdir(path.dirname(rc1AcceptanceFile),{recursive:true});await writeFile(rc1AcceptanceFile,`${JSON.stringify(report,null,2)}\\n`,'utf8');return report;
}
"""
replace(studio,old,new,'Studio device evidence binding')
replace(studio,"""  if(type==='ipad-safari')return safari&&(/iPad/i.test(s)||(/Macintosh/i.test(s)&&/Mobile\\//i.test(s)));
  return true;
""","""  if(type==='ipad-safari')return safari&&(/iPad/i.test(s)||(/Macintosh/i.test(s)&&/Mobile\\//i.test(s)));
  if(type==='android-wechat')return /Android/i.test(s)&&/MicroMessenger/i.test(s);
  return true;
""",'Android WeChat UA validation')
replace(studio,"const data=await body(req,512*1024);const allowed=new Set(['edge-desktop','mac-safari','iphone-safari','ipad-safari','other']);","const data=await body(req,512*1024);const allowed=new Set(['edge-desktop','mac-safari','iphone-safari','ipad-safari','android-wechat','other']);",'Android WeChat device allow-list')
replace(studio,"if(['edge-desktop','mac-safari','iphone-safari','ipad-safari'].includes(data.deviceType)&&!realBrowserUaMatches(data.deviceType,actualUa))","if(['edge-desktop','mac-safari','iphone-safari','ipad-safari','android-wechat'].includes(data.deviceType)&&!realBrowserUaMatches(data.deviceType,actualUa))",'Android WeChat real-browser enforcement')
old_marker="""  if(acceptanceOnly&&seg[0]==='api'&&u.pathname!=='/api/health')return send(res,403,{error:'RC acceptance-only 模式禁止编辑 API',code:'READ_ONLY'});
"""
new_marker="""  if(u.pathname==='/api/final/acceptance'&&req.method==='GET'){
    const r=await runScriptAsync('p1-10-final-acceptance-gate-v3.mjs');let report=null;try{report=await readJson(path.join(root,'reports/p1-10-final-acceptance.json'))}catch{}
    return send(res,report?200:500,{ok:Boolean(report),runOk:r.ok,output:r.output,report});
  }
  if(acceptanceOnly&&seg[0]==='api'&&u.pathname!=='/api/health')return send(res,403,{error:'Final Acceptance 模式禁止编辑 API',code:'READ_ONLY'});
"""
replace(studio,old_marker,new_marker,'Final Acceptance status API')
replace(studio,"return serveFile(req,res,path.join(studioDir,acceptanceOnly?'rc1-acceptance.html':'index.html'));","return serveFile(req,res,path.join(studioDir,acceptanceOnly?'final-acceptance.html':'index.html'));",'Final Acceptance root dashboard')
replace(studio,"'login.html','login.css','login.js','rc1-acceptance.html','rc1-acceptance.css','rc1-acceptance.js']","'login.html','login.css','login.js','rc1-acceptance.html','rc1-acceptance.css','rc1-acceptance.js','final-acceptance.html','final-acceptance.css','final-acceptance.js']",'Studio self-check acceptance assets')
replace(studio,"V3 ${V3_VERSION} Final Promotion 实机验收台","V3 ${V3_VERSION} Final Acceptance 真实环境验收台",'Acceptance server banner')

# Upgrade the existing device acceptance page rather than fork its interaction logic.
js=Path('src/studio/rc1-acceptance.js')
replace(js,"const mobile=['iphone-safari','ipad-safari'].includes(t);","const mobile=['iphone-safari','ipad-safari','android-wechat'].includes(t);",'WeChat mobile manual checks')
old_detect="function detectType(){const ua=navigator.userAgent;if(/Edg\\//i.test(ua)&&!/EdgiOS/i.test(ua))return'edge-desktop';if(isSafariUa(ua)&&/iPhone/i.test(ua))return'iphone-safari';"
new_detect="function detectType(){const ua=navigator.userAgent;if(/Android/i.test(ua)&&/MicroMessenger/i.test(ua))return'android-wechat';if(/Edg\\//i.test(ua)&&!/EdgiOS/i.test(ua))return'edge-desktop';if(isSafariUa(ua)&&/iPhone/i.test(ua))return'iphone-safari';"
replace(js,old_detect,new_detect,'WeChat device auto-detection')
replace(js,"$('#deviceType').value=detectType();renderManual();","const requestedType=new URLSearchParams(location.search).get('target');const allowedTargets=new Set(['edge-desktop','mac-safari','iphone-safari','ipad-safari','android-wechat','other']);$('#deviceType').value=allowedTargets.has(requestedType)?requestedType:detectType();renderManual();",'Acceptance target deep-link')
old_probe="const safari=isSafariUa(),edge=/Edg\\//i.test(navigator.userAgent)&&/Windows NT/i.test(navigator.userAgent);rows.push(row('浏览器',edge?'Microsoft Edge / Windows':safari?'Safari/WebKit 可识别':'非目标浏览器',edge||safari?'pass':'warn'));"
new_probe="const safari=isSafariUa(),edge=/Edg\\//i.test(navigator.userAgent),wechat=/Android/i.test(navigator.userAgent)&&/MicroMessenger/i.test(navigator.userAgent);rows.push(row('浏览器',edge?'Microsoft Edge':wechat?'Android 微信内置浏览器':safari?'Safari/WebKit 可识别':'非目标浏览器',edge||safari||wechat?'pass':'warn'));"
replace(js,old_probe,new_probe,'WeChat browser probe')

html=Path('src/studio/rc1-acceptance.html')
replace(html,'Microsoft Edge / Mac Safari / iPhone Safari · 只读验收模式','Microsoft Edge / Mac Safari / iPhone Safari / Android 微信 · 当前源码只读验收模式','Acceptance header targets')
replace(html,'Windows Microsoft Edge、Mac Safari 与 iPhone Safari 完成一次','Windows/Mac Microsoft Edge、Mac Safari、iPhone Safari 与 Android 微信内置浏览器分别完成一次','Acceptance intro targets')
replace(html,'<option value="ipad-safari">iPad Safari</option><option value="other">其他浏览器</option>','<option value="ipad-safari">iPad Safari</option><option value="android-wechat">Android 微信内置浏览器</option><option value="other">其他浏览器</option>','WeChat acceptance option')

# Bind byte-level media and production receipts to the exact current source commit.
media=Path('scripts/v31-rc2-media-v3.mjs')
replace(media,"const strictLocal=process.argv.includes('--strict-local');const assert=(c,m)=>{if(!c)throw new Error(m)};","const strictLocal=process.argv.includes('--strict-local');const assert=(c,m)=>{if(!c)throw new Error(m)};\nconst sourceSha=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}),sourceAt=spawnSync('git',['show','-s','--format=%cI','HEAD'],{cwd:root,encoding:'utf8'});const currentSourceCommit=String(sourceSha.stdout||'').trim(),currentSourceCommittedAt=String(sourceAt.stdout||'').trim();assert(sourceSha.status===0&&/^[0-9a-f]{40}$/i.test(currentSourceCommit),'current source commit unavailable');assert(sourceAt.status===0&&Number.isFinite(Date.parse(currentSourceCommittedAt)),'current source commit time unavailable');",'Media current source identity')
replace(media,"const receipt={version:V3_VERSION,generatedAt:new Date().toISOString(),strict:true,files:baselineFiles,bytes:baselineBytes,baselineSha256,baselineCommit:source.commit,roots:localRoots.map(x=>x.rel),evidence:'full-media-check-v3 --strict + fixed baseline file-size/Git-blob-SHA1'};","const receipt={version:V3_VERSION,generatedAt:new Date().toISOString(),sourceCommit:currentSourceCommit,sourceCommittedAt:currentSourceCommittedAt,strict:true,files:baselineFiles,bytes:baselineBytes,baselineSha256,baselineCommit:source.commit,roots:localRoots.map(x=>x.rel),evidence:'full-media-check-v3 --strict + fixed baseline file-size/Git-blob-SHA1'};",'Media receipt source binding')

prod=Path('scripts/v31-final-production-receipt-v3.mjs')
replace(prod,"import path from 'node:path';\nimport { V3_VERSION", "import path from 'node:path';\nimport { spawnSync } from 'node:child_process';\nimport { V3_VERSION",'Production receipt git import')
replace(prod,"const assert=(c,m)=>{if(!c)throw new Error(m)};","const assert=(c,m)=>{if(!c)throw new Error(m)};\nconst sourceSha=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}),sourceAt=spawnSync('git',['show','-s','--format=%cI','HEAD'],{cwd:root,encoding:'utf8'});const currentSourceCommit=String(sourceSha.stdout||'').trim(),currentSourceCommittedAt=String(sourceAt.stdout||'').trim();assert(sourceSha.status===0&&/^[0-9a-f]{40}$/i.test(currentSourceCommit),'current source commit unavailable');assert(sourceAt.status===0&&Number.isFinite(Date.parse(currentSourceCommittedAt)),'current source commit time unavailable');",'Production receipt source identity')
replace(prod,"version:V3_VERSION,schema:V31_SCHEMA_VERSION,issue:id,generatedAt:new Date().toISOString(),status:'passed',","version:V3_VERSION,schema:V31_SCHEMA_VERSION,issue:id,generatedAt:new Date().toISOString(),sourceCommit:currentSourceCommit,sourceCommittedAt:currentSourceCommittedAt,status:'passed',",'Production receipt source binding')

print('P1-10 integration patch complete')
