# V3.1-alpha21 回归清单

```bash
npm run test:v31-alpha21
npm run test:v31-alpha21-browser
npm run test:v31-alpha20
npm run test:v31-alpha20-browser
npm run test:v31-alpha19
npm run test:v31-alpha19-browser
npm run check:v3
npm run build:v3
```

重点回归：

- 稳定 Block ID 选择在重排后不漂移。
- Page ID 优先于 pageIndex 解析。
- Reader 强同步 / page-ack 不倒退。
- Inspector 展开收起不破坏 Reader 尺寸计算。
- 手动缩放与 Fit 模式可往返切换。
- 旧 issue 无 ID 时仍由 Studio 自动迁移。
