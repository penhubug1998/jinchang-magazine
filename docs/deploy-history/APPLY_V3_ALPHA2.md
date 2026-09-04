# 应用 V3.0-alpha2 增量包

将本增量包内容解压覆盖到 `jinchang-magazine` 仓库根目录。

本包不会包含也不会覆盖：

```text
1/
2/
index.html
```

因此现有两期线上页面不会被替换。

覆盖后执行：

```bash
npm run verify:v3
```

然后预览：

```bash
python -m http.server 8080
```

打开：

```text
http://localhost:8080/dist-v3/002/
```

原稳定版仍是：

```text
http://localhost:8080/2/
```

建议先做 V3 与稳定版逐页对照，不要直接把 `dist-v3/002/` 覆盖 `/2/`。
