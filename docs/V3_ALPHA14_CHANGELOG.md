# V3.0-alpha14 Changelog

## 目标

Alpha14 将制作中心右侧预览从“简化结构预览 / 保存后构建预览”升级为真正运行公共 V3 Reader 的实时所见即所得预览，同时保持最终发布仍走保存、构建、审计和发布门禁。

## 主要变化

### 1. 真实 Reader 实时预览

- 制作中心默认预览改为“真实 Reader”。
- iframe 运行 `src/reader/index.html + reader.css + reader.js`，不是另一套仿真模板。
- 当前尚未保存的 `issue` 数据可直接推送到 Reader，修改标题、正文、内容块后无需先保存/构建即可查看真实版式。
- 原“快速结构”预览仍保留为轻量兜底。

### 2. 内存实时预览 API

新增：

```text
POST /api/issues/:id/live-preview
GET  /live-preview/:id/
GET  /live-preview/:id/issue.json
GET  /live-preview/:id/assets/*
```

实时稿只保存在 Studio 进程内存中，不写入 `issues/<id>/issue.json`。媒体仍按期刊真实 `assetSource` 解析，因此不会为了预览复制、移动或改写历史资源。

### 3. Studio ↔ Reader 双向联动

- Studio 切换当前页 → Reader 同步到对应物理页。
- Reader 内翻页 → Studio 自动切换当前编辑页。
- 未保存稿通过 `postMessage` 推送。
- Reader 回传 `ready / synced / page` 状态。
- Studio embed 模式不写 Reader 的 localStorage，避免预览改变读者端阅读进度、字号和音乐偏好。

### 4. 多尺寸真实 viewport

预设：

- PC 双页 1366×768
- PC 双页 1920×1080
- iPad 820×1180
- 手机单页 390×844
- 手机单页 412×915

iframe 自身以目标 CSS viewport 尺寸运行，外层仅负责按 Studio 可用区域缩放显示。因此 Reader 的真实媒体查询会生效，而不是只把一张桌面页面缩小。

### 5. 放大与新窗口

- “放大”会将真实 Reader 预览提升为工作区主视觉，不改变 Reader 的目标 viewport。
- “新窗口”打开当前实时 Reader 路径，便于独立检查。
- “重新同步”可手动重新推送当前未保存稿。

### 6. 生产安全边界

Alpha14 没有改变正式发布链：

```text
编辑中的内存稿
  → 实时 Reader（仅预览）

正式保存
  → issue.json + snapshot / revision
  → build:v3
  → audit / release:check
  → publish:v3
```

实时预览成功不等于正式发布检查通过。
