# 应用 V3.0-alpha3 增量包

将本压缩包内容解压到当前 `jinchang-magazine` 仓库根目录，同名 V3 文件允许覆盖。

本增量包不会覆盖现有稳定版 `1/`、`2/`，也不会重复打包第二期的大体积视频、背景音乐和 TTS。完整仓库中构建时会继续从 `2/assets/` 复用媒体资源。

## 验证

```bash
npm run verify:v3
```

如果当前机器没有 Chromium 或 `xvfb-run`，浏览器回归会自动跳过，但数据校验、构建与静态 smoke test 仍会执行。

## 本地预览

```bash
npm run build:v3
python -m http.server 8080
```

访问：

```text
http://localhost:8080/dist-v3/002/
```

稳定版第二期仍为：

```text
http://localhost:8080/2/
```

## alpha3 的定位

这是“阅读内核回归版”，不建议直接覆盖正式 `/2/`。完成人工视觉复核后，再进入 beta 阶段考虑正式接管第三期生产流程。
