# V3.1-alpha3 设计复用模型

## 1. 预设只是一种输入方式

Theme 预设不会在 `issue.json` 中保存 `presetId`。用户选择预设后，Studio 只把已通过 Alpha2 校验边界的标准 token 写入：

```text
accent / paper / text / muted / fontBase / radius / spacing
```

因此期刊文件仍然是自包含数据，不依赖运行时模板包。

## 2. 复制 / 粘贴遵守当前作用域

- Theme 只接受 Theme 字段。
- Page 只接受 Page override 字段。
- Block 只接受 Block override 字段。
- 未知字段、非法颜色、越界数字和非法枚举会在粘贴阶段被拒绝。
- 最终保存时仍由 `scripts/studio-v3.mjs` 对整份 issue 再做服务端校验。

## 3. 批量套用只复制 design

页面批量：

```text
当前 page.design → 左侧已选页面
```

组件批量：

```text
当前 block.design → 本页同 type block
当前 block.design → 整刊同 type block
```

正文、标题、媒体路径、容器结构、文章链接等均不参与复制。

## 4. 设计历史与内容历史分离

Alpha3 的“设计撤销 / 重做”只快照：

- `issue.design`
- 每页 `page.design`
- 每个顶层或容器子块的 `block.design`

如果发生正文编辑、页面增删、组件结构变化等非 design 操作，设计历史会清空。这样可以避免一次样式撤销把刚编辑的正文一起恢复。

## 5. Reader 直达只在 Studio embed 启用

公开 Reader 仍保持普通阅读行为。只有 Studio 内嵌模式会为可设计组件增加定位信息并把点击事件回传给 Studio：

```text
Reader component click
  → pageIndex / blockIndex / optional columnIndex / childIndex
  → Studio openDesignDialog('block', target)
```
