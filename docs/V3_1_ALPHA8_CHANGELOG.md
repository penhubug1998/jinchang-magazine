# V3.1-alpha8 Changelog

- 新增内部校审台与 `.v3-review-workspaces` sidecar。
- 现有自动审计 findings 只读汇入，可显式转成人工校审项。
- 支持人工问题重要性、页码定位、待处理 / 已复核 / 暂缓、复核备注。
- 自动 finding 消失仅作提示，不自动篡改人工复核状态。
- 服务端拒绝未知字段、跨期 issueId、非法状态/重要性和越界页码。
- 保持 `issue.json`、`issue.status`、Reader schema 与 V3.0.0 正式门禁隔离。
