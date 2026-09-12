import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V3_VERSION, root } from './lib-v3-production.mjs';
const assert=(c,m)=>{if(!c)throw new Error(m)};
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
assert(pkg.version===V3_VERSION,'Beta2 基线：package 与统一版本源不一致');
const [reader,readerCss,studio,build,publish,deployLib]=await Promise.all([
  readFile(path.join(root,'src/reader/reader.js'),'utf8'),readFile(path.join(root,'src/reader/reader.css'),'utf8'),readFile(path.join(root,'scripts/studio-v3.mjs'),'utf8'),readFile(path.join(root,'scripts/build-v3.mjs'),'utf8'),readFile(path.join(root,'scripts/publish-v3.mjs'),'utf8'),readFile(path.join(root,'scripts/lib-v3-deploy.mjs'),'utf8')
]);
assert(reader.includes('window.visualViewport?.addEventListener'),'Reader visualViewport 仍可能触发裸全局兼容问题');
assert(reader.includes('webkitFullscreenElement')&&reader.includes('webkitRequestFullscreen')&&reader.includes('webkitEnterFullscreen'),'Safari/iOS fullscreen fallback 缺失');
assert(reader.includes('webkitfullscreenchange'),'Safari fullscreenchange fallback 缺失');
assert(readerCss.includes('-webkit-backdrop-filter'),'Safari backdrop-filter 前缀缺失');
assert(readerCss.includes('max-height:88vh;max-height:88dvh'),'Reader dvh fallback 缺失');
assert(studio.includes('Accept-Ranges')&&studio.includes("res.writeHead(206"),'Studio 音视频 Range/206 支持缺失');
// b7bce38 之后 asset tag 由 `${V3_VERSION}` 改为 `${V3_VERSION}-${reader 内容 sha256 前 12 位}`：
// nginx 对 reader.js/reader.css 下发 max-age=3600, must-revalidate，只按版本号打标签会让
// "改了代码但没换版本" 的部署在浏览器里看起来没生效。这里改为校验新契约——tag 必须同时绑定
// 版本与内容，且四个 Reader 资源都必须带上该 tag。
assert(build.includes('createHash("sha256")'),'构建产物未按 Reader 内容计算 asset tag');
assert(build.includes('const readerAssetTag = `${V3_VERSION}-${readerTagHash'),'构建产物未加入 Reader 版本 cache-bust');
for(const asset of ['reader.css','reader.js','rich-text.js','layout-engine.js'])assert(build.includes(asset+'?v=${readerAssetTag}'),`构建产物未对 ${asset} 应用 cache-bust`);
assert(publish.includes('writeDeploymentArtifacts')&&publish.includes('nginx-cache-snippet.conf'),'发布包缺少完整性/缓存策略');
assert(deployLib.includes('treeSha256')&&deployLib.includes('must-revalidate'),'部署完整性或缓存策略不完整');
for(const script of ['deployment-readiness-v3.mjs','full-media-check-v3.mjs','beta2-production-rehearsal-v3.mjs'])assert(pkg.scripts&&await readFile(path.join(root,'scripts',script),'utf8'),'Beta2 必需脚本缺失');
const media=spawnSync(process.execPath,[path.join(root,'scripts/full-media-check-v3.mjs')],{cwd:root,encoding:'utf8'});assert(media.status===0,`overlay 媒体非严格检查不应失败\n${media.stdout}\n${media.stderr}`);
console.log('V3 beta2 smoke 通过：Safari/iOS 降级、Range 流媒体、cache-bust、部署完整性与完整媒体检查入口均已固化。');
