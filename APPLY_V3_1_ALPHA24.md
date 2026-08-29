# V3.1-alpha24 · Smart Layout Recommendation

## 目标

在 Alpha23 出版级 Layout Engine 基础上加入“可解释版式推荐”。系统分析当前页内容指纹后给出最多 3 个候选方案，编辑者确认后才应用；推荐不会自动重写正文，也不会把 HTML 作为事实来源。

## 内容指纹

- 标题字数、正文净字数
- 图片 / 视频数量
- 引用 / Pull Quote 数量
- 要点、卡片、列表项数量
- 标题层级与内容单元数量
- 页面语义（news / theory / safety / health / profile / culture / finance / activity 等）
- Reader 真实填充率、溢出状态
- Alpha23 `textFlow` 槽位与当前出版分栏状态

## 推荐机制

新增 `src/studio/layout-recommender.js`，采用确定性规则评分，不依赖网络和远程 AI。每个候选方案包含：

- 推荐名称与 preset
- 匹配分数 / 置信度
- 1–3 条可读推荐理由
- 建议页数
- 建议栏数 / 栏间距
- 阅读模式
- 是否建议继续使用 Alpha23 跨页文本流

内置首批方案：

1. 双页长文 · 左文右图
2. 三栏速览
3. 双栏深读
4. 图文特写 · 左图右文
5. 头条引领 · 双栏跟进
6. 单页聚焦

## 一键应用边界

“一键应用”复用既有 Layout Preset，并同步写入 `page.publishing.columns / columnGap / balanceColumns`。操作进入 Studio Undo 历史，可撤销。

当推荐为 2–3 页但当前内容还没有 `textFlow` 时，Alpha24 只提示“建议跨页”，不会擅自拆正文或创建事实源副本；实际连续续排继续由 Alpha23 Text Flow 完成。这一边界避免推荐系统破坏原始内容。

## 制作中心 UI

- 首页页面状态卡直接显示当前首选方案。
- Layout Lab 升级为“智能版式推荐”，显示 3 个候选卡及原因、页数、栏数、阅读模式、置信度。
- 内容变化或 Reader 实测填充率变化后可重新计算。

## 顺带修复

真实 Chromium 回归发现 Alpha23 Full Source 中曾意外缺失一组 Studio 核心函数。本版恢复并重新纳入回归：

- 期刊加载：`loadIssues / openIssue`
- 页面渲染与切换：`renderIssue / renderPages / renderPage / goToPage`
- 页面 JSON / Meta 同步
- 工作区页选择
- 自动草稿
- Undo / Redo / History Snapshot

因此 Alpha24 的浏览器测试覆盖“打开期刊 → 分析推荐 → 一键套版 → Publishing 参数落地 → Undo 历史”完整链路。

## 示例

`examples/v31-smart-layout-alpha24/issue.json`

- 长文约 2200 字 + 2 图 + 1 引用：首推“双页长文 · 左文右图”。
- 短文约 500 字 + 6 个要点 + 无图：首推“三栏速览”。
