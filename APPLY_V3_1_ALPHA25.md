# V3.1-alpha25 · 发布中心 2.0

## 目标

把现有 build / audit / release / snapshot / rollback 从开发者脚本收束为 Studio 内可操作的发布中心，并正式建立：

```text
issue.json
   ├── Web Reader
   ├── Print PDF
   └── Archive ZIP
```

`issue.json` 仍是唯一事实来源，Web/PDF/ZIP 都是可重复生成的派生产物。本版本不修改期刊 schema，`v31SchemaVersion` 继续为 `3.1-alpha24`。

## 发布中心 UI

顶部“正式发布”现在进入 Publishing Center 2.0。中心统一显示：

- 内容完整度
- 页面健康
- 媒体完整
- 移动端
- 桌面端
- 无障碍
- 链接
- 朗读音频

指标来源于现有 audit、资源清单、TTS 证据、链接检查和浏览器设备回归，不使用虚构分值。正式发布按钮只有在严格门禁满足时才解锁。

发布中心同时提供：

- 刷新状态
- 运行发布前检查
- 生成 Web Reader
- 导出 Print PDF
- 生成 Archive ZIP
- 建立快照
- 回滚快照
- 查看旧版高级 Final Gate
- 正式发布

## Release Readiness

`buildPublicationStatus()` 汇总当前发布证据。核心阻断条件包括：

- issue 状态为 ready / published
- strict audit blocker = 0
- 内容完整度达到阈值
- 页面健康达到阈值
- 媒体完整度 100%
- 链接检查通过
- TTS 朗读资源完整
- mobile Chromium 回归 PASS
- desktop Chromium 回归 PASS

因此“能生成 PDF/ZIP”不等于“允许正式发布”。输出生成能力与正式发布安全门禁是两个层次。

## 三路输出

### 1. Web Reader

构建标准 V3 Reader 成刊目录，保留交互阅读、富文本、Alpha23 Publishing Layout、朗读及媒体能力。

### 2. Print PDF

当前默认 PDF 路径使用 Chromium CDP `Page.printToPDF`，结合出版打印 HTML/Print CSS，并复用 Alpha23 的：

- columns
- column gap
- span
- text flow
- rich text
- publishing rules

PDF 是派生产物，不反向写入 `issue.json`。

后续可增加 Vivliostyle CLI adapter，不改变当前内容模型。

### 3. Archive ZIP

归档包包含：

- Web Reader
- 原始 `issue.json`
- `archive-manifest.json`
- audit 证据（存在时）
- Print PDF（已经生成时）

用于长期归档、交接和离线留存。

## 正式发布

正式发布仍复用既有 release-v3 严格流程：

1. 再次执行发布门禁
2. 建立 pre-publish snapshot
3. 构建正式 release 包
4. 执行原子化发布目录切换逻辑
5. 显式更新 issue 状态为 published

Publishing Center 不会因为用户只点击“生成预览/PDF/ZIP”而自动标记 published。

## 版本保护

发布中心直接接入现有 snapshot / rollback。手工发布前可以建立快照，回滚操作继续沿用既有安全链路。

## Alpha25 额外修复

- 修复 Studio 中重复 `publicationCenterDialog` DOM ID，确保浏览器只存在一个发布中心实例。
- 升级通用 Studio 浏览器边界测试：先检查 Publishing Center 2.0，再继续检查旧 Final Gate。
- 历史 Alpha19–Alpha24 测试的版本判断改为“当前版本不低于被测版本”，功能断言保持不变。
- 保持 Alpha24 Smart Layout、Alpha23 Text Flow、Alpha22.1 RichText、Alpha21 Canvas、Alpha20 Stable ID、Alpha19 Reader ACK 兼容。

## 实际输出验证

使用真实 Studio API 已验证：

- Web Reader 输出成功
- PDF 文件真实生成，测试文件约 1.52 MB
- Archive ZIP 真实生成，包含 Web、issue.json 与发布 manifest

测试期刊 001 当时由于 TTS 证据 `0 / 18` 且设备回归未完成，`canPublish=false`。这是预期的安全阻断行为，说明系统不会把“输出生成成功”误判成“可以正式发布”。

## 回归

通过：

```text
npm run test:v31-alpha25
npm run test:v31-alpha25-browser
npm run test:v31-alpha24
npm run test:v31-alpha24-browser
npm run test:v31-alpha23
npm run test:v31-alpha23-browser
npm run test:v31-alpha221
npm run test:v31-alpha221-browser
npm run test:v31-alpha22
npm run test:v31-alpha22-browser
npm run test:v31-alpha21
npm run test:v31-alpha21-browser
npm run test:v31-alpha20
npm run test:v31-alpha20-browser
npm run test:v31-alpha19
npm run test:v31-alpha19-browser
npm run check:v3
npm run build:v3
npm run test:studio-browser
```

Studio 边界回归覆盖：

- 320 × 740
- 390 × 844
- 768 × 1024
- 1366 × 768
- 1920 × 1080

## 已知非阻断提示

当前 Full Source overlay 不包含历史 `1/assets` 与 `2/assets` 实体媒体目录，因此 `check:v3` / `build:v3` 会提示两条媒体存在性检查跳过。这与 Alpha25 代码无关；合并回完整媒体仓库后会恢复真实资源校验。
