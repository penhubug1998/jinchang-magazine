// 发布包安全检查：确保发布目录里不出现不属于公开内容的文件。
//
// 背景（2026-09-12）：线上 public 根目录曾被写入过构建产物、运维日志、变更文档、
// 部署清单，以及各期目录里的旧代码备份（*.pre-*）。其中
// /new-jc-magazine/02/reader.js.pre-ios-fullscreen-fix-20260825 可以被公网直接下载。
// 这个套件把"发布包必须干净"变成可执行断言。
//
// 用法：
//   node scripts/publication-hygiene-smoke-v3.mjs                     # 检查各期发布源
//   node scripts/publication-hygiene-smoke-v3.mjs --dir /path/to/site  # 检查任意目录（如线上根目录）
import assert from 'node:assert/strict';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

// 公开目录里允许出现的文件类型（内容 + 资源）
const ALLOWED_EXT = new Set([
  '.html', '.json', '.js', '.css', '.map'.replace('.map', '.svg'), '.svg', '.ico',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif',
  '.mp3', '.m4a', '.wav', '.ogg', '.mp4', '.webm', '.mov',
  '.woff', '.woff2', '.ttf', '.otf', '.txt', '.pdf', '.zip'
]);

// 明确禁止出现在公开目录的文件（构建产物、备份、日志、清单、密钥）
const FORBIDDEN_PATTERNS = [
  [/(^|\/)\.(?!well-known)[^/]+$/, '隐藏文件/目录（点文件）'],
  [/\.pre-[^/]*$/i, '历史代码备份（*.pre-*）'],
  [/\.bak([-.]|$)/i, '备份文件（*.bak*）'],
  [/\.backup([-.]|$)/i, '备份文件（*.backup*）'],
  [/\.(old|orig|save|swp|tmp)$/i, '临时/旧版本文件'],
  [/\.(log)$/i, '运行日志'],
  [/\.(sql|dump)$/i, '数据库导出'],
  [/\.(mjs|ts)$/i, '未编译源码'],
  [/\.(md)$/i, '内部文档'],
  [/\.(pem|key|crt|p12)$/i, '证书或私钥'],
  [/^\.env/i, '环境变量文件'],
  [/(^|\/)(deploy-manifest|nginx-cache-snippet|EVIDENCE-SHA256)\.(json|conf|txt)$/i, '部署清单/校验文件']
];

// 站点根目录允许存在的非内容文件（站点导航与目录数据）
const ROOT_ALLOWLIST = new Set(['index.html', 'catalog.json']);

async function walk(dir, base = '') {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await walk(path.join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

const argDir = (() => {
  const i = process.argv.indexOf('--dir');
  return i >= 0 ? process.argv[i + 1] : null;
})();

const targets = [];
if (argDir) {
  targets.push({ label: argDir, dir: argDir, shallow: false });
} else {
  // 各期发布源
  for (const id of ['001', '002', '003', '004']) {
    const dir = path.join(root, 'dist-v3', id);
    try { await stat(dir); targets.push({ label: `dist-v3/${id}/`, dir, shallow: false }); } catch {}
  }
  // 线上发布目录（本地可访问时）
  const publicRoot = process.env.PUBLIC_ROOT;
  if (publicRoot) targets.push({ label: publicRoot, dir: publicRoot, shallow: false });
}

if (!targets.length) {
  console.log('发布包卫生检查：未找到可检查的发布产物（先运行 npm run build:v3）。');
  process.exit(0);
}

const problems = [];
for (const target of targets) {
  const files = await walk(target.dir);
  for (const rel of files) {
    const name = path.basename(rel);
    for (const [pattern, label] of FORBIDDEN_PATTERNS) {
      if (pattern.test(rel)) {
        // 站点根目录的 index.html / catalog.json 属于正常内容
        if (!rel.includes('/') && ROOT_ALLOWLIST.has(name)) continue;
        problems.push({ target: target.label, file: rel, reason: label });
        break;
      }
    }
    const ext = path.extname(name).toLowerCase();
    if (ext && !ALLOWED_EXT.has(ext)) {
      problems.push({ target: target.label, file: rel, reason: `未知扩展名 ${ext}` });
    }
  }
  console.log(`  已检查 ${target.label}：${files.length} 个文件`);
}

if (problems.length) {
  console.error(`\n发布包含有 ${problems.length} 个不应公开的文件：`);
  for (const p of problems.slice(0, 20)) console.error(`  [${p.target}] ${p.file} — ${p.reason}`);
  if (problems.length > 20) console.error(`  … 其余 ${problems.length - 20} 个`);
  process.exit(1);
}

console.log(`发布包卫生检查通过：${targets.length} 个发布目录中没有备份、日志、内部文档、源码或密钥类文件。`);
