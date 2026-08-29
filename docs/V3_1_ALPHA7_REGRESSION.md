# V3.1-alpha7 Regression

## 专项 smoke

```bash
npm run test:v31-alpha7
```

验证：

- Alpha7 schema 与父基线证据绑定；
- 制作看板和页面制作画像入口；
- 计划—页面漂移/孤页核对；
- 状态建议必须显式确认；
- sidecar 写入不改变 issue.json / issue.status；
- V3.0 正式门禁关键脚本 SHA256 未变化。

## 浏览器专项

```bash
npm run test:v31-alpha7-browser
```

覆盖：

1. 第一期开刊 18 页真实 fixture；
2. 从当前期刊同步整刊计划；
3. 新增 2 页计划并生成骨架；
4. 看板识别骨架；
5. 充实其中一页后识别 enriched；
6. 修改另一页栏目后识别结构漂移；
7. 漂移筛选与直接定位；
8. 修复页面并显式同步 sidecar 状态；
9. 验证 issue.json PUT 计数为 0、issue.status 不变；
10. 390×844 边界与横向溢出检查。

## 完整链

```bash
npm run verify:core
npm run final:status
```

两者必须分别记录。`verify:core` PASS 不等于 `final:status` READY。
