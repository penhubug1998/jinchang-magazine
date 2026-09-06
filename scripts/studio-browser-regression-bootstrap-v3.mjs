import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const sourceFile = path.join(root, 'scripts', 'studio-browser-regression-v3.mjs');
const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'jinchang-studio-browser-bootstrap-'));
const tmpFile = path.join(tmpDir, 'studio-browser-regression-v3.mjs');

const legacy = `const [html,css,js,presetJs]=await Promise.all([readFile(path.join(root,'src/studio/index.html'),'utf8'),readFile(path.join(root,'src/studio/studio.css'),'utf8'),readFile(path.join(root,'src/studio/studio.js'),'utf8'),readFile(path.join(root,'src/studio/design-presets.js'),'utf8')]);const presetInline=presetJs.replace('export const DESIGN_PRESETS =','const DESIGN_PRESETS =').replace(/\\nexport const DESIGN_PRESET_IDS[^;]+;\\s*$/s,'\\n');const studioJs=js.replace(\"import { DESIGN_PRESETS } from './design-presets.js';\",presetInline);`;
const current = `const [html,css,js,presetJs]=await Promise.all([readFile(path.join(root,'src/studio/index.html'),'utf8'),readFile(path.join(root,'src/studio/studio.css'),'utf8'),readFile(path.join(root,'src/studio/studio.js'),'utf8'),readFile(path.join(root,'src/studio/design-presets.js'),'utf8')]);const presetInline=presetJs.replace('export const DESIGN_PRESETS =','const DESIGN_PRESETS =');const studioJs=js.replace(/import\\s*\\{\\s*DESIGN_PRESETS(?:\\s*,\\s*DESIGN_PRESET_GROUPS)?\\s*\\}\\s*from\\s*['\"]\\.\\/design-presets\\.js['\"]\\s*;?/,presetInline);if(/from\\s*['\"]\\.\\/design-presets\\.js['\"]/.test(studioJs))throw new Error('Studio browser fixture failed to inline design-presets.js');`;

try {
  const source = await readFile(sourceFile, 'utf8');
  if (!source.includes(legacy)) {
    throw new Error('Studio browser bootstrap contract drifted: legacy preset inline sequence not found');
  }
  const patched = source.replace(legacy, current);
  await writeFile(tmpFile, patched);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tmpFile], {
      cwd: root,
      env: process.env,
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
}
