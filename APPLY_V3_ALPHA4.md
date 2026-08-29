# 应用 V3.0-alpha4

将本增量包解压到 `jinchang-magazine` 项目根目录，覆盖同名 V3 开发文件即可。不会覆盖现有 `1/`、`2/` 稳定期刊目录。

## 验证 Alpha4

```bash
npm run verify:v3
npm run audit:v3 -- --issue 002
```

## 创建未来第三期

```bash
npm run new:issue -- --subtitle "第三期主题"
```

当前仓库已有 `001`、`002` 时会自动创建 `issues/003/`。

## 发布前

```bash
npm run assets:sync -- --issue 003
# 将 issues/003/issue.json 中 status 改为 ready
npm run release:check -- --issue 003
```

详见 `docs/V3_PRODUCTION_WORKFLOW.md`。
