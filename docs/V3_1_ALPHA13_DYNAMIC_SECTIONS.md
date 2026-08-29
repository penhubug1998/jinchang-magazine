# 动态板块识别规则

## 结构优先级

1. 卷首语 / 尾刊寄语使用专用识别。
2. “第N版块 ……”继续作为明确板块边界。
3. 其他规范 `Heading1` 直接视为板块边界。
4. `Heading2` 作为栏目内文章。
5. `Heading3` 作为文章内小节。
6. 以 ★ / ☆ / 📖 / 📌 开头的一级标题不会被误当成普通新板块。

## 语义信号

分类器综合：板块标题、栏目副题、专题标题、文章标题、每篇文章前3段正文、栏目导语。

## 稳定 schema

动态语义用于导入理解和制作建议。最终写入 `issue.json` 的 page.type 仍限定为既有稳定类型：article/news/theory/safety/discipline/health（以及既有结构页 cover/toc/closing）。因此新增“银龄风采”“文苑天地”等栏目不会迫使 Reader 增加新 schema。
