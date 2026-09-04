# V3.1-alpha4 设计资产库与一致性治理

版本：`3.1.0-alpha.4`

## 覆盖安装

将 overlay 解压到已验收的完整 `jinchang-magazine` 项目根目录，再执行：

```bash
npm run verify:core
npm run test:v31-alpha4-browser
npm run studio:v3 -- --port 4192
npm run final:status
```

## 本版核心

- 延续 Alpha2/Alpha3 的 `issue.design.tokens → page.design → block.design` 三级继承，不新增任何 issue.json 必填字段。
- 新增“我的样式”项目本地资产库，支持 Theme / Page / Block 三种作用域，最多 60 个样式，可跨期复用。
- “我的样式”保存在 `.v3-design-library/styles.json`，不写入 issue.json；成刊数据仍保持自包含，不依赖本地样式库才能渲染。
- 保存和应用样式时继续使用 Alpha2 的字段白名单、颜色格式、范围和枚举边界；Studio API 会再次执行服务端校验。
- 新增整刊设计覆盖统计：显示有 Page 覆盖的页面数、有 Block 覆盖的组件数。
- 新增同类型组件样式分叉检测：将“继承”和不同显式 design 视为不同变体，给出提示并可直接定位到对应组件设计器。
- 一致性结果是制作辅助信息，不是发布门禁；有意的视觉差异不会被自动修改或阻断发布。

## 正式发布边界

- `v3StableVersion` 继续固定为 `3.0.0`。
- `baselines/v3.0-final-gate-lock-alpha4.json` 绑定已验收 Alpha3 源码包 SHA256：`d89ccad9b88392c0f20755711cabfb1f78dd4cccc7c8e93b08e3087f7f1613b9`。
- Alpha4 逐文件锁定 V3.0 正式门禁关键脚本；任何误改都会让 `test:v31-alpha4` 直接失败。
- Alpha4 smoke、Chromium fixture、“我的样式”和一致性提示均不能使 V3.0 `final:status` 变为 READY。
