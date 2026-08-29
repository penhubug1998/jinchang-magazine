# V3.1-alpha2 样式继承模型

```text
全刊 Theme
   ↓ 未覆盖则继承
页面 Style
   ↓ 未覆盖则继承
组件 Style
```

设计器遵循“默认优秀、进阶自由”：普通用户可以只选择 Theme；需要差异化时才覆盖页面或单个组件。

## Theme tokens
`accent / paper / text / muted / fontBase / radius / spacing`

## Page overrides
`background / color / accent / padding / contentWidth`

## Block overrides
`fontSize / fontWeight / color / background / padding / margin / radius / borderWidth / borderColor / shadow / textAlign / width`

所有值都由 `check:v3` 和 Studio 保存 API 双重校验。
