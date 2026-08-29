# V3.1-alpha23 · Publishing Layout Engine

## 目标

Alpha23 将 V3 Reader 从“页面内组件渲染”推进为“结构化内容 + 派生分页 + 出版约束”。`issue.json` 仍是唯一事实来源，分页碎片只在 Reader 运行时生成，不写回 HTML。

## 新增能力

### 1. 跨页文本流 `textFlow`

同一 `flowId` 的 `textFlow` block 组成连续版面槽位。第一个带 `richText/text` 的 block 提供内容源，后续同 ID block 作为续排槽位。

```json
{
  "type": "textFlow",
  "flowId": "feature-story",
  "richText": { "type": "doc", "content": [] },
  "flow": {
    "capacity": 680,
    "lineChars": 28,
    "orphanLines": 2,
    "widowLines": 2
  }
}
```

分页计划由 `src/reader/layout-engine.js` 计算。RichText mark 在段落拆分时被保留。

### 2. 标题与孤行约束

- RichText heading 默认 `break-after: avoid`。
- 流式分页遇到 heading 会为后续正文预留至少 `orphanLines` 所需容量。
- 段落拆分同时考虑 `orphanLines` 与 `widowLines`。
- 普通正文 CSS 同时设置 `orphans:2; widows:2`，方便后续 Print/Paged Media 共用。

### 3. 页面级多栏

页面支持：

```json
{
  "publishing": {
    "columns": 2,
    "columnGap": 18,
    "balanceColumns": true,
    "columnRule": true
  }
}
```

桌面使用 CSS Multi-column；手机自动退回单栏。

### 4. 出版级 block 约束

block.publishing 支持：

- `keepWithNext`
- `avoidBreak`
- `dropCap`
- `spanAll`
- `wrap: none | left | right`
- `wrapWidth`
- `captionLabel`
- `role`

### 5. 新组件

- `pullQuote`：重点引语，可跨栏。
- `sidebar`：补充说明、延伸阅读、编辑提示。
- `sectionHeading`：跨栏分节标题。
- `textFlow`：跨页文本流槽位。

### 6. Caption

现有 image/video caption 保持兼容，并新增 `publishing.captionLabel`，可形成“图 1 / 图 2 / 视频 1”等出版型标签。

## Studio

- Block Palette 新增跨页文本流、Pull Quote、Sidebar、跨栏标题。
- Page Context Inspector 新增分栏、栏间距、自动平衡。
- Block Context Inspector 新增跨栏、与下段同页、避免断开、首字下沉、图片环绕。
- `textFlow` 额外暴露槽位容量和每行估算参数。

## 示例

`examples/v31-publishing-alpha23/issue.json`

构建后：

`dist-v3/preview-v31-publishing-alpha23/`

## 参考模型

Alpha23 借鉴 CSS Paged Media / Vivliostyle 对 `break-*`、`widows`、`orphans`、`initial-letter`、multi-column 和 `column-span` 的出版语义，但当前 Reader 保持自有 Layout Engine，不直接绑定第三方分页运行时。
