import { parseArgs, normalizeIssueId } from './lib-v3-production.mjs';
import { listSnapshots } from './lib-v3-history.mjs';
const args = parseArgs();
const id = normalizeIssueId(args.issue || args.id || args._[0] || '');
if (!id) { console.error('用法：npm run snapshots:v3 -- --issue 003'); process.exit(2); }
const rows = await listSnapshots(id);
if (!rows.length) { console.log(`${id} 尚无快照。`); process.exit(0); }
console.log(`${id} 快照（${rows.length}）：`);
for (const x of rows) console.log(`- ${x.id} | ${x.label} | ${x.sourceStatus || '-'} | ${x.createdAt}`);
