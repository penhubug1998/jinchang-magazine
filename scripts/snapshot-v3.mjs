import { parseArgs, normalizeIssueId } from './lib-v3-production.mjs';
import { snapshotIssue } from './lib-v3-history.mjs';
const args = parseArgs();
const id = normalizeIssueId(args.issue || args.id || args._[0] || '');
if (!id) { console.error('用法：npm run snapshot:v3 -- --issue 003 [--label 保存前] [--include-assets]'); process.exit(2); }
const snap = await snapshotIssue(id, args.label || 'manual', { includeAssets: Boolean(args['include-assets']) });
console.log(`V3 快照已创建：${snap.id}`);
console.log(`- 期刊：${id}`);
console.log(`- 状态：${snap.sourceStatus || 'unknown'}`);
console.log(`- 路径：${snap.path}`);
