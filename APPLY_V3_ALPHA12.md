# 应用 V3.0-alpha12 增量包

Alpha12 是 overlay 增量包，不包含 `/1/`、`/2/` 的大型音视频文件，也不会直接覆盖线上稳定期刊目录。

在完整仓库根目录执行：

```bash
unzip -o ~/Downloads/jinchang-magazine-v3.0-alpha12-overlay.zip -d .
npm run verify:core
npm run studio:v3
```

浏览器访问：

```text
http://127.0.0.1:4173
```

如需执行两期期刊和制作中心完整 Chromium 回归：

```bash
npm run verify:v3
```

## TTS

第一、第二期随 Alpha12 写入了当前迁移正文的 TTS 指纹基线。以后页面正文或顺序发生变化，审计会提示 TTS 过期。

重新生成逐页 TTS 后执行：

```bash
npm run tts:baseline -- --issue 001
```

或在制作中心媒体工作台中确认新的 TTS 已按当前页面重新生成。

## ffmpeg

“自动生成视频封面”依赖本机 `ffmpeg`。若未安装，其他编辑能力不受影响；也可以手工上传图片并绑定为 poster。
