# V3.1-alpha9 Regression

1. 运行 `npm run test:v31-alpha9`，验证 sidecar 服务端边界、问题快照和 V3.0 gate lock。
2. 运行 `npm run test:v31-alpha9-browser`，验证交接轮次、未清零阻止签收、显式复核后签收、退回/重新交接、内部摘要和 390×844 边界。
3. 运行 `npm run verify:core`，保证 V3.0 与 Alpha1–Alpha9 完整回归。
4. 单独运行 `npm run final:status`；Alpha9 的内部签收不得改变正式门禁状态。
