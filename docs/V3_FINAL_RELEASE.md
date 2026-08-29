# V3.0.0 正式版

V3.0.0 冻结 Alpha9 → RC3 已验证的 Reader、Studio、导入、媒体、TTS、审计、发布和回滚能力。

## 正式版原则

- `package.json` 固定为 `3.0.0`，不再带 prerelease 后缀。
- V3.0 schema 冻结在 `baselines/v3-schema-3.0.json`：9 类页面、14 类内容块及核心边界。
- 破坏性 schema 变化不得直接进入 V3.0.x；必须提供迁移或进入下一主版本。
- `verify:v3` 指向完整正式版回归 `verify:final`。
- 版本号成为 3.0.0 不代表线上已经正式发布。

## 六项正式发布门禁

执行：

```bash
npm run final:status
```

必须全部 READY：

1. 完整历史媒体仓库；
2. Mac Safari 实机；
3. iPhone Safari 实机；
4. 第三期真实材料试制；
5. 部署/回滚自动演练；
6. 正式 HTTPS 线上缓存与完整性。

正式发布采用两阶段：

### 阶段 A：生成可部署正式包

历史媒体、Mac Safari、iPhone Safari、第三期真实试制、部署/回滚演练五项部署前门禁 READY 后：

```bash
npm run final:release -- --issue 003 --confirm
```

生成 `release-v3/V3.0.0-PACKAGE.json`，状态为 `FINAL_PACKAGE_READY_FOR_DEPLOY`。它不会直接修改服务器。服务器部署仍需显式：

```bash
npm run deploy:apply -- --issue 003 --target /path/to/jinchang-magazine --confirm
```

部署后执行正式 HTTPS 校验：

```bash
npm run online:check -- --base https://www.jilv.online/jinchang-magazine --issue 003 --strict
```

### 阶段 B：正式封版

当六项门禁全部 READY：

```bash
npm run final:seal -- --issue 003 --confirm
```

这一步才生成 `release-v3/V3.0.0-RELEASE.json` 与 `reports/v3-final-release.json`，并锁定已线上验证的 `treeSha256`。

## Schema 冻结

`baselines/v3-schema-3.0.json` 是 V3.0 数据契约基线。正式版仍支持高级 JSON，但必须通过该 schema 所代表的现有类型和边界。

后续 V3.0.x 只接受兼容性修复、安全修复、审计/可读性增强和不破坏旧刊的数据扩展。
