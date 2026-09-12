import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const assert=(c,m)=>{if(!c)throw new Error(m)};
const [html,css,studio,server,pkg]=await Promise.all([
  readFile('src/studio/index.html','utf8'),readFile('src/studio/studio.css','utf8'),readFile('src/studio/studio.js','utf8'),readFile('scripts/studio-v3.mjs','utf8'),readFile('package.json','utf8').then(JSON.parse)
]);
assert(html.includes('id="publicationWizardSection"')&&html.includes('id="publicationWizardNextBtn"'),'publication wizard UI missing');
assert(html.includes('id="publicationRollbackSection"'),'rollback anchor missing');
assert(css.includes('P1-07 unified publishing wizard')&&css.includes('.publication-wizard-steps'),'publication wizard styles missing');
for(const token of ['loadPublicationWorkflow','renderPublicationWizard','runPublicationWizardNext','REVIEW_SIGNOFF_REQUIRED'])assert(studio.includes(token)||server.includes(token),`missing ${token}`);
assert(server.includes("seg[4]==='workflow'")&&server.includes('assertPublicationWorkflowReleaseReady'),'server workflow endpoint/guard missing');
assert(pkg.scripts?.['test:p1-07']==='node scripts/p1-07-publish-wizard-smoke-v3.mjs','package script missing');

const port=5400+Math.floor(Math.random()*300),child=spawn(process.execPath,['scripts/studio-v3.mjs','--host','127.0.0.1','--port',String(port)],{stdio:['ignore','pipe','pipe']});
let serverOutput='';child.stdout.on('data',d=>serverOutput+=String(d));child.stderr.on('data',d=>serverOutput+=String(d));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitJson(url,timeout=12000,{failOnHttp=false}={}){const t=Date.now();let last;while(Date.now()-t<timeout){try{const r=await fetch(url);if(r.ok)return await r.json();if(failOnHttp){const text=await r.text();throw new Error(`${r.status} ${r.statusText}: ${text.slice(0,1000)}`)}}catch(e){last=e;if(failOnHttp&&!/fetch failed|ECONNREFUSED/i.test(String(e?.message||e)))throw e}await sleep(80)}throw last||new Error(`timeout ${url}; server=${serverOutput.slice(-2000)}`)}
try{
  await waitJson(`http://127.0.0.1:${port}/api/health`);
  const wf=await waitJson(`http://127.0.0.1:${port}/api/issues/001/publication/workflow?refresh=0`,60000,{failOnHttp:true});
  assert(wf?.issue==='001'&&wf?.review&&wf?.signoff&&wf?.gate&&wf?.build&&wf?.release&&wf?.deployment,'workflow schema incomplete');
  assert(['review','signoff','preflight','build','release','deploy','done'].includes(wf.nextAction),`unexpected nextAction ${wf.nextAction}`);
  assert(typeof wf.review.ready==='boolean'&&typeof wf.signoff.ready==='boolean','workflow readiness flags missing');
  console.log('P1-07 publish wizard smoke PASS:',JSON.stringify({nextAction:wf.nextAction,review:wf.review,signoff:wf.signoff,build:wf.build.ready,release:wf.release.completed}));
}finally{child.kill('SIGTERM');await sleep(120)}
