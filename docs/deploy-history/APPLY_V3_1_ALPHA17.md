# V3.1-alpha17 · Reader 最大化 / 页面控制台

父基线：V3.1-alpha16 Full Source（SHA256 `3335f8bb5f4cc4f55716f4fa20b759b1afd5096f9f1664f742a293cf572f7604`）。

## 主要变化

- Workspace 顶部压缩：隐藏重复的“内容块”标题行和独立工作区模式行；视图切换并入常用编排栏。
- Reader 控件浮动到画布右上角，隐藏重复标题/状态行，让真实 Reader 占用主要垂直空间。
- 制作中心页面 Rail 默认收束；折叠状态提供明确 `›` 展开入口，展开后保留搜索、多选、批量操作和完整页面标题。
- 制作中心原大空白区改为 Page Dashboard：真实 Reader 缩略图、版面健康、页码/内容块/媒体/类型、内容概要和快速动作。
- 制作中心只保留 Dashboard 一个“进入工作区”主 CTA；完整编辑仍只在 Workspace 内进行。
- 未新增 issue.json 必填字段，不增加 Reader 运行时依赖，不改变 V3.0 正式门禁。

## Alpha17 验收重点

1. 1366×768 Workspace 顶部 chrome 不应超过两层，Reader 可用高度显著高于 Alpha16。
2. 制作中心页面 Rail 折叠后必须有明确展开按钮；展开后页面搜索与批量选择仍可用。
3. 制作中心 document 不出现长滚动；右侧 Page Dashboard 填满管理区域。
4. Page Dashboard 缩略图只负责查看，排版/正文/媒体编辑必须进入 Workspace。
5. Alpha16 媒体直编/多窗口同步/版面健康、Alpha15 原地文字编辑、Alpha13 动态导入继续兼容。
