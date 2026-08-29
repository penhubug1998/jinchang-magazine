# V3.1-alpha11 Changelog

## 沉浸式 Workspace
- 新增 `/workspace/` 独立编辑路由，可通过 `issue` 与 `page` 查询参数直达期刊与页码。
- 制作中心增加“进入工作区”；返回时保留当前期号与页码上下文。
- Workspace 隐藏全局侧栏、顶栏、期刊元数据管理区和常驻页面树。
- 当前页编辑与 Reader 形成桌面双栏工作面，默认约 50:50，可沿用已有编辑/预览分栏偏好。
- 页面导航改为上一页/下一页 + 临时页面抽屉，不长期占用编辑宽度。

## 页面信息块
- 原独立 PAGE INFO 大卡片移入 `.block-canvas`，成为内容编辑序列中的第一个折叠信息块。
- 导航标题、页面类型、栏目归属、页内眉题、主标题等字段继续写回原页面字段，不改变 issue schema。
- 默认折叠，只显示页面摘要，减少第一屏垂直占用。

## Reader 同步
- 普通编辑先向已就绪 Reader iframe 发送最新 issue，再异步持久化 live-preview，降低输入后等待感。
- 普通编辑不重建 Reader iframe。
- 预览设备尺寸切换仅改变容器/viewport，不重载 Reader。
- Reader 在 issue 热更新时记录并恢复可见页 `.page-scroll`，避免刷新后跳回顶部。
- 同步 debounce 从 180ms 收敛为 100ms。

## 子路径与服务端
- Studio 服务显式支持 `/workspace`、`/workspace/` 及 workspace 下 Studio 静态资源。
- 继续继承 Alpha10 Full Source R1 的 `/new-jc-magazine-admin/` 子路径感知与工程根目录修复。

## 兼容性
- `v3StableVersion` 仍为 `3.0.0`。
- 无新增 required issue 字段。
- V3.0 正式门禁关键脚本保持证据锁。
