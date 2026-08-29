# V3.1 Final Promotion 阶段说明

当前候选版：`3.1.0-rc.2`
Schema：`3.1-alpha24`（冻结）

## 本阶段目标

不增加产品大功能，只把 RC2 到 V3.1.0 Final 的 5 项外部验收从“文档约定”升级成机器可验证的 receipt / Gate 体系。

## 已完成

### 1. Final Promotion Gate

新增：

- `scripts/v31-final-promotion-gate-v3.mjs`
- `npm run final:v31:status`
- `npm run final:v31:gate`

Gate 只接受当前 RC2 的真实证据：

1. RC2 本地候选版 Gate
2. 完整历史媒体 byte-level strict
3. Microsoft Edge actual binary
4. macOS Safari 实机
5. iPhone Safari 实机
6. 正式 HTTPS 部署 → 回滚 → 再部署 → online strict

### 2. 实机验收台升级

原 Safari 验收台升级为 **Final Promotion 实机验收台**：

- Microsoft Edge Desktop
- Mac Safari
- iPhone Safari
- iPad Safari（辅助）

服务端使用实际 HTTP User-Agent 再次校验浏览器身份：

- Edge：必须是桌面 `Edg/`，不能使用 Chrome 或 EdgiOS 冒充
- Mac Safari：Safari/WebKit + Macintosh，排除 Chrome/Edge
- iPhone Safari：Safari/WebKit + iPhone，排除第三方 iOS 浏览器

人工检查项、自动探测、版本号均绑定 `3.1.0-rc.2`。

### 3. 完整媒体 receipt

`test:v31-rc2-media-local` 在真正带有 `1/assets`、`2/assets` 的完整仓库通过后，会自动生成：

`reports/v31-final-media-receipt.json`

receipt 绑定 51 个文件、122,533,642 bytes、固定 GitHub commit，以及媒体 baseline 的 SHA-256。

### 4. 正式生产环境 receipt

新增：

- `scripts/v31-final-production-receipt-v3.mjs`
- `npm run final:v31:production-receipt -- --issue 001`

要求并验证：

`第一次 RC2 部署 < rollback < 第二次 RC2 部署 <= HTTPS online:check`

同时核对 targetRoot、remotePath 与 treeSha256。

### 5. Final 封版锁

新增：

`npm run final:v31 -- --confirm`

只有 Final Promotion Gate 全 READY 才允许把版本从 `3.1.0-rc.2` 改为 `3.1.0`。

封版过程是事务式：改号后立即执行 `check:v3`、`build:v3` 和 Final Gate 复核；任一步失败都会恢复 RC2 版本并删除不完整的 release receipt。

### 6. Runbook

新增：

`docs/V3_1_FINAL_PROMOTION_RUNBOOK.md`

包含完整媒体、Edge/Safari/iPhone 实机、正式 HTTPS 部署/回滚/再部署、receipt 汇总和最终封版命令。

## 当前环境结果

当前执行环境不能访问 GitHub 二进制 blob、没有真实 Edge/Safari/iPhone Safari 引擎，也没有正式服务器写权限，因此不会伪造 Final PASS。

当前 `final:v31:status` 应保持：

`HOLD · 1/6 READY`

已 READY：RC2 本地候选版 Gate。

其余 5 项需要在对应真实环境生成 receipt 后才能晋级 V3.1.0 Final。
