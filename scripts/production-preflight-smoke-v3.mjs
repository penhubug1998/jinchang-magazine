import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd(); const tmp = await mkdtemp(path.join(os.tmpdir(), 'jinchang-preflight-'));
try {
  const report = path.join(tmp, 'report.json');
  const baseEnv = { ...process.env, STUDIO_ADMIN_PASSWORD: 'a-secure-test-password', V3_PUBLIC_MAGAZINE_ROOT: root, V3_PUBLIC_MAGAZINE_BASE_URL: 'https://magazine.example.test' };
  let result = spawnSync(process.execPath, ['scripts/production-preflight-v3.mjs', '--report', report], { cwd: root, env: baseEnv, encoding: 'utf8' });
  assert.notEqual(result.status, 0); let body = JSON.parse(await readFile(report, 'utf8')); assert.equal(body.ok, false); assert(body.errors.some(x => x.includes('公开目录不能位于制作源目录内')));
  const publicRoot = path.join(tmp, 'public'); await mkdir(publicRoot); result = spawnSync(process.execPath, ['scripts/production-preflight-v3.mjs', '--issue', '001', '--report', report], { cwd: root, env: { ...baseEnv, V3_PUBLIC_MAGAZINE_ROOT: publicRoot, V3_PUBLIC_MAGAZINE_BASE_URL: 'http://magazine.example.test' }, encoding: 'utf8' });
  assert.notEqual(result.status, 0); body = JSON.parse(await readFile(report, 'utf8')); assert(body.errors.some(x => x.includes('必须是 HTTPS'))); assert(body.checks.some(x => x.name === 'issue:001:json' && x.ok)); assert(body.checks.some(x => x.name === 'issue:001:media' && x.ok));
  console.log('生产环境预检测试通过：目录隔离、HTTPS、密码、浏览器和期刊媒体边界均可被检查。');
} finally { await rm(tmp, { recursive: true, force: true }); }
