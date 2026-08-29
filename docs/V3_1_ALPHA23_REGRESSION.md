# V3.1-alpha23 Regression

已通过：

- `npm run test:v31-alpha23`
- `npm run test:v31-alpha23-browser`
- `npm run check:v3`
- `npm run build:v3`
- `npm run test:studio-browser`
- `npm run test:v31-alpha22-1`
- `npm run test:v31-alpha22`
- `npm run test:v31-alpha21`
- `npm run test:v31-alpha20`
- `npm run test:v31-alpha19`
- `npm run test:v31-alpha22-1-browser`
- `npm run test:v31-alpha22-browser`
- `npm run test:v31-alpha21-browser`
- `npm run test:v31-alpha20-browser`
- `npm run test:v31-alpha19-browser`

Alpha23 Chromium 专项验证：

1. `feature-story` 流完成且无未分配节点。
2. 同一 flowId 在相邻页面渲染为不同正文碎片，而非重复全文。
3. 桌面页面 `column-count: 2`。
4. 跨栏 block 计算样式为 `column-span: all`。
5. Pull Quote / Sidebar 正常渲染。
6. 390px 手机宽度自动回归 `column-count: 1`。

保留既有 Full Source overlay 两条非阻断提示：`1/assets`、`2/assets` 不在 overlay 内，因此媒体存在性检查跳过。
