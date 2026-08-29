# V3.1-RC2 · Final Hardening

## 定位

RC2 继续冻结大功能与核心 Schema，不再扩展 `issue.json`。本版本目标是把 RC1 的“候选版可部署”进一步收紧为“正式版前最后一轮本地候选验证完成，并把必须依赖完整媒体仓库、真实浏览器和正式 HTTPS 服务器的外部门槛显式化”。

- Package: `3.1.0-rc.2`
- `v31SchemaVersion`: `3.1-alpha24`（继续冻结）
- `v3StableVersion`: `3.0.0`

## RC2 主要修正

### 1. 版本证据去硬编码

Studio 页眉不再写死 `alpha26`，改为启动时读取 `/api/health` 的真实 package version，并显示：

- `V3.1 RC2 · Release Candidate`
- 后续 Final 也不需要人工修改旧 Alpha 文案。

Publishing Center 的版本来源也改为 `runtime:/api/health`，避免发布证据仍残留旧版本号。

### 2. RC2 质量 Gate

新增 `test:v31-rc2-quality`：

- Studio / Reader HTML duplicate ID；
- 无文本按钮的 accessible name；
- `target="_blank"` 的 `rel="noopener"`；
- 第一/二期媒体 ALT 与 Caption；
- 生产源码中的旧 `3.1.0-alpha.26` 版本证据。

本次自动检查：P0/P1/P2/P3 均未发现新增问题。

### 3. 媒体完整性分层

RC2 固定 GitHub baseline：

- 仓库：`penhubug1998/jinchang-magazine`
- commit：`e603ad3add77514a6474d0a1d67e34bff7f0e9b4`
- 历史媒体：51 个文件，122,533,642 bytes（约 116.9 MB）
- baseline 使用文件大小 + Git blob SHA1 精确绑定。

当前 Full Source overlay 仍不携带 `1/assets`、`2/assets`，因此：

- GitHub 固定 baseline / manifest Gate：PASS；
- 本地 byte-level strict：`deferred-overlay`；
- Final 前必须在完整媒体仓库执行：

```bash
npm run test:v31-rc2-media-local
```

### 4. 浏览器覆盖分层

RC2 新增：

- Chromium 实际引擎：完整桌面/平板/手机矩阵；
- 第二期 Chromium 手机回归；
- Edge Windows UA 兼容模拟；
- iPhone Safari UA + 无 Fullscreen API 兼容模拟。

所有自动化浏览器回归通过。

注意：UA 模拟不冒充真实浏览器引擎。Final 前仍必须补：

- Microsoft Edge actual binary；
- macOS Safari；
- iPhone Safari。

### 5. RC1 → RC2 真实升级/回滚演练

新增 `test:v31-rc2-deployment`：

- 使用 RC1 实际 Reader 构建 fixture；
- 生成 RC2 构建；
- 原子替换 RC1 → RC2；
- 校验 cache / integrity / SHA；
- 主动篡改 `reader.js` 并确认检测失败；
- receipt rollback；
- 确认恢复 `3.1.0-rc.1` Reader。

Full Source 没有历史视频字节，所以 Range 206 媒体验证从部署 Gate 中拆出，由媒体 strict Gate 单独负责，避免职责混淆。

### 6. 性能 Gate

RC1 的代码体积预算继续冻结，同时增加真实浏览器 Ready 时间：

- Reader initial ready P95：约 169 ms；
- Gate budget：2500 ms；
- Studio / Reader 核心文件继续低于 RC1 冻结预算。

### 7. Production E2E 重新执行

在 `3.1.0-rc.2` 自身版本号下重新执行 Beta1 24 步生产链：

创建 → Word 导入 → 栏目识别 → 自动分页 → 修改文字 → 替换图片 → 调整布局 → Stable ID → 校审 → 签收 → TTS → 严格审计 → 构建 → 五档发布门禁 → Web → PDF → ZIP → 正式发布 → 390px 手机查看 → Snapshot → 修改 → Rollback → 证据复核。

结果：PASS，一次完成。

### 8. Alpha26 → Alpha19 兼容链

- 9 组 Smoke：PASS；
- 9 组 Chromium：PASS；
- 共 18 项。

历史测试只放宽了“必须显示旧 Alpha 页眉文案”的断言，Mobile Studio / Publishing Center / Smart Layout / Publishing Layout / RichText / Canvas / Stable ID / Reader ACK 等功能断言均保留。

## RC2 Local Gate

`reports/v31-rc2-gate.json`：

- Production E2E: PASS
- Quality: PASS
- Media source baseline: PASS
- Browser automated coverage: PASS
- RC1 → RC2 deployment / rollback: PASS
- Runtime performance: PASS
- Alpha19–26 compatibility: PASS
- Schema Freeze: PASS
- P0: 0
- P1: 0

状态：`passed-local-final-hold`

## Final Promotion 仍需完成

RC2 不伪造以下环境证据：

1. 完整仓库历史媒体 byte-level strict；
2. Microsoft Edge actual binary；
3. macOS Safari 实机；
4. iPhone Safari 实机；
5. 正式 HTTPS 服务器 RC2 升级 / online verification / rollback 演练。

完成上述 5 项后，才建议进入 `V3.1.0 Final`。
