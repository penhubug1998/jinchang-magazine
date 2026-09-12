import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V3_VERSION, V3_STABLE_VERSION, exists, normalizeIssueId, parseArgs, root } from './lib-v3-production.mjs';

const args=parseArgs();
const id=normalizeIssueId(args.issue||'003');
const seal=Boolean(args.seal);
if(V3_STABLE_VERSION!=='3.0.0'){console.error(`final:release 仅允许 V3.0.0，当前稳定版 ${V3_STABLE_VERSION}`);process.exit(1);}
if(!args.confirm){console.error(`正式发布锁未确认。${seal?'封版':'生成可部署正式包'}请显式加入 --confirm`);process.exit(2);}
function run(label,script,scriptArgs=[]){console.log(`\n=== ${label} ===`);const r=spawnSync(process.execPath,[path.join(root,'scripts',script),...scriptArgs],{cwd:root,stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}

if(seal){
  run('1/2 正式发布六项门禁','final-readiness-v3.mjs',['--issue',id,'--strict']);
  const manifestFile=path.join(root,'release-v3/deploy-manifest.json');
  const packageFile=path.join(root,'release-v3/V3.0.0-PACKAGE.json');
  if(!(await exists(manifestFile))||!(await exists(packageFile))){console.error('尚未生成 V3.0.0 可部署正式包，请先执行 final:release --confirm');process.exit(1);}
  const readiness=JSON.parse(await readFile(path.join(root,'reports/v3-final-readiness.json'),'utf8'));
  const deploy=JSON.parse(await readFile(manifestFile,'utf8'));
  const pkg=JSON.parse(await readFile(packageFile,'utf8'));
  if(pkg.treeSha256!==deploy.treeSha256){console.error('正式包 treeSha256 与当前 deploy manifest 不一致，禁止封版');process.exit(1);}
  const release={version:V3_STABLE_VERSION,release:'V3.0.0',issue:id,sealedAt:new Date().toISOString(),status:'RELEASED',readiness:{ready:readiness.ready,total:readiness.total},treeSha256:deploy.treeSha256,packageCreatedAt:pkg.createdAt,onlineVerified:true,note:'六项真实门禁全部 READY；该 treeSha256 已完成正式 HTTPS 线上验证，V3.0.0 正式封版。'};
  await mkdir(path.join(root,'reports'),{recursive:true});
  await writeFile(path.join(root,'reports/v3-final-release.json'),JSON.stringify(release,null,2)+'\n');
  await writeFile(path.join(root,'release-v3/V3.0.0-RELEASE.json'),JSON.stringify(release,null,2)+'\n');
  console.log(`\nV3.0.0 已正式封版：issue=${id}`);console.log(`treeSha256=${release.treeSha256}`);process.exit(0);
}

run('1/5 部署前五项真实门禁','final-readiness-v3.mjs',['--issue',id,'--predeploy','--strict']);
if(!args['skip-core'])run('2/5 正式版冻结校验','final-smoke-v3.mjs');else console.log('\n=== 2/5 正式版冻结校验：按参数跳过 ===');
run('3/5 目标期刊发布检查','release-check-v3.mjs',['--issue',id]);
run('4/5 生成可部署正式包','publish-v3.mjs',['--issue',id,'--mark-published']);
run('5/5 发布包完整性','deployment-readiness-v3.mjs',['--issue',id]);
const readiness=JSON.parse(await readFile(path.join(root,'reports/v3-final-readiness.json'),'utf8'));
const deploy=JSON.parse(await readFile(path.join(root,'release-v3/deploy-manifest.json'),'utf8'));
const release={version:V3_STABLE_VERSION,release:'V3.0.0',issue:id,createdAt:new Date().toISOString(),status:'FINAL_PACKAGE_READY_FOR_DEPLOY',readiness:{preDeployReady:readiness.preDeployReady,preDeployTotal:readiness.preDeployTotal},treeSha256:deploy.treeSha256,deployManifest:'release-v3/deploy-manifest.json',next:`npm run deploy:apply -- --issue ${id} --target <webroot> --confirm`,afterDeploy:`npm run online:check -- --base https://www.jilv.online/jinchang-magazine --issue ${id} --strict && npm run final:seal -- --issue ${id} --confirm`,note:'已通过部署前五项门禁并生成正式可部署包；尚未封版，必须部署并完成正式 HTTPS 校验后执行 final:seal。'};
await mkdir(path.join(root,'reports'),{recursive:true});
await writeFile(path.join(root,'reports/v3-final-package.json'),JSON.stringify(release,null,2)+'\n');
await writeFile(path.join(root,'release-v3/V3.0.0-PACKAGE.json'),JSON.stringify(release,null,2)+'\n');
console.log(`\nV3.0.0 可部署正式包已生成：issue=${id}`);console.log(`treeSha256=${release.treeSha256}`);console.log('下一步：部署 → online:check --strict → final:seal --confirm。');
