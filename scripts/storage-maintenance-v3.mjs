// 存储维护：找出可以安全回收的派生数据，并按需执行。
//
// 背景：一期期刊从源稿到上线会在磁盘上留下 3–5 份副本（源稿 / 构建 / 发布包 / 输出 / 公开副本），
// 其中 dist-v3 完全是可再生产物，删除只影响一次"下次打开时重建"；
// 而删除期刊、改期号之类的历史操作还会留下孤儿目录。
// 生产上实测：dist-v3 143 MB、outputs-v3 82 MB、隔离区 71 MB —— 这些是这台 40 GB 机器上
// 最容易回收的部分，但没有任何工具能在动手前先看清楚"会删掉什么、能省多少"。
//
// 安全约定（与 AGENTS.md 一致）：
//   - 默认 --dry-run：只报告，不动任何文件；
//   - 只有可再生产物（dist-v3、preview-*）才会被真正删除；
//   - 孤儿产物（源稿已不存在的 release/outputs/snapshots/source-ledger）搬进隔离区，不删除；
//   - 隔离区自身只有在同时给出 --apply --prune-trash 时才按保留期回收；
//   - 永不触碰 issues/、live 期刊的 release-v3、publication-evidence.json 和公开站点目录。
//
// 用法：
//   node scripts/storage-maintenance-v3.mjs                      # 预演（默认）
//   node scripts/storage-maintenance-v3.mjs --apply              # 执行可再生产物回收 + 孤儿入隔离区
//   node scripts/storage-maintenance-v3.mjs --apply --prune-trash --retention-days 90
//   node scripts/storage-maintenance-v3.mjs --json
import path from 'node:path';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { V3_VERSION, exists, humanBytes, parseArgs, posix, root } from './lib-v3-production.mjs';
import { PUBLICATION_OUTPUT_ROOT } from './lib-v3-publication.mjs';

const args = parseArgs();
const apply = Boolean(args.apply);
const pruneTrash = Boolean(args['prune-trash']);
// 保留天数没有技术上限，纯粹是"反悔窗口"有多长：90 只是建议起点。
// 必须显式校验 —— 之前 `Number(x || 90)` 会把 0 静默变成 90、负数变成"永不过期"、
// 非数字变成 NaN 导致"什么都没过期"，三种情况都不报错，属于会骗人的默认值。
const retentionRaw = args['retention-days'] === undefined ? 90 : Number(args['retention-days']);
if (!Number.isInteger(retentionRaw) || retentionRaw < 1) {
  console.error(`--retention-days 必须是不小于 1 的整数（收到 ${JSON.stringify(args['retention-days'])}）。`);
  console.error('想永久保留隔离区就不要加 --prune-trash；想立刻清空请先人工确认后再执行。');
  process.exit(2);
}
const retentionDays = retentionRaw;
const asJson = Boolean(args.json);
// --keep-metadata-only：回收隔离区里的"媒体副本"，只留能说明来龙去脉的元数据。
// 删除期刊时搬进隔离区的派生数据里，媒体占了 95% 以上，而它们都可以从源稿重建；
// 真正有价值的是 issue.json / release.json / publication-evidence.json / 报告 / 源稿台账。
const keepMetadataOnly = Boolean(args['keep-metadata-only']);
const METADATA_KEEP = [/\.json$/i, /\.md$/i, /\.txt$/i, /\.html?$/i];
const METADATA_MAX_BYTES = 256 * 1024;
const keepSnapshots = Number(args['keep-snapshots'] || 0);   // 0 = 不动快照

const issuesRoot = path.join(root, 'issues');
const trashRoot = path.join(root, '.v3-trash');
const derivedRoots = {
  'dist-v3': path.join(root, 'dist-v3'),
  'release-v3': path.join(root, 'release-v3'),
  outputs: PUBLICATION_OUTPUT_ROOT,
  '.v3-snapshots': path.join(root, '.v3-snapshots'),
  '.v3-source-ledger': path.join(root, '.v3-source-ledger'),
};

