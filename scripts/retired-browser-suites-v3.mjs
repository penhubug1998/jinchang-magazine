// Runs the retired browser suites and reports which ones still work.
//
// These suites were removed from the merge gate on 2026-09-12 because they
// reported drift in the harness (missing markup, renamed APIs, fixed-string
// fixtures) rather than defects in the product. See RETIRED-BROWSER-SUITES.md.
//
// This runner never blocks anything: it is a diagnostic. Run it when you touch
// an area one of these suites covers, or when you want to promote a suite back
// into the gate.
import { spawnSync } from 'node:child_process';

const suites = [
  'test:studio-browser',
  'test:alpha13-browser',
  'test:alpha14-browser',
  'test:beta2-browser',
  'test:rc1-browser',
  'test:rc3-browser',
  'test:v31-alpha3-browser',
  'test:v31-alpha4-browser',
  'test:v31-alpha5-browser',
  'test:v31-alpha6-browser',
  'test:v31-alpha7-browser',
  'test:v31-alpha8-browser',
  'test:v31-alpha9-browser',
  'test:v31-alpha11-browser',
  'test:v31-alpha12-browser',
  'test:v31-alpha13-browser',
  'test:v31-alpha14-browser',
  'test:v31-alpha15-browser',
  'test:v31-alpha17-browser',
  'test:v31-alpha18-browser',
  'test:v31-alpha19-browser',
  'test:v31-alpha20-browser',
  'test:v31-alpha21-browser',
  'test:v31-alpha22-1-browser',
  'test:v31-alpha24-browser',
  'test:v31-alpha25-browser'
];

const only = process.argv.slice(2).filter(x => !x.startsWith('-'));
const selected = only.length ? suites.filter(x => only.includes(x)) : suites;
const missing = only.filter(x => !suites.includes(x));
for (const name of missing) console.warn(`未知的退休套件（不在清单里，未运行）：${name}`);

const passed = [], failed = [], skipped = [];
for (const suite of selected) {
  process.stdout.write(`RUN   ${suite}\n`);
  const result = spawnSync('npm', ['run', '--silent', suite], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.status === 0) {
    if (/跳过|skipped/i.test(output) && /未找到 Chromium/.test(output)) { skipped.push(suite); console.log(`SKIP  ${suite}（环境缺少 Chromium）`); }
    else { passed.push(suite); console.log(`PASS  ${suite}`); }
    continue;
  }
  failed.push(suite);
  const reason = output.split('\n').map(x => x.trim()).filter(x => /^Error:|^AssertionError|^TypeError/.test(x))[0] || output.trim().split('\n').slice(-1)[0] || 'no output';
  console.log(`FAIL  ${suite}`);
  console.log(`      ${reason.slice(0, 160)}`);
}

console.log(`\n退休套件诊断：${selected.length} 个运行，${passed.length} 通过，${failed.length} 失败${skipped.length ? `，${skipped.length} 环境跳过` : ''}`);
if (passed.length) console.log(`  可考虑升回门禁（需连续两次 CI 通过 + 覆盖不重复）：${passed.join(' ')}`);
if (failed.length) console.log(`  仍漂移、按策略不再单独修复：${failed.join(' ')}`);
console.log('  策略与升级条件见 RETIRED-BROWSER-SUITES.md');
// Diagnostic only: always exit 0 so it can be wired into an exploratory step.
process.exit(0);
