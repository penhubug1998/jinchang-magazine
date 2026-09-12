import { readFile, writeFile } from 'node:fs/promises';

const VERSION='3.31.3';
const DIRECT=['@tiptap/core','@tiptap/starter-kit','@tiptap/extension-text-style','@tiptap/extension-highlight','@tiptap/extension-text-align'];

async function text(file){return readFile(file,'utf8')}
async function replace(file,oldValue,newValue){
  let source=await text(file);
  if(source.includes(newValue)) return false;
  if(!source.includes(oldValue)) throw new Error(`P1-13 patch pattern missing in ${file}: ${oldValue.slice(0,120)}`);
  source=source.replace(oldValue,newValue);
  await writeFile(file,source);
  return true;
}

const pkg=JSON.parse(await text('package.json'));
for(const name of DIRECT) pkg.dependencies[name]=VERSION;
pkg.richTextEngine.version=VERSION;
pkg.scripts['test:p1-13']='node scripts/p1-13-dependency-security-smoke-v3.mjs';
await writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');

await replace('src/reader/rich-text.js',
  "const TIPTAP_VERSION = '3.30.2';",
  `const TIPTAP_VERSION = '${VERSION}';`);

await replace('scripts/vendor-tiptap-v3.mjs',
  "const version=pkg.richTextEngine?.version||'3.30.2';",
  "const version=pkg.richTextEngine?.version;\nif(!version){console.error('package.json 缺少 richTextEngine.version，拒绝生成无法绑定版本的 Tiptap vendor。');process.exit(2)}");

await replace('scripts/v31-alpha22-smoke-v3.mjs',
  "for(const dep of ['@tiptap/core','@tiptap/starter-kit','@tiptap/extension-text-style','@tiptap/extension-highlight','@tiptap/extension-text-align'])assert(pkg.dependencies?.[dep]==='3.30.2',`Tiptap dependency missing ${dep}`);\nassert(RICH_TEXT_ENGINE_INFO.name==='Tiptap Core'&&RICH_TEXT_ENGINE_INFO.version==='3.30.2'&&!RICH_TEXT_ENGINE_INFO.htmlIsSourceOfTruth,'engine contract failed');",
  "const tiptapVersion=pkg.richTextEngine?.version;assert(tiptapVersion==='3.31.3',`unsafe Tiptap version ${tiptapVersion}`);\nfor(const dep of ['@tiptap/core','@tiptap/starter-kit','@tiptap/extension-text-style','@tiptap/extension-highlight','@tiptap/extension-text-align'])assert(pkg.dependencies?.[dep]===tiptapVersion,`Tiptap dependency/version mismatch ${dep}`);\nassert(RICH_TEXT_ENGINE_INFO.name==='Tiptap Core'&&RICH_TEXT_ENGINE_INFO.version===tiptapVersion&&!RICH_TEXT_ENGINE_INFO.htmlIsSourceOfTruth,'engine contract failed');");

await replace('scripts/v31-alpha221-smoke-v3.mjs',
  "assert(RICH_TEXT_ENGINE_INFO.name==='Tiptap Core'&&RICH_TEXT_ENGINE_INFO.version==='3.30.2'&&RICH_TEXT_ENGINE_INFO.selfHosted&&RICH_TEXT_ENGINE_INFO.externalCdnFallback===false&&RICH_TEXT_ENGINE_INFO.nativeStructuredFallback,'engine hardening contract failed');",
  "const tiptapVersion=pkg.richTextEngine?.version;assert(tiptapVersion==='3.31.3',`unsafe Tiptap version ${tiptapVersion}`);\nassert(RICH_TEXT_ENGINE_INFO.name==='Tiptap Core'&&RICH_TEXT_ENGINE_INFO.version===tiptapVersion&&RICH_TEXT_ENGINE_INFO.selfHosted&&RICH_TEXT_ENGINE_INFO.externalCdnFallback===false&&RICH_TEXT_ENGINE_INFO.nativeStructuredFallback,'engine hardening contract failed');");
