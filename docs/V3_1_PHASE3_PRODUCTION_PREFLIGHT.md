# 第三阶段：真实环境试刊预检

第三阶段先使用测试域名和真实单位稿件完成一轮试刊。现有 Reader 页面、期刊模板和页面布局保持不变，本阶段只检查运行环境与发布链路。

## 服务器配置

复制 [`deploy/jinchang-magazine.env.example`](../deploy/jinchang-magazine.env.example)，按服务器实际路径修改，然后以服务用户启动制作中心。`STUDIO_ADMIN_PASSWORD` 至少 12 个字符；`V3_PUBLIC_MAGAZINE_BASE_URL` 必须使用 HTTPS；公开目录必须位于制作源目录之外。

## 预检命令

```bash
npm run production:preflight
npm run production:preflight -- --issue 003
```

预检报告写入 `reports/v3-production-preflight.json`。报告包含：认证配置、HTTPS、公开目录隔离与权限、PDF 浏览器、期刊源稿和引用媒体。失败时命令返回非零状态，便于 systemd 部署或 CI 阻断上线。

## 试刊顺序

1. 复制一期真实稿件到测试环境，保留原有页面结构。
2. 在制作中心执行导入、预览、保存、审计和 PDF 导出。
3. 点击正式发布，再部署公开 Reader；运行 `npm run online:check -- --base https://测试域名/路径 --issue 003 --strict`。
4. 用手机和桌面浏览器打开公开链接，核对目录、图片、音频、二维码和分享链接。
5. 使用快照回滚恢复上一版本，确认失败发布不会破坏已上线版本。

真实试刊完成后，再根据编辑记录安排下一批功能；不以本地 smoke 结果代替 HTTPS、Safari/iOS 和单位真实素材验收。
