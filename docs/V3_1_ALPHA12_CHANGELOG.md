# V3.1-alpha12 Changelog

## 整期结构快速导入

### Import parser
- DOCX 解析保留 Word 段落样式层级。
- 新增 periodical structure detector：preface / sections / articles / subsections / closing。
- Word 大纲优先，中文“第N版块 / 卷首语 / 尾刊寄语”等规则兜底。
- 新增 semantic page type mapping：news / theory / safety / discipline / health。
- Heading3 小节可转换为提示卡、步骤卡、案例/警示组合、chips 等结构化内容块。

### Semantic pagination
- 完整期刊按文章和小节边界分页，而不是统一 `标题（1）…标题（N）`。
- 单页内容块密度上限为 10。
- 长正文仍保留句级拆分能力。
- 续页标题自动提炼，避免完整长标题反复占用导航空间。

### Studio Quick Import
- 新增“结构理解”：智能识别 / 整期期刊 / 普通文章。
- 新增“写入方式”：智能 / 追加 / 替换正文 / 整期重建。
- 识别到完整期刊时，预览显示版块数、文章数、卷首语/尾刊等结构摘要。
- 标准新刊骨架下，智能模式默认整期重建。
- 整期重建保留封面和目录，替换正文与旧尾刊。
- 标准骨架封面占位标题自动替换为导入文档总标题。
- 普通文章导入行为保持兼容，默认继续追加。

### Evidence boundary
- 不修改 issue.json schema。
- 不改变 issue.status。
- 不新增 Reader 运行时依赖。
- 不产生或修改任何 V3.0 正式发布门禁证据。
