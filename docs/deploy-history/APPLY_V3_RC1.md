# V3.0-RC1 overlay

1. 将本增量包覆盖到**完整** `jinchang-magazine` 项目根目录，不要在用户主目录直接运行 npm。
2. 快速自动验证：`npm run verify:core`。
3. Studio 建议另开端口：`npm run studio:v3 -- --port 4179`。
4. 完整仓库媒体：`npm run rc:media`。
5. Mac/iPhone Safari：`npm run rc:safari -- --port 4180`。
6. 第三期真实材料准备好后：`npm run rc:third -- --issue 003 --confirm-real-material`。
7. 部署后执行 `online:check`；最后用 `npm run rc:status -- --strict` 判断是否满足全部 RC1 外部 gate。

本 overlay 不重复包含 `1/assets`、`2/assets` 大型历史媒体，也不会自动部署到服务器。
