# V3.1-alpha16 Regression

## Alpha16 专项
1. 版本/schema 与 Alpha15 parent SHA 绑定。
2. V3.0 六个关键门禁文件 SHA256 不变。
3. 实际 Studio health=3.1.0-alpha.16，001=18、002=29。
4. Chromium：BroadcastChannel 保存同步、脏稿冲突保护、Reader visual-metrics、Studio canvas-media 写回。
5. 实际 Reader 源码：图片媒体浮条、canvas-media 消息和 visual-metrics 均真实出现。

## 全链
- npm run verify:core
- npm run final:status（必须与开发回归分离）
- Studio 五档、Alpha1/Alpha2 Reader 五档、Alpha3–Alpha16 浏览器专项。

Alpha16 的 smoke/Chromium/Studio PASS 不转换成任何 V3.0.0 正式发布门禁 PASS。
