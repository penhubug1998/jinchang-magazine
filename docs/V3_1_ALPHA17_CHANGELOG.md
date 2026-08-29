# V3.1-alpha17 Changelog

## 信息架构

- Page Editor 管理态改为 Page Dashboard，不再保留缩水版编辑器。
- Page Rail 折叠/展开语义强化，管理态默认折叠以释放横向空间。
- 进入 Workspace 成为单一主路径。

## Workspace

- 50px 沉浸工具栏 + 54px 常用编排栏。
- 工作区模式下隐藏 content-editor-toolbar 与 workspace-layout-toolbar。
- 视图模式移入 `workspaceViewSelect`。
- Reader 预览尺寸/同步/全屏/编辑新窗口改为浮动控制区。
- 保留 25/75、30/70、50/50、纯画布四种布局与分割条。

## Page Dashboard

- Reader 缩略图（只读预览）。
- 版面健康状态。
- 页码 / 内容块 / 媒体 / 页面类型指标。
- 最多 7 项内容概要。
- 复制页、套用版式、版面健康、继续制作快捷操作。

## 数据边界

- `issue.json` schema 不变。
- Page Dashboard 不持久化额外数据。
- V3.0.0 正式门禁逻辑与正式证据文件保持冻结。
