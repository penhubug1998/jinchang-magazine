# APPLY V3.1-alpha20

基于 `jinchang-magazine-v3.1-alpha19-full-source.zip` 开发。

## 本版目标

1. 引入 Page / Block 稳定 ID，并保持旧 issue 自动兼容。
2. 引入 Command Bus，先迁移 Reader Canvas 的关键编辑操作。
3. 拆出 Studio Core 模块，为 Alpha21 Workspace 2.0 与 Inspector 做准备。

## 验收

```bash
npm run test:v31-alpha20
npm run test:v31-alpha20-browser
npm run test:v31-alpha19
npm run test:v31-alpha19-browser
npm run check:v3
npm run build:v3
```

## 下一阶段

Alpha21 将在本版 Core 基础上推进 Canvas Workspace 2.0：Reader 主画布、Context Inspector、Zoom/Fit、选择状态进一步改为稳定 ID。
