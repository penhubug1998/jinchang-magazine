from pathlib import Path

p = Path('scripts/studio-v3.mjs')
s = p.read_text()
anchor = 'const MAX_BACKGROUND_JOBS = 100;'
if anchor not in s:
    raise SystemExit('background constants drifted')
if 'const backgroundJobFile=' not in s:
    s = s.replace(anchor, anchor + "\nconst backgroundJobFile=process.env.V3_BACKGROUND_JOB_FILE?path.resolve(process.env.V3_BACKGROUND_JOB_FILE):path.join(root,'.v3-background-jobs','jobs.json');\nlet backgroundJobPersistChain=Promise.resolve();", 1)

a = s.index('function jobView(job){')
b = s.index('\nfunction backgroundJobResponse(job)', a)
replacement = r'''function jobView(job){return {id:job.id,kind:job.kind,issueId:job.issueId,status:job.status,progress:job.progress,createdAt:job.createdAt,startedAt:job.startedAt||null,finishedAt:job.finishedAt||null,statusUrl:`/api/jobs/${encodeURIComponent(job.id)}`,result:job.result||null,error:job.error||null,errorDetails:job.errorDetails||null,retryable:['failed','interrupted','cancelled'].includes(job.status),sourceFingerprint:job.sourceFingerprint||null};}
function durableJobRecord(job){return {id:job.id,kind:job.kind,issueId:job.issueId,payload:job.payload||{},sourceFingerprint:job.sourceFingerprint||null,status:job.status,progress:job.progress,createdAt:job.createdAt,startedAt:job.startedAt||null,finishedAt:job.finishedAt||null,result:job.result||null,error:job.error||null,errorDetails:job.errorDetails||null};}
function persistBackgroundJobs(){const data={version:1,updatedAt:new Date().toISOString(),jobs:[...backgroundJobs.values()].map(durableJobRecord)};backgroundJobPersistChain=backgroundJobPersistChain.catch(()=>{}).then(()=>atomicWriteText(backgroundJobFile,`${JSON.stringify(data,null,2)}\n`));return backgroundJobPersistChain;}
function backgroundTaskFor(kind,id,payload={}){switch(kind){
case 'publication-preflight':return report=>runPublicationPreflight(id,report);
case 'publication-preview':return async report=>{report({stage:'构建当前期刊',percent:10});const output=await ensurePublicationWeb(id);return {ok:true,output,status:await publicationStatus(id,{refreshAudit:false})};};
case 'publication-pdf':return async report=>{report({stage:'生成 PDF',percent:10});const output=await generatePublicationPdf(id);return {ok:true,output,status:await publicationStatus(id,{refreshAudit:false})};};
case 'publication-archive':return async report=>{report({stage:'生成归档包',percent:10});const output=await generatePublicationArchive(id);return {ok:true,output,status:await publicationStatus(id,{refreshAudit:false})};};
case 'publication-release':return async report=>{const output=await generateFormalRelease(id,report);const issueFile=path.join(root,'issues',id,'issue.json'),nextIssue=await readJson(issueFile),source=await writeSourceReceipt(id,nextIssue,{reason:'formal-release'});return {ok:true,output,status:await publicationStatus(id,{refreshAudit:true}),issue:nextIssue,source};};
case 'public-deploy':return async report=>{report({stage:'部署公开 Reader',percent:10});const deployment=await deployPublicIssue(id);report({stage:'在线校验',percent:90});return {ok:deployment.verified,deployment,status:await publicationStatus(id,{refreshAudit:false})};};
case 'audit':return async report=>{report({stage:'执行审计',percent:10});const argv=['--issue',id,'--quiet'];if(payload.strict)argv.push('--strict');const r=await runScriptAsync('audit-v3.mjs',argv),reportFile=path.join(root,'reports',`v3-release-audit-${id}.json`);let auditReport=null;try{auditReport=await readJson(reportFile)}catch{}return {ok:r.ok,output:r.output,strict:Boolean(payload.strict),generatedAt:auditReport?.generatedAt||null,audit:auditReport?.issues?.[0]||null,htmlUrl:`/reports/v3-release-audit-${id}.html`};};
case 'build':return async report=>{report({stage:'构建当前期刊',percent:10});const r=await runScriptAsync('build-v3.mjs',['--issue',id]);return {ok:r.ok,output:r.output,preview:`/preview/${id}/`};};
case 'tts-generate':return report=>{const bin=resolveTtsGenerator();if(!bin)throw Object.assign(new Error('服务器未配置 TTS 生成器'),{code:'TTS_GENERATOR_UNAVAILABLE'});return generateTtsForIssue(id,payload,bin,report);};
default:throw Object.assign(new Error(`未知后台任务类型：${kind}`),{code:'JOB_KIND_UNKNOWN'});
}}
async function assertBackgroundJobSource(job){if(!job.sourceFingerprint||!job.issueId)return;const file=path.join(root,'issues',job.issueId,'issue.json');const current=issueSourceFingerprint(await readJson(file));if(current!==job.sourceFingerprint)throw Object.assign(new Error('任务排队后源稿已变化；为避免用错误版本生成发布结果，本任务已停止。请基于当前稿件重新发起。'),{code:'JOB_SOURCE_CHANGED'});}
function enqueueBackgroundJob({kind,issueId,payload={},sourceFingerprint=null,task}){
  if(backgroundQueue.length>=MAX_BACKGROUND_QUEUE)throw Object.assign(new Error('后台任务队列已满，请稍后重试'),{statusCode:429,code:'JOB_QUEUE_FULL'});
  const job={id:`job-${Date.now().toString(36)}-${randomUUID().slice(0,8)}`,kind,issueId,payload,sourceFingerprint,status:'queued',progress:{stage:'排队中',percent:0},createdAt:new Date().toISOString(),task:task||backgroundTaskFor(kind,issueId,payload)};
  backgroundJobs.set(job.id,job);backgroundQueue.push(job);void persistBackgroundJobs();void pumpBackgroundJobs();return job;
}
async function restoreBackgroundJobs(){let data=null;try{data=await readJson(backgroundJobFile)}catch{}for(const row of Array.isArray(data?.jobs)?data.jobs.slice(-MAX_BACKGROUND_JOBS):[]){const job={...row,payload:row.payload||{},task:null};if(['queued','running'].includes(job.status)){job.status='interrupted';job.finishedAt=new Date().toISOString();job.error='服务重启时任务尚未结束，已安全标记为中断，可重新执行。';job.errorDetails={code:'SERVICE_RESTART',advice:['检查当前源稿版本后点击重试']};job.progress={stage:'服务重启 · 已中断',percent:Number(job.progress?.percent)||0};}backgroundJobs.set(job.id,job);}if(backgroundJobs.size)await persistBackgroundJobs();}
function cancelBackgroundJob(job){if(job.status!=='queued')throw Object.assign(new Error('仅排队中的任务可安全取消；运行中的发布/构建任务不会被强行终止。'),{statusCode:409,code:'JOB_NOT_CANCELLABLE'});const i=backgroundQueue.findIndex(x=>x.id===job.id);if(i>=0)backgroundQueue.splice(i,1);job.status='cancelled';job.finishedAt=new Date().toISOString();job.progress={stage:'已取消',percent:0};job.task=null;void persistBackgroundJobs();return job;}
function retryBackgroundJob(job){if(!['failed','interrupted','cancelled'].includes(job.status))throw Object.assign(new Error('当前任务状态不能重试'),{statusCode:409,code:'JOB_NOT_RETRYABLE'});return enqueueBackgroundJob({kind:job.kind,issueId:job.issueId,payload:job.payload||{},sourceFingerprint:job.sourceFingerprint,task:backgroundTaskFor(job.kind,job.issueId,job.payload||{})});}
async function pumpBackgroundJobs(){
  if(backgroundJobRunning)return;backgroundJobRunning=true;
  try{while(backgroundQueue.length){const job=backgroundQueue.shift();job.status='running';job.startedAt=new Date().toISOString();job.progress={stage:'开始执行',percent:1};await persistBackgroundJobs();try{await assertBackgroundJobSource(job);job.result=await job.task(progress=>{job.progress={...job.progress,...progress};void persistBackgroundJobs();});job.status='succeeded';job.progress={stage:'已完成',percent:100};}catch(error){job.status='failed';job.error=error?.message||String(error);job.errorDetails={code:error?.code||'',advice:Array.isArray(error?.advice)?error.advice:[]};job.progress={stage:'执行失败',percent:100};console.error(`[job:${job.id}] ${job.error}`);}job.finishedAt=new Date().toISOString();job.task=null;while(backgroundJobs.size>MAX_BACKGROUND_JOBS){const oldest=[...backgroundJobs.values()].find(x=>!['queued','running'].includes(x.status));if(!oldest)break;backgroundJobs.delete(oldest.id);}await persistBackgroundJobs();}}
  finally{backgroundJobRunning=false;}
}'''
s = s[:a] + replacement + s[b:]
old_route = "if(!acceptanceOnly&&seg[0]==='api'&&seg[1]==='jobs'&&seg[2]&&req.method==='GET'){\n    const job=backgroundJobs.get(seg[2]);\n    return job?send(res,200,jobView(job)):send(res,404,{error:'后台任务不存在或已过期',code:'JOB_NOT_FOUND'});\n  }"
new_route = "if(!acceptanceOnly&&seg[0]==='api'&&seg[1]==='jobs'&&seg[2]){const job=backgroundJobs.get(seg[2]);if(!job)return send(res,404,{error:'后台任务不存在或已过期',code:'JOB_NOT_FOUND'});if(req.method==='GET')return send(res,200,jobView(job));if(seg[3]==='cancel'&&req.method==='POST'){try{return send(res,200,jobView(cancelBackgroundJob(job)))}catch(e){return send(res,e.statusCode||409,{error:e.message,code:e.code})}}if(seg[3]==='retry'&&req.method==='POST'){try{const next=retryBackgroundJob(job);return send(res,202,backgroundJobResponse(next))}catch(e){return send(res,e.statusCode||409,{error:e.message,code:e.code})}}}"
if old_route not in s:
    raise SystemExit('job API route drifted')
s = s.replace(old_route, new_route, 1)
s = s.replace("issueId:id,task:", "issueId:id,sourceFingerprint:issueSourceFingerprint(issue),task:")
s = s.replace("kind:'audit',issueId:id,sourceFingerprint:issueSourceFingerprint(issue),task:", "kind:'audit',issueId:id,payload:{strict:Boolean(data.strict)},sourceFingerprint:issueSourceFingerprint(issue),task:")
s = s.replace("kind:'tts-generate',issueId:id,sourceFingerprint:issueSourceFingerprint(issue),task:", "kind:'tts-generate',issueId:id,payload:data,sourceFingerprint:issueSourceFingerprint(issue),task:")
listen = 'server.listen(port,host,()=>{'
if listen not in s:
    raise SystemExit('listen contract drifted')
if 'await restoreBackgroundJobs();\nserver.listen' not in s:
    s = s.replace(listen, 'await restoreBackgroundJobs();\n' + listen, 1)
p.write_text(s)

g = Path('.gitignore')
t = g.read_text() if g.exists() else ''
if '.v3-background-jobs/' not in t:
    g.write_text(t.rstrip() + '\n.v3-background-jobs/\n')
