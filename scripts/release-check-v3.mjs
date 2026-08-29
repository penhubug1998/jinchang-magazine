import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { normalizeIssueId, parseArgs, root } from './lib-v3-production.mjs';

const args = parseArgs();
const issue = normalizeIssueId(args.issue || args.id || '');
const skipBrowser = Boolean(args['skip-browser']);
const strict = Boolean(args.strict);

function run(label, script, scriptArgs = []) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...scriptArgs], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('1/5 数据校验', 'check-v3.mjs');
run('2/5 构建', 'build-v3.mjs');
run('3/5 静态 smoke', 'smoke-v3.mjs', issue ? ['--issue', issue] : []);
if (strict && !skipBrowser) run('4/5 五档浏览器回归', 'browser-regression-v3.mjs', issue ? ['--issue', issue] : []);
else if (!strict) console.log('\n=== 4/5 五档浏览器回归：提示项，不阻断正式发布 ===');
else console.log('\n=== 4/5 五档浏览器回归：按参数跳过 ===');
// Content, media, TTS and data-integrity blockers always stop a release.
// Device/browser regression remains an explicit advisory unless the operator
// asks for it with --strict (or runs the separate device acceptance flow).
const auditArgs = ['--strict'];
if (issue) auditArgs.push('--issue', issue);
run('5/5 发布审计（硬性门禁 + 提示项）', 'audit-v3.mjs', auditArgs);
console.log(`\nV3 发布前检查通过${issue ? `：${issue}` : ''}。`);
