import path from 'node:path';
import { collectReferencedAssets, exists, narrationPageDigests, narrationSourceDigest, normalizeIssueId, parseArgs, readJson, root, writeJson } from './lib-v3-production.mjs';

const args=parseArgs();
const id=normalizeIssueId(args.issue||args.id||args._?.[0]);
if(!id){console.error('用法：npm run tts:baseline -- --issue 003');process.exit(2)}
const file=path.join(root,'issues',id,'issue.json');
if(!(await exists(file))){console.error(`找不到 issues/${id}/issue.json`);process.exit(1)}
const issue=await readJson(file);
if(issue.engine!=='v3'){console.error('仅支持 V3 期刊');process.exit(1)}
const refs=collectReferencedAssets(issue).filter(x=>x.kind==='tts');
if(!refs.length){console.error('当前期刊未配置预生成 TTS pattern');process.exit(1)}
const sourceDir=path.resolve(root,issue.assetSource||'');
const missing=[];
for(const ref of refs){if(!(await exists(path.join(sourceDir,ref.path))))missing.push(ref.path)}
if(missing.length&&!args.force){console.error(`TTS 尚不完整，缺失 ${missing.length} 个文件；补齐后再建立基线。可用 --force 强制。`);process.exit(1)}
issue.features ||= {}; issue.features.narration ||= {};
issue.features.narration.sourceDigest=narrationSourceDigest(issue);
issue.features.narration.pageDigests=narrationPageDigests(issue);
issue.features.narration.baselinedAt=new Date().toISOString();
await writeJson(file,issue);
console.log(`TTS 基线已更新：${id} · ${issue.pages?.length||0} 页${missing.length?` · 强制忽略 ${missing.length} 个缺失文件`:''}`);
