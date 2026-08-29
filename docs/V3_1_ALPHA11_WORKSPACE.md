# V3.1-alpha11 沉浸式工作区

## 信息架构

制作中心负责“管理”，Workspace 负责“创作”。

制作中心：期刊选择、页面结构、整刊编排、资源、审计、内部校审、交接、正式门禁入口。

Workspace：当前页面信息、内容块、布局、Reader、保存、撤销/重做、页间移动。

这避免把期刊栏、42 页页面列表、全局动作、内容编辑和 Reader 同时挤在一个永久界面中。

## 桌面布局
- 顶部为轻量工作区工具条。
- 下方编辑工具条与布局比例工具条固定在 Workspace 自身结构中。
- 主区左侧 `.block-canvas` 独立滚动。
- 主区右侧 `.live-preview-card` 填满可用高度；Reader viewport 在卡片内部伸展。
- 外层 document 在桌面 Workspace 中保持不滚动，避免 Reader 更新牵动页面位置。

## 移动边界
820px 以下转换为单列页面流，390×844 不允许横向溢出。移动端仍保留内容块优先，Reader 位于编辑区后方，不强制桌面双栏。

## 同步策略
1. 编辑器状态发生变化。
2. 100ms debounce。
3. 若 Reader 已就绪，立即 `postMessage` 最新 issue，不等待服务端写盘。
4. 后台 POST live-preview，用于独立 Reader/新窗口等真实服务路径。
5. Reader `render({preserveScroll:true})`，恢复当前可见页滚动位置。

该链路不改变“正式保存”的边界：即时 Reader 同步与 live-preview 仍不是正式 issue 保存。
