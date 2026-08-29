# V3.1-alpha11 应用说明

主题：沉浸式工作区 / 双屏编辑。

父基线：V3.1-alpha10 Full Source R1（部署修复版），SHA256 `f465866e97bf5f067377392eb8e3a5ee85ac35bb669d780a79eaa522be5bc5c1`。

## 使用

制作中心仍使用现有入口，例如 `/new-jc-magazine-admin/`。在页面编辑器点击“进入工作区”，进入：

`/new-jc-magazine-admin/workspace/?issue=002&page=27`

工作区只保留当前页编辑与 Reader 预览：
- 隐藏期刊侧栏、制作中心顶栏、整页页面树与管理卡片；
- 左侧内容编辑、右侧真实 Reader，各自独立滚动；
- 顶部提供返回制作中心、上一页/下一页、页面抽屉、保存和撤销/重做；
- 页面基础信息作为内容画布第一个“页面信息块”，默认折叠；
- Reader 普通编辑先通过 postMessage 即时更新，再后台持久化 live-preview；
- Reader 内容刷新保留当前 `.page-scroll` 位置，预览尺寸切换不重建 iframe。

## 部署

Alpha11 继承 Alpha10 Full Source R1 的工程根目录与子路径适配。Nginx 继续将整个 `/new-jc-magazine-admin/` 代理到 Studio 服务即可，`/workspace/`、`/workspace/studio.css`、`/workspace/studio.js` 与 `design-presets.js` 由同一 Studio 服务处理。

## 边界

本版没有给 `issue.json` 增加字段，也没有增加 Reader 成刊运行时依赖；Alpha11 是 V3.1 开发能力，不改变 V3.0.0 正式发布门禁。历史媒体实体 `1/assets` 与 `2/assets` 不在源码包中，仍按既有非阻断 overlay 策略处理。
