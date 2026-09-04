# V3.1-alpha22.1 应用说明

本版本基于 V3.1-alpha22 Full Source，对 Rich Text Engine 做生产化加固，不改变 `issue.json` 作为唯一事实来源的原则。

## 关键变更

- **Tiptap self-host**：Reader 运行时不再依赖 `esm.sh`、jsDelivr、unpkg 等外部 CDN。
- **本地 vendor 构建**：新增 `npm run vendor:tiptap`，将 Tiptap 3.30.2 打成浏览器 ESM bundle，输出到 `src/reader/vendor/tiptap-runtime.js`。
- **结构化离线 fallback**：本地 Tiptap bundle 不可用时仍可编辑 RichText JSON，不会降级成“只能保存纯文本”。
- **Undo / Redo**：Reader 内支持撤销/重做；Studio 将一次富文本编辑会话合并为一个历史边界，避免每 180ms 快照污染全局历史栈。
- **粘贴清洗**：剥离脚本、事件属性、iframe/embed/media/form 等危险或不受支持内容，仅保留白名单结构和安全文本样式。
- **选区浮动工具条**：选中文字时显示轻量 Bold / Italic / Underline / Link / Highlight 工具条。
- **Bridge 修复**：RichText session 的可序列化元数据与 Reader DOM 引用分离，避免 `postMessage` Structured Clone 错误。
- **Live Preview / Build**：Studio 可安全提供 `/vendor/` 资源；`build:v3` 会递归复制 Reader vendor 目录。

## Tiptap 本地化

当前 Full Source 内置的是安全 placeholder + 结构化 fallback，因此完全离线也能继续编辑。

在有 npm 网络访问的构建环境中执行：

```bash
npm install
npm run vendor:tiptap
npm run build:v3
```

生成的 `src/reader/vendor/tiptap-runtime.js` 与 `tiptap-runtime.manifest.json` 应随站点一并发布。生产 Reader 不需要访问外部 CDN。

## 数据兼容

无需迁移旧 issue：

- `block.richText` 继续保存结构化 JSON。
- `block.text` 继续作为纯文本兼容镜像。
- HTML 只作为运行时 DOM，不写入 `issue.json`。
- Alpha22、Alpha21、Alpha20、Alpha19 数据和工作区链路保持兼容。
