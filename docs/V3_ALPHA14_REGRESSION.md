# V3.0-alpha14 回归结果

## 核心回归

`npm run verify:core`：PASS。

包括：

- `check:v3`
- `build:v3`
- V3 smoke
- Alpha9 / 10 / 11 / 12 / 13 / 14 smoke
- production
- platform
- visual-editor
- studio-workflow

overlay 单独运行仍只有两条预期非阻断警告：没有 `1/assets`、`2/assets`；合入完整仓库后执行历史媒体存在性检查。

## Alpha14 API / 数据隔离

PASS：

- POST 未保存第二期编辑稿到 live-preview。
- GET live-preview `issue.json` 返回未保存内容。
- 磁盘 `issues/002/issue.json` 未被改写。
- Reader index / CSS / JS 路径正常。
- issue id 不匹配会被拒绝。

## Reader 浏览器回归

### 第一期 001

- 390×844 PASS
- 412×915 PASS
- 820×1180 PASS
- 1366×768 PASS
- 1920×1080 PASS

### 第二期 002

- 390×844 PASS
- 412×915 PASS
- 820×1180 PASS
- 1366×768 PASS
- 1920×1080 PASS

## Studio 边界回归

- 320×740 PASS
- 390×844 PASS
- 768×1024 PASS
- 1366×768 PASS
- 1920×1080 PASS

## Alpha13 导入回归

五档尺寸全部 PASS，确认 Alpha14 未破坏 Word / Markdown / TXT 与批量文章导入工作流。

## Alpha14 实时 Reader 专项

| 设备档 | Reader viewport | 实际布局 | 结果 |
| --- | --- | --- | --- |
| PC | 1366×768 | 双页 | PASS |
| PC | 1920×1080 | 双页 | PASS |
| iPad | 820×1180 | 双页（Reader 当前断点为 760px） | PASS |
| 手机 | 390×844 | 单页 | PASS |
| 手机 | 412×915 | 单页 | PASS |

同时验证：

- 未保存标题实时进入 Reader：PASS
- Studio → Reader 当前页同步：PASS
- Reader → Studio 翻页同步：PASS
- 放大预览：PASS
- 快速结构 ↔ 真实 Reader 切换：PASS

说明：`desktop-1366x768-reader-expanded.png` 截图是在 1366×768 的 Studio 窗口中选择“手机 390×844”设备档并放大，因此图中 Reader 为手机单页，这是测试步骤本身，不表示 1366 Reader 被错误识别为移动端。设备报告中的 1366 / 1920 两档均实测为双页。

## 总门禁说明

本环境将所有 Chromium 套件串行执行时会触发单次工具执行时间限制，因此没有将“总命令超时”误报为测试失败。核心门禁和以下浏览器套件均已分别完整执行并 PASS：

- `test:browser:001`
- `test:browser`
- `test:studio-browser`
- `test:alpha13-browser`
- `test:alpha14-browser`

本地没有该单次工具窗口限制时仍可运行：

```bash
npm run verify:v3
```
