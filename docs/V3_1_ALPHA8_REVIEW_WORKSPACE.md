# V3.1-alpha8 内部校审台 / 问题闭环

## 1. 目标

Alpha8 不替换既有 V3 发布审计中心，而是在日常审计与人工校对之间增加制作侧问题闭环：自动审计 finding 继续只读生成，人工问题和复核状态存入独立 sidecar。

## 2. 数据隔离

内部校审单保存到 `.v3-review-workspaces/<issueId>.json`。它不写 `issue.json`、不修改 `issue.status`、Reader 不读取，也不会产生 `final:status` 所需的任何正式证据。

## 3. 自动审计桥接

- 复用现有日常审计；
- findings 在校审台中只读展示；
- 用户可以显式把某条 finding 纳入人工校审；
- 自动 finding 后续消失时，校审台显示“自动问题已消失”，但不会自动把人工项标成已复核。

## 4. 人工校审项

每项包含标题、分类、重要性、状态、页码和复核备注。状态仅有 `open / reviewed / hold`；“已复核”只表示制作侧人工闭环。

## 5. 正式发布边界

Alpha8 的自动/人工校审 PASS 不能满足 V3.0.0 六项正式发布门禁。正式状态继续只由 `npm run final:status` 和真实证据决定。
