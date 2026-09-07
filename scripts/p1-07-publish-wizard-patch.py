from pathlib import Path
import json


def replace_once(path, old, new, label):
    p=Path(path); s=p.read_text()
    if old not in s:
        raise SystemExit(f'{label} drifted: {path}')
    p.write_text(s.replace(old,new,1))


def append_once(path, marker, text):
    p=Path(path); s=p.read_text()
    if marker in s:
        return
    p.write_text(s.rstrip()+"\n\n"+text.rstrip()+"\n")

# --- Publishing Center UI --------------------------------------------------
html='src/studio/index.html'
anchor='<section class="publication-section"><div class="publication-section-head"><div><span class="eyebrow">QUALITY GATES</span><strong>发布指标</strong></div><span id="publicationPreflightState">尚未执行严格发布检查</span></div><div id="publicationMetrics" class="publication-metrics"></div></section>'
insert='''<section class="publication-section publication-wizard" id="publicationWizardSection"><div class="publication-section-head"><div><span class="eyebrow">GUIDED RELEASE</span><strong>统一发布向导</strong><small>保存 → 校审清零 → 交接签收 → 构建与门禁 → 正式发布 / 上线</small></div><span id="publicationWizardState">正在读取流程状态</span></div><div id="publicationWizardSteps" class="publication-wizard-steps"></div><div class="publication-wizard-next"><div><span class="eyebrow">NEXT ACTION</span><strong id="publicationWizardNextTitle">正在判断下一步…</strong><p id="publicationWizardNextDetail">系统只推进当前尚未完成的一步，不跳过校审和签收。</p></div><div class="publication-wizard-actions"><button type="button" id="publicationWizardRollbackBtn">查看回滚点</button><button type="button" class="primary" id="publicationWizardNextBtn">继续下一步</button></div></div></section>'''
replace_once(html,anchor,insert+anchor,'publication wizard section')
replace_once(html,'<section class="publication-section"><div class="publication-section-head"><div><span class="eyebrow">SNAPSHOT / ROLLBACK</span>','<section class="publication-section" id="publicationRollbackSection"><div class="publication-section-head"><div><span class="eyebrow">SNAPSHOT / ROLLBACK</span>','rollback section id')

# --- Client state and workflow --------------------------------------------
js='src/studio/studio.js'
replace_once(js,"publicationSnapshots:[], studioEntry:'content' };","publicationSnapshots:[], publicationWorkflow:null, studioEntry:'content' };",'publication workflow state')
replace_once(js,"state.publicationStatus=null; state.publicationStatusPromise=null; state.editorMode='visual';","state.publicationStatus=null; state.publicationStatusPromise=null; state.publicationWorkflow=null; state.editorMode='visual';",'publication workflow reset')

