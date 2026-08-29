# V3 浏览器兼容基线（RC1）

## 自动回归

- Chrome / Edge Chromium 引擎：390×844、412×915、820×1180、1366×768、1920×1080；
- Studio：320×740、390×844、768×1024、1366×768、1920×1080；
- Safari-like capability fallback：在 Chromium 中主动移除 `visualViewport` 和页面 Fullscreen API，验证 Reader 仍可启动、触控翻页并进入移动沉浸模式。

## Safari 专项处理

Safari/iOS 相关实现包括 WebKit fullscreen、原生视频 fullscreen、`-webkit-backdrop-filter`、`vh` fallback、`-webkit-overflow-scrolling`、`-webkit-mask-image` 与 HTTP Range 流媒体。

Beta2 自动测试环境没有原生 Safari，因此不能把 capability fallback 等同于 Safari 实机结果。RC1 使用 `npm run rc:safari` 在 macOS Safari 和至少一台 iPhone Safari 上执行：封面、双页/单页、拖拽翻页、目录、字号、文章弹窗、视频播放/拖动/全屏、TTS fallback、Studio 真实 Reader 联动。

## 最低目标

正式 V3.0 目标为当前主流 Edge/Chrome/Safari。对于过旧、缺少 `<dialog>` 等基础 Web API 的浏览器，不保证制作中心完整能力；Reader 应尽量保持可读和可翻页。
