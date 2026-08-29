# V3.1-alpha4 设计资产库与一致性治理

## 1. 我的样式不是运行时依赖

Studio 将用户保存的样式放在：

```text
.v3-design-library/styles.json
```

每条记录只包含：

```text
id / name / scope / contextType / payload / createdAt
```

其中 `payload` 必须通过当前 scope 的 design 白名单。用户应用样式时，payload 会复制到当前 `issue.design.tokens`、`page.design` 或 `block.design`；Reader 不读取样式库。

## 2. 跨期复用边界

- Theme 样式保存解析后的完整标准 token。
- Page 样式只保存当前页自己的覆盖字段。
- Block 样式只保存当前组件自己的覆盖字段。
- `contextType` 只用于提示样式来源（例如 paragraph / news），不是强制类型锁；真正可应用字段仍由 scope 白名单决定。
- 空 Page / Block 覆盖不会保存为“我的样式”，避免制造没有效果的资产。

## 3. 一致性治理不是自动纠错

Alpha4 统计：

- 页面中有多少页设置了 `page.design`；
- 所有顶层/容器子组件中有多少设置了 `block.design`；
- 同一 block type 是否出现多种 design 签名，包括“完全继承”这一变体。

出现多种变体只表示“视觉存在分叉”。这可能是有意强调，也可能是忘记统一，因此 Studio 只提示并提供定位，不自动批量覆盖，也不把它作为 V3.0 正式发布门禁。

## 4. 服务端再次校验

即使前端已校验，`POST /api/design-library` 仍会检查：

- scope 只能为 theme / page / block；
- 未知字段拒绝保存；
- 颜色必须为 `#RRGGBB`；
- 数字范围和 block 枚举继续沿用 Alpha2 边界；
- 最多保存 60 个样式。

测试可以通过 `V3_DESIGN_LIBRARY_FILE` 指向临时文件，避免污染用户真实样式库。
