import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { V3_VERSION, exists, normalizeIssueId, parseArgs, root } from './lib-v3-production.mjs';
import { verifyIntegrity } from './lib-v3-deploy.mjs';
const args=parseArgs(); const releaseRoot=path.resolve(root,String(args.release||args.output||'release-v3')); const id=normalizeIssueId(args.issue||args.id||args._[0]||'');
if(!id){console.error('用法：npm run deploy:check -- --issue 003 [--release release-v3]');process.exit(2)}
const dir=path.join(releaseRoot,id); const errors=[];
if(!(await exists(dir)))errors.push(`发布目录不存在：${path.relative(root,dir)}`);
if(!errors.length){
  const releaseFile=path.join(dir,'release.json'); if(!(await exists(releaseFile)))errors.push('缺少 release.json');
  else {const meta=JSON.parse(await readFile(releaseFile,'utf8'));if(meta.version!==V3_VERSION)errors.push(`release.json 版本 ${meta.version} != ${V3_VERSION}`);if(meta.issue!==id)errors.push(`release.json issue=${meta.issue} != ${id}`)}
  const result=await verifyIntegrity(dir); if(!result.ok)errors.push(...result.errors);
  const rootManifest=path.join(releaseRoot,'deploy-manifest.json');
  if(!(await exists(rootManifest)))errors.push('缺少 deploy-manifest.json');
  else {const deploy=JSON.parse(await readFile(rootManifest,'utf8'));if(deploy.version!==V3_VERSION)errors.push(`deploy-manifest 版本 ${deploy.version} != ${V3_VERSION}`);if(deploy.issue!==id)errors.push(`deploy-manifest issue=${deploy.issue} != ${id}`);if(result.manifest&&deploy.treeSha256!==result.manifest.treeSha256)errors.push('deploy-manifest treeSha256 与 integrity.json 不一致');}
  const cache=path.join(releaseRoot,'nginx-cache-snippet.conf'); if(!(await exists(cache)))errors.push('缺少 nginx-cache-snippet.conf');
}
if(errors.length){console.error(`Beta2 部署就绪检查失败（${errors.length}）：`);for(const x of errors)console.error(`- ${x}`);process.exit(1)}
console.log(`Beta2 部署就绪检查通过：${id} 文件完整性、版本、manifest 与缓存策略均正常。`);
