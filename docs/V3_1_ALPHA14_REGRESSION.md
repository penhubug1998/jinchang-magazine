# V3.1-alpha14 Regression

## 专项覆盖

- 常用编排栏存在且在桌面 / 390×844 下可操作。
- 顶层内容块多选、Shift/Cmd 选择与批量样式写回。
- 批量字号、间距、宽度、位置与块顺序操作。
- 实际 Reader 源码进入画布模式后生成拖动手柄、Resize 手柄和选中态。
- Studio 可接收 Reader `canvas-select / canvas-reorder / canvas-resize / canvas-align` 并更新标准 issue 数据。
- Workspace 翻页信息卡短标题/长标题宽度保持一致。
- 媒体自动优化开关具备明确标签。
- `alignSelf` 服务端边界与 schema check。
- 续页末页平衡的合并/后移策略。
- 第三期真实 DOCX 在 Alpha14 仍保持 5 板块 / 23 篇 / 39 语义页 / maxBlocks=10，未出现单个短块续页。

## 兼容回归

- Alpha1–Alpha14 V3.1 smoke 连续通过。
- V3.0 正式发布关键脚本 SHA256 锁保持不变。
- Alpha13 动态板块分类、Alpha12 整期导入、Alpha11 Workspace 以及此前设计/编排/校审能力均需在最终 `verify:core` 与浏览器链重新验证。

## 证据边界

Alpha14 画布与分页回归均为 V3.1 开发证据，不替代 V3.0.0 的真实设备、历史媒体、第三期正式材料、部署/回滚及 HTTPS 正式门禁。
