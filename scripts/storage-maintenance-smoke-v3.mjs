// 存储维护工具回归：预演不动任何文件；执行只删可再生产物、孤儿入隔离区；
// 隔离区回收必须显式 --prune-trash 且只按保留期处理。
//
// 用法：node scripts/storage-maintenance-smoke-v3.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readdir, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createTestWorkspace, removeTestWorkspace } from './lib-v3-test-workspace.mjs';

const dir = await createTestWorkspace('storage-maintenance');
const run = (args = []) => spawnSync(process.execPath, [path.join(dir, 'scripts', 'storage-maintenance-v3.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
const exists = async file => { try { await stat(file); return true } catch { return false } };
const mk = async (rel, bytes = 64) => { const file = path.join(dir, rel); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, 'x'.repeat(bytes), 'utf8'); return file };

try {
  // 源稿：只有 003 是真期刊；999 是历史遗留
  await mk('issues/003/issue.json', 128);
  await mk('dist-v3/003/index.html');
  await mk('dist-v3/999/index.html');
  await mk('dist-v3/preview-alpha9/index.html');
  await mk('release-v3/003/release.json');
  await mk('release-v3/999/release.json');
  await mk('outputs-v3/003/publication-evidence.json');
  await mk('outputs-v3/999/publication-evidence.json');
  for (const name of ['20260101T000000Z-a', '20260102T000000Z-b', '20260103T000000Z-c']) await mk(`.v3-snapshots/003/${name}/issue.json`);
  // 原子替换残留：正式目录还在 → 可删；找不到正式目录 → 只报告
  await mk('release-v3/.003.previous-12345-1/release.json', 128);
  await mk('release-v3/.777.previous-12345-2/release.json', 128);
  const oldTrash = await mk('.v3-trash/issues/006-20260101T000000Z/.deleted.json');
  const freshTrash = await mk('.v3-trash/issues/007-20260913T000000Z/.deleted.json');
  const longAgo = new Date(Date.now() - 200 * 24 * 3600 * 1000);
  await utimes(oldTrash, longAgo, longAgo);
  await utimes(path.dirname(oldTrash), longAgo, longAgo);

  console.log('存储维护回归：');

  // 1) 预演：只报告，不动文件
  const dry = run(['--json']);
  assert.equal(dry.status, 0, `预演失败：${dry.stderr}`);
  const plan = JSON.parse(dry.stdout);
  const categories = new Set(plan.plan.map(x => x.category));
  assert.ok(categories.has('regenerable') && categories.has('orphan') && categories.has('trash'), `预演分类不全：${[...categories]}`);
  assert.ok(plan.plan.some(x => x.path === 'dist-v3/999' && x.action === 'delete'), '孤儿构建产物应标记为删除');
  assert.ok(plan.plan.some(x => x.path === 'release-v3/999' && x.action === 'quarantine'), '孤儿发布包应标记为隔离');
  assert.ok(plan.plan.some(x => x.path === 'dist-v3/003'), 'live 期刊的构建产物也属于可再生产物');
  assert.equal(plan.plan.some(x => x.path.startsWith('release-v3/003')), false, 'live 期刊的发布包绝不能被回收');
  assert.equal(plan.plan.some(x => x.path.startsWith('outputs-v3/003')), false, 'live 期刊的输出/发布证据绝不能被回收');
  assert.equal(plan.plan.some(x => x.path.startsWith('issues/')), false, '源稿目录永远不参与回收');
  for (const file of ['dist-v3/003/index.html', 'dist-v3/999/index.html', 'release-v3/999/release.json', oldTrash]) {
    const target = path.isAbsolute(file) ? file : path.join(dir, file);
    assert.ok(await exists(target), `预演不得改动文件：${file}`);
  }
  assert.ok(plan.totals.regenerable > 0 && plan.totals.orphan > 0 && plan.totals.trash > 0, '预演应给出各类体积');
  const transientRows = plan.plan.filter(x => x.category === 'transient');
  assert.equal(transientRows.length, 2, `原子替换残留应被识别，实际 ${transientRows.length}`);
  assert.ok(transientRows.some(x => x.path === 'release-v3/.003.previous-12345-1' && x.action === 'delete'), '正式目录已就位的残留应可删');
  assert.ok(transientRows.some(x => x.path === 'release-v3/.777.previous-12345-2' && x.action === 'report'), '找不到正式目录的残留只能报告，交给人工');
  console.log(`  预演只报告、不动文件，分类与体积正确 ✓（可回收 ${plan.totals.regenerable + plan.totals.orphan} 字节）`);

  // 2) 执行：可再生产物删除、孤儿进隔离区、live 产物原样保留
  const applied = run(['--apply', '--keep-snapshots', '1']);
  assert.equal(applied.status, 0, `执行失败：${applied.stdout}\n${applied.stderr}`);
  assert.equal(await exists(path.join(dir, 'dist-v3/003')), false, '可再生产物应被删除');
  assert.equal(await exists(path.join(dir, 'dist-v3/999')), false, '孤儿构建产物应被删除');
  assert.equal(await exists(path.join(dir, 'dist-v3/preview-alpha9')), false, '预览产物应被删除');
  assert.equal(await exists(path.join(dir, 'release-v3/999')), false, '孤儿发布包应被移走');
  assert.equal(await exists(path.join(dir, 'release-v3/.003.previous-12345-1')), false, '原子替换残留应被删除');
  assert.ok(await exists(path.join(dir, 'release-v3/.777.previous-12345-2/release.json')), '找不到正式目录的残留必须保留（只报告）');
  assert.ok(await exists(path.join(dir, 'release-v3/003/release.json')), 'live 发布包必须保留');
  assert.ok(await exists(path.join(dir, 'outputs-v3/003/publication-evidence.json')), 'live 发布证据必须保留');
  assert.ok(await exists(path.join(dir, 'issues/003/issue.json')), '源稿必须保留');
  const maintenance = (await readdir(path.join(dir, '.v3-trash', 'maintenance'))).filter(Boolean);
  assert.equal(maintenance.length, 1, `应恰好有一个维护隔离批次，实际 ${maintenance.length}`);
  const batch = path.join(dir, '.v3-trash', 'maintenance', maintenance[0]);
  // 隔离区里按"原类别/期号"分层，避免 release-v3/999 与 outputs-v3/999 互相覆盖
  assert.ok(await exists(path.join(batch, 'orphan', 'release-v3', '999', 'release.json')), `孤儿发布包必须在隔离区里：${JSON.stringify(await readdir(path.join(batch, 'orphan').catch?.(() => [])).catch(() => []))}`);
  assert.ok(await exists(path.join(batch, 'orphan', 'outputs', '999')), '孤儿输出也必须在隔离区里');
  const snapshotsLeft = await readdir(path.join(dir, '.v3-snapshots', '003'));
  assert.deepEqual(snapshotsLeft, ['20260103T000000Z-c'], `应只保留最新快照，实际 ${JSON.stringify(snapshotsLeft)}`);
  assert.ok((await readdir(path.join(batch, 'snapshot'))).length === 1, '超额快照应进隔离区');
  console.log('  执行：可再生产物删除、孤儿与超额快照入隔离区、live 产物与源稿分毫未动 ✓');

  // 3) 隔离区回收：默认不删，显式 --prune-trash 才按保留期处理
  const noPrune = run(['--apply']);
  assert.equal(noPrune.status, 0);
  assert.ok(await exists(oldTrash), '未加 --prune-trash 时不得删除隔离区内容');
  const pruned = run(['--apply', '--prune-trash', '--retention-days', '90']);
  assert.equal(pruned.status, 0, `回收失败：${pruned.stdout}\n${pruned.stderr}`);
  assert.equal(await exists(oldTrash), false, '超过保留期的隔离内容应被回收');
  assert.ok(await exists(freshTrash), '保留期内的隔离内容必须保留');
  console.log('  隔离区：默认只报告，显式 --prune-trash 才按保留期回收，未过期内容保留 ✓');

  // 4) 保留天数必须显式校验：0 / 负数 / 非数字都不能被"静默当成默认值"
  for (const bad of ['0', '-30', 'abc', '90.5']) {
    const r = run(['--retention-days', bad]);
    assert.equal(r.status, 2, `--retention-days ${bad} 应被拒绝，实际 status=${r.status}`);
    assert.match(r.stderr, /retention-days/, `拒绝时应说明原因：${r.stderr.slice(0, 120)}`);
  }
  // 前面那次 --prune-trash 已经把 200 天前那条回收了，这里再造一条用于体积分档断言
  const agedAgain = await mk('.v3-trash/issues/008-20260101T000000Z/.deleted.json');
  await utimes(agedAgain, longAgo, longAgo);
  await utimes(path.dirname(agedAgain), longAgo, longAgo);
  const buckets = run(['--json']);
  const parsed = JSON.parse(buckets.stdout);
  assert.equal(parsed.retentionDays, 90, '默认保留期应为 90 天（仅作建议起点，可任意指定）');
  assert.ok(Array.isArray(parsed.ageBuckets) && parsed.ageBuckets.map(x => x.days).join(',') === '30,90,365', '应给出 30/90/365 天的隔离区体积分档');
  assert.ok(parsed.ageBuckets[0].bytes > 0, '超过 30 天的分档应统计到那条 200 天前的隔离内容');
  assert.equal(parsed.ageBuckets[2].bytes, 0, '超过 365 天的分档应为 0');
  console.log('  保留天数参数显式校验（0 / 负数 / 小数 / 非数字都拒绝），并给出 30/90/365 天体积分档 ✓');

  console.log('存储维护回归通过：预演安全、可再生产物回收、孤儿隔离、隔离区保留期与参数校验均符合预期。');
} finally {
  await removeTestWorkspace(dir);
}
