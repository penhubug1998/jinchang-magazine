# V3.1-alpha5 Changelog

## 新增：整页版式工作台

- 页面编辑器新增“智能套版”。
- 6 套内容保留式内置版式：单栏聚焦、首屏重点 + 双栏、均衡双栏、左图右文、左文右图、三栏速览。
- 套版前先把已有 container 展平成内容单元，再重新组织为合法 container；正文、图片、视频、文章链接对象均沿用当前页原对象副本，不从模板注入旧内容。
- 大页面按每列 20 个子块、每容器 1–3 列的 V3.1-alpha1 边界自动分批，避免一键套版制造非法页面。

## 新增：我的版式

- `.v3-layout-library/layouts.json` 项目本地持久化，最多 40 个。
- 版式资产只保存 `slot/container` blueprint、container 设计和可选页面 design，不保存正文、媒体路径、文章绑定。
- 支持跨期保存、应用、删除。
- 应用后只写标准 `page.design`、`container` 与既有内容块，因此 Reader 不依赖版式资产库。
- 服务端严格拒绝正文混入槽位、未知字段、非法容器、容器嵌套和越界 design。

## 新增：本地智能版式建议

- 根据内容单元数量、媒体数量、卡片密度、文字长度确定性评分。
- 每页给出 Top 3 建议和可解释原因。
- 不调用外部 AI，不自动改页；用户点击后才执行套版。
- 建议结果仅属于编辑辅助，不是 V3.0.0 正式发布 gate。

## 加固：我的模板

- 保留页面 design。
- 对 container 内的 image/video/articleLink 递归清理旧资源和文章绑定。
- 避免跨期整页模板暗带上一期媒体路径。

## 证据绑定

- 父基线锁定为已本机验收 Alpha4：`f12c39a09aa2a0a0b1410ab37f586cd5a6660985f15c1a6404e20029c75a0c07`。
- V3.0.0 final readiness / gate / release / doctor / next 与 frozen 3.0 schema 继续逐文件 SHA256 锁定。
