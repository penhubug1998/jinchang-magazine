# V3.1-alpha15 · WYSIWYG Workspace

## 信息架构

Alpha15 明确区分两类工作场景：

1. 制作中心：期刊选择、页面管理、检查、资源、校审、正式发布等低频/治理操作。
2. 沉浸式 Workspace：当前页内容、样式、画布和 Reader 的高频制作操作。

桌面制作中心本身不再依赖 body 长滚动；内部主要区域独立滚动。

## Workspace 模式

- 编辑辅助：30 / 70
- 双栏：50 / 50
- 画布优先：25 / 75
- 纯画布：隐藏编辑辅助区，仅保留 Reader 主画布

布局模式可通过 URL 继承到新窗口，避免新窗口退回普通预览。

## Reader 原地文字编辑

画布模式下双击支持的文字节点：

- paragraph.text
- quote.title / quote.text
- cardline.title / cardline.text
- casePair.case / casePair.warning
- coverMeta.text
- blessing.text
- producer.text

编辑时 Reader 使用临时 `contenteditable`，blur 或 Ctrl/Cmd+Enter 提交；Escape 放弃修改。Reader 只负责发送编辑意图，Studio 找到对应 block 后更新 state 与 `issue.json` 草稿，因此 Reader DOM 不成为持久化数据源。

## 浮动样式工具条

提供第一层高频样式：字号减/增、粗体、左/中/右对齐。详细 token、精细间距与高级设计继续进入高级设置，避免主画布再次被大量参数挤占。

## Quick Structure

Alpha15 从主预览中移除 Quick Structure 标签。实时 Reader 已经承担页面结构、视觉和直接编辑的统一入口；结构树仅作为高级诊断/管理能力保留，不再与真实 Reader 并列争夺主空间。
