# V3.1-alpha6 Regression

封板前至少执行：

```bash
npm run test:v31-alpha6
npm run test:v31-alpha6-browser
npm run verify:core
npm run final:status
```

浏览器专项应验证：

1. 第一期开刊仍为 18 页；
2. 第二期开刊仍为 29 页；
3. 当前期刊同步只建立计划；
4. 参考第二期只建立计划，不修改第一期页面；
5. Sidecar 保存不触发 `issue.json` PUT；
6. 两页计划只生成两个缺失页面；
7. 原有 18 页内容保持；
8. 计划备注和计划 ID 不进入生成页面；
9. 390×844 编排台无横向溢出；
10. V3.0.0 正式门禁仍由独立 `final:status` 判定。
