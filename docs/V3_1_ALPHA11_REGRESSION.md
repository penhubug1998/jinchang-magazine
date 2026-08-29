# V3.1-alpha11 Regression

## 专项 smoke
`npm run test:v31-alpha11`

覆盖：
- Alpha11 package/schema/stable version；
- Workspace HTML/CSS/JS 路由与服务端静态资源；
- PAGE INFO 位于 block canvas；
- Reader 即时 postMessage 在 live-preview 持久化之前发生；
- Reader scroll preservation；
- 001=18 页、002=29 页；
- Alpha10 Full Source R1 父 SHA；
- V3.0 正式门禁关键文件 SHA 锁。

## Chromium 专项
`npm run test:v31-alpha11-browser`

环境限制：本执行环境的 Chromium 直接访问 localhost 会被管理员策略阻断。因此真实 Studio server 的 `/api/health`、`/workspace/` 和静态资源使用真实 Node 服务分别验证；UI 交互使用实际 Studio HTML/CSS/JS 与实际 001/002 fixture，通过 CDP 注入受控 API fixture。不得把这项证据冒充 Mac Safari、iPhone Safari 或线上 HTTPS 正式门禁证据。

已覆盖：
- 1366×768 第一屏双栏；
- 全局侧栏/顶栏/常驻页面树隐藏；
- 页面信息块内嵌且默认折叠；
- 编辑区滚动位置在普通编辑后保持；
- 外层 document 不因预览更新跳顶；
- 普通编辑不重建 iframe；
- PC/手机预览尺寸切换不重载 iframe；
- 页面抽屉与上一页/下一页；
- 390×844 无横向溢出。

## 兼容回归
- Alpha1–Alpha11 smoke 连续 PASS。
- Studio 五档浏览器边界 PASS。
- Alpha1/Alpha2 Reader 五档矩阵 PASS。
- Alpha3–Alpha11 Chromium 专项 PASS。

## 正式门禁
必须单独执行 `npm run final:status`。开发 smoke/Chromium/Workspace 验收均不得转换成 V3.0.0 正式门禁 PASS。
