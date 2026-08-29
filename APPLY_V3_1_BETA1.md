# V3.1-beta1 · Production Workflow Validation

## 目标

Beta1 不增加大功能，只验证并修复从内容创建到发布回滚的完整生产闭环。验收要求是一次连续完成，不依赖人工打开 DevTools、不手工修改 `issue.json`、不通过命令行补状态。

## 本轮收口修复

1. **Studio 嵌套模块真实路由**
   - 修复 `/workspace/viewport.js` 等路径被 `/workspace/*` 兼容路由误截获的问题。
   - 静态真实文件优先，旧 Workspace 兼容路由仅作为 fallback。

2. **Stable ID 保存归一化**
   - Word 导入、自动分页、模板等来源的新页面/Block 在正式保存前统一执行 Identity Normalize。
   - fallback ID 规则与正式 Identity Engine 对齐：严格 `page_/block_` 前缀、至少 6 位主体、哈希补零。

3. **Alpha23 审计兼容**
   - 严格审计合法 Block 列表补齐 `textFlow / pullQuote / sidebar / sectionHeading`，避免出版级合法组件被误判为阻断。

4. **发布证据版本一致性**
   - 发布中心/发布证据不再硬编码 alpha26，统一读取当前 `V3_VERSION`。

5. **Reader 五档回归真实 ESM 模块图**
   - `Page.setDocumentContent` 测试模式下不再把带相对 import 的 `reader.js` 直接塞进 `about:blank`。
   - 将 `rich-text.js`、`layout-engine.js` 组成自包含 data-module 依赖图，保持真实模块边界。

6. **浏览器回归动画稳定性**
   - 翻页验证不再依赖固定 `sleep(820ms)`，改为等待 `state.turning=false` 且页码到达目标值。
   - 发布前仍执行 5 档完整 Reader 门禁；正式发布后追加 390×844 手机复核，避免重复执行同一矩阵。

## Beta1 全流程生产演练

`npm run test:v31-beta1-production`

一次连续通过 24 个检查点：

1. 建立干净生产沙箱
2. 干净环境启动 Studio
3. 真实嵌套模块路由加载
4. 创建新期刊
5. 导入 Word
6. 生成栏目
7. 自动分页
8. 修改文字
9. 替换图片
10. 调整布局
11. Stable ID 首次正式保存
12. 校审
13. 签收
14. 朗读基线准备
15. 严格校验
16. 构建
17. 发布前生产门禁（Mobile/Desktop PASS）
18. 生成 Web Reader
19. 导出真实 PDF
20. 生成 Archive ZIP
21. 正式发布
22. 390×844 发布后手机 Reader 复核
23. Snapshot 修改后 Rollback
24. review/handoff/build/release/pdf/archive/rollback 证据落盘复核

最后一次演练结果保存在：

`reports/v31-beta1-production-last.json`

## 兼容回归

Alpha26 → Alpha19 的 Smoke 与真实 Chromium 回归全部通过：

- Alpha26 Mobile Studio
- Alpha25 Publication Center 2.0
- Alpha24 Smart Layout Recommendation
- Alpha23 Publishing Layout / Text Flow
- Alpha22.1 Rich Text Production Hardening
- Alpha22 Rich Text Engine
- Alpha21 Canvas Workspace 2.0
- Alpha20 Stable ID / Command Bus
- Alpha19 Reader ACK / Fullscreen / Workspace

历史版本测试仅扩展“当前 Beta1 属于后续兼容版本”的版本断言；历史功能断言未放宽。

## 最终门禁

- `npm run test:v31-beta1` ✅
- `npm run test:v31-beta1-production` ✅
- Alpha26 → Alpha19 Smoke ✅
- Alpha26 → Alpha19 Chromium ✅
- `npm run check:v3` ✅
- `npm run build:v3` ✅

`check:v3` 仍存在 Full Source overlay 的两条既有非阻断提示：当前 overlay 没有历史 `1/assets` 和 `2/assets` 实体目录，因此这两期资源存在性检查会在合入完整仓库后执行。

## 版本与 Schema

- Package: `3.1.0-beta.1`
- `v31SchemaVersion`: `3.1-alpha24`
- `v3StableVersion`: `3.0.0`

Beta1 未扩大 `issue.json` schema。

## RC1 Gate

Beta1 已满足进入 RC1 的技术门槛：完整生产 E2E 连续通过、历史兼容链通过、构建门禁通过。RC1 应冻结大功能和核心 schema，重点转入真实内容生产验收、部署升级/回滚演练、性能与跨浏览器缺陷清零。