workflow_client=r'''
async function loadPublicationWorkflow({refresh=true}={}){
  if(!state.issue)return null;
  const id=String(state.issue.id);
  try{
    const wf=await api(`/api/issues/${encodeURIComponent(id)}/publication/workflow?refresh=${refresh?'1':'0'}`);
    if(state.issue?.id===id){state.publicationWorkflow=wf;renderPublicationWizard();}
    return wf;
  }catch(error){
    state.publicationWorkflow={issue:id,error:error.message||String(error),nextAction:'status'};
    renderPublicationWizard();
    throw error;
  }
}
function publicationWizardStep(id,label,ready,detail,current=false){
  const tone=ready?'pass':current?'current':'pending';
  return `<article class="publication-wizard-step ${tone}" data-publication-wizard-step="${id}"><span>${ready?'✓':current?'→':'○'}</span><div><b>${escText(label)}</b><small>${escText(detail||'')}</small></div></article>`;
}
function renderPublicationWizard(){
  const box=$('#publicationWizardSteps'),stateEl=$('#publicationWizardState'),title=$('#publicationWizardNextTitle'),detail=$('#publicationWizardNextDetail'),button=$('#publicationWizardNextBtn');
  if(!box||!state.issue)return;
  const wf=state.publicationWorkflow||{},dirty=Boolean(state.dirty),review=wf.review||{},signoff=wf.signoff||{},gate=wf.gate||{},build=wf.build||{},release=wf.release||{},deployment=wf.deployment||{};
  let next=dirty?'save':String(wf.nextAction||'status');
  if(!dirty&&next==='save')next='review';
  const steps=[
    ['save','保存制作源',!dirty,dirty?'当前仍有未保存修改':'制作源已保存'],
    ['review','校审清零',Boolean(review.ready),review.ready?'人工校审项已清零':`${Number(review.unresolved)||0} 项仍待处理`],
    ['signoff','交接签收',Boolean(signoff.ready),signoff.ready?`${signoff.recipient||'内部签收'} · 已确认`:signoff.accepted?'签收已过期，期刊修改后需重新核对':'需要完成最新一轮内部签收'],
    ['build','构建与门禁',Boolean(gate.ready&&build.ready),gate.ready?(build.ready?'严格门禁与 Web Reader 均已就绪':'门禁通过，尚未生成 Web Reader'):'严格发布检查尚未通过'],
    ['release','正式发布 / 上线',Boolean(release.completed&&(!deployment.configured||deployment.verified)),release.completed?(deployment.configured?(deployment.verified?'已发布并完成公开校验':'已发布，公开部署待完成'):'正式发布包已生成'):'尚未正式发布']
  ];
  const currentId=next==='preflight'||next==='build'?'build':next==='deploy'||next==='done'?'release':next;
  box.innerHTML=steps.map(([id,label,ready,text])=>publicationWizardStep(id,label,ready,text,id===currentId&&!ready)).join('');
  const labels={save:['先保存当前修改','保存后会重新计算校审、签收和发布证据。'],review:['完成内部校审','仍有未复核问题；进入校审台逐项处理后再继续。'],signoff:['完成交接签收','生成或打开最新校审轮次，核对版本差异并由内部签收人确认。'],preflight:['运行严格发布检查','检查内容完整度、媒体、链接、无障碍和朗读等正式发布门禁。'],build:['生成 Web Reader','严格门禁已通过，先生成真实 Web Reader 构建，再进入正式发布。'],release:['正式发布并上线','校审、签收、构建和门禁均已完成，可以进入正式发布。'],deploy:['完成公开部署','正式发布包已生成；继续部署并校验公开阅读地址。'],done:['发布闭环已完成','公开版本已校验。需要恢复时可使用下方发布快照回滚。'],status:['刷新发布状态','重新读取服务器发布证据后判断下一步。']};
  const copy=labels[next]||labels.status;
  if(stateEl)stateEl.textContent=wf.generatedAt?`状态更新 ${fmtTime(wf.generatedAt)}`:'发布流程状态';
  if(title)title.textContent=copy[0];if(detail)detail.textContent=copy[1];
  if(button){button.textContent=next==='done'?'打开公开版本':'继续下一步';button.disabled=Boolean(state.publicationBusy);button.dataset.wizardAction=next;}
}
async function runPublicationWizardNext(){
  if(!requireIssue()||state.publicationBusy)return;
  if(state.dirty){const ok=await saveIssue({silent:true});if(!ok)return;await loadPublicationWorkflow({refresh:true});return renderPublicationWizard();}
  let wf;
  try{wf=await loadPublicationWorkflow({refresh:true});}catch(error){return toast(`读取发布流程失败：${error.message}`,3600);}
  const next=String(wf?.nextAction||'status');
  if(next==='review'){$('#publicationCenterDialog')?.close();await openReviewWorkspace();return;}
  if(next==='signoff'){$('#publicationCenterDialog')?.close();await openReviewHandoffs();return;}
  if(next==='preflight'){await runPublicationPreflightUi();await loadPublicationWorkflow({refresh:true});return;}
  if(next==='build'){await runPublicationAction('preview','构建 Web Reader');await loadPublicationWorkflow({refresh:true});return;}
  if(next==='release'){await formalPublicationUi();await loadPublicationWorkflow({refresh:true}).catch(()=>{});return;}
  if(next==='deploy'){await deployPublicationUi();await loadPublicationWorkflow({refresh:true}).catch(()=>{});return;}
  if(next==='done'){const url=state.publicationStatus?.publicShare?.url||state.publicationStatus?.publicDeployment?.url;if(url)window.open(url,'_blank','noopener');else toast('发布闭环已完成；当前环境没有配置公开阅读地址');return;}
  await Promise.all([loadPublicationStatus({refresh:true}),loadPublicationWorkflow({refresh:true})]);
}
'''
replace_once(js,'async function loadPublicationStatus({refresh=true}={}){',workflow_client+'\nasync function loadPublicationStatus({refresh=true}={}){','publication client workflow functions')
replace_once(js,"$('#publicationBlockers').innerHTML=rows.length?rows.join(''):'<li class=\"publication-clean\">✓ 没有硬性阻断或提示项</li>';renderPublicationCompletion();","$('#publicationBlockers').innerHTML=rows.length?rows.join(''):'<li class=\"publication-clean\">✓ 没有硬性阻断或提示项</li>';renderPublicationCompletion();renderPublicationWizard();",'render publication wizard')
replace_once(js,"async function openPublicationCenter(){if(!requireIssue())return;$('#publicationCenterDialog').showModal();state.publicationBusy='';renderPublicationCenter();try{await Promise.all([loadPublicationStatus({refresh:true}),loadPublicationSnapshots()]);}","async function openPublicationCenter(){if(!requireIssue())return;$('#publicationCenterDialog').showModal();state.publicationBusy='';renderPublicationCenter();try{await Promise.all([loadPublicationStatus({refresh:true}),loadPublicationSnapshots(),loadPublicationWorkflow({refresh:true})]);}",'load publication workflow on open')
replace_once(js,"async function formalPublicationUi(){\n  if(!requireIssue()||state.publicationBusy)return;","async function formalPublicationUi(){\n  if(!requireIssue()||state.publicationBusy)return;\n  try{const wf=await loadPublicationWorkflow({refresh:true});if(!wf?.review?.ready){toast('正式发布已阻断：请先完成内部校审清零',4200);return;}if(!wf?.signoff?.ready){toast(wf?.signoff?.accepted?'正式发布已阻断：签收后期刊发生变化，请重新核对并签收':'正式发布已阻断：请先完成最新一轮内部签收',4800);return;}}catch(error){toast(`无法确认签收证据：${error.message}`,4200);return;}",'formal release signoff guard')
replace_once(js,"$('#publicationReleaseBtn').onclick=formalPublicationUi;","$('#publicationReleaseBtn').onclick=formalPublicationUi;\n$('#publicationWizardNextBtn')?.addEventListener('click',runPublicationWizardNext);\n$('#publicationWizardRollbackBtn')?.addEventListener('click',()=>$('#publicationRollbackSection')?.scrollIntoView({behavior:'smooth',block:'start'}));",'publication wizard actions')
replace_once(js,"publicationSnapshots:[], publicationWorkflow:null, studioEntry:'content' };","publicationSnapshots:[], publicationWorkflow:null, studioEntry:'content' };")

