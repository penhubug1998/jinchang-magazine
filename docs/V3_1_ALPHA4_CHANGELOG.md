# V3.1-alpha4 Changelog

## 新增

- “我的样式”跨期资产库：Theme / Page / Block 三种作用域。
- 当前作用域一键保存为我的样式、应用与删除。
- 项目本地 `.v3-design-library/styles.json` 持久化，最多 60 个。
- 服务端样式资产白名单与参数边界校验。
- 整刊 Page / Block design 覆盖率统计。
- 同类型组件多样式分叉检测与 Studio 一键定位。
- Alpha4 父基线和 V3.0 正式门禁关键文件 SHA256 锁。

## 保持不变

- `issue.design / page.design / block.design` 数据模型与 Alpha2 参数边界。
- Alpha3 Theme 预设、复制/粘贴、批量套用、设计撤销/重做和 Reader 点选直达。
- 第一、第二期既有内容及 V3.0.0 六项正式发布门禁。

## 设计原则

“我的样式”只是制作侧资产。应用后写入的仍是标准 design 值，因此期刊不会因为样式库被删除、迁移或未部署而失去视觉样式。