async function dirBytes(dir) {
  let total = 0;
  const walk = async current => {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) total += await stat(file).then(x => x.size).catch(() => 0);
    }
  };
  await walk(dir);
  return total;
}
async function entries(dir) {
  return (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter(x => x.isDirectory()).map(x => x.name);
}
const isPreview = name => name.startsWith('preview-');
const isMetadataFile = (name, size) => METADATA_KEEP.some(re => re.test(name)) && size <= METADATA_MAX_BYTES;
async function scanMediaInEntry(dir) {
  let bytes = 0, count = 0;
  const walk = async current => {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) { await walk(file); continue; }
      if (!entry.isFile()) continue;
      const info = await stat(file).catch(() => null);
      if (!info || isMetadataFile(entry.name, info.size)) continue;
      bytes += info.size; count += 1;
    }
  };
  await walk(dir);
  return { bytes, count };
}
// 真正执行：删掉非元数据文件、清掉空目录，并在批次根目录留下 PRUNED-MEDIA.json 说明删了什么。
async function pruneMediaInEntry(dir, reason) {
  const dropped = []; let freed = 0;
  const walk = async current => {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) { await walk(file); continue; }
      if (!entry.isFile()) continue;
      const info = await stat(file).catch(() => null);
      if (!info || isMetadataFile(entry.name, info.size)) continue;
      await rm(file, { force: true });
      freed += info.size;
      dropped.push({ path: posix(path.relative(dir, file)), bytes: info.size });
    }
  };
  await walk(dir);
  const removeEmpty = async current => {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory()) continue;
      const sub = path.join(current, entry.name);
      await removeEmpty(sub);
      if ((await readdir(sub).catch(() => [])).length === 0) await rm(sub, { recursive: true, force: true });
    }
  };
  await removeEmpty(dir);
  if (dropped.length) {
    await writeFile(path.join(dir, 'PRUNED-MEDIA.json'), `${JSON.stringify({
      version: V3_VERSION, prunedAt: new Date().toISOString(), reason,
      rule: '只保留 .json/.md/.txt/.html 且不超过 256 KB 的元数据；媒体副本可从源稿重建',
      droppedFiles: dropped.length, droppedBytes: freed,
      keptHint: 'issue.json / release.json / integrity.json / publication-evidence.json / reports / 源稿台账',
      dropped: dropped.slice(0, 200),
    }, null, 2)}\n`, 'utf8');
  }
  return { dropped: dropped.length, freed };
}

// 磁盘上真实存在的期号（源稿目录）
const liveIssues = new Set((await readdir(issuesRoot, { withFileTypes: true }).catch(() => []))
  .filter(x => x.isDirectory()).map(x => x.name));

const plan = [];
// group 用来在隔离区里保留"这件东西原来属于哪一类"，避免不同来源的同名目录互相覆盖
// （例如 release-v3/999 与 outputs-v3/999 都叫 999）。
const add = (category, target, bytes, action, reason, group = '') => plan.push({ category, group, path: posix(path.relative(root, target)), bytes, action, reason });

// 1) 可再生产物：dist-v3（含 preview-*），删掉只会让下次打开时重建
for (const name of await entries(derivedRoots['dist-v3'])) {
  if (name.startsWith('.')) continue;              // 临时/隐藏目录交给下面的"原子替换残留"处理
  const target = path.join(derivedRoots['dist-v3'], name);
  const bytes = await dirBytes(target);
  if (isPreview(name)) add('regenerable', target, bytes, 'delete', '预览构建产物，可随时重建', 'dist-v3');
  else if (liveIssues.has(name)) add('regenerable', target, bytes, 'delete', '构建产物，发布/预览时会自动重建', 'dist-v3');
  // 源稿已经没了的构建产物：既不可再生也没有保留价值（发布副本另有归档），直接删除。
  else add('regenerable', target, bytes, 'delete', '构建产物，且源稿已不存在', 'dist-v3');
}

// 2) 孤儿产物：源稿已经不在了（历史删除操作、改期号留下的）
for (const [label, dir] of Object.entries(derivedRoots)) {
  if (label === 'dist-v3') continue;
  for (const name of await entries(dir)) {
    if (name.startsWith('.')) continue;            // 临时/隐藏目录交给下面的"原子替换残留"处理
    if (liveIssues.has(name)) continue;
    const target = path.join(dir, name);
    add('orphan', target, await dirBytes(target), 'quarantine', `issues/${name} 已不存在`, label);
  }
}

