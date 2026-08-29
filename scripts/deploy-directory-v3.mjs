import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { V3_VERSION, exists, normalizeIssueId, parseArgs, posix, root } from './lib-v3-production.mjs';
import { verifyIntegrity } from './lib-v3-deploy.mjs';

const args=parseArgs();
const id=normalizeIssueId(args.issue||args.id||args._[0]||'');
const releaseRoot=path.resolve(root,String(args.release||'release-v3'));
const targetRoot=args.target?path.resolve(String(args.target)):null;
const publicIssuePath=(value)=>{const number=Number(String(value||'').trim());return Number.isInteger(number)&&number>0?String(number).padStart(2,'0'):String(value||'').trim()};
const remotePath=String(args['remote-path']||publicIssuePath(id)||'').replace(/^\/+|\/+$/g,'');
const confirm=Boolean(args.confirm);
if(!id||!targetRoot){console.error('用法：npm run deploy:apply -- --issue 003 --target /var/www/.../new-jc-magazine [--remote-path 03] [--confirm]');process.exit(2)}
if(!/^[a-zA-Z0-9._-]+$/.test(remotePath)){console.error(`remote-path 不合法：${remotePath}`);process.exit(2)}
if(path.parse(targetRoot).root===targetRoot){console.error('拒绝把文件系统根目录作为部署目标。');process.exit(2)}
const source=path.join(releaseRoot,id);const errors=[];
if(!(await exists(source)))errors.push(`发布源不存在：${posix(path.relative(root,source))}`);
if(!errors.length){const v=await verifyIntegrity(source);if(!v.ok)errors.push(...v.errors);const meta=path.join(source,'release.json');if(!(await exists(meta)))errors.push('发布源缺少 release.json');else{const j=JSON.parse(await readFile(meta,'utf8'));if(j.version!==V3_VERSION)errors.push(`release.json 版本 ${j.version} != ${V3_VERSION}`);if(j.issue!==id)errors.push(`release.json issue=${j.issue} != ${id}`)}}
for(const f of ['index.html','catalog.json','deploy-manifest.json','nginx-cache-snippet.conf'])if(!(await exists(path.join(releaseRoot,f))))errors.push(`发布根缺少 ${f}`);
if(errors.length){console.error(`部署前检查失败（${errors.length}）：`);for(const e of errors)console.error(`- ${e}`);process.exit(1)}
const target=path.join(targetRoot,remotePath);const plan={version:V3_VERSION,issue:id,source:posix(source),target:posix(target),rootFiles:['index.html','catalog.json','deploy-manifest.json','nginx-cache-snippet.conf']};
if(!confirm){console.log('RC1 安全部署预演（dry-run）：');console.log(JSON.stringify(plan,null,2));console.log('未写入目标目录。确认后追加 --confirm。');process.exit(0)}

await mkdir(targetRoot,{recursive:true});
const token=`${new Date().toISOString().replace(/[:.]/g,'-')}-${process.pid}`;
const control=path.join(targetRoot,'.v3-deployments');const backupDir=path.join(control,'backups',id,token);const receiptDir=path.join(control,'receipts');
await mkdir(path.join(backupDir,'root'),{recursive:true});await mkdir(receiptDir,{recursive:true});
const staging=path.join(targetRoot,`.${remotePath}.staging-${token}`);const previous=path.join(targetRoot,`.${remotePath}.previous-${token}`);
await rm(staging,{recursive:true,force:true});await rm(previous,{recursive:true,force:true});await cp(source,staging,{recursive:true});
const staged=await verifyIntegrity(staging);if(!staged.ok){await rm(staging,{recursive:true,force:true});console.error(`staging 完整性失败：${staged.errors.join('；')}`);process.exit(1)}
const previousExisted=await exists(target);const rootState=[];
for(const name of plan.rootFiles){const dst=path.join(targetRoot,name);const existed=await exists(dst);rootState.push({name,existed});if(existed)await cp(dst,path.join(backupDir,'root',name),{recursive:false})}
let targetSwapped=false;
try{
  if(previousExisted)await rename(target,previous);
  await rename(staging,target);targetSwapped=true;
  if(previousExisted)await rename(previous,path.join(backupDir,'issue'));
  for(const name of plan.rootFiles){
    const src=path.join(releaseRoot,name),dst=path.join(targetRoot,name),tmp=path.join(targetRoot,`.${name}.tmp-${token}`),old=path.join(targetRoot,`.${name}.previous-${token}`);
    await cp(src,tmp);
    const had=await exists(dst);
    try{if(had)await rename(dst,old);await rename(tmp,dst);if(had)await rm(old,{force:true})}
    catch(error){await rm(tmp,{force:true}).catch(()=>{});if(had&&await exists(old)&&!(await exists(dst)))await rename(old,dst).catch(()=>{});throw error}
  }
}catch(error){
  await rm(staging,{recursive:true,force:true}).catch(()=>{});
  if(targetSwapped)await rm(target,{recursive:true,force:true}).catch(()=>{});
  if(await exists(previous))await rename(previous,target).catch(()=>{});
  for(const state of rootState){const dst=path.join(targetRoot,state.name),bak=path.join(backupDir,'root',state.name);if(state.existed&&await exists(bak))await cp(bak,dst).catch(()=>{});else if(!state.existed)await rm(dst,{force:true}).catch(()=>{})}
  throw error;
}
const receipt={version:V3_VERSION,issue:id,deployedAt:new Date().toISOString(),targetRoot:posix(targetRoot),remotePath,releaseRoot:posix(releaseRoot),backupDir:posix(backupDir),previousExisted,rootState,treeSha256:staged.manifest?.treeSha256||null};
const receiptFile=path.join(receiptDir,`${id}-${token}.json`);await writeFile(receiptFile,JSON.stringify(receipt,null,2)+'\n','utf8');await writeFile(path.join(receiptDir,`${id}-latest.json`),JSON.stringify(receipt,null,2)+'\n','utf8');
await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,`reports/v3-rc1-deployment-${id}.json`),JSON.stringify({...receipt,receiptFile:posix(receiptFile)},null,2)+'\n','utf8');
console.log(`RC1 目录部署完成：${target}`);console.log(`- 备份：${backupDir}`);console.log(`- receipt：${receiptFile}`);console.log(`- treeSha256：${receipt.treeSha256}`);
