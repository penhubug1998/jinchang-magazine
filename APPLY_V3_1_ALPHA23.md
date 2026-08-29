# APPLY V3.1-alpha23

版本：`3.1.0-alpha.23`

本版为 Publishing Layout Engine 阶段，核心新增跨页文本流、出版约束和页面多栏能力。

## 主要文件

- `src/reader/layout-engine.js`
- `src/reader/reader.js`
- `src/reader/reader.css`
- `src/studio/studio.js`
- `scripts/check-v3.mjs`
- `scripts/build-v3.mjs`
- `scripts/lib-v3-production.mjs`
- `scripts/studio-v3.mjs`
- `scripts/v31-alpha23-smoke-v3.mjs`
- `scripts/v31-alpha23-browser-v3.mjs`
- `examples/v31-publishing-alpha23/issue.json`

## 验证

```bash
npm run test:v31-alpha23
npm run check:v3
npm run build:v3
npm run test:v31-alpha23-browser
npm run test:studio-browser
```

## 兼容说明

旧 paragraph / quote / image / video / container 数据保持可读。没有 `publishing` 与 `flow` 字段的旧刊维持 Alpha22.1 渲染行为。
