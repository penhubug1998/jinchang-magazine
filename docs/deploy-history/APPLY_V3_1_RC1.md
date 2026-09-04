# V3.1-RC1 · Release Candidate Hardening

## 定位

RC1 冻结大功能与核心 Schema，不再扩展 `issue.json`。本版本目标是把 Beta1 的“完整生产链可跑通”提升为“候选正式版可部署、可回滚、可度量、可兼容”。

- Package: `3.1.0-rc.1`
- `v31SchemaVersion`: `3.1-alpha24`（冻结）
- `v3StableVersion`: `3.0.0`

## RC1 新增候选版 Gate

### 1. Production E2E 重新执行

在 RC1 版本号下重新执行 Beta1 的 24 步生产闭环，而不是沿用旧 Beta 报告：

创建新期刊 → Word 导入 → 栏目识别 → 自动分页 → 修改文字 → 替换图片 → 调整布局 → Stable ID → 校审 → 签收 → TTS → 严格审计 → 构建 → 五档发布门禁 → Web → PDF → ZIP → 正式发布 → 手机查看 → Snapshot → 修改 → Rollback → 证据复核。

结果：PASS。

### 2. 真实内容验收

第一期（18 页）与第二期（29 页）使用真实 `issue.json` 做候选版验证：

- 无占位内容；
- 页面/Block 结构正常；
- 390×844 Chromium Reader 回归通过；
- 不修改真实刊物数据。

结果：PASS。

### 3. 部署/升级/回滚演练

新增 `test:v31-rc1-deployment`：

- 使用第一期真实构建产物；
- 写入正式 integrity / deploy manifest / cache policy；
- 部署到独立站点目录；
- 验证新版本替换成功；
- 执行 deployment receipt rollback；
- 验证旧期刊目录和归档首页恢复。

结果：PASS。

### 4. 性能预算冻结

新增 `test:v31-rc1-performance`，防止 RC/Final 阶段代码继续无边界膨胀。

本次基线：

- `studio.js`: 约 326 KB（预算 380 KB）
- Reader JS（reader + rich-text + layout-engine）: 约 95 KB（预算 140 KB）
- Studio CSS: 预算 220 KB
- Reader CSS: 预算 48 KB
- 第一/二期 `issue.json` 均设置候选版预算线

结果：PASS。

## 兼容回归

在 `3.1.0-rc.1` 下重新执行：

- Alpha26 → Alpha19：9 组 Smoke 全通过；
- Alpha26 → Alpha19：9 组真实 Chromium 回归全通过。

覆盖 Mobile Studio、Publication Center、Smart Layout、Publishing Layout/Text Flow、RichText、Canvas Workspace、Stable ID/Command Bus、Reader ACK/Fullscreen。

## 候选版修正

- 历史 Alpha19–26 测试允许 RC1 作为后续兼容版本，但没有放宽功能断言；
- Beta1 Production E2E 改为读取当前 package version，因此可证明完整流程是在 RC1 自身版本下重新跑通；
- 保留 `3.1-alpha24` Schema Freeze，没有给 RC1 增加新的数据字段体系。

## 已知非阻断项

Full Source overlay 仍不包含历史 `1/assets` 与 `2/assets` 实体媒体目录，因此 `check:v3` 会提示两条资源存在性检查跳过。真实媒体完整性应在合并回完整仓库后继续使用原有 strict media gate 验证。

## RC1 Gate

`reports/v31-rc1-gate.json` 汇总以下证据：

- Production E2E: PASS
- Real Content: PASS
- Deployment / Rollback: PASS
- Performance Budget: PASS
- Alpha19–26 Compatibility: PASS
- Schema Freeze: PASS
- check/build: PASS
- P0: 0
- P1: 0

满足继续进入 RC2/正式候选验收的技术条件。
