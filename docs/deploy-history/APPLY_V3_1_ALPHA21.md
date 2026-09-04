# APPLY V3.1-alpha21

基于 `jinchang-magazine-v3.1-alpha20-full-source.zip` 开发。

## 本版目标

1. Reader 升级为 Workspace 主画布，并提供独立 Zoom/Fit。
2. 新增 Context Inspector，按页面/文字/媒体/容器/多选切换属性。
3. Block 选择状态进一步稳定 ID 化，重排不漂移。
4. Page Bridge 增加稳定 `pageId`，页码下标仅作兼容 fallback。

## 验收

```bash
npm run test:v31-alpha21
npm run test:v31-alpha21-browser
npm run test:v31-alpha20
npm run test:v31-alpha20-browser
npm run check:v3
npm run build:v3
```

## 下一阶段

Alpha22 建议进入 Rich Text Engine：先把 paragraph / heading / quote 的正文编辑从裸 `contenteditable` 迁移到结构化富文本内核，同时保持 issue.json 为事实来源。
