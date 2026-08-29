# V3.1-alpha3 Regression

## 核心门禁

- `npm run verify:core`：PASS。
- Alpha1 schema：`f95e1a6caea947d0`。
- Alpha2 schema：`f796dc7d6bf9f9fc`。
- Alpha3 schema：`c7a570f2eb26f216`。
- `check:v3` 仍只有 `issues/001/assets.json` / `issues/002/assets.json` 对 overlay 缺少 `1/assets` / `2/assets` 的 2 条非阻断警告。

## Alpha3 浏览器专项

`npm run test:v31-alpha3-browser`：PASS。

覆盖：

- 真实 Studio 服务进程 `/api/health` 版本 `3.1.0-alpha.3`。
- Chromium/CDP 加载原始 Studio 源码和 `issues/001/issue.json` fixture。
- 6 套 Theme 预设。
- 设计撤销 / 重做。
- Block 样式复制 / 粘贴。
- 本页、整刊同类型组件批量套用。
- 已选页面批量套用。
- 原始 Reader HTML/CSS/JS 以 Studio embed 模式运行并点击组件直达设计器。
- 390×844 设计器边界与横向溢出检查。

当前执行环境会把 Chromium 对 `127.0.0.1` 的页面级导航拦截为 `ERR_BLOCKED_BY_ADMINISTRATOR`，因此浏览器 UI 使用 CDP `Page.setDocumentContent` 加载原始源码；Studio 服务健康检查仍由真实本地进程独立完成。该限制不被描述为线上或 Safari 正式验收。

## 既有浏览器回归

- `npm run test:studio-browser`：320×740、390×844、768×1024、1366×768、1920×1080 PASS。
- `npm run test:v31-alpha2-browser`：390×844、412×915、820×1180、1366×768、1920×1080 PASS。

## V3.0 正式锁

Alpha3 smoke 会核对 `baselines/v3.0-final-gate-lock-alpha3.json` 中记录的正式门禁关键文件 SHA256。开发 smoke、fixture browser 或 mock final API 不得满足正式门禁。
