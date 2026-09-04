# V3.1-alpha3 设计复用与可控回退

版本：`3.1.0-alpha.3`

## 覆盖安装

将 overlay 解压到已验收的完整 `jinchang-magazine` 项目根目录，再执行：

```bash
npm run verify:core
npm run test:v31-alpha3-browser
npm run studio:v3 -- --port 4190
npm run final:status
```

## 本版核心

- 延续 Alpha2 的 `issue.design.tokens → page.design → block.design` 三级继承，不新增必填 issue 字段。
- 新增 6 套内置 Theme 预设；预设应用后只保存标准 Theme token 值，不保存模板依赖。
- 支持当前作用域样式复制 / 粘贴，并对粘贴 JSON 进行客户端白名单、颜色、范围和枚举校验；正式保存仍由 Studio API 再校验完整 issue。
- 页面样式可批量套用到左侧已选页面。
- 组件样式可批量套用到本页同类型组件或整刊同类型组件；只复制 `design`，不改正文、媒体或结构。
- 新增设计专用撤销 / 重做，只恢复 design 数据；正文或页面结构变化时设计历史会自动清空，避免误回退内容。
- Studio 内嵌真实 Reader 中可直接点击正文组件进入对应 Block 设计器；公开 Reader 不启用该编辑交互。
- 修复 Alpha2 中“仅打开设计器会创建空 design 对象”的隐性写入问题：Alpha3 只读查看不写数据，首次真正修改时才创建覆盖对象。

## 正式发布边界

- `v3StableVersion` 仍为 `3.0.0`。
- Alpha3 新增 `baselines/v3.0-final-gate-lock-alpha3.json`，绑定已验收 Alpha2 源码包 SHA256，并逐文件锁定 V3.0 正式门禁关键逻辑。
- Alpha3 smoke、浏览器 fixture 或模拟数据均不能把 V3.0 `final:status` 置为 READY；正式门禁只认原有证据绑定流程。
