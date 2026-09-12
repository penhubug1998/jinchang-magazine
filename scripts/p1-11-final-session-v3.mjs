import { startFinalSession, buildSessionStatus, sealFinalSession, readFinalSession } from './lib-p1-11-final-session-v3.mjs';

const args=process.argv.slice(2);const command=args.find(x=>!x.startsWith('--'))||'status';
const value=name=>{const direct=args.find(x=>x.startsWith(`--${name}=`));if(direct)return direct.split('=').slice(1).join('=');const i=args.indexOf(`--${name}`);return i>=0?args[i+1]:null};
const reset=args.includes('--reset');

if(command==='start'){
  const session=await startFinalSession({issue:value('issue')||'003',reset});
  console.log(`P1-11 Final Acceptance Session ACTIVE\n${session.sessionId}\nsource=${session.source.commit}\nissue=${session.issue}`);
  process.exit(0);
}
if(command==='seal'){
  const session=await sealFinalSession();
  console.log(`P1-11 Final Acceptance Session SEALED\n${session.sessionId}\nbundle=${session.bundleSha256}`);
  process.exit(0);
}
if(command==='show'){
  console.log(JSON.stringify(await readFinalSession(),null,2));
  process.exit(0);
}
if(command!=='status'){console.error(`Unknown command: ${command}. Use start | status | show | seal`);process.exit(2)}
const status=await buildSessionStatus();
console.log(`# P1-11 Final Acceptance Session\n\nSession: ${status.state.status}\nSource: ${status.source?.commit||'unavailable'}\nAcceptance: ${status.acceptance.ready}/${status.acceptance.total} READY\nCan seal: ${status.canSeal?'YES':'NO'}\nNext: ${status.next}`);
if(args.includes('--strict')&&!status.canSeal)process.exit(1);
