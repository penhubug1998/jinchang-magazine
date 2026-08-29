# V3.0 RC1 部署、回滚与线上校验

## 发布包

先生成并检查目标期刊：

```bash
npm run publish:v3 -- --issue 003
npm run deploy:check -- --issue 003
```

发布包在 `release-v3/`，每一期都包含 `integrity.json`，根目录包含 `deploy-manifest.json` 和 Nginx 缓存片段。

## 目录部署：默认 dry-run

```bash
npm run deploy:apply -- \
  --issue 003 \
  --target /var/www/jilv.online/jinchang-magazine
```

只显示计划，不写目录。确认后：

```bash
npm run deploy:apply -- \
  --issue 003 \
  --target /var/www/jilv.online/jinchang-magazine \
  --confirm
```

默认 `003 → 3/`，也可以显式指定 `--remote-path 3`。部署使用 staging → 原子切换，旧期刊与根归档文件会进入 `.v3-deployments/backups/`，同时生成 receipt。

## 回滚

先 dry-run：

```bash
npm run deploy:rollback -- --issue 003 --target /var/www/jilv.online/jinchang-magazine
```

确认：

```bash
npm run deploy:rollback -- --issue 003 --target /var/www/jilv.online/jinchang-magazine --confirm
```

默认使用该期最新 receipt；也可通过 `--receipt` 指定。

## 正式 HTTPS 线上验证

部署完成后：

```bash
npm run online:check -- \
  --base https://www.jilv.online/jinchang-magazine \
  --issue 003 \
  --strict
```

会核对：归档首页、期刊首页、issue.json、integrity.json、关键 Reader 文件 SHA256、treeSha256、HTML/JSON/JS/CSS/媒体 Cache-Control，以及第一段视频 `Range: bytes=0-99 → 206`。

报告写入 `reports/v3-rc1-online-verification-003.json`。
