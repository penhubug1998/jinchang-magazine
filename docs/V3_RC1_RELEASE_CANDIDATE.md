# V3.0-RC1 候选发布门禁

RC1 冻结大型功能，仅允许 Bug、兼容、数据一致性、审计、发布和恢复类修复。

## 自动门禁

```bash
npm run verify:core
npm run verify:rc1
```

自动覆盖 Alpha9→Beta2 冻结链、第一/二期 Reader、Studio、内容导入、真实 Reader 联动、14 类 block matrix、Safari-like fallback、RC1 历史媒体 baseline 算法、只读 Safari 验收台和原子部署/篡改检测/回滚演练。

## 完整仓库媒体

在真正包含 `1/assets`、`2/assets` 的仓库执行：

```bash
npm run rc:media
```

RC1 baseline 固定到公开仓库 `penhubug1998/jinchang-magazine` 的 main commit `e603ad3add77514a6474d0a1d67e34bff7f0e9b4`。不仅检查文件名/大小，还计算 Git blob SHA1，能发现同大小内容替换。

## 第三期真实材料试制

RC1 不会用自动生成模拟稿冒充真实第三期。真实 `issues/003` 准备好、媒体/TTS 齐全且 `status=ready` 后：

```bash
npm run rc:third -- --issue 003 --confirm-real-material
```

它依次执行 strict media、strict audit、目标期刊 release check、候选发布包和 deploy readiness。输出 `reports/v3-rc1-third-issue-trial-003.json`。

## 人工/外部 gate

- Mac Safari 实机；
- iPhone Safari 实机；
- 第三期真实材料；
- 完整历史媒体目录；
- 正式 HTTPS 线上缓存/完整性。

统一查看：

```bash
npm run rc:status
```