// 2.5) 原子替换留下的临时目录：.<期号>.previous-* / .<期号>.staging-*
// 正常的 rename 交换结束后会被清掉；进程中途被杀就会留下来（生产上真的躺着一个 63 MB 的）。
// 只有当对应的正式目录已经存在（说明交换已完成）才按残留删除，否则只报告、交给人工判断。
for (const [label, dir] of Object.entries(derivedRoots)) {
  for (const name of (await readdir(dir, { withFileTypes: true }).catch(() => []))) {
    if (!name.isDirectory() || !name.name.startsWith('.')) continue;
    const match = name.name.match(/^\.([^.]+)\.(previous|staging)-/);
    if (!match) continue;
    const target = path.join(dir, name.name);
    const live = path.join(dir, match[1]);
    const bytes = await dirBytes(target);
    if (await exists(live)) add('transient', target, bytes, 'delete', `${match[2]} 临时目录，正式目录已就位`, label);
    else add('transient', target, bytes, 'report', `${match[2]} 临时目录，但找不到对应的正式目录 ${label}/${match[1]}`);
  }
}

// 3) 快照数量：默认只报告，--keep-snapshots N 才把多余的搬进隔离区
const snapshotCounts = [];
for (const issueId of await entries(derivedRoots['.v3-snapshots'])) {
  const list = await entries(path.join(derivedRoots['.v3-snapshots'], issueId));
  snapshotCounts.push({ issueId, count: list.length });
  if (!keepSnapshots || list.length <= keepSnapshots) continue;
  for (const name of list.sort().slice(0, list.length - keepSnapshots)) {
    const target = path.join(derivedRoots['.v3-snapshots'], issueId, name);
    add('snapshot', target, await dirBytes(target), 'quarantine', `保留最新 ${keepSnapshots} 个快照`, issueId);
  }
}

// 4) 隔离区自身的保留期（只有 --apply --prune-trash 才会动）
const cutoff = Date.now() - retentionDays * 24 * 3600 * 1000;
// 隔离区有两处：应用目录与公开根目录，各自留在自己的文件系统里，回收时两边都要看。
const publicMagazineRoot = process.env.V3_PUBLIC_MAGAZINE_ROOT ? path.resolve(process.env.V3_PUBLIC_MAGAZINE_ROOT) : '';
const trashRoots = [{ label: 'app', dir: trashRoot }];
if (publicMagazineRoot) trashRoots.push({ label: 'public', dir: path.join(publicMagazineRoot, '.v3-trash') });
const AGE_BUCKETS = [30, 90, 365];
const trashEntries = [];
for (const { label, dir } of trashRoots) {
  for (const group of await entries(dir)) {
    for (const name of await entries(path.join(dir, group))) {
      const target = path.join(dir, group, name);
      const info = await stat(target).catch(() => null);
      if (!info) continue;
      const bytes = await dirBytes(target);
      const ageDays = Math.floor((Date.now() - info.mtimeMs) / (24 * 3600 * 1000));
      const expired = info.mtimeMs < cutoff;
      trashEntries.push({ side: label, group, name, bytes, ageDays, expired, mtime: new Date(info.mtimeMs).toISOString() });
      if (expired) add('trash', target, bytes, pruneTrash ? 'delete' : 'report', `隔离 ${ageDays} 天（超过 ${retentionDays} 天）`, `${label}/${group}`);
    }
  }
}
const trashTotal = trashEntries.reduce((n, x) => n + x.bytes, 0);
const ageBuckets = AGE_BUCKETS.map(days => ({
  days,
  bytes: trashEntries.filter(x => x.ageDays >= days).reduce((n, x) => n + x.bytes, 0),
  count: trashEntries.filter(x => x.ageDays >= days).length,
}));

if (keepMetadataOnly) {
  for (const row of trashEntries) {
    const target = path.join(row.side === 'public' ? path.join(publicMagazineRoot, '.v3-trash') : trashRoot, row.group, row.name);
    const media = await scanMediaInEntry(target);
    if (media.count) add('media', target, media.bytes, 'prune-media', `${media.count} 个媒体/产物文件，只保留元数据（${row.side}/${row.group}/${row.name}）`, `${row.side}/${row.group}`);
  }
}

const totals = {
  media: plan.filter(x => x.category === 'media').reduce((n, x) => n + x.bytes, 0),
  transient: plan.filter(x => x.category === 'transient').reduce((n, x) => n + x.bytes, 0),
  regenerable: plan.filter(x => x.category === 'regenerable').reduce((n, x) => n + x.bytes, 0),
  orphan: plan.filter(x => x.category === 'orphan').reduce((n, x) => n + x.bytes, 0),
  snapshot: plan.filter(x => x.category === 'snapshot').reduce((n, x) => n + x.bytes, 0),
  trash: plan.filter(x => x.category === 'trash').reduce((n, x) => n + x.bytes, 0),
};

