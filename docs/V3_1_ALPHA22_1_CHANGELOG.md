# V3.1-alpha22.1 Changelog

## 定位

Alpha22.1 是 Rich Text Engine 的生产加固版本，重点不是增加更多格式按钮，而是让 Alpha22 的结构化编辑在断网、粘贴复杂内容、频繁输入和全局撤销场景下更可靠。

## 新增

### 1. Self-hosted Tiptap Runtime

- Reader 取消外部 CDN runtime 依赖。
- 新增 `src/reader/vendor/` 自托管目录。
- 新增 `scripts/vendor-tiptap-v3.mjs` 与 `npm run vendor:tiptap`。
- 生成 bundle 时附带 SHA-256 manifest，便于部署核验。

### 2. Structured Native Fallback

当自托管 Tiptap bundle 尚未生成或加载失败时：

- 仍保留 RichText JSON 数据模型；
- 仍支持常用 inline/block 格式；
- 编辑结果继续写回 `richText` + `text` 镜像；
- 不依赖公网恢复编辑能力。

### 3. Undo / Redo 合并

- Reader 工具栏增加 Undo / Redo。
- 编辑中的高频 snapshot 继续用于草稿和同步，但 `recordHistory=false`。
- 编辑结束时以 `sessionId` 形成一次 Studio 历史边界。
- 避免输入几十个字产生几十个全局撤销节点。

### 4. Paste Sanitizer

粘贴入口统一进行清洗：

- 删除 script/style/iframe/object/embed/svg/math；
- 删除 image/video/audio/source/form/input/button 等非正文元素；
- 删除 `on*` 事件、class/id/data-* 等非必要属性；
- URL 和局部 style 走安全白名单。

### 5. Selection Bubble

正文存在非折叠选区时显示浮动工具条，提供：

- Bold
- Italic
- Underline
- Link
- Highlight

完整格式仍保留在项目自有 Rich Text 主工具栏中。

## 修复

- RichText session 元数据不再混入 DOM Element，避免跨 iframe `postMessage` 的 structured-clone 错误。
- Offline fallback 不再把结构化正文误降级为纯文本。
- RichText 编辑过程中不会持续污染 Studio 全局 history。

## 回归

通过 Alpha22.1、Alpha22、Alpha21、Alpha20、Alpha19 的 Smoke 与 Chromium 回归，以及 `check:v3`、`build:v3`。
