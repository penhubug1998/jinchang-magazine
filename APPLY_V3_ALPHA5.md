# Jinchang Magazine V3.0-alpha5 Overlay

本包是基于 alpha4 的增量升级包。

## 覆盖方式

将压缩包内容解压到现有 `jinchang-magazine` 仓库根目录。

不会主动删除或覆盖历史 `/1/`、`/2/` 内容目录；本包主要新增/更新 `src/`、`scripts/`、`issues/` 元数据、文档和 CI 配置。

## 安装后验证

```bash
npm run verify:v3
```

## 启动制作中心

```bash
npm run studio:v3
```

访问：

```text
http://127.0.0.1:4173
```

## 创建第三期示例

```bash
npm run new:issue -- --subtitle "第三期主题"
npm run studio:v3
```

## 发布前

```bash
npm run assets:sync -- --issue 003
npm run audit:v3 -- --issue 003
# 将 status 改为 ready
npm run release:check -- --issue 003
npm run publish:v3 -- --issue 003
```

正式发布包会出现在 `release-v3/003/`，不会自动覆盖线上目录。
