# V3.1-alpha21 · Canvas Workspace 2.0 / Context Inspector

Alpha21 在 Alpha20 稳定 ID 与 Command Bus 基础上，把制作工作区从“编辑器 + Reader 预览”推进为“Reader 主画布 + 上下文属性检查器”的出版工作台。

## 1. Reader 主画布与独立缩放

- Reader 继续使用真实发布渲染器，但在 Workspace 中成为主画布。
- 新增 `适合页面 / 适合宽度 / 手动缩放` 三种模式。
- 手动缩放范围 25%–200%，工具栏支持 `− / ＋`，并支持 Ctrl/Cmd + 滚轮。
- 缩放状态与 Reader 设备预设独立保存，不再通过改变设备尺寸模拟缩放。
- `preview-max` 继续提供纯画布最大化，右侧 Inspector 与左侧编辑器都会让出空间。

## 2. Context Inspector

新增右侧上下文属性检查器：

- 未选择组件：显示页面健康、内容节点、媒体数、页面类型、栏目与页面操作。
- 单个文字组件：布局宽度/位置/间距 + 字号/字重/文字对齐。
- 图片/视频：替换媒体、裁切/焦点、填充、比例、视频封面。
- 容器：布局、列间距、手机堆叠策略。
- 多选：批量宽度、位置、文字对齐、复制、删除。

Inspector 底部直接显示稳定 Page/Block ID，便于排查同步问题。

## 3. 选择状态稳定 ID 化

- `selectedBlockIds` 成为 Workspace 选择状态的稳定身份来源。
- 旧 `selectedBlocks` 下标仍保留兼容。
- 组件重排后，选中状态按 Block ID 重新解析，因此不会因为数组位置变化跳到别的组件。
- Reader 的 `canvas-mode` 同时接收 `selectedBlockIds` 和旧下标。

## 4. Page Bridge 稳定 ID 化

Alpha20 解决了 Block 身份，本版继续把页面同步升级为 Page ID：

- Reader 页面 DOM 带 `data-page-id`。
- Reader → Studio 的 page / page-ack / visual-metrics 自动携带 `pageId`。
- Studio → Reader 的可靠换页命令同时发送 `pageId` 与 `pageIndex`。
- 双端优先按 `pageId` 解析，旧页码下标继续作为 fallback。

这使插页、排序后的 Reader ACK/测量结果更不容易落到错误页面。

## 5. Workspace 模块继续拆分

新增：

- `src/studio/workspace/viewport.js`：缩放步进、Fit Page / Fit Width 尺寸计算。
- `src/studio/workspace/inspector.js`：Inspector 类型识别与属性摘要。

V3.0.0 正式发布门禁保持不变，旧 issue 和旧 pageIndex bridge 仍可读取。
