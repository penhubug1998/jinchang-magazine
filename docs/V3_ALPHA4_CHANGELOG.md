# V3.0-alpha4 Changelog

Alpha4 将 V3 从“可稳定阅读”推进到“可持续生产与发布”。本版不改变 Alpha3 已冻结的阅读交互基线，主要增加新一期生产脚手架、资源清单同步、媒体审计和发布门禁。

## 新增

- `npm run new:issue`：自动选择下一个数字期号，也可显式指定 `--id`。
- 自动生成 `issues/<id>/issue.json`、`assets.json`、编辑说明和四类媒体目录。
- 默认生成 9 页基础期刊：封面、卷首语、目录、5 个栏目占位页、尾刊寄语。
- `npm run assets:sync`：根据 `issue.json` 自动重建资源清单，覆盖背景音乐、逐页 TTS、图片、视频。
- `npm run audit:v3`：生成 JSON / Markdown / HTML 三种发布审计报告。
- 媒体体积检查：视频 30 MB、音乐 8 MB、图片 2 MB、单个 TTS 2 MB 以上给出优化警告；本期被引用媒体总量超过 100 MB 给出总量警告。
- TTS 完整性检查：按阅读页数量和 `page-{page}.mp3` 规则自动比对，报告缺失页码区间。
- 未引用媒体检查：提醒 `assets/` 中存在但未被 `issue.json` 使用的文件。
- `npm run release:check`：串联数据校验、构建、静态 smoke、五档浏览器回归和严格发布审计。
- 严格发布门禁：目标期刊必须为 `ready` / `published`，并且所有被引用资源必须存在。
- GitHub Actions 在每次 V3 检查后自动生成审计报告 artifact。

## 制作阶段规则

- `draft`：允许缺少 TTS / 音乐 / 图片 / 视频，`check:v3` 只警告，仍可构建和预览。
- `ready`：表示内容与资源已确认；缺少清单资源会成为阻断错误。
- `published`：已发布版本，继续执行与 `ready` 相同的严格资源完整性规则。
- `migration-preview-*`：迁移预览状态，不应作为正式发布目标。

## 不变项

- 现有 `/1/`、`/2/` 不覆盖。
- V3 第二期仍从 `2/assets` 复用现有媒体。
- Alpha3 的 PC 书本跨页、手机跟手翻页、VisualViewport、自定义视频全屏与五档浏览器回归继续保留。
