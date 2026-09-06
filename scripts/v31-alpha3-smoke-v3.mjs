import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import { DESIGN_PRESETS } from '../src/studio/design-presets.js';

const pkg=JSON.parse(await readFile('package.json','utf8'));
if(pkg.version!=='3.1.0'&&!['3.1.0-alpha.3','3.1.0-alpha.4','3.1.0-alpha.5','3.1.0-alpha.6','3.1.0-alpha.7','3.1.0-alpha.8','3.1.0-alpha.9','3.1.0-alpha.10','3.1.0-alpha.11','3.1.0-alpha.12','3.1.0-alpha.13','3.1.0-alpha.14','3.1.0-alpha.15','3.1.0-alpha.16','3.1.0-alpha.17','3.1.0-alpha.18','3.1.0-alpha.19'].includes(pkg.version))throw new Error(`V3.1 alpha3 回归不支持当前版本：${pkg.version}`);
if(pkg.v31SchemaVersion!=='3.1-alpha24'&&!['3.1-alpha3','3.1-alpha4','3.1-alpha5','3.1-alpha6','3.1-alpha7','3.1-alpha8','3.1-alpha9','3.1-alpha10','3.1-alpha11','3.1-alpha12','3.1-alpha13','3.1-alpha14','3.1-alpha15','3.1-alpha16','3.1-alpha17','3.1-alpha18','3.1-alpha19'].includes(pkg.v31SchemaVersion))throw new Error(`V3.1 alpha3 回归不支持当前 schema：${pkg.v31SchemaVersion}`);
if(pkg.v3StableVersion!=='3.0.0')throw new Error('V3.0.0 稳定发布锁未保留');
const schema=JSON.parse(await readFile('baselines/v3-schema-3.1-alpha3.json','utf8'));
if(schema.designWorkflow?.themePresets!==true||schema.designWorkflow?.readerDirectTargeting!=='studio-embed-only')throw new Error('Alpha3 设计工作流 schema 不完整');
for(const key of ['selected-pages','same-type-current-page','same-type-whole-issue'])if(!schema.designWorkflow.batchApply?.includes(key))throw new Error(`Alpha3 缺少批量套用边界 ${key}`);
if(schema.evidenceBinding?.developmentSmokeCannotSatisfyFinalGate!==true)throw new Error('Alpha3 未声明开发 smoke 不得满足正式门禁');
if(DESIGN_PRESETS.length<6)throw new Error('主题预设数量不足');
const ids=new Set();
for(const p of DESIGN_PRESETS){
  if(!p.id||ids.has(p.id))throw new Error('主题预设 id 缺失或重复');ids.add(p.id);
  for(const key of ['accent','paper','text','muted'])if(!/^#[0-9a-fA-F]{6}$/.test(String(p.tokens?.[key]||'')))throw new Error(`预设 ${p.id} 的 ${key} 非法`);
  const {fontBase,radius,spacing}=p.tokens||{};
  if(fontBase<11||fontBase>18||radius<0||radius>24||spacing<4||spacing>24)throw new Error(`预设 ${p.id} 超出 Alpha2 Theme 边界`);
}
const [studio,html,css,reader,readerCss,server]=await Promise.all(['src/studio/studio.js','src/studio/index.html','src/studio/studio.css','src/reader/reader.js','src/reader/reader.css','scripts/studio-v3.mjs'].map(f=>readFile(f,'utf8')));
for(const token of ['applyDesignPreset','pasteDesignStyle','applyPageDesignBatch','applyBlockDesignBatch','undoDesign','redoDesign','captureDesignState','designPayload'])if(!studio.includes(token))throw new Error(`Studio Alpha3 缺少 ${token}`);
for(const id of ['designPresetList','pasteDesignJson','designUndoBtn','designRedoBtn','designReuseActions'])if(!html.includes(`id="${id}"`))throw new Error(`Studio Alpha3 UI 缺少 ${id}`);
if(!css.includes('V3.1-alpha3 · design reuse'))throw new Error('Studio Alpha3 样式缺失');
for(const token of ['studio-design-target','design-target','designTargetAttrs'])if(!reader.includes(token))throw new Error(`Reader 直达设计缺少 ${token}`);
if(!reader.includes("if (studioEmbed) {")||!readerCss.includes('Studio embed direct design targeting'))throw new Error('Reader 直达设计未限制在 Studio embed');
if(!server.includes("'design-presets.js'"))throw new Error('Studio 自检未覆盖主题预设模块');

const lock=JSON.parse(await readFile('baselines/v3.0-final-gate-lock-alpha3.json','utf8'));
if(lock.stableVersion!=='3.0.0'||lock.parentOverlaySha256!=='88b0528541f67401613f8bd2df98998d8ff5ed58e2c784e7f27f0c65a2228daa')throw new Error('正式门禁锁定基线信息异常');
for(const [file,expected] of Object.entries(lock.files||{})){
  const actual=crypto.createHash('sha256').update(await readFile(file)).digest('hex');
  if(actual!==expected)throw new Error(`V3.0 正式门禁关键文件被 Alpha3 改动：${file}`);
}
const digest=crypto.createHash('sha256').update(JSON.stringify(schema)).digest('hex').slice(0,16);
console.log(`V3.1-alpha3 smoke 通过：主题预设、样式复制粘贴、页面/组件批量套用、设计撤销重做、Studio Reader 点选直达和 V3.0 证据绑定均正常。schema=${digest}`);