if (asJson) {
  console.log(JSON.stringify({ version: V3_VERSION, root: posix(root), apply, pruneTrash, retentionDays, liveIssues: [...liveIssues].sort(), plan, totals, trashEntries, ageBuckets, retentionDays, keepMetadataOnly, snapshotCounts }, null, 2));
} else {
  console.log(`存储维护${apply ? '（执行）' : '（预演，未改动任何文件）'} · 工程根目录：${root}`);
  console.log(`源稿期号：${[...liveIssues].sort().join(', ') || '（无）'}`);
  console.log('');
  const labels = { media: '隔离区媒体副本（只留元数据）', transient: '原子替换残留（删除/报告）', regenerable: '可再生产物（删除）', orphan: '孤儿产物（进隔离区）', snapshot: '超额快照（进隔离区）', trash: '隔离区过期（保留期回收）' };
  for (const key of ['media', 'transient', 'regenerable', 'orphan', 'snapshot', 'trash']) {
    const rows = plan.filter(x => x.category === key);
    console.log(`${labels[key]}：${rows.length} 项 · ${humanBytes(totals[key])}`);
    for (const row of rows.slice(0, 12)) console.log(`   ${row.action === 'delete' ? '删除' : row.action === 'quarantine' ? '隔离' : row.action === 'prune-media' ? '瘦身' : '仅报告'}  ${humanBytes(row.bytes).padStart(9)}  ${row.path}  （${row.reason}）`);
    if (rows.length > 12) console.log(`   … 其余 ${rows.length - 12} 项`);
  }
  console.log('');
  console.log(`隔离区合计：${humanBytes(trashTotal)}（${trashEntries.length} 项）· ` +
    ageBuckets.map(b => `≥${b.days} 天 ${humanBytes(b.bytes)}/${b.count} 项`).join(' · '));
  const freed = apply ? plan.filter(x => x.action === 'delete').reduce((n, x) => n + x.bytes, 0) : 0;
  console.log('');
  console.log(`可回收合计：${humanBytes(totals.media + totals.transient + totals.regenerable + totals.orphan + totals.snapshot + (pruneTrash ? totals.trash : 0))}` +
    (pruneTrash ? '' : `（另有隔离区过期 ${humanBytes(totals.trash)}，需显式 --prune-trash）`));
  if (apply) console.log(`本次实际释放：${humanBytes(freed)}`);
  else console.log('预演结束。确认后加 --apply 执行；隔离区回收需再加 --prune-trash。');
}

if (!apply) process.exit(0);

let freedBytes = 0;
const quarantineRoot = path.join(trashRoot, 'maintenance', new Date().toISOString().replace(/[:.]/g, '-'));
const results = { deleted: [], quarantined: [], prunedMedia: [], failed: [] };
for (const row of plan) {
  if (row.action === 'report') continue;
  const target = path.join(root, row.path);
  try {
    if (row.action === 'prune-media') {
      const pruned = await pruneMediaInEntry(target, '--keep-metadata-only');
      freedBytes += pruned.freed;
      results.prunedMedia.push({ path: row.path, files: pruned.dropped, bytes: pruned.freed });
    } else if (row.action === 'delete') {
      const bytes = row.bytes;
      await rm(target, { recursive: true, force: true });
      freedBytes += bytes;
      results.deleted.push(row.path);
    } else {
      const dest = path.join(quarantineRoot, row.category, row.group || '', path.basename(row.path));
      await mkdir(path.dirname(dest), { recursive: true });
      await rename(target, dest);
      results.quarantined.push(row.path);
    }
  } catch (error) {
    results.failed.push({ path: row.path, error: String(error?.message || error) });
  }
}
if (!asJson) {
  console.log('');
  const prunedFiles = results.prunedMedia.reduce((n, x) => n + x.files, 0);
  console.log(`已删除 ${results.deleted.length} 项 · 已隔离 ${results.quarantined.length} 项 · 瘦身 ${results.prunedMedia.length} 个批次（${prunedFiles} 个媒体文件）· 失败 ${results.failed.length} 项 · 释放 ${humanBytes(freedBytes)}`);
  if (results.quarantined.length) console.log(`隔离位置：${posix(path.relative(root, quarantineRoot))}`);
  for (const row of results.failed) console.error(`失败：${row.path} — ${row.error}`);
} else {
  console.log(JSON.stringify({ freedBytes, ...results }, null, 2));
}
process.exit(results.failed.length ? 1 : 0);
