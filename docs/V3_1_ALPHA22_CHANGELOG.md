# V3.1-alpha22 · Rich Text Engine

## 目标

将 Reader 中基于原生 `contenteditable` 的整块纯文本编辑，演进为以 Tiptap Core 为编辑内核、项目自有 UI 为交互层、`issue.json` 结构化 JSON 为唯一事实来源的富文本编辑系统。

## 已完成

- 接入 Tiptap Core 3.30.2（Headless），不引入 Tiptap UI 套件。
- Reader 自有浮动工具栏支持：paragraph、heading、bold、italic、underline、link、bullet/ordered list、quote、text color、highlight、text align、font-size。
- `paragraph` / `quote` 支持 `richText` JSON；旧 `text` 自动转换为 paragraph doc，旧刊无需迁移即可阅读。
- 富文本提交通过 `canvas-richtext-edit` + stable `blockId` 回写 Studio。
- `block.text` 继续保存纯文本镜像，供朗读、搜索、摘要和旧版本兼容；真正的局部样式保存在 `block.richText`。
- HTML 仅用于渲染，不写入 issue 数据。
- 左侧旧纯文本编辑器在 richText 生效后自动锁定，避免 `text` / `richText` 双事实源；用户可显式“转为纯文本”。
- Tiptap 网络运行时不可达时保留原生 contenteditable fallback；fallback 修改会显式回落到纯文本模式，避免旧 RichText 覆盖新文字。
- 新增 `examples/v31-richtext-alpha22` 示例刊。
- live-preview 新增 `rich-text.js` 路由；build 会携带模块并注入版本缓存戳。

## 数据示例

```json
{
  "type": "paragraph",
  "text": "纯文本镜像",
  "richText": {
    "type": "doc",
    "content": [
      {
        "type": "paragraph",
        "content": [
          {"type":"text","text":"局部粗体","marks":[{"type":"bold"}]}
        ]
      }
    ]
  }
}
```

## 兼容策略

1. 无 `richText`：继续按旧 `text` 渲染。
2. 首次富文本编辑：生成 `richText`，同步更新 `text` 镜像。
3. 有 `richText`：Reader 优先渲染结构化 JSON。
4. 用户明确转为纯文本：移除 `richText`，保留镜像文字。

## 验收

- `npm run test:v31-alpha22`
- `npm run test:v31-alpha22-browser`
- `npm run test:v31-alpha21-browser`
- `npm run test:v31-alpha20-browser`
- `npm run test:v31-alpha19-browser`
- `npm run check:v3`
- `npm run build:v3`