# Export for regression harness.
replace_once(js,"openEditorialPlan, loadEditorialPlan, saveEditorialPlan, analyzeEditorialPlan,","openEditorialPlan, loadEditorialPlan, saveEditorialPlan, analyzeEditorialPlan,",'export anchor')
replace_once(js,"mobileEditBlockInReader };","mobileEditBlockInReader, loadPublicationWorkflow, renderPublicationWizard, runPublicationWizardNext };",'export publication wizard')

# --- Server-side aggregate evidence and release guard ----------------------
server='scripts/studio-v3.mjs'
workflow_server=r'''
function publicationWorkflowFingerprint(issue){const s=JSON.stringify(issue||{});let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');}
async function publicationWorkflowStatus(id,{refreshAudit=false}={}){
  const issue=await readJson(path.join(root,'issues',id,'issue.json'));
  const [review,handoffs,status]=await Promise.all([readReviewWorkspace(id),readReviewHandoffs(id),publicationStatus(id,{refreshAudit})]);
  const unresolved=(review.items||[]).filter(item=>item.status!=='reviewed'),important=unresolved.filter(item=>item.severity==='important');
  const rows=[...(handoffs.handoffs||[])].sort((a,b)=>(Number(b.round)||0)-(Number(a.round)||0)),latest=rows[0]||null;
  const accepted=latest?.status==='accepted',fingerprint=publicationWorkflowFingerprint(issue),legacyAccepted=Boolean(accepted&&!latest?.baselineSnapshot?.id),fresh=Boolean(accepted&&(legacyAccepted||latest?.diffReviewedFingerprint===fingerprint));
  const reviewReady=unresolved.length===0,signoffReady=reviewReady&&fresh;
  const web=status.outputs?.web||{},buildReady=Boolean(web.url||web.href||web.path),gateReady=Boolean(status.canPublish);
  const releaseOutput=status.outputs?.release||{},releaseDone=Boolean(issue.status==='published'&&(releaseOutput.path||releaseOutput.generatedAt));
  const configured=Boolean(status.publicShare?.configured),verified=Boolean(status.publicDeployment?.verified||status.outputs?.public?.verified);
  let nextAction='done';
  if(!reviewReady)nextAction='review';else if(!signoffReady)nextAction='signoff';else if(!gateReady)nextAction='preflight';else if(!buildReady)nextAction='build';else if(!releaseDone)nextAction='release';else if(configured&&!verified)nextAction='deploy';
  return {version:1,issue:id,generatedAt:new Date().toISOString(),sourceFingerprint:fingerprint,nextAction,review:{ready:reviewReady,unresolved:unresolved.length,important:important.length,updatedAt:review.updatedAt||null},signoff:{ready:signoffReady,accepted:Boolean(accepted),fresh,legacy:legacyAccepted,round:latest?.round||null,recipient:latest?.recipient||'',role:latest?.role||'',acceptedAt:latest?.acceptedAt||null,status:latest?.status||'missing'},gate:{ready:gateReady,lastPreflight:status.lastPreflight||null,reason:status.reason||''},build:{ready:buildReady,web},release:{ready:reviewReady&&signoffReady&&gateReady&&buildReady,completed:releaseDone,output:releaseOutput},deployment:{configured,verified,url:status.publicShare?.url||status.publicDeployment?.url||''}};
}
async function assertPublicationWorkflowReleaseReady(id){
  const workflow=await publicationWorkflowStatus(id,{refreshAudit:false});
  if(!workflow.review.ready)throw Object.assign(new Error(`内部校审仍有 ${workflow.review.unresolved} 项未清零，正式发布已阻断`),{statusCode:409,code:'REVIEW_NOT_CLOSED'});
  if(!workflow.signoff.ready)throw Object.assign(new Error(workflow.signoff.accepted?'内部签收已过期：签收后期刊发生变化，请重新核对并签收':'缺少有效的最新内部签收，正式发布已阻断'),{statusCode:409,code:'REVIEW_SIGNOFF_REQUIRED'});
  if(!workflow.build.ready)await ensurePublicationWeb(id);
  return workflow;
}
'''
replace_once(server,'async function generateFormalRelease(id,report=()=>{}){',workflow_server+'\nasync function generateFormalRelease(id,report=()=>{}){await assertPublicationWorkflowReleaseReady(id);','server workflow guard')
replace_once(server,"    if (seg[3]==='publication'&&seg[4]==='status'&&req.method==='GET') { const refresh=u.searchParams.get('refresh')!=='0'; return send(res,200,await publicationStatus(id,{refreshAudit:refresh})); }","    if (seg[3]==='publication'&&seg[4]==='workflow'&&req.method==='GET') { const refresh=u.searchParams.get('refresh')==='1'; return send(res,200,await publicationWorkflowStatus(id,{refreshAudit:refresh})); }\n    if (seg[3]==='publication'&&seg[4]==='status'&&req.method==='GET') { const refresh=u.searchParams.get('refresh')!=='0'; return send(res,200,await publicationStatus(id,{refreshAudit:refresh})); }",'publication workflow endpoint')

