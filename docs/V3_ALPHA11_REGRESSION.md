# V3.0-alpha11 回归报告

## 自动化结果

以下测试均已独立执行通过：

- `npm run check:v3`
- `npm run build:v3`
- `npm run test:v3`
- `npm run test:alpha9`
- `npm run test:alpha10`
- `npm run test:alpha11`
- `npm run test:production`
- `npm run test:platform`
- `npm run test:visual-editor`
- `npm run test:studio-workflow`
- `npm run test:browser:001`
- `npm run test:browser`
- `npm run test:studio-browser`

`npm run verify:core` 已整体通过。

## Alpha11 专项覆盖

### 页面批量编辑

- 48 页压力数据；
- 多选页面；
- 批量设置栏目；
- 多级撤销后恢复旧栏目；
- 重做后重新应用批量修改；
- 结构页保护。

### 自动草稿

- 草稿 API 支持中间编辑态；
- 同一中间态走正式保存会被严格边界拒绝；
- 自动草稿可以写入、读取、删除；
- Chromium 中真实触发草稿恢复对话框并恢复可视化内容块；
- 放弃未保存修改后草稿同步清理。

### 已发布修订

- published 期刊保存后 `revision.pending=true`；
- 期刊列表返回 `revisionPending=true`；
- 审计报告包含 `UNPUBLISHED_REVISION`；
- 回滚链仍能正常工作。

## 制作中心浏览器尺寸

全部通过：

- 320×740
- 390×844
- 768×1024
- 1366×768
- 1920×1080

检查内容包括：

- 无横向越界；
- 顶部收敛菜单；
- 固定桌面工作台；
- 页面多选工具条；
- 内容块添加 / 复制；
- 撤销 / 重做；
- 自动草稿与恢复；
- Visual ↔ JSON；
- 审计页面 / 元数据 / 内容块定位；
- 页面模板；
- 媒体库；
- 文章库；
- 成刊预览；
- 保存前差异；
- 放弃未保存修改。

另外修复了 320px 屏幕下页面级“复制页 / 套用模板 / 删除页”按钮被挤成竖排的问题，现固定为可读的横向三按钮布局。

## 阅读器回归

第一期 `001`（18 页）与第二期 `002`（29 页）分别通过：

- 390×844
- 412×915
- 820×1180
- 1366×768
- 1920×1080

## Overlay 环境提示

独立 Alpha11 overlay 不包含历史大媒体，因此 `check:v3` / `build:v3` 会对 `1/assets`、`2/assets` 输出资源存在性跳过提示。该提示为非阻断项；覆盖到完整仓库后会检查真实资源。
