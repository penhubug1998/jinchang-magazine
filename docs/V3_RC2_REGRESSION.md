# V3.0-RC2 Regression

## Core

`npm run verify:core`：PASS。

覆盖 Alpha9→Alpha14、Beta1/Beta1 recovery、Beta2/Beta2 production rehearsal、production、platform、visual editor、studio workflow、RC1 deployment/media baseline，以及 RC2 gate smoke。

Overlay 仍有两条预期非阻断警告：`1/assets`、`2/assets` 未随源码增量包提供。

## RC2 专项

- 媒体 hydrate dry-run：PASS
- 缺失媒体下载：PASS（本地 HTTP fixture）
- 同大小错误媒体默认拒绝覆盖：PASS
- `--repair --confirm` 恢复：PASS
- RC1 Safari 通过记录不继承 RC2：PASS
- RC2 Mac/iPhone 记录 strict gate：PASS
- 第三期 draft/占位预检阻断：PASS
- 第三期 ready/baseline 预检：PASS
- 6 项 readiness current-version binding：PASS
- Chrome/Edge 假装 Mac Safari：HTTP 400 `UA_MISMATCH`：PASS

## Browser

- 001 Reader 五档：PASS
- 002 Reader 五档：PASS
- Studio 320/390/768/1366/1920：PASS
- Alpha13 import：PASS
- Alpha14 live Reader：PASS
- Beta1 block matrix：PASS
- Beta2 Safari-like fallback：PASS
- RC2 Safari acceptance UI 390/1366：PASS

原生 Mac Safari / iPhone Safari 仍必须由真实设备完成，不在自动测试中伪造通过。
