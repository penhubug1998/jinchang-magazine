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
const cssNeedle = `html.replace('<link rel="stylesheet" href="./studio.css">',`;
const cssReplacement = `html.replace(/<link rel="stylesheet" href="\\.\\/studio\\.css(?:\\?[^\"]*)?">/,`;
const scriptNeedle = `.replace('<script type="module" src="./studio.js"></script>',`;
const scriptReplacement = `.replace(/<script type="module" src="\\.\\/studio\\.js(?:\\?[^\"]*)?"><\\/script>/,`;
const runtimeHookNeedle = `await Promise.all([cdp.send('Page.enable'),cdp.send('Runtime.enable')]);`;
const runtimeHookReplacement = `await Promise.all([cdp.send('Page.enable'),cdp.send('Runtime.enable')]);const runtimeErrors=[];cdp.on('Runtime.exceptionThrown',p=>runtimeErrors.push(p.exceptionDetails?.exception?.description||p.exceptionDetails?.text||'runtime exception'));`;
const readyNeedle = `const assert=(c,m)=>{if(!c)throw new Error(m)};assert(studioReady,'Studio did not become ready');`;
const readyReplacement = `const studioDiagnostics=studioReady?null:await evaluate(\`(()=>({ready:window.__V3_STUDIO_READY__===true,body:document.body?.innerText?.slice(0,500)||'',scripts:[...document.scripts].map(s=>({type:s.type,src:s.src||'',text:(s.textContent||'').slice(0,120)})),runtimeErrors:${'${JSON.stringify(runtimeErrors)}'}}))()\`).catch(error=>({diagnosticError:String(error),runtimeErrors}));const assert=(c,m)=>{if(!c)throw new Error(m)};assert(studioReady,\`Studio did not become ready: ${'${JSON.stringify(studioDiagnostics)}'}\`);`;

try {
  const source = await readFile(sourceFile, 'utf8');
  for (const [needle, label] of [
    [legacy, 'legacy preset inline sequence'],
    [cssNeedle, 'Studio stylesheet fixture replacement'],
    [scriptNeedle, 'Studio script fixture replacement'],
    [runtimeHookNeedle, 'Runtime hook'],
    [readyNeedle, 'Studio ready assertion']
  ]) {
    if (!source.includes(needle)) throw new Error(`Studio browser bootstrap contract drifted: ${label} not found`);
  }
  const patched = source
    .replace(legacy, current)
    .replace(cssNeedle, cssReplacement)
    .replace(scriptNeedle, scriptReplacement)
    .replace(runtimeHookNeedle, runtimeHookReplacement)
    .replace(readyNeedle, readyReplacement);
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
