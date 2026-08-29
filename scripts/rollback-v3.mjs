import { parseArgs, normalizeIssueId } from './lib-v3-production.mjs';
import { listSnapshots, restoreSnapshot } from './lib-v3-history.mjs';
const args = parseArgs();
const id = normalizeIssueId(args.issue || args.id || '');
let snapshot = String(args.snapshot || '').trim();
if (!id) { console.error('用法：npm run rollback:v3 -- --issue 003 --snapshot <snapshot-id>'); process.exit(2); }
if (!snapshot && args.latest) snapshot = (await listSnapshots(id))[0]?.id || '';
if (!snapshot) { console.error('缺少 --snapshot；也可使用 --latest。'); process.exit(2); }
const restored = await restoreSnapshot(id, snapshot, { restoreAssets: Boolean(args['restore-assets']) });
console.log(`V3 回滚完成：${id} ← ${restored.id}`);
console.log('已在回滚前自动创建安全快照。');
