import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  exists, narrationPageDigests, narrationPageText, narrationSourceDigest,
  normalizeIssueId, parseArgs, readJson, root, writeJson
} from './lib-v3-production.mjs';
import { snapshotIssue } from './lib-v3-history.mjs';

const args = parseArgs();
const id = normalizeIssueId(args.issue || args.id || args._[0] || '');
if (!id) {
  console.error('用法：node scripts/generate-tts-v3.mjs --issue 003 [--voice zh-CN-XiaoxiaoNeural] [--rate 1]');
  process.exit(2);
}

const issueFile = path.join(root, 'issues', id, 'issue.json');
if (!(await exists(issueFile))) throw new Error(`找不到 issues/${id}/issue.json`);
const issue = await readJson(issueFile);
const assetRoot = path.resolve(root, String(issue.assetSource || ''));
const managedRoot = path.join(root, 'issues', id, 'assets');
if (assetRoot !== managedRoot) {
  throw new Error(`${id} 使用历史/外部 assetSource，不能覆盖生成 TTS；请保留原始媒体或先迁移到本期独立 assets 目录。`);
}
if (!Array.isArray(issue.pages) || !issue.pages.length) throw new Error(`${id} 没有可生成的页面`);

const voice = String(args.voice || 'zh-CN-XiaoxiaoNeural').slice(0, 80);
const rateValue = Number(args.rate || 1);
const rate = Number.isFinite(rateValue) ? Math.max(0.5, Math.min(2, rateValue)) : 1;
const ratePercent = Math.round((rate - 1) * 100);
const rateArg = `${ratePercent >= 0 ? '+' : ''}${ratePercent}%`;
const generator = String(args.bin || process.env.V3_TTS_BIN || path.join(root, '.venv', 'bin', 'edge-tts'));
if (!path.basename(generator).toLowerCase().includes('edge-tts') || !(await exists(generator))) {
  throw new Error('未找到 edge-tts 神经语音生成器；请先安装并配置 .venv/bin/edge-tts。');
}

const token = `${Date.now()}-${process.pid}`;
const staging = path.join(assetRoot, `.tts-staging-${token}`);
const target = path.join(assetRoot, 'tts');
const backup = path.join(assetRoot, '.tts-backups', token);
const originalIssue = JSON.stringify(issue, null, 2);
let swapped = false;

try {
  await mkdir(staging, { recursive: true });
  const generated = [];
  for (const [index, page] of issue.pages.entries()) {
    const number = index + 1;
    const text = narrationPageText(page, issue.articles || {}, { scope: issue.features?.narration?.scope });
    if (!text) throw new Error(`第 ${number} 页没有可朗读正文，未生成不完整发布音频。`);
    const name = `page-${String(number).padStart(2, '0')}.mp3`;
    const file = path.join(staging, name);
    const result = spawnSync(generator, ['--voice', voice, '--rate', rateArg, '--text', text, '--write-media', file], {
      encoding: 'utf8', timeout: 120000, maxBuffer: 512 * 1024
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error((result.stderr || result.stdout || `第 ${number} 页 TTS 退出 ${result.status}`).trim());
    const info = await stat(file);
    if (!info.size) throw new Error(`第 ${number} 页生成了空音频`);
    generated.push({ page: number, bytes: info.size });
  }

  const snapshot = await snapshotIssue(id, 'before-neural-tts');
  if (await exists(target)) {
    await mkdir(path.dirname(backup), { recursive: true });
    await rename(target, backup);
  }
  await rename(staging, target);
  swapped = true;

  issue.features ||= {};
  issue.features.narration = {
    ...(issue.features.narration || {}),
    pattern: 'assets/tts/page-{page}.mp3',
    fallback: 'speechSynthesis',
    continuousDefault: false,
    rate,
    generator: 'edge-neural',
    voice,
    generatedAt: new Date().toISOString(),
    sourceDigest: narrationSourceDigest(issue),
    pageDigests: narrationPageDigests(issue),
    baselinedAt: new Date().toISOString()
  };
  await writeJson(issueFile, issue);
  const sync = spawnSync(process.execPath, [path.join(root, 'scripts', 'sync-assets-v3.mjs'), '--issue', id], {
    cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 512 * 1024
  });
  if (sync.status !== 0) throw new Error((sync.stderr || sync.stdout || '资源清单同步失败').trim());

  console.log(JSON.stringify({
    ok: true, issue: id, pages: generated.length,
    bytes: generated.reduce((sum, item) => sum + item.bytes, 0),
    snapshot: snapshot.id, backup: path.relative(root, backup),
    pattern: issue.features.narration.pattern, voice,
    sourceDigest: issue.features.narration.sourceDigest
  }, null, 2));
} catch (error) {
  await rm(staging, { recursive: true, force: true }).catch(() => {});
  if (swapped) {
    await rm(target, { recursive: true, force: true }).catch(() => {});
    if (await exists(backup)) await rename(backup, target).catch(() => {});
    await writeJson(issueFile, JSON.parse(originalIssue)).catch(() => {});
  }
  throw error;
}
