# V3.1-alpha16 Changelog

## Direct media editing
Reader 画布选择顶层 image/video 块时显示媒体工具条。媒体替换继续进入 Studio 媒体资源工作台；图片裁切继续复用非破坏式焦点编辑器。快速 fit/ratio 操作直接写标准 image block 字段。

## Safe multi-window awareness
同一期刊窗口通过 BroadcastChannel 建立本地浏览器内联动。保存版本可广播完整标准 issue；干净窗口自动更新，存在未保存修改的窗口进入 remote-pending 状态，防止无提示覆盖。

## Reader-measured visual health
真实 Reader 基于实际页面 DOM 计算 fill ratio、overflow 和 block count 并回传 Studio。Studio 将结果分为正常、留白偏多、偏密三类，只提供制作建议和间距快捷调整。

## Compatibility
- v3StableVersion 保持 3.0.0。
- issue.json required schema 不变。
- Alpha1–Alpha15 既有 schema 指纹保持不变。
- 001/002 历史刊内容不参与本阶段修改。
