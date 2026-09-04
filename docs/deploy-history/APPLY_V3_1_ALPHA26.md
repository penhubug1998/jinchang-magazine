# V3.1-alpha26 · Mobile Studio

## 目标

Alpha26 不把桌面 Studio 强行压缩到手机，而是为手机重新定义一条 Reader-first 制作流程：

```text
Reader
  │
  ├── 预览
  ├── 改文字
  ├── 换图片
  ├── 调布局
  ├── 查看问题
  ├── 审核
  └── 发布
```

手机端不承担复杂自由拖拽、连续 Resize、密集多栏属性面板等桌面工作。`issue.json` 仍是唯一事实来源，本版本不扩张期刊 schema，`v31SchemaVersion` 继续保持 `3.1-alpha24`。

## Reader-first 手机壳层

在 `<=820px` 且处于 Workspace 时启用 Mobile Studio：

- Reader 作为主屏内容，占据顶部状态栏与底部 Dock 之间的全部可用空间。
- 自动关闭桌面 Canvas 自由拖拽模式。
- 顶部只保留返回、当前页、页面健康、保存。
- 底部固定页码切换与四个主入口：文字 / 图片 / 布局 / 页面。
- 所有高频编辑通过 Bottom Sheet 完成。
- 离开手机宽度后自动退出手机壳层并恢复桌面 Workspace。

新增模块：

```text
src/studio/mobile-studio.js
```

负责手机断点、可编辑文字/媒体目标分类、页面快照和工作流入口定义。

## 文字工作流

### 普通文本

普通 `paragraph / quote / heading / sectionHeading / sidebar / pullQuote` 等可编辑字段可以直接在 Bottom Sheet 快速修订并保存。

### RichText

已经升级为 Alpha22/22.1 结构化 RichText 的内容不会被手机 textarea 覆盖。Bottom Sheet 显示结构化正文提示，并通过 `mobile-edit-block` 桥接到 Reader 原位编辑：

```text
Mobile Bottom Sheet
       ↓
mobile-edit-block
       ↓
Reader RichText Editor
       ↓
richText JSON + text mirror
       ↓
issue.json
```

因此手机端仍保留粗体、链接、列表、颜色等结构，不产生双事实源。

## 图片 / 视频工作流

图片面板根据当前页自动列出媒体目标，提供：

- 替换图片 / 视频
- 图片调整
- 视频封面

手机端不开放复杂画布拖动和自由 Resize，避免小屏误操作。

## 布局工作流

布局 Bottom Sheet 接入 Alpha24 Smart Layout Recommendation，并提供四个轻量、安全的常用版式：

- 单页聚焦
- 右侧媒体
- 双栏平衡
- 三栏速览

同时可调整 Alpha23 Publishing Layout 的：

- 1 / 2 / 3 栏
- 栏平衡

复杂出版属性继续保留给桌面 Inspector。

## 页面工作流

页面 Bottom Sheet 汇总：

- 当前页标题与健康状态
- 页面字数 / 媒体 / Block 数
- 全部页面快速跳转
- 查看问题 / Audit
- 审核
- 发布

发布入口直接复用 Alpha25 Publishing Center 2.0，不在手机端另造一套发布逻辑。

## Reader 桥接

Reader 新增 `mobileStudioMode`。手机模式允许：

- 选择 Block
- RichText 原位编辑
- 普通文字原位编辑

但明确禁止自动开启 Canvas 拖拽 / Resize。Reader 收到 `mobile-studio-mode` 后会关闭 Canvas Mode；收到 `mobile-edit-block` 时，只定位并打开指定 Block 的文字编辑会话。

## 响应式边界

Alpha26 专项 Chromium 回归覆盖：

- 320 × 740：Mobile Studio，Bottom Sheet 不越界
- 390 × 844：完整 Reader-first 工作流
- 768 × 1024：平板竖屏仍使用 Mobile Studio，Bottom Sheet 不越界
- 1024 × 768：自动退出 Mobile Studio
- 1366 × 768：桌面 Workspace 恢复
- 1920 × 1080：宽屏 Workspace 恢复

测试会等待 Bottom Sheet 动画完成后再量最终几何边界，避免把过渡动画中间帧误判为布局溢出。

## 兼容保护

Alpha26 不修改期刊数据 schema，继续兼容：

- Alpha25 Publishing Center 2.0
- Alpha24 Smart Layout Recommendation
- Alpha23 Publishing Layout / Text Flow
- Alpha22.1 RichText Production Hardening
- Alpha22 RichText Engine
- Alpha21 Canvas Workspace 2.0
- Alpha20 Stable ID / Command Bus
- Alpha19 Reader ACK / Fullscreen / Workspace

本次还修复了 Alpha21/20/19 等历史 Chromium 测试在 DevTools 刚启动时可能拿到空 page target 的随机竞态：测试会等待真实 page target 出现后再连接，不放宽任何功能断言。

## 回归

已通过 Alpha26 专项与 Alpha25→Alpha19 兼容链：

```text
npm run test:v31-alpha26
npm run test:v31-alpha26-browser
npm run test:v31-alpha25
npm run test:v31-alpha25-browser
npm run test:v31-alpha24
npm run test:v31-alpha24-browser
npm run test:v31-alpha23
npm run test:v31-alpha23-browser
npm run test:v31-alpha221
npm run test:v31-alpha221-browser
npm run test:v31-alpha22
npm run test:v31-alpha22-browser
npm run test:v31-alpha21
npm run test:v31-alpha21-browser
npm run test:v31-alpha20
npm run test:v31-alpha20-browser
npm run test:v31-alpha19
npm run test:v31-alpha19-browser
npm run check:v3
npm run build:v3
```

## 已知非阻断提示

当前 Full Source overlay 仍不包含历史 `1/assets` 与 `2/assets` 实体媒体目录，所以 `check:v3` / `build:v3` 会继续提示两条媒体存在性检查跳过。该提示与 Alpha26 Mobile Studio 无关；合并回完整媒体仓库后即可恢复真实资源校验。
