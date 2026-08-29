# V3.0-alpha5 Changelog

## 目标

把 alpha4 的命令行生产链升级为“可视化制作 + 历史回滚 + 安全发布 + 自动归档”的本地制作平台雏形，同时继续保护现有 `/1/`、`/2/` 稳定目录。

## 新增

### 1. 自动归档首页

`npm run build:v3` 现在除了生成各期阅读器，还会生成：

- `dist-v3/index.html`
- `dist-v3/catalog.json`

归档页自动读取 `issues/*/issue.json` 生成期刊卡片，不再需要手工维护首页卡片。
Legacy 期刊链接会从数据文件中的历史相对路径转换为归档页可用的 `../1/`、`../2/` 等路径。

### 2. 版本快照与回滚

新增命令：

```bash
npm run snapshot:v3 -- --issue 003 --label "修改前"
npm run snapshots:v3 -- --issue 003
npm run rollback:v3 -- --issue 003 --snapshot <snapshot-id>
```

快照默认保存 `issue.json`、`assets.json` 和 `README.md`，不重复复制大媒体。回滚前会自动再创建一份安全快照。

### 3. 安全发布器

```bash
npm run publish:v3 -- --issue 003
```

发布器会强制执行完整 `release:check`，随后：

1. 创建 `pre-publish` 快照；
2. 重新构建；
3. 输出 `release-v3/003/`；
4. 写入 `release.json`；
5. 生成 `release-v3/index.html` 归档页；
6. 写入 `deploy-manifest.json`。

默认不会覆盖线上 `/1/`、`/2/`，也不会自动上传服务器。

### 4. 可视化制作中心

```bash
npm run studio:v3
```

默认打开本地地址：

`http://127.0.0.1:4173`

当前支持：

- 选择/新建期刊；
- 编辑期名、本期主题、状态、发布单位；
- 页面列表导航；
- 编辑页面 type / navTitle / kicker / title；
- 编辑 `blocks` JSON；
- 新增/删除页面；
- 保存前自动快照；
- 手工快照；
- 查看最近历史并回滚；
- 触发发布审计；
- 触发构建并打开阅读预览。

### 5. 目标期刊浏览器回归

修复 alpha4 的一个发布门禁缺口：此前浏览器回归固定测试第二期。

现在：

```bash
npm run release:check -- --issue 003
```

会真正对 `003` 执行 390×844、412×915、820×1180、1366×768、1920×1080 五档 Chromium 回归。

文章弹窗和视频专项会根据目标期刊是否存在对应 block 自动启用或跳过。

## 安全边界

- 发布器没有“跳过发布检查”的公开绕过路径。
- `publish:v3` 要求目标期刊状态为 `ready` 或 `published`。
- 发布产物写入 `release-v3/`，不会直接复制到线上历史目录。
- 回滚会先自动保存当前状态，避免误操作导致当前版本丢失。
