# V3.0.0 正式版 overlay

1. 将本 overlay 覆盖到完整 `jinchang-magazine` 仓库根目录。
2. 快速验证：`npm run verify:core`
3. 启动 Studio：`npm run studio:v3 -- --port 4185`
4. 查看正式发布门禁：`npm run final:status`
5. 完整浏览器门禁：`npm run verify:v3`
6. 部署前五项 READY 后生成正式包：`npm run final:release -- --issue 003 --confirm`
7. 线上严格校验后封版：`npm run final:seal -- --issue 003 --confirm`

正式部署前必须补齐完整历史媒体、Mac Safari、iPhone Safari、第三期真实材料与正式 HTTPS 校验。版本号为 3.0.0 不会绕过这些门禁。

Safari/iPhone 正式版验收台：`npm run rc:safari`（默认 4186）。
