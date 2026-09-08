import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const sandbox = path.join(root, '.tmp-v3-production');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function run(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(sandbox, 'scripts', script), ...args], { cwd: sandbox, encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
    throw new Error(`${script} 执行失败`);
  }
  return result.stdout;
}

await rm(sandbox, { recursive: true, force: true });
await mkdir(path.join(sandbox, 'scripts'), { recursive: true });
await mkdir(path.join(sandbox, 'issues', '001'), { recursive: true });
await mkdir(path.join(sandbox, 'issues', '002'), { recursive: true });
for (const file of ['lib-v3-production.mjs','new-issue-v3.mjs','sync-assets-v3.mjs','audit-v3.mjs']) {
  await cp(path.join(root, 'scripts', file), path.join(sandbox, 'scripts', file));
}
await cp(path.join(root, 'package.json'), path.join(sandbox, 'package.json'));
await mkdir(path.join(sandbox,'src','studio'),{recursive:true});
await cp(path.join(root,'src','studio','issue-templates.js'),path.join(sandbox,'src','studio','issue-templates.js'));

try {
  run('new-issue-v3.mjs', ['--subtitle', 'Alpha4 production smoke']);
  const issueFile = path.join(sandbox, 'issues', '003', 'issue.json');
  let issue = JSON.parse(await readFile(issueFile, 'utf8'));
  assert(issue.id === '003', `自动期号应为 003，实际 ${issue.id}`);
  assert(issue.status === 'draft', '新一期必须默认为 draft');
  assert(issue.pages.length === 9, `默认脚手架应为 9 页，实际 ${issue.pages.length}`);

  run('sync-assets-v3.mjs', ['--issue', '003']);
  let manifest = JSON.parse(await readFile(path.join(sandbox, 'issues', '003', 'assets.json'), 'utf8'));
  assert(manifest.expected.filter((x) => x.kind === 'tts').length === 9, '脚手架 TTS 清单应与 9 个阅读页一致');

  // 草稿审计应允许资源未齐全，但必须产生 warning。
  run('audit-v3.mjs', ['--issue', '003']);
  let report = JSON.parse(await readFile(path.join(sandbox, 'reports', 'v3-release-audit-003.json'), 'utf8'));
  assert(report.issues[0].readiness === 'warning', '缺资源 draft 应为 warning，而不是 ready/blocked');

  // 模拟媒体已齐全并进入 ready。结构自测使用 >4KB 的占位数据，验证门禁流程而非音频解码质量。
  const assetRoot = path.join(sandbox, 'issues', '003', 'assets');
  const bytes = Buffer.alloc(8192, 1);
  await writeFile(path.join(assetRoot, 'music', 'bgm.mp3'), bytes);
  for (let i = 1; i <= issue.pages.length; i++) {
    await writeFile(path.join(assetRoot, 'tts', `page-${String(i).padStart(2, '0')}.mp3`), bytes);
  }
  const formalize = (value) => {
    if (typeof value === 'string') return value.replaceAll('请填写', '测试正式').replaceAll('待编辑', '正式内容');
    if (Array.isArray(value)) return value.map(formalize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, formalize(v)]));
    return value;
  };
  issue = formalize(issue);
  issue.status = 'ready';
  await writeFile(issueFile, `${JSON.stringify(issue, null, 2)}\n`, 'utf8');
  run('sync-assets-v3.mjs', ['--issue', '003']);
  run('audit-v3.mjs', ['--strict', '--issue', '003']);
  report = JSON.parse(await readFile(path.join(sandbox, 'reports', 'v3-release-audit-003.json'), 'utf8'));
  assert(report.issues[0].readiness === 'ready', '资源齐全且 status=ready 时严格审计应通过');
  assert(report.summary.blockers === 0, '严格审计不应存在阻断项');

  console.log('V3 production smoke 通过：自动建刊、资源清单、草稿审计、ready 严格门禁链路正常。');
} finally {
  await rm(sandbox, { recursive: true, force: true });
}
