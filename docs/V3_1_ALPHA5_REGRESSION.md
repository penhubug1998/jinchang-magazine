# V3.1-alpha5 Regression

## 核心结果

- `npm run test:v31-alpha5`：PASS。
- schema：`c428c1ec4857da17`。
- Alpha1–Alpha4 schema 指纹保持：`f95e1a6caea947d0` / `f796dc7d6bf9f9fc` / `c7a570f2eb26f216` / `96d2686428713c3d`。
- `npm run verify:core`：exit 0。

## Alpha5 smoke 覆盖

- 我的版式 GET/POST/DELETE 真实 Studio API。
- slot 携带正文：400。
- container 嵌套：400。
- page design 越界：400。
- 我的模板 container 内 image/video/articleLink 递归绑定清理。
- 我的模板 page design 保留。
- V3.0 final gate 关键文件 Alpha5 SHA 锁。

## 浏览器覆盖

- Studio 5 档边界回归：320×740、390×844、768×1024、1366×768、1920×1080。
- Alpha2 Reader 5 档样式矩阵：PASS。
- Alpha3 设计复用兼容链：PASS。
- Alpha4 设计资产/一致性兼容链：PASS。
- Alpha5：Top 3 智能建议、6 套内置版式、套版前后内容/媒体签名一致、我的版式保存/应用/删除、390×844 边界：PASS。

## V3.0 正式发布状态

`npm run final:status` 必须单独解释。Alpha5 开发验收时 V3.0.0 仍为 `PENDING 0/6`，部署前 `PENDING 0/5`。任何 Chromium、Studio、smoke 或本地 fixture PASS 都不得自动写成正式 gate PASS。
