const $=s=>document.querySelector(s);
const auto=$('#autoChecks'),manual=$('#manualChecks'),reader=$('#reader'),shell=$('#frameShell');
let fullscreenFallbackVerified=false;
const manualItems=[
 ['readerVisible','Reader 页面完整可见，没有横向异常溢出','all'],
 ['navigation','翻页正常：桌面使用按钮/键盘，手机使用横向滑动','all'],
 ['toc','目录可打开，并能跳转到对应页面','all'],
 ['font','字号调整正常，弹窗不会超出屏幕','all'],
 ['narration','逐页朗读可播放、暂停，切页后状态正常','all'],
 ['music','背景音乐可播放/关闭，朗读时音乐处理正常','all'],
 ['video','视频可播放、拖动进度；移动 Safari 可进入系统视频全屏','all'],
 ['fullscreen','全屏按钮可用；不支持页面 Fullscreen 时能进入沉浸模式','all'],
 ['orientation','iPhone/iPad 横竖屏切换后页面与工具栏没有错位','mobile'],
 ['resume','刷新/重新打开后阅读与界面状态没有异常','all']
];
function requiredManualItems(){const t=$('#deviceType')?.value||detectType();const mobile=['iphone-safari','ipad-safari'].includes(t);return manualItems.filter(x=>x[2]==='all'||mobile)}
function renderManual(){manual.innerHTML=requiredManualItems().map(([id,text])=>`<label><input type="checkbox" data-check="${id}"><span>${text}</span></label>`).join('')}
function isSafariUa(ua=navigator.userAgent){return /Safari/i.test(ua)&&!/(Chrome|Chromium|CriOS|Edg|EdgiOS|FxiOS|OPiOS)/i.test(ua)}
function detectType(){const ua=navigator.userAgent;if(/Edg\//i.test(ua)&&!/EdgiOS/i.test(ua))return'edge-desktop';if(isSafariUa(ua)&&/iPhone/i.test(ua))return'iphone-safari';if(isSafariUa(ua)&&(/iPad/i.test(ua)||(/Macintosh/i.test(ua)&&/Mobile\//i.test(ua))))return'ipad-safari';if(isSafariUa(ua)&&/Macintosh/i.test(ua)&&!/Mobile\//i.test(ua))return'mac-safari';return'other'}
$('#deviceType').value=detectType();renderManual();$('#deviceType').addEventListener('change',renderManual);
function row(label,value,state='pass',key=''){return`<div class="check"${key?` data-check-row="${key}"`:''}><span>${label}</span><span class="badge ${state}">${value}</span></div>`}
function applyReaderSize(button){const w=Number(button.dataset.width),h=Number(button.dataset.height);reader.style.width=`${w}px`;reader.style.height=`${h}px`;const max=Math.max(0.18,Math.min(1,(shell.clientWidth-20)/w,(shell.clientHeight-20)/h));reader.style.transform=`scale(${max})`;shell.style.setProperty('--scale',max)}
function setReaderImmersive(on){document.body.classList.toggle('reader-immersive',Boolean(on));if(!on)document.querySelector('[data-width="390"]')?.click()}
function updateFullscreenFallbackStatus(){const badge=document.querySelector('[data-check-row="fullscreen"] .badge');if(!badge)return;if(fullscreenFallbackVerified){badge.textContent='沉浸 fallback 已验证';badge.className='badge pass'}else{const fs=Boolean(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen);badge.textContent=fs?'标准/WebKit 可用':'页面全屏不可用，将验证沉浸 fallback';badge.className=`badge ${fs?'pass':'warn'}`}}
window.addEventListener('message',(event)=>{const data=event.data;if(event.source!==reader.contentWindow||data?.source!=='v3-reader'||data.type!=='mobile-immersive')return;if(data.active)fullscreenFallbackVerified=true;setReaderImmersive(Boolean(data.active));updateFullscreenFallbackStatus()});
async function probes(){
 const rows=[];let corePass=true;const css=(q)=>CSS?.supports?.(q)??false;
 const safari=isSafariUa(),edge=/Edg\//i.test(navigator.userAgent)&&/Windows NT/i.test(navigator.userAgent);rows.push(row('浏览器',edge?'Microsoft Edge / Windows':safari?'Safari/WebKit 可识别':'非目标浏览器',edge||safari?'pass':'warn'));
 rows.push(row('visualViewport',window.visualViewport?'支持':'使用 V3.0 fallback',window.visualViewport?'pass':'warn'));
 const fs=Boolean(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen);rows.push(row('Fullscreen API',fullscreenFallbackVerified?'沉浸 fallback 已验证':fs?'标准/WebKit 可用':'页面全屏不可用，将验证沉浸 fallback',fullscreenFallbackVerified||fs?'pass':'warn','fullscreen'));
 rows.push(row('backdrop-filter',css('backdrop-filter:blur(4px)')||css('-webkit-backdrop-filter:blur(4px)')?'支持':'fallback 背景',css('backdrop-filter:blur(4px)')||css('-webkit-backdrop-filter:blur(4px)')?'pass':'warn'));
 rows.push(row('动态视口单位',css('height:100dvh')?'支持 dvh':'使用 vh fallback',css('height:100dvh')?'pass':'warn'));
 try{localStorage.setItem('v3rc2','1');localStorage.removeItem('v3rc2');rows.push(row('localStorage','读写正常'));}catch{rows.push(row('localStorage','不可用','fail'));corePass=false}
 try{const h=await fetch('/api/health',{cache:'no-store'});const j=await h.json();rows.push(row('V3.1 服务',h.ok?j.version:'失败',h.ok?'pass':'fail'));if(h.ok)document.querySelector('#runtimeVersion').textContent=j.version;if(!h.ok)corePass=false}catch{rows.push(row('V3.0 服务','连接失败','fail'));corePass=false}
 let probe=null;try{probe=await (await fetch(`/api/rc/probe?issue=${encodeURIComponent($('#issueId').value)}`,{cache:'no-store'})).json();rows.push(row('V3 Reader 数据',probe.pages?`${probe.pages} 页`:'失败',probe.pages?'pass':'fail'));if(!probe.pages)corePass=false;if(probe.video){if(probe.videoAvailable){const r=await fetch(`/issue-assets/${probe.issue}/${probe.video.replace(/^assets\//,'')}`,{headers:{Range:'bytes=0-99'},cache:'no-store'});rows.push(row('MP4 Range 206',r.status===206?'206 Partial Content':`HTTP ${r.status}`,r.status===206?'pass':'fail'));if(r.status!==206)corePass=false}else rows.push(row('历史媒体',`缺少 ${probe.video}（请在完整仓库验收）`,'warn'));}}
 catch(e){rows.push(row('期刊/媒体探测',e.message,'fail'));corePass=false}
 auto.innerHTML=rows.join('');$('#probeSummary').textContent=probe?`第 ${probe.issue} 期 · ${probe.pages} 页 · 媒体目录${probe.mediaAvailable?'可用':'未挂载'}`:'探测失败';
 return {corePass,probe};
}
let lastProbe=null;
async function reload(){const id=$('#issueId').value.trim()||'002';reader.src=`/live-preview/${encodeURIComponent(id)}/?page=1&rc1Acceptance=1&t=${Date.now()}`;lastProbe=await probes();}
$('#reload').addEventListener('click',reload);
document.querySelectorAll('[data-width]').forEach(btn=>btn.addEventListener('click',()=>applyReaderSize(btn)));
window.addEventListener('resize',()=>document.querySelector('[data-width="390"]')?.click());
$('#submit').addEventListener('click',async()=>{const checks=Object.fromEntries(requiredManualItems().map(([id])=>[id,Boolean(document.querySelector(`[data-check="${id}"]`)?.checked)]));const required=Object.values(checks).every(Boolean);const data={deviceType:$('#deviceType').value,deviceName:$('#deviceName').value.trim()||navigator.platform||'device',userAgent:navigator.userAgent,issue:$('#issueId').value,checks,auto:lastProbe||{},notes:$('#notes').value,passed:Boolean(required&&lastProbe?.corePass)};const r=await fetch('/api/rc/acceptance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const j=await r.json();if(!r.ok){$('#saveState').textContent='未记录 · 浏览器身份不匹配';$('#saveState').classList.remove('pass');$('#report').style.display='block';$('#report').textContent=JSON.stringify(j,null,2);return}$('#saveState').textContent=data.passed?'已通过并记录':'已记录 · 尚有未通过项';$('#saveState').classList.toggle('pass',data.passed);$('#report').style.display='block';$('#report').textContent=JSON.stringify(j,null,2);});
$('#loadReport').addEventListener('click',async()=>{const j=await (await fetch('/api/rc/acceptance',{cache:'no-store'})).json();$('#report').style.display='block';$('#report').textContent=JSON.stringify(j,null,2)});
await reload();document.querySelector('[data-width="390"]')?.click();
