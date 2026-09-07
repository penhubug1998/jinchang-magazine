const fs=require('node:fs');

function replaceExact(src,oldText,newText,label){
  if(!src.includes(oldText))throw new Error(`${label} contract drifted`);
  return src.replace(oldText,newText);
}

// P0-02: expose an explicit editor baseline + observed-server version in the Studio state.
{
  const file='src/studio/studio.js';
  let src=fs.readFileSync(file,'utf8');
  src=replaceExact(src,
    "sourceStatus:null, sourceFingerprint:'', page: 0",
    "sourceStatus:null, sourceFingerprint:'', sourceObservedFingerprint:'', sourceConflict:null, page: 0",
    'Studio source state');

  const refreshOld=`async function refreshSourceStatus({quiet=false}={}){
  const id=state.issue?.id;if(!id)return null;
  try{const source=await api(\`/api/issues/\${encodeURIComponent(id)}/source-status\`);if(state.issue?.id!==id)return null;state.sourceStatus=source;state.sourceFingerprint=String(source?.fingerprint||'');renderSourceStatus();return source;}
  catch(error){if(!quiet)toast(\`读取服务器制作源失败：\${error.message}\`,3000);return null;}
}`;
  const refreshNew=`async function refreshSourceStatus({quiet=false,adoptBaseline=false}={}){
  const id=state.issue?.id;if(!id)return null;
  try{const source=await api(\`/api/issues/\${encodeURIComponent(id)}/source-status\`);if(state.issue?.id!==id)return null;state.sourceStatus=source;state.sourceObservedFingerprint=String(source?.fingerprint||'');if(adoptBaseline&&!state.dirty&&!state.sourceConflict)state.sourceFingerprint=state.sourceObservedFingerprint;renderSourceStatus();return source;}
  catch(error){if(!quiet)toast(\`读取服务器制作源失败：\${error.message}\`,3000);return null;}
}`;
  src=replaceExact(src,refreshOld,refreshNew,'refreshSourceStatus');

  src=replaceExact(src,
    "state.sourceStatus=sourceStatus; state.sourceFingerprint=String(sourceStatus?.fingerprint||''); state.identityMigrationPending",
    "state.sourceStatus=sourceStatus; state.sourceFingerprint=String(sourceStatus?.fingerprint||''); state.sourceObservedFingerprint=state.sourceFingerprint; state.sourceConflict=null; state.identityMigrationPending",
    'issue load source baseline');

  const statusOld="title.textContent=`服务器制作源 · 已保护`;\n  text.textContent=`保存前自动创建快照；当前源指纹 ${String(source.fingerprint||'').slice(0,12)||'—'} · ${snapshot} · 保留 ${Number(source.snapshotCount||0)} 个快照。`;";
  const statusNew="if(state.sourceConflict){title.textContent='检测到并发保存冲突 · 已锁定保存';text.textContent=`本地稿未丢失；编辑基线 ${String(state.sourceFingerprint||'').slice(0,12)||'—'}，服务器最新 ${String(state.sourceObservedFingerprint||source.fingerprint||'').slice(0,12)||'—'}。请重新打开本期并人工合并；刷新服务器状态不会解除锁定。`;return;}\n  title.textContent=`服务器制作源 · 已保护`;\n  text.textContent=`保存前自动创建快照；编辑基线 ${String(state.sourceFingerprint||'').slice(0,12)||'—'} · 服务器观察 ${String(state.sourceObservedFingerprint||source.fingerprint||'').slice(0,12)||'—'} · ${snapshot} · 保留 ${Number(source.snapshotCount||0)} 个快照。`;";
  src=replaceExact(src,statusOld,statusNew,'source status UI');

  const saveOld=`async function saveIssue({ silent=false }={}) {
  if (!state.issue || !commitPage()) return false; syncMeta();
  const identityRepair = ensureIssueIdentity(state.issue);
  if (identityRepair.changed) { state.identityMigrationPending = true; syncJsonFromPage(); renderPages(); renderBlockList(); }
  try { const res = await api(\`/api/issues/\${state.issue.id}\`, { method:'PUT', body:JSON.stringify({issue:state.issue,sourceFingerprint:state.sourceFingerprint}) }); state.issue = res.issue; state.originalIssue=cloneData(res.issue); state.sourceStatus=res.source||state.sourceStatus; state.sourceFingerprint=String(res.source?.fingerprint||state.sourceFingerprint||''); state.historyCurrent=cloneData(res.issue); state.redoStack=[]; state.dirty = false; if (state.audit) state.auditStale = true; renderPages(); renderPage(); renderSourceStatus(); updateStateBadges(); await Promise.allSettled([deleteDraft(),loadIssues(),loadSnapshots()]); broadcastPeer('saved',{issue:state.issue,snapshotId:res.snapshot?.id||''}); if (!silent) toast(\`已保存 · 快照 \${res.snapshot.id}\`); return true; }
  catch (e) { if(e.code==='SOURCE_DRIFT'){toast('服务器制作源已被其他窗口更新，当前修改未覆盖。请重新打开本期后再合并修改。',4200);void refreshSourceStatus({quiet:true});return false;} toast(e.message,2800); return false; }
}`;
  const saveNew=`async function saveIssue({ silent=false }={}) {
  if (!state.issue || !commitPage()) return false; syncMeta();
  if(state.sourceConflict){if(!silent)toast('检测到其他窗口已保存新版本；当前本地稿仍保留，但保存已锁定。请重新打开本期并人工合并后再保存。',5200);return false;}
  const identityRepair = ensureIssueIdentity(state.issue);
  if (identityRepair.changed) { state.identityMigrationPending = true; syncJsonFromPage(); renderPages(); renderBlockList(); }
  const baselineFingerprint=String(state.sourceFingerprint||'');
  try { const res = await api(\`/api/issues/\${state.issue.id}\`, { method:'PUT', body:JSON.stringify({issue:state.issue,sourceFingerprint:baselineFingerprint,editorSessionId:PEER_SESSION_ID}) }); state.issue = res.issue; state.originalIssue=cloneData(res.issue); state.sourceStatus=res.source||state.sourceStatus; state.sourceFingerprint=String(res.source?.fingerprint||baselineFingerprint); state.sourceObservedFingerprint=state.sourceFingerprint; state.sourceConflict=null; state.historyCurrent=cloneData(res.issue); state.redoStack=[]; state.dirty = false; if (state.audit) state.auditStale = true; renderPages(); renderPage(); renderSourceStatus(); updateStateBadges(); await Promise.allSettled([deleteDraft(),loadIssues(),loadSnapshots()]); broadcastPeer('saved',{issue:state.issue,snapshotId:res.snapshot?.id||''}); if (!silent) toast(\`已保存 · 快照 \${res.snapshot.id}\`); return true; }
  catch (e) { if(e.code==='SOURCE_DRIFT'){state.sourceConflict={at:Date.now(),baselineFingerprint,serverFingerprint:state.sourceObservedFingerprint||'',localIssue:cloneData(state.issue)};toast('服务器制作源已被其他窗口更新。当前本地稿已保留，连续点击保存不会覆盖新稿；请重新打开本期后人工合并。',5600);void refreshSourceStatus({quiet:true,adoptBaseline:false});renderSourceStatus();return false;} toast(e.message,2800); return false; }
}`;
  src=replaceExact(src,saveOld,saveNew,'saveIssue');

  // Any successful operation that returns a new source receipt legitimately advances both values.
  src=src.replaceAll("state.sourceFingerprint=String(x.source?.fingerprint||state.sourceFingerprint||'');renderSourceStatus();","state.sourceFingerprint=String(x.source?.fingerprint||state.sourceFingerprint||'');state.sourceObservedFingerprint=state.sourceFingerprint;state.sourceConflict=null;renderSourceStatus();");
  src=src.replaceAll("state.sourceFingerprint=String(r.source?.fingerprint||state.sourceFingerprint||'');renderSourceStatus();","state.sourceFingerprint=String(r.source?.fingerprint||state.sourceFingerprint||'');state.sourceObservedFingerprint=state.sourceFingerprint;state.sourceConflict=null;renderSourceStatus();");
  fs.writeFileSync(file,src);
}

