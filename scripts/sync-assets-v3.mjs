import path from 'node:path';
import { collectReferencedAssets, exists, normalizeIssueId, parseArgs, readJson, root, writeJson } from './lib-v3-production.mjs';

const args = parseArgs();
const id = normalizeIssueId(args.issue || args.id || args._[0]);
if (!id) {
  console.error('用法：npm run assets:sync -- --issue 003');
  process.exit(2);
}
const issueFile = path.join(root, 'issues', id, 'issue.json');
if (!(await exists(issueFile))) {
  console.error(`找不到 issues/${id}/issue.json`);
  process.exit(1);
}
const issue = await readJson(issueFile);
if (issue.engine !== 'v3') {
  console.error(`${id} 不是 V3 期刊，无法生成 V3 资源清单。`);
  process.exit(1);
}
const manifest = {
  issue: issue.id,
  assetSource: issue.assetSource || `issues/${id}/assets`,
  generatedAt: new Date().toISOString(),
  expected: collectReferencedAssets(issue)
};
await writeJson(path.join(root, 'issues', id, 'assets.json'), manifest);
const counts = manifest.expected.reduce((acc, item) => ((acc[item.kind] = (acc[item.kind] || 0) + 1), acc), {});
console.log(`资源清单已更新：issues/${id}/assets.json`);
console.log(Object.entries(counts).map(([k,v]) => `${k}=${v}`).join('，') || '当前没有外部媒体资源');
