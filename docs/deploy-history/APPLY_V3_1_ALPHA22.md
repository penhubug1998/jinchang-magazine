# V3.1-alpha22 应用说明

本版本基于 V3.1-alpha21 Full Source，新增 Rich Text Engine。

## 关键变更

- `src/reader/rich-text.js`：结构化 RichText adapter + Tiptap Core runtime loader。
- `src/reader/reader.js`：Reader 内富文本编辑会话与 Studio Bridge。
- `src/reader/index.html`：项目自有富文本工具栏。
- `src/reader/reader.css`：Tiptap / RichText 编辑态样式。
- `src/studio/studio.js`：`canvas-richtext-edit` 持久化、纯文本兼容保护。
- `scripts/studio-v3.mjs`：live-preview 提供 `rich-text.js`。
- `scripts/build-v3.mjs`：构建时复制并缓存戳 RichText 模块。
- `examples/v31-richtext-alpha22/`：结构化富文本示例刊。

无需手工迁移现有 issue。旧 paragraph / quote 的 `text` 字段继续可读；首次富文本编辑后自动增加 `richText` JSON。
