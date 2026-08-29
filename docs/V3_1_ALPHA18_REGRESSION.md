# V3.1-alpha18 Regression

专项覆盖：

1. 新建一期主题为空时点击“取消”，dialog 必须直接关闭且 invalid 事件为 0。
2. Page Rail 收束态展开按钮可见且可点击。
3. 制作中心 Reader 可浏览，Reader 页码消息同步 Studio 当前页。
4. Workspace Reader ready 时切页通过 postMessage 同步；未 ready 时通过 URL page 参数兜底。
5. 390×844 制作中心无 document 横向溢出，页面抽屉可展开。
6. 390×844 Workspace Reader 优先于内容编辑区，Reader 具有可用高度和触控按钮。
7. Studio 320×740、390×844、768×1024、1366×768、1920×1080 边界回归。
8. Alpha1–Alpha18、V3.0 历史链全部回归。

正式 V3.0 状态仍由独立 `npm run final:status` 决定，不使用 Alpha18 开发回归替代正式证据。
