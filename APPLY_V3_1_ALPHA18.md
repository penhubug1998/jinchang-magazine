# V3.1-alpha18 应用说明

V3.1-alpha18 聚焦全局交互修复、页面状态同步和移动端制作中心可用性。

## 主要变化

- Dialog / Drawer 取消按钮统一绕过表单 required 校验；支持取消按钮、Escape 与遮罩关闭。
- Page Rail 的展开/收束控件脱离 section header，收束状态仍明确显示 `› 展开页面`。
- 制作中心 Page Dashboard 的 Reader 恢复浏览交互，可翻页、目录、字号、朗读；Reader 页码变化反向同步当前 Dashboard 页面。
- Workspace 将页面目标保存为 `readerTargetPage`；Reader ready/synced 后重放目标页；Reader 未就绪时使用带目标页的 URL 重载兜底。
- 手机端制作中心改为页面抽屉式导航、横向滚动低频工具条；Workspace 采用 Reader 优先、编辑区其次的布局。

## 数据边界

本版本不新增 issue.json 必填字段，不改变 Reader 发布数据 schema，不改变 issue.status，也不写入 V3.0 正式发布门禁证据。
