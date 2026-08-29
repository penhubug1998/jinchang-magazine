# V3.0-alpha9 Regression Report

日期：2026-08-22

## 历史刊迁移

- 第一期开启 V3：PASS
- 第一页封面 / 最后一页尾刊寄语：PASS
- 18 页标题顺序固定：PASS
- 5 篇外部文章数据：PASS
- 18 个 TTS + 1 背景音乐 + 1 视频资源清单：PASS
- 第二期 published 状态：PASS
- Studio API 同时返回 001 / 002 为 V3 可编辑：PASS

## 制作中心边界

压力数据：48 页、超长标题、超长主题、多内容块。

| 尺寸 | 结果 | 重点 |
|---|---|---|
| 320×740 | PASS | 无横向越界，纵向工作流正常 |
| 390×844 | PASS | 表单/内容块/弹窗边界正常 |
| 768×1024 | PASS | 平板纵向工作流正常 |
| 1366×768 | PASS | 固定左栏；元信息折叠；首屏页面结构+编辑区可见；双区独立滚动 |
| 1920×1080 | PASS | 固定工作台与大屏边界正常 |

审计定位：

- 页面主标题定位：PASS
- 元信息定位并自动展开：PASS
- 内容块定位并展开对应 block：PASS

## 阅读器五档回归

第一期 001：

- 390×844 PASS
- 412×915 PASS
- 820×1180 PASS
- 1366×768 PASS
- 1920×1080 PASS

第二期 002：同五档全部 PASS。

浏览器回归同时覆盖桌面正反翻页、移动端拖拽、目录、文章弹窗、字号、视频自定义全屏。

## 自动测试

最终以 `npm run verify:v3` 为总门禁，包含：

- `check:v3`
- `build:v3`
- `test:v3`
- `test:alpha9`
- `test:production`
- `test:platform`
- `test:visual-editor`
- `test:studio-workflow`
- `test:browser:001`
- `test:browser`（002）
- `test:studio-browser`
