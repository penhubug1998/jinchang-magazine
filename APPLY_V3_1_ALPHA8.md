# 应用 V3.1-alpha8 Overlay

V3.1-alpha8 以用户本机真实验收通过的 V3.1-alpha7 overlay 为唯一父基线。

父基线 SHA256：

`110906fa3ef3360b93afbcc7cb5d88e0c0bd4f54a2494bf035158ea50a5a4569`

应用后执行：

```bash
npm run verify:core
npm run test:v31-alpha8-browser
npm run final:status
npm run studio:v3 -- --port 4197
```

内部校审数据在 `.v3-review-workspaces/`，属于制作侧数据，不得加入成刊 overlay，也不得冒充 V3.0.0 正式发布门禁证据。
