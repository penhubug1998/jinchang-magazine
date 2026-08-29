# V3.0-beta1 Changelog

## 定位

Beta1 进入功能冻结阶段。目标不是继续扩展制作中心功能，而是将 Alpha2～Alpha14 已实现的 Reader、Studio、导入、媒体、TTS、修订和发布能力固定为可回归的生产基线。

## 主要变化

### 1. 统一版本来源

运行时版本统一由 `scripts/lib-v3-production.mjs` 的 `V3_VERSION` 提供。Studio health、审计报告、快照 manifest、发布包和部署 manifest 不再分别硬编码版本。

### 2. 第一/二期冻结 baseline

新增 `baselines/v3-beta1.json`，锁定 001/002 的页数、页面顺序、文章 ID、结构摘要、文章摘要和 TTS 正文指纹。

### 3. 全内容块矩阵

新增 `examples/beta1-matrix/issue.json`：

- 9 类页面类型全部覆盖；
- 14 类内容块全部覆盖；
- 真实 Reader 五档 Chromium 必须全部成功渲染。

### 4. 目标期刊 smoke 修复

`smoke-v3.mjs` 新增 `--issue`。`release-check --issue 003` 的静态 smoke 现在真正验证 003，不再隐式依赖第二期构建产物。

### 5. 发布目录原子替换

`publish-v3.mjs` 不再先删除旧正式发布目录。新流程先完整生成 staging，成功后再原子切换；失败时恢复旧目录。

根级 `index.html`、`catalog.json`、`deploy-manifest.json` 也改为临时文件写完后再 rename，降低写一半的风险。

### 6. 发布/回滚恢复专项

新增 `beta1-recovery-smoke-v3.mjs`，验证：

- 同源连续构建一致；
- 指定快照可恢复；
- 回滚前自动创建安全快照；
- 成功发布生成完整 release；
- 失败发布不破坏上一份 release；
- staging/previous 不残留。
