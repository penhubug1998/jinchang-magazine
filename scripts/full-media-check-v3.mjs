import path from 'node:path';
import crypto from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { V3_VERSION, collectReferencedAssets, exists, humanBytes, normalizeIssueId, parseArgs, posix, root, stripAssetsPrefix } from './lib-v3-production.mjs';

const args = parseArgs();
const strict = Boolean(args.strict);
const only = normalizeIssueId(args.issue || args.id || '');
const baselineFile = path.resolve(root, String(args.baseline || 'baselines/v3-rc1-media.json'));
const reportFile = path.resolve(root, String(args.report || 'reports/v3-full-media-check.json'));
let baseline = null;
if (await exists(baselineFile)) {
  try { baseline = JSON.parse(await readFile(baselineFile, 'utf8')); }
  catch (error) { console.error(`ERROR 媒体 baseline 无法读取：${error.message}`); process.exit(1); }
}

const report = {
  version: V3_VERSION,
  generatedAt: new Date().toISOString(),
  strict,
  targetIssue: only || null,
  baseline: baseline ? { file: posix(path.relative(root, baselineFile)), source: baseline.source || null } : null,
  summary: { checkedReferences: 0, checkedFiles: 0, errors: 0, warnings: 0 },
  issues: []
};

function add(row, severity, code, message, data = {}) {
  const item = { severity, code, message, ...data };
  row.problems.push(item);
  if (severity === 'error') { report.summary.errors++; console.error(`ERROR ${row.id}: ${message}`); }
  else { report.summary.warnings++; console.warn(`WARN ${row.id}: ${message}`); }
}

function gitBlobSha1(bytes) {
  return crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
}

async function scanFiles(base, row) {
  const files = new Map();
  const lower = new Map();
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(file); continue; }
      if (!entry.isFile() || entry.name === '.gitkeep' || entry.name === '.DS_Store') continue;
      const rel = posix(path.relative(base, file));
      const key = rel.toLowerCase();
      if (lower.has(key) && lower.get(key) !== rel) add(row, 'error', 'CASE_CONFLICT', `大小写冲突 ${lower.get(key)} / ${rel}`);
      else lower.set(key, rel);
      const info = await stat(file);
      if (info.size === 0) add(row, 'error', 'EMPTY_MEDIA', `空媒体 ${rel}`);
      files.set(rel, { path: rel, bytes: info.size, file });
      report.summary.checkedFiles++;
    }
  }
  await walk(base);
  return files;
}

async function checkBaseline(issue, base, files, row) {
  const expected = baseline?.issues?.[issue.id];
  if (!expected) return;
  row.baseline = { expectedFiles: expected.fileCount, expectedBytes: expected.totalBytes, sourceCommit: baseline.source?.commit || null };
  if (expected.assetSource && expected.assetSource !== issue.assetSource) add(row, 'error', 'ASSET_SOURCE_DRIFT', `assetSource ${issue.assetSource || '(空)'} 与 RC1 baseline ${expected.assetSource} 不一致`);
  if (expected.pages && expected.pages !== issue.pages?.length) add(row, 'error', 'PAGE_COUNT_DRIFT', `页数 ${issue.pages?.length || 0} 与 RC1 baseline ${expected.pages} 不一致`);

  const expectedMap = new Map((expected.files || []).map(x => [x.path, x]));
  for (const [rel, item] of expectedMap) {
    const actual = files.get(rel);
    if (!actual) { add(row, 'error', 'BASELINE_FILE_MISSING', `RC1 历史媒体缺失 ${rel}`); continue; }
    if (actual.bytes !== item.bytes) { add(row, 'error', 'BASELINE_SIZE_MISMATCH', `${rel} 大小 ${actual.bytes} != GitHub baseline ${item.bytes}`); continue; }
    // 精确校验 Git blob SHA，能发现“大小相同但内容变了”。
    const bytes = await readFile(actual.file);
    const sha = gitBlobSha1(bytes);
    if (sha !== item.gitBlobSha1) add(row, 'error', 'BASELINE_HASH_MISMATCH', `${rel} Git blob SHA1 与 GitHub baseline 不一致`, { expected: item.gitBlobSha1, actual: sha });
  }
  const extras = [...files.keys()].filter(x => !expectedMap.has(x));
  if (extras.length) {
    const severity = strict ? 'error' : 'warning';
    add(row, severity, 'BASELINE_EXTRA_FILES', `历史媒体目录出现 ${extras.length} 个 baseline 外文件：${extras.slice(0, 8).join(', ')}${extras.length > 8 ? ' …' : ''}`);
  }
  const totalBytes = [...files.values()].reduce((n, x) => n + x.bytes, 0);
  if (files.size !== expected.fileCount) add(row, 'error', 'BASELINE_FILE_COUNT', `历史媒体文件数 ${files.size} != baseline ${expected.fileCount}`);
  if (totalBytes !== expected.totalBytes) add(row, 'error', 'BASELINE_TOTAL_BYTES', `历史媒体总体积 ${totalBytes} != baseline ${expected.totalBytes}`);
  row.actual = { files: files.size, bytes: totalBytes, size: humanBytes(totalBytes) };
}

const issueRoot = path.join(root, 'issues');
const entries = await readdir(issueRoot, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const issueFile = path.join(issueRoot, entry.name, 'issue.json');
  if (!(await exists(issueFile))) continue;
  const issue = JSON.parse(await readFile(issueFile, 'utf8'));
  if (issue.engine !== 'v3' || (only && issue.id !== only)) continue;
  const row = { id: issue.id, assetSource: issue.assetSource || `issues/${issue.id}/assets`, problems: [], references: 0, actual: null, baseline: null };
  report.issues.push(row);
  const base = path.resolve(root, row.assetSource);
  if (!(await exists(base))) {
    const message = `资源目录不存在 ${row.assetSource}`;
    if (strict) add(row, 'error', 'ASSET_ROOT_MISSING', message);
    else add(row, 'warning', 'ASSET_ROOT_MISSING', `${message}（overlay 环境允许跳过；完整仓库/发布前请使用 --strict）`);
    continue;
  }

  const files = await scanFiles(base, row);
  const refs = collectReferencedAssets(issue);
  row.references = refs.length;
  // A draft issue has not been produced yet, so its media legitimately does not
  // exist. Requiring it makes --strict fail on work that has not started.
  // Published issues keep the hard failure, which is the property that matters:
  // parity is asserted over live assets, and every gap is still reported.
  const draft = issue.status === 'draft';
  for (const ref of refs) {
    report.summary.checkedReferences++;
    const rel = stripAssetsPrefix(ref.path);
    if (!files.has(rel)) add(row, draft ? 'warning' : 'error', 'REFERENCED_FILE_MISSING', `缺少 ${ref.kind} ${ref.path}${draft ? '（草稿期尚未生成媒体）' : ''}`, { path: ref.path, kind: ref.kind, page: ref.page || null });
  }
  await checkBaseline(issue, base, files, row);
  console.log(`${issue.id}: 媒体目录可用，引用 ${refs.length} 项，实际文件 ${files.size} 项${row.baseline ? '，RC1 GitHub baseline 已核对' : ''}。`);
}

await mkdir(path.dirname(reportFile), { recursive: true });
await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`媒体完整性：refs=${report.summary.checkedReferences}, files=${report.summary.checkedFiles}, errors=${report.summary.errors}, warnings=${report.summary.warnings}`);
console.log(`报告：${posix(path.relative(root, reportFile))}`);
if (report.summary.errors) process.exit(1);
