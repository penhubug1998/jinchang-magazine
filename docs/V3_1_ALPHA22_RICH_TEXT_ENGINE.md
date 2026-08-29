# V3.1-alpha22 Rich Text Engine 设计说明

## 分层

- **Tiptap Core / ProseMirror**：选区、命令、Schema、Undo 基础能力。
- **Reader Toolbar**：项目自有 UI，只调用 Tiptap command chain。
- **RichText Adapter**：legacy text ↔ Tiptap JSON、纯文本镜像、安全 HTML renderer。
- **Studio Bridge**：通过 `canvas-richtext-edit` 和 stable blockId 持久化。
- **issue.json**：唯一事实来源。

## 为什么不存 HTML

HTML 适合作为渲染结果，不适合作为出版数据模型。结构化 JSON 可以稳定承载 heading/list/quote/mark/attrs，并且后续更容易实现评论、AI 修改、Diff、跨端编辑和出版级分页。

## 第一阶段 Schema

Nodes: `doc`, `paragraph`, `heading`, `bulletList`, `orderedList`, `listItem`, `blockquote`, `text`, `hardBreak`。

Marks/Attrs: `bold`, `italic`, `underline`, `link`, `highlight`, `textStyle.color`, `textStyle.backgroundColor`, `textStyle.fontSize`, `textAlign`。

## 下一步

Alpha23 可在此基础上继续做选区 Bubble Toolbar 优化、结构化 Undo/Redo 合并、粘贴清洗、跨 paragraph 选择、快捷键提示，以及出版级 Text Flow / pagination。
