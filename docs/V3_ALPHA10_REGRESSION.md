# V3.0-alpha10 Regression Report

## 数据与平台

- `check:v3` PASS
- `build:v3` PASS
- `test:v3` PASS
- `test:alpha9` PASS（第一期迁移历史基线）
- `test:alpha10` PASS
- `test:production` PASS
- `test:platform` PASS
- `test:visual-editor` PASS
- `test:studio-workflow` PASS

Standalone overlay 因未包含历史大型媒体，会对 `1/assets`、`2/assets` 给出非阻断跳过提示。

## 阅读器

第一期 001 与第二期 002 均通过真实 Chromium：

- 390×844
- 412×915
- 820×1180
- 1366×768
- 1920×1080

## 制作中心边界

通过：

- 320×740
- 390×844
- 768×1024
- 1366×768
- 1920×1080

专项链路：

1. 期刊信息默认折叠；
2. 页面信息默认折叠；
3. 审计定位页面标题后页面信息自动展开；
4. 复制普通页面，并保护结构页；
5. 保存前差异确认弹窗保持视口内；
6. 撤销后恢复最近一次保存状态；
7. 超长复制页标题仍保留“（副本）”标识。
