# V3.1-alpha15 Regression Plan

## Alpha15 专项

- 制作中心桌面固定视口与内部滚动。
- 期刊信息从常驻区域迁移到弹窗。
- “进入沉浸工作区”主入口。
- Workspace 25/75 画布优先及其余布局模式。
- Quick Structure 主标签移除。
- 新窗口完整 Workspace 状态继承。
- Studio 接收 `canvas-text-edit` / `canvas-style` 并写回标准 issue/block 数据。
- 实际 Reader 源码：双击文字 → contenteditable → blur → postMessage → Studio；浮动文字工具条。
- Alpha14 画布手柄/Resize/选择能力继续存在。

## 兼容回归

必须重新通过 Alpha1–Alpha14 专项、Studio 五档、Alpha1/Alpha2 Reader 矩阵及 Alpha3–Alpha14 浏览器链。

## 正式门禁边界

Alpha15 smoke / Chromium / Studio / Workspace / 原地编辑均为开发证据，不转换为 V3.0.0 正式发布门禁 PASS。独立 `npm run final:status` 仍是唯一正式状态入口之一。
