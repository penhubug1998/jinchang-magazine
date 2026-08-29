import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V3_VERSION, V3_STABLE_VERSION, parseArgs, posix, root } from './lib-v3-production.mjs';

const args=parseArgs();
const id=String(args.issue||args.id||'003').padStart(3,'0');
if(V3_STABLE_VERSION!=='3.0.0'){
  console.error(`final:doctor 仅用于 V3.0.0，当前稳定版 ${V3_STABLE_VERSION}`);
  process.exit(2);
}
function run(script,argv=[]){
  const r=spawnSync(process.execPath,[path.join(root,'scripts',script),...argv],{cwd:root,encoding:'utf8'});
  return {status:r.status??1,stdout:r.stdout||'',stderr:r.stderr||''};
}
function readJson(rel){return readFile(path.join(root,rel),'utf8').then(JSON.parse).catch(()=>null)}

// Always refresh the non-destructive readiness view and third-issue preflight.
const readinessRun=run('final-readiness-v3.mjs',['--issue',id]);
const thirdRun=run('rc2-third-preflight-v3.mjs',['--issue',id]);
const deviceRun=run('rc2-device-status-v3.mjs');
const readiness=await readJson('reports/v3-final-readiness.json');
const third=await readJson(`reports/v3-rc2-third-preflight-${id}.json`);
const hydration=await readJson('reports/v3-rc2-media-hydration.json');

const gates=readiness?.gates||[];
const pending=gates.filter(x=>x.status!=='READY');
const priority=['historical-media','mac-safari','iphone-safari','third-real','deployment-rehearsal','online'];
const next=priority.map(x=>pending.find(g=>g.id===x)).find(Boolean)||null;
const report={
  version:V3_VERSION,
  issue:id,
  generatedAt:new Date().toISOString(),
  readiness:{status:readiness?.status||'UNKNOWN',ready:readiness?.ready||0,total:readiness?.total||6,preDeployStatus:readiness?.preDeployStatus||'UNKNOWN',preDeployReady:readiness?.preDeployReady||0,preDeployTotal:readiness?.preDeployTotal||5},
  recommendedNext:next?{gate:next.id,label:next.label,detail:next.detail,command:next.action}:null,
  gates,
  thirdPreflight:third,
  mediaHydration:hydration?.summary||null,
  diagnostics:{readinessStatus:readinessRun.status,thirdPreflightStatus:thirdRun.status,deviceStatus:deviceRun.status,deviceOutput:deviceRun.stdout.trim()}
};
await mkdir(path.join(root,'reports'),{recursive:true});
await writeFile(path.join(root,'reports/v3-final-doctor.json'),JSON.stringify(report,null,2)+'\n','utf8');
const lines=[
  '# V3.0.0 发布门禁诊断',
  '',
  `**总状态 ${report.readiness.status}** · ${report.readiness.ready}/${report.readiness.total} READY`,
  `**部署前 ${report.readiness.preDeployStatus}** · ${report.readiness.preDeployReady}/${report.readiness.preDeployTotal} READY`,
  '',
  ...(gates.map(g=>`${g.status==='READY'?'✅':'⏳'} **${g.label}**：${g.detail}`)),
  '',
  next?`## 推荐下一步\n\n**${next.label}**\n\n${next.detail}\n\n\`${next.action}\``:'## 推荐下一步\n\n全部门禁已经 READY，可进入 final:seal。',
  '',
  '## 规则',
  '',
  '- 只读取真实证据；不会自动把 Safari、第三期或线上 HTTPS 标记为通过。',
  '- 某项 PASS 后如果对应源稿、媒体或 release tree 改变，final:status 会使旧证据失效。',
  ''
];
await writeFile(path.join(root,'reports/v3-final-doctor.md'),lines.join('\n'),'utf8');
console.log(lines.join('\n'));
console.log(`报告：${posix('reports/v3-final-doctor.json')}`);
