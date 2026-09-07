import { spawn } from 'node:child_process';

const attempts=3;
for(let attempt=1;attempt<=attempts;attempt++){
  const result=await new Promise(resolve=>{
    const child=spawn(process.execPath,['scripts/mobile-reader-accessibility-browser-v3.mjs'],{stdio:['ignore','pipe','pipe'],env:process.env});
    let stdout='',stderr='';child.stdout.on('data',data=>stdout+=String(data));child.stderr.on('data',data=>stderr+=String(data));
    child.on('error',error=>resolve({code:-1,stdout,stderr:`${stderr}\n${error.message}`.trim()}));
    child.on('close',code=>resolve({code:Number(code??-1),stdout,stderr}));
  });
  process.stdout.write(result.stdout);
  if(result.code===0){if(attempt>1)console.log(`P1-06 浏览器回归在第 ${attempt} 次启动成功。`);process.exit(0)}
  const startupFailure=/DevToolsActivePort|ECONNREFUSED|websocket unavailable|Chromium.*未生成/i.test(result.stderr);
  process.stderr.write(result.stderr);
  if(!startupFailure||attempt===attempts){console.error(`P1-06 浏览器回归失败（第 ${attempt}/${attempts} 次）。${startupFailure?'浏览器启动连续失败。':'检测到产品/断言失败，不做基础设施重试。'}`);process.exit(result.code||1)}
  console.warn(`P1-06 Chromium 启动失败（第 ${attempt}/${attempts} 次），仅重试浏览器基础设施。`);
  await new Promise(resolve=>setTimeout(resolve,400*attempt));
}
process.exit(1);
