# 应用 V3.0-alpha13 Overlay

Alpha13 是增量源码包，不包含历史 `/1/`、`/2/` 大型媒体，也不会主动覆盖线上稳定目录。

## Mac 推荐

先进入完整仓库根目录：

```bash
cd "/你的实际路径/jinchang-magazine"
```

将 overlay 覆盖到当前目录后执行：

```bash
npm run verify:core
npm run studio:v3 -- --port 4175
```

浏览器：

```text
http://127.0.0.1:4175
```

完整浏览器回归：

```bash
npm run verify:v3
```

## Alpha13 新入口

制作中心顶部：

```text
内容 → 快速导入
内容 → 我的模板
```

快速导入包括：粘贴正文、Word/Markdown/TXT、批量文章、栏目骨架。

详见：`docs/V3_CONTENT_IMPORT.md`。