await replace('scripts/v31-alpha221-smoke-v3.mjs',
  "assert(vendorRuntime.TIPTAP_VENDOR_READY===true&&vendorRuntime.TIPTAP_VERSION==='3.30.2','real self-hosted vendor exports missing');",
  "assert(vendorRuntime.TIPTAP_VENDOR_READY===true&&vendorRuntime.TIPTAP_VERSION===tiptapVersion,'real self-hosted vendor exports/version mismatch');");

await replace('scripts/v31-alpha22-browser-v3.mjs',
  "const root=process.cwd(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),assert=(c,m)=>{if(!c)throw new Error(m)};const candidates=",
  "const root=process.cwd(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),assert=(c,m)=>{if(!c)throw new Error(m)};const pkg=JSON.parse(await readFile('package.json','utf8')),tiptapVersion=pkg.richTextEngine?.version;const candidates=");
await replace('scripts/v31-alpha22-browser-v3.mjs',
  "assert(['3.1.0-alpha.22','3.1.0-alpha.22.1','3.1.0-alpha.23','3.1.0-alpha.24','3.1.0-alpha.25','3.1.0-alpha.26','3.1.0-beta.1','3.1.0-rc.1','3.1.0-rc.2'].includes(health.version),`health ${JSON.stringify(health)}`);",
  "assert(health.version==='3.1.0'||['3.1.0-alpha.22','3.1.0-alpha.22.1','3.1.0-alpha.23','3.1.0-alpha.24','3.1.0-alpha.25','3.1.0-alpha.26','3.1.0-beta.1','3.1.0-rc.1','3.1.0-rc.2'].includes(health.version),`health ${JSON.stringify(health)}`);");
await replace('scripts/v31-alpha22-browser-v3.mjs',
  "assert(result.info?.name==='Tiptap Core'&&result.info?.version==='3.30.2'&&!result.info?.htmlIsSourceOfTruth,`info ${JSON.stringify(result)}`);",
  "assert(result.info?.name==='Tiptap Core'&&result.info?.version===tiptapVersion&&!result.info?.htmlIsSourceOfTruth,`info ${JSON.stringify(result)}`);");

await replace('scripts/v31-alpha221-browser-v3.mjs',
  "const root=process.cwd(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),assert=(c,m)=>{if(!c)throw new Error(m)};const candidates=",
  "const root=process.cwd(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),assert=(c,m)=>{if(!c)throw new Error(m)};const pkg=JSON.parse(await readFile('package.json','utf8')),tiptapVersion=pkg.richTextEngine?.version;const candidates=");
await replace('scripts/v31-alpha221-browser-v3.mjs',
  "assert(['3.1.0-alpha.22.1','3.1.0-alpha.23','3.1.0-alpha.24','3.1.0-alpha.25','3.1.0-alpha.26','3.1.0-beta.1','3.1.0-rc.1','3.1.0-rc.2'].includes(health.version),`health ${JSON.stringify(health)}`);",
  "assert(health.version==='3.1.0'||['3.1.0-alpha.22.1','3.1.0-alpha.23','3.1.0-alpha.24','3.1.0-alpha.25','3.1.0-alpha.26','3.1.0-beta.1','3.1.0-rc.1','3.1.0-rc.2'].includes(health.version),`health ${JSON.stringify(health)}`);");
await replace('scripts/v31-alpha221-browser-v3.mjs',
  "const vendorData='data:text/javascript,'+encodeURIComponent(\"export const TIPTAP_VENDOR_READY=false;export const TIPTAP_VERSION='3.30.2';export const Editor=null;export const StarterKit=null;export const TextStyleKit=null;export const Highlight=null;export const TextAlign=null;\");",
  "const vendorData='data:text/javascript,'+encodeURIComponent(`export const TIPTAP_VENDOR_READY=false;export const TIPTAP_VERSION=${JSON.stringify(tiptapVersion)};export const Editor=null;export const StarterKit=null;export const TextStyleKit=null;export const Highlight=null;export const TextAlign=null;`);");

console.log(`P1-13 Tiptap security patch prepared · ${VERSION}`);
