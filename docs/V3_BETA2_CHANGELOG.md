# V3.0-beta2 Changelog

## 定位
Beta2 不扩展新的页面类型或内容块，目标是用真实第三期生产演练收口浏览器兼容、完整媒体仓库、部署目录和缓存策略，为 RC1 做准备。

## 真实生产演练
新增 `beta2-production-rehearsal-v3.mjs`：

1. 新建 003；
2. 生成并解析 DOCX；
3. 解析 Markdown 长文；
4. 自动分页并组成 10 页演练刊；
5. 加入图片、视频、背景音乐；
6. 补齐逐页 TTS 并建立正文指纹；
7. 严格媒体检查与发布审计；
8. 生成发布包并执行部署完整性校验；
9. 对视频资源发送 Range 请求并要求 206；
10. 修改正文，要求 TTS stale 阻断；
11. 快照回滚后重新通过严格审计；
12. 故意发布失败，并确认最后一份 release 保持完整。

报告：`reports/v3-beta2-production-rehearsal.json`。

## Safari / Edge 兼容收口
- `visualViewport` 改用 `window.visualViewport` 安全访问；
- document fullscreen 同时支持标准 API 与 WebKit API；
- iPhone Safari 视频优先使用 `webkitEnterFullscreen`；
- 页面全屏不可用时回退移动沉浸模式；
- `fullscreenchange` + `webkitfullscreenchange`；
- `dvh` 增加 `vh` fallback；
- `backdrop-filter` 增加 `-webkit-backdrop-filter`；
- Studio 音视频静态服务支持 `Range` / `206 Partial Content`。

Chromium 五档继续代表 Edge/Chrome 引擎回归；另外新增 `--compat` 能力降级测试，主动移除 `visualViewport` 与页面 Fullscreen API，验证 Safari-like fallback。原生 Safari 仍建议在 macOS/iOS 实机做 RC 前验收。

## 缓存与部署
- `dist-v3/<issue>/index.html` 对 Reader CSS/JS 自动追加 `?v=<V3_VERSION>`；
- 发布包新增 `integrity.json`，记录文件 SHA256、体积、缓存分类与整树摘要；
- 根发布目录新增 `nginx-cache-snippet.conf`；
- `deploy-manifest.json` 记录 treeSha256 与缓存策略；
- 新增 `npm run deploy:check -- --issue 003`，发布后校验版本、完整性和部署 manifest；
- HTML/JSON 默认每次重验证，Reader JS/CSS 短缓存，媒体日缓存且必须重验证；媒体替换仍推荐使用新文件名。

## 完整媒体仓库
新增 `npm run media:check`：
- 检查所有 V3 期刊引用媒体存在性；
- 空文件；
- macOS/Linux 大小写路径冲突；
- 严格模式下缺少历史媒体目录直接失败。

Overlay 使用非严格模式；完整仓库/CI 使用 `npm run media:check -- --strict`。
