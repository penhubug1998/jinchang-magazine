# V3.1-alpha16 · 媒体直编 / 多窗口同步 / 版面健康

Alpha16 继承 Alpha15 已验收的所见即所得 Workspace，不改变 issue.json 必填 schema，也不新增 Reader 运行时依赖。

## 本阶段能力
- Reader 画布中选中图片/视频后直接出现媒体工具条。
- 图片支持：替换资源、裁切/焦点、contain/cover 切换、画框比例循环；视频支持替换视频与更换封面。
- 继续复用既有媒体资源工作台和 imageAdjustDialog，最终仍写入标准 block 字段。
- 同一期刊的多个 Workspace 使用 BroadcastChannel 感知彼此：保存、所在页和草稿状态。
- 远端保存仅在当前窗口无未保存修改时自动载入；本地有脏稿时只提示，不覆盖。
- 真实 Reader 将当前可见页面的内容占用、overflow、clientHeight/scrollHeight 和块数回传 Studio。
- Studio 显示“版面健康”状态，并可按建议快速应用紧凑/标准/宽松块间距。

## 证据边界
这些能力仅属于 V3.1 编辑制作体验，不改变 issue.status，不写正式发布证据，也不满足 V3.0.0 正式门禁。
