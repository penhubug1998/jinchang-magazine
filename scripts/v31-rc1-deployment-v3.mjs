import { cp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, V3_VERSION } from './lib-v3-production.mjs';
import { writeDeploymentArtifacts, nginxCacheSnippet, CACHE_POLICY } from './lib-v3-deploy.mjs';
const assert=(c,m)=>{if(!c)throw new Error(m)};const sandbox=path.join(root,'.tmp-v31-rc1-deploy');
function run(script,args=[]){const r=spawnSync(process.execPath,[path.join(root,'scripts',script),...args],{cwd:sandbox,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});if(r.status!==0)throw new Error(`${script} failed\n${r.stdout}\n${r.stderr}`);return r}
await rm(sandbox,{recursive:true,force:true});
try{
 await mkdir(sandbox,{recursive:true});
 await writeFile(path.join(sandbox,'package.json'),JSON.stringify({version:V3_VERSION,type:'module'},null,2));
 await cp(path.join(root,'scripts'),path.join(sandbox,'scripts'),{recursive:true});
 await cp(path.join(root,'src'),path.join(sandbox,'src'),{recursive:true});
 await cp(path.join(root,'issues'),path.join(sandbox,'issues'),{recursive:true});
 await cp(path.join(root,'baselines'),path.join(sandbox,'baselines'),{recursive:true});
 await cp(path.join(root,'examples'),path.join(sandbox,'examples'),{recursive:true});
 run('build-v3.mjs');
 const built=path.join(sandbox,'dist-v3','001');await access(path.join(built,'index.html'));
 const web=path.join(sandbox,'web');await mkdir(path.join(web,'1'),{recursive:true});await writeFile(path.join(web,'1','marker.txt'),'previous-rc');await writeFile(path.join(web,'index.html'),'previous-index');
 const releaseRoot=path.join(sandbox,'release-v3');await mkdir(releaseRoot,{recursive:true});await cp(built,path.join(releaseRoot,'001'),{recursive:true});await cp(path.join(sandbox,'dist-v3','index.html'),path.join(releaseRoot,'index.html'));await cp(path.join(sandbox,'dist-v3','catalog.json'),path.join(releaseRoot,'catalog.json'));
 const releaseIssue=path.join(releaseRoot,'001');await writeFile(path.join(releaseIssue,'release.json'),JSON.stringify({version:V3_VERSION,issue:'001',label:'第一期',releasedAt:new Date().toISOString()},null,2)+'\n');const integrity=await writeDeploymentArtifacts(releaseIssue,{issue:'001'});await writeFile(path.join(releaseRoot,'deploy-manifest.json'),JSON.stringify({version:V3_VERSION,issue:'001',source:'release-v3/001/',suggestedTarget:'1/',integrity:'001/integrity.json',treeSha256:integrity.treeSha256,cachePolicy:CACHE_POLICY,cacheSnippet:'nginx-cache-snippet.conf'},null,2)+'\n');await writeFile(path.join(releaseRoot,'nginx-cache-snippet.conf'),nginxCacheSnippet());
 // Deploy script creates its own receipt/backup. We only use actual built RC1 output here.
 run('deploy-directory-v3.mjs',['--issue','001','--target',web,'--confirm']);
 assert((await readFile(path.join(web,'1','index.html'),'utf8')).includes('reader'),'RC1 deployment did not install Reader');
 run('rollback-deployment-v3.mjs',['--issue','001','--target',web,'--confirm']);
 assert((await readFile(path.join(web,'1','marker.txt'),'utf8'))==='previous-rc','RC1 rollback did not restore previous issue directory');
 assert((await readFile(path.join(web,'index.html'),'utf8'))==='previous-index','RC1 rollback did not restore archive index');
 await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,'reports','v31-rc1-deployment.json'),JSON.stringify({version:V3_VERSION,generatedAt:new Date().toISOString(),status:'passed',issue:'001',steps:['build actual issue','deploy to sandbox','verify replacement','rollback','verify previous tree restored']},null,2)+'\n');
 console.log('V3.1 RC1 部署演练通过：真实第一期构建产物 → 沙箱部署 → 版本替换 → receipt 回滚 → 旧站点恢复。');
}finally{await rm(sandbox,{recursive:true,force:true});}
