# V3.0-beta2 Overlay 使用说明

本包是增量 overlay，不包含历史 `1/assets`、`2/assets` 大型媒体，也不会覆盖线上 `/1/`、`/2/`。

```bash
cd "/你的完整 jinchang-magazine 项目目录"
unzip -o jinchang-magazine-v3.0-beta2-overlay.zip -d .
npm run verify:core
npm run studio:v3 -- --port 4178
```

完整仓库建议再执行：

```bash
npm run media:check -- --strict
npm run verify:beta2
```

正式发布某一期：

```bash
npm run publish:v3 -- --issue 003
npm run deploy:check -- --issue 003
```

缓存策略参见 `docs/V3_DEPLOYMENT_AND_CACHE.md`。
