# V3.0.0 正式发布操作收口增量

本增量不改变版本号与 frozen schema，只增强剩余真实门禁的执行体验。

## 新增 `final:next`

```bash
npm run final:next
```

它读取当前真实 readiness，只显示当前优先级最高的下一步。不会把 Safari、第三期真实材料或线上 HTTPS 自动标为通过。

安全自动项可显式执行：

```bash
npm run final:next -- --execute
```

目前仅允许自动执行历史媒体补齐、部署/回滚自动演练；遇到真实设备/材料/线上门禁时会拒绝自动化。

## 历史媒体补全增强

```bash
npm run rc:media:hydrate -- --confirm --jobs 4
```

- 默认 3 并发，可用 `--jobs 1..8` 调整。
- 默认每文件失败重试 2 次，可用 `--retries 0..5` 调整。
- 默认请求超时 60 秒，可用 `--timeout <ms>` 调整。
- 每个文件下载后立即按大小 + Git blob SHA1 校验。
- 重复运行只处理缺失/不一致项，已 READY 的文件不会重下。
- 不一致文件仍必须 `--repair --confirm`；修复前原文件进入 `.v3-media-backups/`。

## 建议正式门禁顺序

```bash
npm run final:next
npm run final:doctor
```

依次补齐媒体、Mac Safari、iPhone Safari、第三期真实试制、部署演练与正式 HTTPS。正式发布锁与证据绑定规则保持不变。
