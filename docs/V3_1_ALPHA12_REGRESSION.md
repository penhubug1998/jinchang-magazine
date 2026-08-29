# V3.1-alpha12 Regression

## 专项 smoke

`npm run test:v31-alpha12`

覆盖：
- Alpha12 package/schema/stable version。
- 5 版块合成 DOCX 大纲结构识别。
- preface / closing / section / article 识别。
- 页面类型映射。
- discipline casePair 等语义内容块。
- 单页 blocks <= 10。
- 不再机械生成 `标题（1）…标题（N）`。
- 普通文章 fallback 不受影响。
- Studio 快速导入结构/写入模式入口。
- Alpha11 父基线绑定。
- V3.0 正式门禁关键文件 SHA256 锁。
- 真实 Studio health。

## Chromium

`npm run test:v31-alpha12-browser`

覆盖：
- 9 页标准新刊骨架。
- 完整期刊结构预览。
- auto 写入方式解析为 publication。
- 整期重建后封面标题填充。
- 旧骨架占位正文被清除。
- 语义 pageType / section 保留。
- 自动目录只生成五大版块。
- 390×844 快速导入窗口边界。

## 第三期 DOCX 真实试制

- 解析：8334 chars / 296 blocks。
- 识别：5 sections / 23 articles / preface / closing。
- 语义内容页：39。
- 标准新刊重建后：41 页。
- TOC：5 项。
- max blocks/page：10。
- `npm run audit:v3 -- --issue 003`：warning · score 88 · blockers 0 · warnings 3。
- warnings：DRAFT_STATUS / BGM ASSET_MISSING / TTS_MISSING_PAGES。

该试制仅作为 Alpha12 开发回归，不满足 V3.0 正式“第三期真实材料”门禁。
