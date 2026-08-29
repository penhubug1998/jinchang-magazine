import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { V3_VERSION, exists, normalizeIssueId, readJson, root, writeJson } from './lib-v3-production.mjs';

const SNAPSHOT_ROOT = process.env.V3_SNAPSHOT_ROOT ? path.resolve(process.env.V3_SNAPSHOT_ROOT) : path.join(root, '.v3-snapshots');
const SNAPSHOT_FILES = ['issue.json', 'assets.json', 'README.md'];

function safeLabel(input = '') {
  return String(input).trim().replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}
function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
export async function sha256File(file) {
  const data = await readFile(file);
  return crypto.createHash('sha256').update(data).digest('hex');
}
export async function snapshotIssue(issueInput, label = 'manual', options = {}) {
  const id = normalizeIssueId(issueInput);
  if (!id) throw new Error('缺少 issue id');
  const issueDir = path.join(root, 'issues', id);
  const issueFile = path.join(issueDir, 'issue.json');
  if (!(await exists(issueFile))) throw new Error(`找不到 issues/${id}/issue.json`);
  const issue = await readJson(issueFile);
  const createdAt = new Date().toISOString();
  const name = `${stamp()}-${safeLabel(label) || 'snapshot'}`;
  const target = path.join(SNAPSHOT_ROOT, id, name);
  await mkdir(target, { recursive: true });
  const files = [];
  for (const fileName of SNAPSHOT_FILES) {
    const source = path.join(issueDir, fileName);
    if (!(await exists(source))) continue;
    await cp(source, path.join(target, fileName));
    const info = await stat(source);
    files.push({ name: fileName, bytes: info.size, sha256: await sha256File(source) });
  }
  if (options.includeAssets) {
    const sourceAssets = path.join(root, issue.assetSource || '');
    if (issue.assetSource && await exists(sourceAssets)) {
      await cp(sourceAssets, path.join(target, 'assets'), { recursive: true });
      files.push({ name: 'assets/', copied: true });
    }
  }
  const manifest = {
    version: V3_VERSION, id: name, issue: id, label: String(label || 'manual'), createdAt,
    sourceStatus: issue.status || null, sourceSubtitle: issue.subtitle || '', files,
    includesAssets: Boolean(options.includeAssets)
  };
  await writeJson(path.join(target, 'snapshot.json'), manifest);
  return { ...manifest, path: path.relative(root, target).replaceAll('\\','/') };
}

export async function listSnapshots(issueInput) {
  const id = normalizeIssueId(issueInput);
  const dir = path.join(SNAPSHOT_ROOT, id);
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestFile = path.join(dir, entry.name, 'snapshot.json');
    if (!(await exists(manifestFile))) continue;
    try { output.push(await readJson(manifestFile)); } catch {}
  }
  return output.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function readSnapshotIssue(issueInput, snapshotId) {
  const id = normalizeIssueId(issueInput);
  const safeId = path.basename(String(snapshotId || ''));
  if (!id || !safeId || safeId !== String(snapshotId || '')) throw new Error('快照读取需要合法 issue id 与 snapshot id');
  const source = path.join(SNAPSHOT_ROOT, id, safeId);
  const manifestFile = path.join(source, 'snapshot.json');
  const issueFile = path.join(source, 'issue.json');
  if (!(await exists(manifestFile)) || !(await exists(issueFile))) throw new Error(`找不到快照：${safeId}`);
  const manifest = await readJson(manifestFile);
  if (manifest.issue !== id) throw new Error(`快照期号 ${manifest.issue} 与目标 ${id} 不一致`);
  return { manifest, issue: await readJson(issueFile) };
}

export async function restoreSnapshot(issueInput, snapshotId, options = {}) {
  const id = normalizeIssueId(issueInput);
  if (!id || !snapshotId) throw new Error('回滚需要 issue id 和 snapshot id');
  const source = path.join(SNAPSHOT_ROOT, id, path.basename(snapshotId));
  const manifestFile = path.join(source, 'snapshot.json');
  if (!(await exists(manifestFile))) throw new Error(`找不到快照：${snapshotId}`);
  const manifest = await readJson(manifestFile);
  if (manifest.issue !== id) throw new Error(`快照期号 ${manifest.issue} 与目标 ${id} 不一致`);
  const issueDir = path.join(root, 'issues', id);
  if (!options.noSafetySnapshot) await snapshotIssue(id, `before-rollback-${snapshotId}`);
  for (const fileName of SNAPSHOT_FILES) {
    const snapFile = path.join(source, fileName);
    if (await exists(snapFile)) await cp(snapFile, path.join(issueDir, fileName));
  }
  if (manifest.includesAssets && options.restoreAssets && await exists(path.join(source, 'assets'))) {
    const issue = await readJson(path.join(issueDir, 'issue.json'));
    const targetAssets = path.join(root, issue.assetSource || '');
    if (!issue.assetSource) throw new Error('快照恢复媒体时发现 issue.assetSource 为空');
    await rm(targetAssets, { recursive: true, force: true });
    await cp(path.join(source, 'assets'), targetAssets, { recursive: true });
  }
  return manifest;
}
