# V3.0-alpha6 Regression Report

## 结果

`npm run verify:v3` 全部通过。

### 数据与生产链

- `check:v3`：PASS（overlay 缺少 `2/assets`，保留 1 条预期非阻断提示）
- `build:v3`：PASS
- `test:v3`：PASS
- `test:production`：PASS
- `test:platform`：PASS

`test:platform` 额外验证：

- 制作中心真实 HTTP API 可启动；
- 审计 API 返回结构化 finding；
- finding 同时包含 `location` 和 `fix`；
- 严格审计可对 draft 返回 `STATUS_NOT_READY`；
- 超过 120 字符的本期主题返回 HTTP 400 + `VALIDATION_ERROR`；
- 保存前快照与回滚正常。

### 阅读器浏览器回归

第二期 002：

- 390×844：PASS
- 412×915：PASS
- 820×1180：PASS
- 1366×768：PASS
- 1920×1080：PASS

### 制作中心浏览器边界回归

使用 48 页、超长标题压力数据：

- 320×740：PASS
- 390×844：PASS
- 768×1024：PASS
- 1366×768：PASS
- 1920×1080：PASS

自动验证：

- 无水平越界；
- 控件不超出视口；
- 48 页列表完整；
- dialog 不越界；
- 审计 finding 正确显示；
- page finding 可定位到第 18 页主标题；
- metadata finding 可定位到本期主题。

## 人工截图复核

额外检查了：

- 320px 审计中心：指标卡单列、按钮不越界、toast 改到顶部，不遮挡筛选；
- 1366px 审计中心：结果、可发布度、指标、finding 与定位按钮层次明确；
- 超长标题：顶部与页面编辑标题采用多行截断；
- 删除页按钮保持横向，不再被长标题挤成竖排。
