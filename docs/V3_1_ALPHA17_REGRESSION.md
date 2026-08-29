# V3.1-alpha17 Regression

Alpha17 专项应覆盖：

- 管理态默认 Page Rail 收束，宽度 < 100px。
- Rail 可显式展开，展开宽度 > 250px，完整页面标题可见。
- 管理态 Page Dashboard 占据主要区域，Reader 缩略图 URL 指向当前 issue/page。
- 1366×768 管理态 `document.scrollHeight <= innerHeight + tolerance`。
- Workspace 顶部沉浸工具栏约 50px，常用编排栏单行约 54px。
- 重复 content-editor-toolbar / workspace-layout-toolbar 在 Workspace 隐藏。
- Reader 画布有效高度 >= 560px（1366×768 Chromium 基线）。
- Studio 五档边界继续通过。
- Alpha1–Alpha16 历史专项继续通过。
- `npm run verify:core` 必须 exit 0；`npm run final:status` 独立记录，不得转换开发 PASS 为正式门禁 PASS。
