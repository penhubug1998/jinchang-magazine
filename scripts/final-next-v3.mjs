import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V3_VERSION, V3_STABLE_VERSION, parseArgs, root } from './lib-v3-production.mjs';
const args=parseArgs();
if(V3_STABLE_VERSION!=='3.0.0'){console.error(`final:next 仅用于 V3.0.0，当前稳定版 ${V3_STABLE_VERSION}`);process.exit(2)}
const issue=String(args.issue||'003').padStart(3,'0');
function run(script, argv=[]){const r=spawnSync(process.execPath,[path.join(root,'scripts',script),...argv],{cwd:root,encoding:'utf8'}); if(r.stdout)process.stdout.write(r.stdout); if(r.stderr)process.stderr.write(r.stderr); return r.status??1}
run('final-readiness-v3.mjs',['--issue',issue]);
const report=JSON.parse(await readFile(path.join(root,'reports/v3-final-readiness.json'),'utf8'));
const pending=(report.gates||[]).filter(x=>x.status!=='READY');
if(!pending.length){console.log('\n✅ 六项真实门禁均 READY。下一步：npm run final:seal -- --issue '+issue+' --confirm');process.exit(0)}
const order=['historical-media','mac-safari','iphone-safari','third-real','deployment-rehearsal','online'];
const next=order.map(id=>pending.find(x=>x.id===id)).find(Boolean);
console.log(`\nNEXT · ${next.label}\n${next.detail}\n命令：${next.action}`);
const executable=new Set(['historical-media','deployment-rehearsal']);
if(args.execute){
  if(!executable.has(next.id)){
    console.error(`\n⛔ ${next.label} 需要真实设备/材料/线上环境，final:next 不会自动替你通过。`);process.exit(3)
  }
  console.log(`\n执行安全自动项：${next.label}`);
  if(next.id==='historical-media'){
    const a=['--confirm']; if(args.repair)a.push('--repair'); if(args.jobs)a.push('--jobs',String(args.jobs));
    const s=run('rc2-media-hydrate-v3.mjs',a); if(s)process.exit(s); const c=run('full-media-check-v3.mjs',['--strict']); if(c)process.exit(c);
  } else {
    const s=run('rc1-deployment-rehearsal-v3.mjs'); if(s)process.exit(s);
  }
  run('final-readiness-v3.mjs',['--issue',issue]);
}
