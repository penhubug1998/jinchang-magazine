# V3.0-alpha14 Overlay 应用说明

本包是增量 overlay，不包含历史 `/1/`、`/2/` 大型媒体文件，也不会主动覆盖线上稳定目录。

## 合入完整仓库

```bash
cd "/你的实际路径/jinchang-magazine"
unzip -o ~/Downloads/jinchang-magazine-v3.0-alpha14-overlay.zip -d .
npm run verify:core
```

## 启动制作中心

如果 4173—4175 已被旧版本占用，可使用：

```bash
npm run studio:v3 -- --port 4176
```

打开：

```text
http://127.0.0.1:4176
```

健康检查应返回 Alpha14：

```text
{"ok":true,"version":"3.0.0-alpha.14"}
```

## 真实 Reader

打开任一期后，右侧“预览”默认使用真实 Reader。编辑内容后无需保存即可同步；可以在设备菜单切换 PC、iPad、手机尺寸。

“真实 Reader 已同步当前编辑稿”只表示预览同步成功，不代表正式稿已经保存或通过发布审计。
