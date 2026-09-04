# V3.0.0 发布门禁收口工具链

这是 V3.0.0 正式版的非功能性收口增量，版本号仍为 `3.0.0`。

覆盖到完整项目根目录后：

```bash
npm run verify:core
npm run final:doctor
npm run studio:v3 -- --port 4187
```

浏览器打开 `http://127.0.0.1:4187`，顶部“正式发布”可查看六项真实 gate。

优先处理历史媒体：

```bash
npm run final:gate -- media
npm run final:gate -- media --confirm
```

如本地存在与固定 baseline 不一致的历史媒体，默认拒绝覆盖；确认恢复固定历史版本时：

```bash
npm run final:gate -- media --repair --confirm
```

Safari：

```bash
npm run rc:safari
npm run final:gate -- devices
```

第三期：

```bash
npm run final:gate -- third --issue 003
npm run final:gate -- third --issue 003 --confirm-real-material
```

正式 HTTPS：

```bash
npm run final:gate -- online --issue 003 --base https://www.jilv.online/jinchang-magazine
```

任何真实源稿、媒体或 release tree 在 PASS 后再次改变，旧证据会被 `final:status` 自动判为过期。
