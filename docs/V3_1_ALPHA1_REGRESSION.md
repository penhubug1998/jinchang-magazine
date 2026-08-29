# V3.1-alpha1 回归基线

## 核心
`npm run verify:core` 必须完整通过 Alpha9 → V3.0 final ops → V3.1-alpha1。

## Reader
- 第一刊 18 页五档 viewport。
- 第二刊 29 页五档 viewport。
- V3.0 14 类 block matrix。
- Safari-like fallback。
- V3.1 7 种 layout matrix。

## Studio
320×740、390×844、768×1024、1366×768、1920×1080。
真实操作：添加布局 → 5:5 切三栏 → 列内添加子块 → 编辑子块内容。

## V3.1 专项
`npm run test:v31-alpha1-browser` 必须验证：
- 7 种布局均以 Grid 渲染；
- 列数正确；
- 390/412 手机默认堆叠单栏；
- 示例图文资源可正常加载。
