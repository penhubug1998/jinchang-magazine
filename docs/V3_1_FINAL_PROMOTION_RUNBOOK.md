# V3.1.0 Final Promotion Runbook

当前候选版：`3.1.0-rc.2`
Schema Freeze：`3.1-alpha24`

V3.1.0 Final **不允许靠 UA 模拟、口头确认或旧版本报告晋级**。Final Gate 只接受绑定当前 RC2 的真实 receipt。

## 0. 查看当前状态

```bash
npm run final:v31:status
```

严格模式（任一 Gate 缺失即返回非 0）：

```bash
npm run final:v31:gate
```

## 1. 完整历史媒体 byte-level strict

在包含 `1/assets`、`2/assets` 的完整仓库中合入 RC2 源码后执行：

```bash
npm run test:v31-rc2-media-local
```

通过后自动生成：

```text
reports/v31-final-media-receipt.json
```

receipt 会绑定：

- 51 个历史媒体文件
- 122,533,642 bytes
- 固定 GitHub commit
- `baselines/v3-rc1-media.json` SHA-256
- 文件大小 + Git blob SHA1 strict 结果

不要手工创建该文件。

## 2. Microsoft Edge / macOS Safari / iPhone Safari 实机

在一台可被验收设备访问的可信网络机器运行：

```bash
npm run final:v31:acceptance
```

默认端口 `4186`。终端会显示可访问地址。

分别使用：

1. Microsoft Edge actual binary（Windows / macOS 均可）
2. macOS Safari
3. iPhone Safari

打开验收台，逐项完成 Reader / 翻页 / 目录 / 字号 / TTS / 音乐 / 视频 / 全屏或沉浸 / 恢复状态；iPhone 额外检查横竖屏。

验收台会使用 HTTP 请求的真实 User-Agent 校验浏览器身份：

- Edge 必须包含桌面版 `Edg/`（不可为 `EdgiOS`）
- Mac Safari 必须为真实 Safari/WebKit 且不是 Chrome/Edge
- iPhone Safari 必须为真实 iPhone Safari

通过记录写入：

```text
reports/v3-rc1-device-acceptance.json
```

Final Gate 还会再次检查 UA、人工项目全部通过、`auto.corePass=true` 和 `version=3.1.0-rc.2`。

## 3. 正式 HTTPS：部署 → 校验 → 回滚 → 再部署 → 再校验

先生成当前 RC2 的 release 目录，并确认发布包完整。

正式站点示例：

```bash
npm run deploy:apply -- --issue 001 --target /var/www/jilv.online/jinchang-magazine --confirm
npm run online:check -- --base https://www.jilv.online/jinchang-magazine --issue 001 --strict

npm run deploy:rollback -- --issue 001 --target /var/www/jilv.online/jinchang-magazine --confirm

npm run deploy:apply -- --issue 001 --target /var/www/jilv.online/jinchang-magazine --confirm
npm run online:check -- --base https://www.jilv.online/jinchang-magazine --issue 001 --strict
```

完成上述顺序后生成便携 receipt：

```bash
npm run final:v31:production-receipt -- --issue 001
```

输出：

```text
reports/v31-final-production-receipt.json
```

该脚本会验证第一次部署 receipt、rollback 时间、第二次部署时间、HTTPS online check 时间以及 treeSha256 的一致性。

## 4. 汇总所有 receipt

如果媒体、实机和服务器在不同机器完成，将以下报告复制回同一 RC2 源码目录：

```text
reports/v31-final-media-receipt.json
reports/v3-rc1-device-acceptance.json
reports/v31-final-production-receipt.json
```

然后执行：

```bash
npm run final:v31:gate
```

只有看到：

```text
READY_FOR_V3_1_0_FINAL
```

才允许封版。

## 5. 封版 V3.1.0 Final

```bash
npm run final:v31 -- --confirm
```

该命令会先重新执行严格 Final Promotion Gate。Gate 不全时不会修改版本号。

成功后：

```bash
npm run final:v31:status
npm run check:v3
npm run build:v3
```

并重新生成最终 Full Source / deploy package 与 SHA-256。

## 6. Final 冻结规则

封版前后均保持：

- `v31SchemaVersion = 3.1-alpha24`
- 不增加大功能
- 不改核心数据模型
- P0 = 0
- P1 = 0
- 只允许发布文档、必要阻断 Bug、部署说明与证据更新
