// 发布包回归：确保 build 出来的 Reader 带有阅读端应有的能力。
//
// 起因（2026-09-12）：线上第三期加载的 reader.js 是旧版本，导致
// "点击图片放大"和"AI 摘要逐字动效"消失——功能源码都在仓库里，但发布包用了旧文件。
// 这个套件直接构建一期并检查产物，把"发布包必须包含这些能力"变成可执行断言。
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, cp, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const prefix = '.tmp-v3-reader-capabilities-';
const sandbox = await mkdtemp(path.join(root, prefix));
const issueId = '001';

try {
  for (const dir of ['scripts', 'src', 'baselines', 'examples']) {
    await cp(path.join(root, dir), path.join(sandbox, dir), { recursive: true });
  }
  await cp(path.join(root, 'package.json'), path.join(sandbox, 'package.json'));
  // 构建需要该期的源稿；只带 issue.json/assets.json，不复制媒体（media 与本次断言无关）。
  await mkdir(path.join(sandbox, 'issues', issueId), { recursive: true });
  for (const name of ['issue.json', 'assets.json']) {
    await cp(path.join(root, 'issues', issueId, name), path.join(sandbox, 'issues', issueId, name)).catch(() => {});
  }

  const build = spawnSync(process.execPath, ['scripts/build-v3.mjs', '--issue', issueId], { cwd: sandbox, encoding: 'utf8' });
  assert.equal(build.status, 0, `build-v3 失败：${build.stdout}\n${build.stderr}`);

  const target = path.join(sandbox, 'dist-v3', issueId);
  const readerJs = await readFile(path.join(target, 'reader.js'), 'utf8');
  const readerCss = await readFile(path.join(target, 'reader.css'), 'utf8');
  const indexHtml = await readFile(path.join(target, 'index.html'), 'utf8');

  // 1. 阅读端能力必须真的进了发布包（不只是源码里有）
  const required = [
    [readerJs, /function openImageLightbox\s*\(/, '点击图片放大（lightbox）的打开函数'],
    [readerJs, /function closeImageLightbox\s*\(/, 'lightbox 的关闭函数'],
    [readerJs, /img\[data-zoom-src\]/, '图片来源应带上可放大的标记'],
    [readerJs, /stopAiSummaryTyping\s*\(/, 'AI 摘要逐字动效的停止函数'],
    [readerJs, /is-typing/, '逐字动效的状态标记'],
    [readerJs, /articleAiSummaryBtn/, 'AI 摘要按钮']
  ];
  for (const [source, pattern, label] of required) {
    assert.ok(pattern.test(source), `发布包缺少能力：${label}`);
  }

  // 2. 样式也必须一起进包，否则 JS 生效但看起来"没反应"
  for (const [pattern, label] of [[/\.image-lightbox/, 'lightbox 样式'], [/is-typing/, '逐字动效样式']]) {
    assert.ok(pattern.test(readerCss), `发布包缺少样式：${label}`);
  }

  // 3. 页面必须引用到这两个资源，并且带版本串（否则浏览器吃旧缓存）
  assert.ok(/reader\.js\?v=/.test(indexHtml), 'index.html 未给 reader.js 加版本串');
  assert.ok(/reader\.css\?v=/.test(indexHtml), 'index.html 未给 reader.css 加版本串');

  // 4. 构建必须是确定性的：同源再构建一次，reader 产物哈希一致
  const firstHashJs = spawnSync('shasum', ['-a', '256', path.join(target, 'reader.js')], { encoding: 'utf8' }).stdout.split(/\s/)[0];
  const sandbox2 = await mkdtemp(path.join(root, prefix));
  try {
    for (const dir of ['scripts', 'src', 'baselines', 'examples']) {
      await cp(path.join(root, dir), path.join(sandbox2, dir), { recursive: true });
    }
    await cp(path.join(root, 'package.json'), path.join(sandbox2, 'package.json'));
    await mkdir(path.join(sandbox2, 'issues', issueId), { recursive: true });
    for (const name of ['issue.json', 'assets.json']) {
      await cp(path.join(root, 'issues', issueId, name), path.join(sandbox2, 'issues', issueId, name)).catch(() => {});
    }
    const second = spawnSync(process.execPath, ['scripts/build-v3.mjs', '--issue', issueId], { cwd: sandbox2, encoding: 'utf8' });
    assert.equal(second.status, 0, `第二次 build 失败：${second.stderr}`);
    const secondHashJs = spawnSync('shasum', ['-a', '256', path.join(sandbox2, 'dist-v3', issueId, 'reader.js')], { encoding: 'utf8' }).stdout.split(/\s/)[0];
    assert.equal(secondHashJs, firstHashJs, '两次构建的 reader.js 不一致（构建不确定）');
  } finally {
    await rm(sandbox2, { recursive: true, force: true }).catch(() => {});
  }

  const stats = spawnSync(process.execPath, ['-e', `console.log(JSON.stringify({js:${readerJs.length},css:${readerCss.length}}))`], { encoding: 'utf8' }).stdout.trim();
  console.log(`发布包能力回归通过：reader.js ${readerJs.length} 字节 / reader.css ${readerCss.length} 字节，图片放大、AI 摘要逐字动效、样式与版本串齐全，构建可复现。`);
  void stats;
} finally {
  await rm(sandbox, { recursive: true, force: true }).catch(() => {});
}
