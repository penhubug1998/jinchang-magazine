# V3.0.0 正式发布门禁收口

本阶段不修改 V3.0.0 产品版本号，不新增编辑能力，只增强正式发布证据链和门禁可用性。

## 新增命令

```bash
npm run final:doctor
npm run final:gate -- status
npm run final:gate -- media
npm run final:gate -- devices
npm run final:gate -- third --issue 003
npm run final:gate -- deployment
npm run final:gate -- online --issue 003 --base https://www.jilv.online/jinchang-magazine
```

`final:doctor` 会读取当前六项真实证据并给出唯一推荐下一步，不会修改 gate。

`final:gate` 是统一入口：

- `media`：默认 dry-run；显式 `--confirm` 才允许下载历史媒体，`--repair --confirm` 才覆盖错误历史文件。
- `devices`：只显示当前版本真实设备记录；真正验收仍由 `npm run rc:safari` 完成。
- `third`：默认只做实材预检；只有 `--confirm-real-material` 才执行真实试制。
- `deployment`：只跑本地原子部署/回滚演练。
- `online`：必须提供真实 HTTPS `--base`，并执行 strict 校验。

## 证据失效规则

V3.0.0 正式门禁不再只看“某份报告曾经 PASS”。

- 历史媒体：严格媒体报告通过后，只要 `1/assets`、`2/assets`、对应 issue 或 media baseline 更新，旧 PASS 自动失效。
- 第三期真实试制：报告绑定 `issueSha256` 和试制时间；之后改动 `issue.json` 或资源目录，旧 PASS 自动失效。
- 正式 HTTPS：线上校验绑定本地 `release-v3/<issue>/integrity.json` 的 `treeSha256`；本地 release 变化后旧线上 PASS 自动失效。
- Safari：继续绑定当前 `3.0.0` 版本和真实 Safari UA。

## Studio 门禁面板

Studio 顶部新增“正式发布”入口。面板只读取真实 `final:status`：

- 六项 gate
- READY 计数
- 部署前 READY 计数
- 每项真实证据说明
- 推荐下一步
- 可复制命令

面板不会提供“强制通过”或“跳过实机”的操作。

## 正式封版不变

```text
5/5 部署前 gate READY
  ↓
final:release
  ↓
真实服务器部署
  ↓
HTTPS strict online:check
  ↓
6/6 READY
  ↓
final:seal
```
