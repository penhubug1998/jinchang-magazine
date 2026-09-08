from pathlib import Path
p=Path('scripts/studio-v3.mjs')
s=p.read_text(encoding='utf-8')
old="""    chrome=spawn(chromium,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-allow-origins=*',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${userDataDir}`,'--no-first-run','about:blank'],{stdio:'ignore',detached:true});
    let tabs=null;for(let i=0;i<100;i++){try{const response=await fetch(`http://127.0.0.1:${debugPort}/json/list`);if(response.ok){tabs=await response.json();if(tabs?.length)break}}catch{}await new Promise(resolve=>setTimeout(resolve,80));}
    if(!tabs?.length)throw publicationFailure('PDF_CHROMIUM_START_FAILED','Chromium 未能启动 PDF 调试端口。',['请确认服务器 Chromium 可执行并允许无头模式运行。']);
"""
new="""    let spawnError=null;
    chrome=spawn(chromium,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-allow-origins=*',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${userDataDir}`,'--no-first-run','about:blank'],{stdio:'ignore',detached:true});
    chrome.once('error',error=>{spawnError=error});
    let tabs=null;for(let i=0;i<100;i++){if(spawnError)break;try{const response=await fetch(`http://127.0.0.1:${debugPort}/json/list`);if(response.ok){tabs=await response.json();if(tabs?.length)break}}catch{}await new Promise(resolve=>setTimeout(resolve,80));}
    if(spawnError)throw publicationFailure('PDF_CHROMIUM_START_FAILED',`Chromium 启动失败：${spawnError.message||spawnError}`,['请确认 CHROMIUM 指向可执行文件，并检查执行权限。','Web Reader、正式发布和 ZIP 归档不受影响。']);
    if(!tabs?.length)throw publicationFailure('PDF_CHROMIUM_START_FAILED','Chromium 未能启动 PDF 调试端口。',['请确认服务器 Chromium 可执行并允许无头模式运行。']);
"""
if old not in s:
    raise SystemExit('target block not found')
p.write_text(s.replace(old,new,1),encoding='utf-8')
print('P1-09 PDF spawn hardening applied')