# --- Styling ---------------------------------------------------------------
css='src/studio/studio.css'
append_once(css,'/* ===== P1-07 unified publishing wizard ===== */',r'''
/* ===== P1-07 unified publishing wizard ===== */
.publication-wizard{border:1px solid #ddcfbd;background:linear-gradient(180deg,#fffdf8,#faf6ef)}
.publication-wizard .publication-section-head small{display:block;margin-top:4px;color:var(--muted);font-size:10px;font-weight:400}
.publication-wizard-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:10px}
.publication-wizard-step{display:grid;grid-template-columns:30px minmax(0,1fr);gap:8px;align-items:center;min-width:0;padding:10px;border:1px solid #e7ddd1;border-radius:12px;background:#fff}
.publication-wizard-step>span{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#f0e8dc;color:#8a796b;font-weight:700}
.publication-wizard-step b,.publication-wizard-step small{display:block;overflow-wrap:anywhere}.publication-wizard-step b{font-size:11px}.publication-wizard-step small{margin-top:2px;color:var(--muted);font-size:9px;line-height:1.45}
.publication-wizard-step.pass{border-color:#cfe2d4;background:#f4faf5}.publication-wizard-step.pass>span{background:#4f7660;color:#fff}
.publication-wizard-step.current{border-color:#d9b579;background:#fff8ea;box-shadow:0 0 0 2px rgba(197,145,53,.08)}.publication-wizard-step.current>span{background:#9b6b18;color:#fff}
.publication-wizard-next{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:12px;padding:13px 14px;border-radius:14px;background:#2f2925;color:#f9eddc}.publication-wizard-next strong{display:block;margin-top:3px;font-size:15px}.publication-wizard-next p{margin:4px 0 0;color:rgba(255,244,228,.68);font-size:10px;line-height:1.55}.publication-wizard-actions{display:flex;gap:7px;flex:0 0 auto}.publication-wizard-actions button{border-color:rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff4df}.publication-wizard-actions .primary{background:#a43b34;border-color:#a43b34}
@media(max-width:900px){.publication-wizard-steps{grid-template-columns:1fr 1fr}.publication-wizard-step:last-child{grid-column:1/-1}.publication-wizard-next{align-items:flex-start;flex-direction:column}.publication-wizard-actions{width:100%}.publication-wizard-actions button{flex:1}}
@media(max-width:520px){.publication-wizard-steps{grid-template-columns:1fr}.publication-wizard-step:last-child{grid-column:auto}.publication-wizard-actions{display:grid;grid-template-columns:1fr;width:100%}}
''')

# --- package scripts -------------------------------------------------------
pkg=Path('package.json'); data=json.loads(pkg.read_text()); scripts=data.setdefault('scripts',{})
scripts['test:p1-07']='node scripts/p1-07-publish-wizard-smoke-v3.mjs'
pkg.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('P1-07 unified publish wizard patch applied')
