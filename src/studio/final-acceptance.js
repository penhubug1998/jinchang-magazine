const $=s=>document.querySelector(s);
const template=$('#gateTemplate');
const grid=$('#gateGrid');
const deviceLabels={
  'edge-desktop':'Microsoft Edge actual binary',
  'mac-safari':'macOS Safari 实机',
  'iphone-safari':'iPhone Safari 实机',
  'android-wechat':'Android 微信内置浏览器实机'
};
let lastReport=null;

function render(report){
  lastReport=report;
  $('#score').textContent=`${report.ready}/${report.total}`;
  $('#overall').textContent=report.promotion?.allowed?'READY · PROMOTION ALLOWED':'HOLD · PROMOTION BLOCKED';
  $('#commit').textContent=`${report.source?.commit||'unavailable'} · ${report.source?.committedAt||'unavailable'}`;
  grid.replaceChildren(...report.gates.map((gate,index)=>{
    const node=template.content.firstElementChild.cloneNode(true);node.dataset.status=gate.status;
    node.querySelector('.gate-index').textContent=String(index+1).padStart(2,'0');node.querySelector('.badge').textContent=gate.status;
    node.querySelector('h2').textContent=gate.label;node.querySelector('.detail').textContent=gate.detail||'';
    const action=node.querySelector('.action');action.textContent=gate.status==='READY'?'证据已绑定当前源码':gate.action||'需要重新取得当前源码证据';
    return node;
  }));
}

function renderGateError(error){
  $('#overall').textContent='Gate 读取失败';
  const node=template.content.firstElementChild.cloneNode(true);node.dataset.status='FAILED';
  node.querySelector('.gate-index').textContent='!!';node.querySelector('.badge').textContent='FAILED';node.querySelector('h2').textContent='无法读取 Final Acceptance';node.querySelector('.detail').textContent=String(error?.message||error);node.querySelector('.action').textContent='检查验收服务器与当前源码状态';grid.replaceChildren(node);
}

async function refreshSession(){
  const summary=$('#sessionSummary'),id=$('#sessionId'),warning=$('#sessionWarning');
  try{
    const response=await fetch('/reports/p1-11-final-acceptance-session.json',{cache:'no-store'});
    if(response.status===404){summary.textContent='NOT STARTED · 先运行 final:v31:session:start 锁定当前源码';id.textContent='—';warning.textContent='尚未建立 P1-11 验收会话；此时可以查看 Gate，但不要开始收集最终设备证据。';return;}
    if(!response.ok)throw new Error(`Session HTTP ${response.status}`);
    const session=await response.json();const current=lastReport?.source?.commit||'';const same=Boolean(current&&session.source?.commit===current);
    id.textContent=session.sessionId||'unknown session';
    if(session.status==='SEALED'&&same){summary.textContent=`SEALED · ${session.finalReady||8}/${session.finalTotal||8} READY`;warning.textContent=`证据包 ${session.bundleSha256||'unknown'} · 已封存，不应再修改源码。`;return;}
    if(!same){summary.textContent='STALE · Session 源码与当前 HEAD 不一致';warning.textContent=`Session=${session.source?.commit||'unknown'}；Current=${current||'unknown'}。请停止验收并重新开始当前源码 Session。`;return;}
    summary.textContent=`${session.status||'ACTIVE'} · issue ${session.issue||'—'} · ${session.startedAt||''}`;
    warning.textContent='当前 Session 与 HEAD 一致。继续收集证据期间不要提交任何源码改动。';
  }catch(error){summary.textContent='Session 读取失败';id.textContent='—';warning.textContent=String(error?.message||error);}
}

async function refresh(){
  $('#overall').textContent='正在重新计算…';
  try{const response=await fetch('/api/final/acceptance',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);render(data.report||data);}
  catch(error){renderGateError(error);}
  await refreshSession();
}
$('#refresh').addEventListener('click',refresh);
document.querySelectorAll('[data-device]').forEach(button=>button.addEventListener('click',async()=>{
  const type=button.dataset.device;const url=new URL('/rc1-acceptance.html',location.origin);url.searchParams.set('target',type);
  try{await navigator.clipboard.writeText(url.toString());$('#copyState').textContent=`已复制 ${deviceLabels[type]||type} 验收链接：${url}`;}
  catch{$('#copyState').textContent=`${deviceLabels[type]||type}：${url}`;}
}));
await refresh();setInterval(refresh,15000);
