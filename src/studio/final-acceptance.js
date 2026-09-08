const $=s=>document.querySelector(s);
const template=$('#gateTemplate');
const grid=$('#gateGrid');
const deviceLabels={
  'edge-desktop':'Microsoft Edge actual binary',
  'mac-safari':'macOS Safari 实机',
  'iphone-safari':'iPhone Safari 实机',
  'android-wechat':'Android 微信内置浏览器实机'
};

function render(report){
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
async function refresh(){
  $('#overall').textContent='正在重新计算…';
  try{const response=await fetch('/api/final/acceptance',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);render(data.report||data);}
  catch(error){$('#overall').textContent='Gate 读取失败';grid.innerHTML=`<article class="card gate" data-status="FAILED"><span class="badge">FAILED</span><h2>无法读取 Final Acceptance</h2><p class="detail">${String(error.message||error)}</p></article>`;}
}
$('#refresh').addEventListener('click',refresh);
document.querySelectorAll('[data-device]').forEach(button=>button.addEventListener('click',async()=>{
  const type=button.dataset.device;const url=new URL('/rc1-acceptance.html',location.origin);url.searchParams.set('target',type);
  try{await navigator.clipboard.writeText(url.toString());$('#copyState').textContent=`已复制 ${deviceLabels[type]||type} 验收链接：${url}`;}
  catch{$('#copyState').textContent=`${deviceLabels[type]||type}：${url}`;}
}));
await refresh();setInterval(refresh,15000);
