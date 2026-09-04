# 应用 V3.1-alpha9 overlay

将本 overlay 覆盖到已通过本机真实验收的 V3.1-alpha8 完整项目根目录，再执行：

```bash
npm run verify:core
npm run final:status
npm run studio:v3 -- --host 127.0.0.1 --port 4198
```

Alpha9 新增的 `.v3-review-handoffs/` 是本地制作 sidecar，不应作为 Reader 或 V3.0 正式发布门禁依赖。