// P0-02/P0-03: serialize source writes, atomically replace issue.json, and fail closed in formal mode.
{
  const file='scripts/studio-v3.mjs';
  let src=fs.readFileSync(file,'utf8');
  src=replaceExact(src,
    "const adminLoginEnabled = adminLoginPassword.length > 0;",
    "const adminLoginEnabled = adminLoginPassword.length > 0;\nconst productionMode = process.env.NODE_ENV === 'production' || process.env.V3_FORMAL_MODE === '1' || process.env.STUDIO_PRODUCTION === '1';\nif(productionMode&&!acceptanceOnly&&!adminLoginEnabled)throw new Error('正式模式必须配置 STUDIO_ADMIN_PASSWORD；为避免未鉴权启动，服务已拒绝启动。');",
    'formal auth boundary');
  src=replaceExact(src,"const backgroundJobs = new Map();","const backgroundJobs = new Map();\nconst issueWriteLocks = new Map();",'issue write lock map');

  const helperAnchor="function send(res,status,data,type='application/json; charset=utf-8',headers={}) {";
  const helper=`async function atomicWriteText(file,text){const dir=path.dirname(file);await mkdir(dir,{recursive:true});const temp=path.join(dir,\`.\${path.basename(file)}.tmp-\${process.pid}-\${randomUUID()}\`);try{await writeFile(temp,text,'utf8');await rename(temp,file);}catch(error){await rm(temp,{force:true}).catch(()=>{});throw error;}}
async function withIssueWriteLock(issueId,task){const key=String(issueId);const previous=issueWriteLocks.get(key)||Promise.resolve();let release;const gate=new Promise(resolve=>{release=resolve});const tail=previous.catch(()=>{}).then(()=>gate);issueWriteLocks.set(key,tail);await previous.catch(()=>{});try{return await task();}finally{release();if(issueWriteLocks.get(key)===tail)issueWriteLocks.delete(key);}}
`;
  if(!src.includes(helperAnchor))throw new Error('send helper anchor drifted');
  src=src.replace(helperAnchor,helper+helperAnchor);

  const putRe=/if \(seg\.length===3&&req\.method==='PUT'\) \{ const payload=await body\(req\);const data=payload\?\.issue&&typeof payload\.issue==='object'&&!Array\.isArray\(payload\.issue\)\?payload\.issue:payload;const expectedFingerprint=String\(payload\?\.sourceFingerprint\|\|''\);const currentFingerprint=issueSourceFingerprint\(issue\);if\(expectedFingerprint&&expectedFingerprint!==currentFingerprint\)return send\(res,409,\{error:'服务器制作源已更新；为避免覆盖新内容，本次保存已拒绝。请重新打开本期后再合并修改。',code:'SOURCE_DRIFT',source:await readSourceStatus\(id,issue\)\}\);try\{validateIssue\(data,id\)\}catch\(e\)\{return send\(res,400,\{error:e\.message\|\|String\(e\),code:'VALIDATION_ERROR'\}\)\}if\(issue\.status==='published'&&data\.status==='published'\)\{data\.revision=\{\.\.\.\(data\.revision\|\|\{\}\),pending:true,updatedAt:new Date\(\)\.toISOString\(\),basePublishedAt:issue\.publishedAt\|\|null,source:'studio'\};\}const snap=await snapshotIssue\(id,'studio-before-save'\);await writeFile\(issueFile,`\$\{JSON\.stringify\(data,null,2\)\}\\n`,'utf8'\);await deleteDraftFile\(id\);await runScriptAsync\('sync-assets-v3\.mjs',\['--issue',id\]\);const source=await writeSourceReceipt\(id,data,\{reason:'studio-save',snapshot:snap\}\);return send\(res,200,\{issue:data,snapshot:snap,source\}\); \}/;
  if(!putRe.test(src))throw new Error('issue PUT route drifted');
  const putNew=`if (seg.length===3&&req.method==='PUT') { const payload=await body(req);const data=payload?.issue&&typeof payload.issue==='object'&&!Array.isArray(payload.issue)?payload.issue:payload;const protectedEnvelope=Boolean(payload?.issue&&typeof payload.issue==='object'&&!Array.isArray(payload.issue));const expectedFingerprint=String(payload?.sourceFingerprint||'');if(protectedEnvelope&&!expectedFingerprint)return send(res,428,{error:'保存请求缺少编辑基线指纹，请重新打开本期后再保存。',code:'SOURCE_FINGERPRINT_REQUIRED'});return withIssueWriteLock(id,async()=>{const freshIssue=await readJson(issueFile);const currentFingerprint=issueSourceFingerprint(freshIssue);if(expectedFingerprint&&expectedFingerprint!==currentFingerprint)return send(res,409,{error:'服务器制作源已更新；为避免覆盖新内容，本次保存已拒绝。请重新打开本期后再合并修改。',code:'SOURCE_DRIFT',source:await readSourceStatus(id,freshIssue)});try{validateIssue(data,id)}catch(e){return send(res,400,{error:e.message||String(e),code:'VALIDATION_ERROR'})}if(freshIssue.status==='published'&&data.status==='published'){data.revision={...(data.revision||{}),pending:true,updatedAt:new Date().toISOString(),basePublishedAt:freshIssue.publishedAt||null,source:'studio'};}const snap=await snapshotIssue(id,'studio-before-save');await atomicWriteText(issueFile,\`\${JSON.stringify(data,null,2)}\\n\`);await deleteDraftFile(id);await runScriptAsync('sync-assets-v3.mjs',['--issue',id]);const source=await writeSourceReceipt(id,data,{reason:'studio-save',snapshot:snap});return send(res,200,{issue:data,snapshot:snap,source});}); }`;
  src=src.replace(putRe,putNew);

  const acceptanceOld="if(seg[0]==='api'&&['rc','rc1'].includes(seg[1])&&seg[2]==='acceptance'){\n    if(req.method==='GET')return send(res,200,await readRc1Acceptance());\n    if(req.method==='POST'){";
  const acceptanceNew="if(seg[0]==='api'&&['rc','rc1'].includes(seg[1])&&seg[2]==='acceptance'){\n    if(req.method==='GET')return send(res,200,await readRc1Acceptance());\n    if(req.method==='POST'){\n      if(productionMode&&!acceptanceOnly&&!adminSession(req))return send(res,401,{error:'正式模式下验收记录写入需要已认证管理会话',code:'AUTH_REQUIRED'});";
  src=replaceExact(src,acceptanceOld,acceptanceNew,'acceptance write auth');
  fs.writeFileSync(file,src);
}

