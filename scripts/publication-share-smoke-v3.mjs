import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createTestWorkspace,writePublicationFixture,startTestStudio,stopTestStudio,removeTestWorkspace} from './lib-v3-test-workspace.mjs';

const dir=await createTestWorkspace('public-share'),publicRoot=path.join(dir,'public');
let studio,staticServer;
try{
  await writePublicationFixture(dir);await mkdir(publicRoot);
  staticServer=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(publicRoot,pathname.replace(/^\/+/,''),pathname.endsWith('/')?'index.html':'');if(!file.startsWith(publicRoot+path.sep))throw Error('outside public root');const data=await readFile(file);res.writeHead(200,{'Content-Type':file.endsWith('.json')?'application/json':'text/html'});res.end(data)}catch{res.writeHead(404);res.end('not found')}});
  await new Promise((resolve,reject)=>{staticServer.once('error',reject);staticServer.listen(0,'127.0.0.1',resolve)});
  const publicBase=`http://127.0.0.1:${staticServer.address().port}`;
  studio=await startTestStudio(dir,{V3_PUBLIC_MAGAZINE_ROOT:publicRoot,V3_PUBLIC_MAGAZINE_BASE_URL:publicBase});
  const post=async action=>{const response=await fetch(`${studio.base}/api/issues/003/publication/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});return {response,data:await response.json()}};
  const missing=await post('deploy');assert.equal(missing.response.status,409,'deployment without a release must be rejected');
  const release=await post('release');assert(release.response.ok&&release.data.ok,JSON.stringify(release.data));assert.equal(release.data.issue.status,'published');
  const deployed=await post('deploy');assert(deployed.response.ok&&deployed.data.deployment?.verification?.ok,JSON.stringify(deployed.data));
  const page=await(await fetch(deployed.data.deployment.url)).text(),catalog=await(await fetch(publicBase+'/catalog.json')).json();
  assert(page.includes('reader.js'));assert(catalog.some(x=>x.id==='003'&&x.href==='./03/'));
  assert((await fetch(publicBase+'/03/assets/image/reading.svg')).ok);
  const repeated=await post('deploy');assert(repeated.response.ok,'repeated deployment must be safe');
  assert.equal(repeated.data.status.publicDeployment.sourceMatchesCurrent,true,'fresh deployment matches saved source');
  const issueFile=path.join(dir,'issues','003','issue.json');
  const edited=JSON.parse(await readFile(issueFile,'utf8'));edited.subtitle+=' · 修改后';
  await writeFile(issueFile,JSON.stringify(edited));
  const changed=await (await fetch(`${studio.base}/api/issues/003/publication/status`)).json();
  assert.equal(changed.publicDeployment.verified,true,'historical verification is retained');
  assert.equal(changed.publicDeployment.sourceMatchesCurrent,false,'editing must not appear already online');
  const workflow=await (await fetch(`${studio.base}/api/issues/003/publication/workflow`)).json();
  assert.equal(workflow.deployment.verified,false,'workflow must not report an old version as current');
  assert.notEqual(workflow.nextAction,'done');
  const recatalog=await(await fetch(publicBase+'/catalog.json')).json();assert.equal(recatalog.filter(x=>x.id==='003').length,1);
  console.log('公开发布回归通过：空环境生成正式包、部署、在线校验、目录、图片、重复部署；无正式包时仍拒绝部署。');
}finally{await stopTestStudio(studio);if(staticServer)await new Promise(resolve=>staticServer.close(resolve));await removeTestWorkspace(dir)}
