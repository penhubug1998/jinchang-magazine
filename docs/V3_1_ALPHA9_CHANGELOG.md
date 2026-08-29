# V3.1-alpha9 Changelog

- 新增校审轮次 / 交接签收工作台。
- 新增 `.v3-review-handoffs/<issueId>.json` 制作侧 sidecar。
- 新增未复核问题快照、交接、退回、签收与内部摘要。
- 删除/暂缓问题不自动视为解决；签收要求当前校审项显式 `reviewed`。
- 继续保持 `issue.json`、`issue.status`、Reader 和 V3.0 正式发布证据隔离。
