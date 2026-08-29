# V3.1-alpha10 Regression

1. `npm run test:v31-alpha10`：版本基线快照、只读 snapshot issue API、handoff sidecar 新字段边界、issue.json/issue.status 隔离、V3.0 gate lock。
2. `npm run test:v31-alpha10-browser`：确认交接建基线、差异展示、页面定位、显式核对、核对失效、签收阻断/通过、390×844 边界。
3. `npm run verify:core`：V3.0 全链 + Alpha1–Alpha10。
4. `npm run final:status`：必须独立记录真实正式门禁状态，开发 smoke 不可替代。
