# V3.1-alpha23 Changelog

- 新增 `src/reader/layout-engine.js`。
- 新增派生 Publishing Plan；HTML 不成为事实来源。
- 新增 `textFlow` 跨页结构化续排。
- RichText 段落拆分保留 mark，并加入 heading keep / widow / orphan 策略。
- 页面新增 1–3 栏、column-gap、balance、column-rule。
- 新增 `pullQuote`、`sidebar`、`sectionHeading`。
- 新增 drop cap、left/right wrap、span-all、avoid-break、keep-with-next。
- image/video Caption 支持 `publishing.captionLabel`。
- Studio Block Palette 与 Context Inspector 增加出版属性入口。
- `check-v3` 增加 Alpha23 block/publishing/flow 校验。
- narration text 支持新 block 类型。
- build 为 `layout-engine.js` 增加版本戳。
- 修复 Studio 静态预览服务器把 JSON Buffer 二次 JSON.stringify 的问题；静态文件现在按原始字节发送。
- 新增 Alpha23 Smoke / Chromium 回归和出版示例刊。
