# V3.1-alpha7 Changelog

## 新增：制作看板

- 在 Alpha6 整刊编排台中新增 Production Board。
- 实时派生：需处理、缺页、骨架页、结构漂移、已充实页。
- 支持“全部 / 需处理 / 骨架 / 漂移 / 已充实”筛选。
- 支持从看板或“未纳入计划页面”直接定位 Studio 页面。

## 新增：页面制作画像

- 本地确定性分析占位文字、有效文字量、媒体绑定、文章绑定和卡片密度。
- 阶段：missing / skeleton / content / enriched。
- 明确标注为制作进度画像，不作为 release readiness。

## 新增：计划—页面核对

- 继续使用 Alpha6 的标题 + 类型 + 栏目精确匹配。
- 标题仍匹配但类型/栏目变化时标记“结构漂移”。
- 自动发现没有纳入任何计划的正文页。

## 新增：显式制作状态同步

- 根据当前页面现状建议 planned / in-progress / done。
- hold 不被建议覆盖。
- 用户显式确认后，只更新既有 editorial sidecar status。
- 不写 issue.status，不自动发布，不生成正式门禁证据。

## 兼容与证据绑定

- Reader schema 不变。
- issue.json 无新增必填字段。
- 父基线绑定已本机真实验收 Alpha6：`af4c52aa8844f48ebc8a4cc06aad13ef305f2795d1804bd5074fd36250df14a1`。
- V3.0.0 final readiness / gate / release / doctor / next 与 frozen 3.0 schema 继续逐文件 SHA256 锁定。
