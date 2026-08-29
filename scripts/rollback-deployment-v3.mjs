import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { V3_VERSION, exists, normalizeIssueId, parseArgs, posix, root } from './lib-v3-production.mjs';
const args=parseArgs();const id=normalizeIssueId(args.issue||args.id||args._[0]||'');const targetRoot=args.target?path.resolve(String(args.target)):null;const confirm=Boolean(args.confirm);
if(!id||!targetRoot){console.error('用法：npm run deploy:rollback -- --issue 003 --target /var/www/.../jinchang-magazine [--receipt file] --confirm');process.exit(2)}
const receiptFile=args.receipt?path.resolve(String(args.receipt)):path.join(targetRoot,'.v3-deployments','receipts',`${id}-latest.json`);
if(!(await exists(receiptFile))){console.error(`找不到部署 receipt：${receiptFile}`);process.exit(1)}
const receipt=JSON.parse(await readFile(receiptFile,'utf8'));if(receipt.issue!==id){console.error(`receipt issue=${receipt.issue} 与 ${id} 不一致`);process.exit(1)}if(receipt.version!==V3_VERSION)console.warn(`WARN receipt 版本 ${receipt.version}，当前 ${V3_VERSION}；仍允许 RC1 回滚。`);
if(path.resolve(receipt.targetRoot)!==targetRoot){console.error(`receipt targetRoot=${receipt.targetRoot} 与参数 ${targetRoot} 不一致`);process.exit(1)}
const target=path.join(targetRoot,receipt.remotePath);const backupDir=path.resolve(receipt.backupDir);const backupIssue=path.join(backupDir,'issue');
if(!confirm){console.log('RC1 回滚预演（dry-run）：');console.log(JSON.stringify({issue:id,target:posix(target),backup:posix(backupDir),restorePrevious:receipt.previousExisted},null,2));console.log('未修改目标。确认后追加 --confirm。');process.exit(0)}
const token=`rollback-${Date.now()}-${process.pid}`;const current=path.join(targetRoot,`.${receipt.remotePath}.current-${token}`);const staging=path.join(targetRoot,`.${receipt.remotePath}.rollback-${token}`);
await rm(current,{recursive:true,force:true});await rm(staging,{recursive:true,force:true});
try{
  if(await exists(target))await rename(target,current);
  if(receipt.previousExisted){if(!(await exists(backupIssue)))throw new Error(`历史期刊备份不存在：${backupIssue}`);await cp(backupIssue,staging,{recursive:true});await rename(staging,target)}
  for(const state of receipt.rootState||[]){const dst=path.join(targetRoot,state.name),bak=path.join(backupDir,'root',state.name);if(state.existed){if(!(await exists(bak)))throw new Error(`根文件备份不存在：${bak}`);await cp(bak,dst)}else await rm(dst,{force:true})}
  await rm(current,{recursive:true,force:true});
}catch(error){await rm(staging,{recursive:true,force:true}).catch(()=>{});if(!(await exists(target))&&await exists(current))await rename(current,target).catch(()=>{});throw error}
const result={version:V3_VERSION,issue:id,rolledBackAt:new Date().toISOString(),receipt:posix(receiptFile),target:posix(target),restoredPrevious:Boolean(receipt.previousExisted)};await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,`reports/v3-rc1-rollback-${id}.json`),JSON.stringify(result,null,2)+'\n','utf8');console.log(`RC1 部署回滚完成：${target}`);
