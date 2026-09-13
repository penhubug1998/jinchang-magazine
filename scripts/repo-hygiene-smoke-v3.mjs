// 仓库卫生回归：阻止"大文件 / 垃圾文件 / 密钥"被提交进来。
//
// 背景：仓库里已经躺着两个 45–49 MB 的视频（共约 94 MB），跟踪内容合计约 143 MB，
// 而此前**没有任何机制**会在下一次提交大文件时报警。Git 历史一旦写入就难以回收
// （改写公开仓库历史风险高），所以只能在入口拦住。
//
// 这个套件只做三件事，全部针对"已经进入 git 跟踪"的文件：
//   1. 单个文件不得超过 20 MB；已经存在于仓库里的大文件按"路径 + 当前体积上限"白名单放行，
//      但**不允许再变大**，也不允许新增。
//   2. 备份 / 临时 / 系统垃圾文件不得被跟踪（*.bak、*.orig、*~、.DS_Store、*.log …）。
//   3. 密钥类文件不得被跟踪（.env、*.pem、*.key、*.dump、*.sql …）。
//
// 用法：node scripts/repo-hygiene-smoke-v3.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const MAX_FILE_BYTES = 20 * 1024 * 1024;

// 已经存在于仓库里的大文件：按当前体积设上限，只能变小、不能变大，也不能再加新的。
// 上限取"当前字节数"，不取四舍五入后的 MB，否则会拿圆整值当上限而误报。
const ALLOWED_LARGE = new Map([
  ['1/assets/video/discipline.mp4', 47486619],              // 45.3 MB
  ['2/assets/video/b5f8fa9399881dcaa092a0e2a2c00d03.mp4', 51007991]   // 48.6 MB
]);

const JUNK = [/(^|\/)\.DS_Store$/, /\.bak$/i, /\.bak-/i, /\.orig$/i, /~$/, /\.tmp$/i, /(^|\/)npm-debug\.log$/i, /\.log$/i,
  // 删除期刊的隔离区属于运行时数据：只能留在服务器上，绝不能进仓库
  /(^|\/)\.v3-trash\//];
const SECRETS = [/(^|\/)\.env($|\.)/, /\.pem$/i, /\.key$/i, /(^|\/)id_rsa/, /\.dump$/i, /\.sql$/i,
  // 运行时数据库：含密码哈希与会话，绝不能进仓库（2026-09-13 真的漏提交过一次 users.db）
  /\.db$/i, /\.db-wal$/i, /\.db-shm$/i, /\.sqlite3?$/i, /(^|\/)\.v3-users\//];

function trackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`无法列出 git 跟踪文件（需要 git 仓库）：${result.stderr || result.stdout}`);
  return result.stdout.split('\0').filter(Boolean);
}

const files = trackedFiles();
assert.ok(files.length > 100, `跟踪文件数量异常（${files.length}），可能不在仓库根目录运行`);

const oversized = [];
const grown = [];
let totalBytes = 0;
for (const file of files) {
  let size = 0;
  try { size = statSync(path.join(root, file)).size; } catch { continue; }   // 稀疏签出时跳过
  totalBytes += size;
  const ceiling = ALLOWED_LARGE.get(file);
  if (ceiling != null) {
    if (size > ceiling) grown.push({ file, size, ceiling });
    continue;
  }
  if (size > MAX_FILE_BYTES) oversized.push({ file, size });
}

const junk = files.filter(file => JUNK.some(re => re.test(file)));
const secrets = files.filter(file => SECRETS.some(re => re.test(file)));

const mb = bytes => `${(bytes / 1048576).toFixed(1)} MB`;

assert.equal(oversized.length, 0,
  `有 ${oversized.length} 个新的大文件进入仓库（上限 ${mb(MAX_FILE_BYTES)}）：\n` +
  oversized.map(x => `  ${mb(x.size)}  ${x.file}`).join('\n') +
  '\n如果这张素材确实必须进仓库，请先把体积压到 20 MB 以内，或明确把它加入白名单并说明理由。');

assert.equal(grown.length, 0,
  `白名单里的大文件变大了（只能变小）：\n` +
  grown.map(x => `  ${mb(x.size)}（上限 ${mb(x.ceiling)}）  ${x.file}`).join('\n'));

assert.equal(junk.length, 0,
  `仓库里跟踪了备份 / 临时 / 系统垃圾文件：\n${junk.map(f => `  ${f}`).join('\n')}\n` +
  '请从 git 中移除（git rm --cached），并确认 .gitignore 覆盖这类文件。');

assert.equal(secrets.length, 0,
  `仓库里跟踪了疑似密钥 / 转储文件：\n${secrets.map(f => `  ${f}`).join('\n')}\n` +
  '密钥绝不允许提交；如属误报请调整本套件的 SECRETS 规则。');

console.log(`仓库卫生回归通过：跟踪文件 ${files.length} 个 · 合计 ${mb(totalBytes)} · ` +
  `超过 ${mb(MAX_FILE_BYTES)} 的新文件 0 个 · 白名单大文件 ${ALLOWED_LARGE.size} 个未变大 · ` +
  `备份/临时文件 0 个 · 密钥类文件 0 个。`);