// Strengthen server integration regression with repeated stale saves, missing baseline and true parallel writers.
{
  const file='scripts/source-guard-smoke-v3.mjs';
  let src=fs.readFileSync(file,'utf8');
  const conflictAnchor="  assert(conflict.code === 'SOURCE_DRIFT', 'stale source must return SOURCE_DRIFT');\n";
  const conflictAdd=`\n  response = await fetch(\`\${base}/api/issues/001/source-status\`);\n  const observedServer = await response.json();\n  assert(observedServer.fingerprint === saved.source.fingerprint, 'source refresh should expose newer source without changing stale baseline');\n  stale.subtitle = '旧窗口第二次覆盖尝试';\n  response = await fetch(\`\${base}/api/issues/001\`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({issue:stale,sourceFingerprint:before.fingerprint}) });\n  assert(response.status === 409, 'stale editor must remain rejected after refreshing source status');\n  const afterRetry = JSON.parse(await readFile(path.join(sandbox,'issues','001','issue.json'),'utf8'));\n  assert(afterRetry.subtitle === '服务器已更新', 'repeated stale save must never overwrite the newer source');\n  const missingFingerprint = await fetch(\`\${base}/api/issues/001\`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({issue:stale}) });\n  assert(missingFingerprint.status === 428, 'protected Studio envelope without baseline fingerprint must be rejected');\n`;
  src=replaceExact(src,conflictAnchor,conflictAnchor+conflictAdd,'source conflict retry test');
  const receiptAnchor="  assert(receipt.fingerprint === saved.source.fingerprint && receipt.reason === 'studio-save', `latest source receipt mismatch: ${JSON.stringify({ receipt, saved: saved.source })}`);\n";
  const parallelAdd=`\n  const baseline = saved.source.fingerprint;\n  const left=structuredClone(changed),right=structuredClone(changed);left.subtitle='并发写入 A';right.subtitle='并发写入 B';\n  const pair=await Promise.all([left,right].map(next=>fetch(\`\${base}/api/issues/001\`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({issue:next,sourceFingerprint:baseline})})));\n  const statuses=pair.map(x=>x.status).sort((a,b)=>a-b);\n  assert(statuses[0]===200&&statuses[1]===409,`parallel save should serialize to one success and one conflict: ${JSON.stringify(statuses)}`);\n  const finalParallel=JSON.parse(await readFile(path.join(sandbox,'issues','001','issue.json'),'utf8'));\n  assert(['并发写入 A','并发写入 B'].includes(finalParallel.subtitle),'parallel final source must be one complete writer, never a torn write');\n`;
  src=replaceExact(src,receiptAnchor,receiptAnchor+parallelAdd,'parallel source test');
  fs.writeFileSync(file,src);
}

