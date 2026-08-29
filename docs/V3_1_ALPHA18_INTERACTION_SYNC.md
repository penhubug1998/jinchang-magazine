# Alpha18 交互与页面同步设计

## Dialog dismissal

所有 `button[value="cancel"]` / `[data-dialog-close]` 统一转换为无校验关闭动作。关闭行为不提交 form，也不会触发 required 校验。

## Workspace → Reader

页面切换的单一目标状态为 `state.readerTargetPage`。

1. `goToPage()` 先更新 Studio 当前页与 URL。
2. Reader 已 ready：立即发送 `page` 消息，并在短延时后补发一次。
3. Reader 未 ready：更新 iframe URL 的 `page=N`，确保加载后落在目标页。
4. Reader 发出 `ready` / `synced` 时，再次重放目标页，避免初始化消息竞态。

## Manager Reader → Dashboard

Page Dashboard Reader 的 `page` 消息会调用 Studio `goToPage()`，因此 Reader 翻页、Dashboard 标题、页面列表 active 状态和 URL 保持一致。

## Mobile

- Page Rail 收束为 54px 左右的抽屉头，展开后显示可滚动页面列表。
- Workspace 先显示 Reader，再显示内容编辑区。
- 核心翻页/保存/导航触控目标保持约 40px 以上。
