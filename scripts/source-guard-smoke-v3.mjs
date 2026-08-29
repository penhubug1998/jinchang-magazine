import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

const root = process.cwd();
const sandbox = path.join(root, '.tmp-v3-source-guard');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function copyRuntime() {
  await mkdir(path.join(sandbox, 'scripts'), { recursive: true });
  await mkdir(path.join(sandbox, 'src'), { recursive: true });
  await mkdir(path.join(sandbox, 'issues', '001'), { recursive: true });
  for (const file of [
    'lib-v3-production.mjs', 'lib-v3-history.mjs', 'lib-v3-import.mjs',
    'lib-v3-publication.mjs', 'lib-v3-catalog.mjs', 'lib-v3-deploy.mjs',
    'new-issue-v3.mjs', 'sync-assets-v3.mjs', 'studio-v3.mjs'
  ]) await cp(path.join(root, 'scripts', file), path.join(sandbox, 'scripts', file));
  await cp(path.join(root, 'src', 'studio'), path.join(sandbox, 'src', 'studio'), { recursive: true });
  await cp(path.join(root, 'src', 'reader'), path.join(sandbox, 'src', 'reader'), { recursive: true });
  await cp(path.join(root, 'package.json'), path.join(sandbox, 'package.json'));
}

const issue = {
  id: '001', label: '第一期', publication: '源稿保护测试', publisher: '测试单位',
  subtitle: '初始源稿', engine: 'v3', status: 'draft', assetSource: 'issues/001/assets',
  theme: 'classic-red', features: {}, articles: {},
  pages: [{ type: 'cover', navTitle: '封面', title: '源稿保护测试', blocks: [] }]
};

await rm(sandbox, { recursive: true, force: true });
await copyRuntime();
await writeFile(path.join(sandbox, 'issues', '001', 'issue.json'), JSON.stringify(issue, null, 2));

const port = await freePort();
const child = spawn(process.execPath, [path.join(sandbox, 'scripts', 'studio-v3.mjs'), '--port', String(port)], {
  cwd: sandbox, stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '';
child.stdout.on('data', (data) => { logs += data; });
child.stderr.on('data', (data) => { logs += data; });
const base = `http://127.0.0.1:${port}`;

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
    await sleep(50);
  }
  assert(ready, `source guard service did not start: ${logs}`);

  let response = await fetch(`${base}/api/issues/001/source-status`);
  assert(response.ok, 'source status route should be available');
  const before = await response.json();
  assert(/^[a-f0-9]{64}$/.test(before.fingerprint), 'source status must expose a SHA-256 fingerprint');

  response = await fetch(`${base}/api/issues/001/source-export`);
  assert(response.ok, 'source export route should be available');
  const exported = await response.json();
  assert(exported.issue.id === '001' && exported.source.fingerprint === before.fingerprint, 'source export must bind to current source fingerprint');

  const changed = structuredClone(issue);
  changed.subtitle = '服务器已更新';
  response = await fetch(`${base}/api/issues/001`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ issue: changed, sourceFingerprint: before.fingerprint })
  });
  assert(response.ok, 'save with current fingerprint should succeed');
  const saved = await response.json();
  assert(saved.source?.fingerprint && saved.source.fingerprint !== before.fingerprint, 'save should return the refreshed source fingerprint');

  const stale = structuredClone(issue);
  stale.subtitle = '旧窗口覆盖尝试';
  response = await fetch(`${base}/api/issues/001`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ issue: stale, sourceFingerprint: before.fingerprint })
  });
  assert(response.status === 409, 'stale source fingerprint must be rejected');
  const conflict = await response.json();
  assert(conflict.code === 'SOURCE_DRIFT', 'stale source must return SOURCE_DRIFT');

  const receipt = JSON.parse(await readFile(path.join(sandbox, '.v3-source-ledger', '001', 'latest.json'), 'utf8'));
  assert(receipt.fingerprint === saved.source.fingerprint && receipt.reason === 'studio-save', `latest source receipt mismatch: ${JSON.stringify({ receipt, saved: saved.source })}`);
  console.log('V3 source guard smoke 通过：源状态、源稿导出、保存回执和旧窗口覆盖拦截均正常。');
} finally {
  child.kill('SIGTERM');
  await sleep(120);
  await rm(sandbox, { recursive: true, force: true });
}