// Static + process-level regression for the new formal boundaries.
{
  const file='scripts/plan-p0-reliability-smoke-v3.mjs';
  const content=`import { readFile } from 'node:fs/promises';\nimport { spawn } from 'node:child_process';\nconst assert=(c,m)=>{if(!c)throw new Error(m)};\nconst studio=await readFile('src/studio/studio.js','utf8');\nconst server=await readFile('scripts/studio-v3.mjs','utf8');\nconst ignore=await readFile('.gitignore','utf8');\nassert(studio.includes('sourceObservedFingerprint')&&studio.includes('sourceConflict'),'Studio must separate edit baseline from observed server source');\nassert(studio.includes('if(state.sourceConflict)')&&studio.includes('adoptBaseline:false'),'SOURCE_DRIFT must lock repeat saves without upgrading baseline');\nassert(server.includes('withIssueWriteLock')&&server.includes('atomicWriteText'),'server must serialize issue writes and atomically replace issue.json');\nassert(server.includes('SOURCE_FINGERPRINT_REQUIRED'),'Studio protected save must require an edit-baseline fingerprint');\nassert(server.includes('productionMode')&&server.includes('正式模式必须配置 STUDIO_ADMIN_PASSWORD'),'formal server must fail closed without credentials');\nassert(ignore.includes('.v3-ai-config.json')&&ignore.includes('.v3-ai-cache/'),'AI local config/cache must stay ignored');\nconst env={...process.env,NODE_ENV:'production',V3_FORMAL_MODE:'1'};delete env.STUDIO_ADMIN_PASSWORD;\nconst child=spawn(process.execPath,['scripts/studio-v3.mjs','--port','43991'],{env,stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>out+=x);const code=await new Promise(r=>child.on('exit',r));\nassert(code!==0&&out.includes('STUDIO_ADMIN_PASSWORD'),`formal direct server must refuse unauthenticated boot: ${'${'}code} ${'${'}out}`);\nconsole.log('Plan P0 reliability smoke 通过：编辑基线锁、并发原子写入、正式鉴权与本地配置边界已固化。');\n`;
  fs.writeFileSync(file,content);
}

console.log('Current development-plan patch applied.');
