# V3.1-alpha18 Changelog

## Fixed

- 修复带 required 字段的 dialog 中“取消”按钮仍触发表单校验的问题。
- 修复 Page Rail 收束后缺少稳定展开入口的问题。
- 修复 Workspace 页面已切换、Reader 仍停留在旧页的异步竞态。
- 修复制作中心 Reader 缩略图完全不可交互的问题。
- 修复窄屏下页面导航和常用操作的横向溢出/触控目标问题。

## Changed

- 制作中心 Reader 作为浏览型 Reader，可以正常翻页并同步 Page Dashboard 当前页，但仍不承担编辑。
- 手机制作中心页面导航采用可展开抽屉；手机 Workspace Reader 排在编辑器之前。
- 顶部低频功能菜单在窄屏下采用可横向滚动的触控工具条。
