# V3 发布审计中心使用说明

## 日常审计

制作过程中点击“日常审计”，或运行：

```bash
npm run audit:v3 -- --issue 003
```

草稿期允许媒体/TTS 尚未齐全，结果以 warning 方式提示。

## 发布前检查

制作中心点击“发布前检查”，或运行：

```bash
npm run audit:v3 -- --strict --issue 003
```

严格模式要求期刊已经进入 `ready` 或 `published`，并将资源缺失、占位内容等发布风险升级为阻断项。

正式发布仍建议执行完整：

```bash
npm run release:check -- --issue 003
```

它还会执行目标期刊的浏览器回归。

## 审计结果怎么处理

### 阻断

必须在正式发布前解决。例如：

- 文章引用不存在；
- TOC 跳转页码无效；
- 严格模式下仍有占位内容；
- ready 状态下缺失关键媒体/TTS；
- assetSource 越出项目目录。

### 警告

通常不直接阻止日常预览，但应人工确认。例如：

- 标题过长；
- 页面数量偏少；
- 图片无 alt；
- 媒体偏大；
- 重复导航标题。

### 定位

制作中心中的“定位”会根据 finding 的 location：

- 元数据问题 → 聚焦到期名、本期主题、状态、发布单位；
- 页面问题 → 自动切换到对应页，并聚焦标题 / 眉题 / JSON；
- 资源问题 → 定位到相关页，同时显示/复制资源路径。

## 完整报告

每次审计都会生成：

```text
reports/v3-release-audit-003.json
reports/v3-release-audit-003.md
reports/v3-release-audit-003.html
```

制作中心点击“完整报告”可直接查看 HTML 版本。
