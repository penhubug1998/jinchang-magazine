import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V3_VERSION, V3_STABLE_VERSION, parseArgs, root } from './lib-v3-production.mjs';

const args=parseArgs();
const gate=String(args.gate||args._?.[0]||'status').toLowerCase();
const issue=String(args.issue||args.id||'003').padStart(3,'0');
if(V3_STABLE_VERSION!=='3.0.0'){
  console.error(`final:gate 仅用于 V3.0.0，当前稳定版 ${V3_STABLE_VERSION}`);
  process.exit(2);
}
function run(script,argv=[],{allowFailure=false}={}){
  const r=spawnSync(process.execPath,[path.join(root,'scripts',script),...argv],{cwd:root,encoding:'utf8',stdio:'pipe'});
  if(r.stdout)process.stdout.write(r.stdout);
  if(r.stderr)process.stderr.write(r.stderr);
  if(!allowFailure&&(r.status??1)!==0)process.exit(r.status??1);
  return r.status??1;
}
function bool(name){return Boolean(args[name]);}

switch(gate){
  case 'status':
    run('final-readiness-v3.mjs',['--issue',issue]);
    break;
  case 'doctor':
    run('final-doctor-v3.mjs',['--issue',issue]);
    break;
  case 'media': {
    const hydrate=[];if(args['media-issue'])hydrate.push('--issue',String(args['media-issue']));
    if(bool('confirm'))hydrate.push('--confirm');
    if(bool('repair'))hydrate.push('--repair');
    run('rc2-media-hydrate-v3.mjs',hydrate);
    if(bool('confirm'))run('full-media-check-v3.mjs',['--strict']);
    run('final-readiness-v3.mjs',['--issue',issue]);
    break;
  }
  case 'devices':
    run('rc2-device-status-v3.mjs');
    console.log('\n真实设备验收请启动：npm run rc:safari');
    break;
  case 'third':
    if(bool('confirm-real-material'))run('rc1-third-issue-trial-v3.mjs',['--issue',issue,'--confirm-real-material']);
    else run('rc2-third-preflight-v3.mjs',['--issue',issue]);
    run('final-readiness-v3.mjs',['--issue',issue]);
    break;
  case 'deployment':
    run('rc1-deployment-rehearsal-v3.mjs');
    run('final-readiness-v3.mjs',['--issue',issue]);
    break;
  case 'online': {
    const base=String(args.base||'').trim();
    if(!base){console.error('online gate 需要 --base https://...');process.exit(2)}
    const argv=['--base',base,'--issue',issue,'--strict'];
    if(args['remote-path'])argv.push('--remote-path',String(args['remote-path']));
    run('online-verification-v3.mjs',argv);
    run('final-readiness-v3.mjs',['--issue',issue]);
    break;
  }
  case 'all-auto':
    // Safe automation only: no Safari fabrication, no real-material confirmation, no server deployment.
    run('rc2-media-hydrate-v3.mjs',[]);
    run('rc2-third-preflight-v3.mjs',['--issue',issue],{allowFailure:true});
    run('rc1-deployment-rehearsal-v3.mjs');
    run('final-doctor-v3.mjs',['--issue',issue]);
    break;
  default:
    console.error(`未知 gate：${gate}\n支持：status / doctor / media / devices / third / deployment / online / all-auto`);
    process.exit(2);
}
