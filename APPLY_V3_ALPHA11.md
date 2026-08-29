# 应用 V3.0-alpha11 overlay

Alpha11 是源码增量包，不包含旧 `/1/`、`/2/` 中的大型音视频，也不会主动覆盖线上稳定目录。

## 推荐：覆盖到完整仓库

在 macOS 上先进入完整 `jinchang-magazine` 项目根目录。这个目录必须能看到：

```text
package.json
issues/
scripts/
src/
1/
2/
```

例如：

```bash
cd "/你的实际路径/jinchang-magazine"
unzip -o ~/Downloads/jinchang-magazine-v3.0-alpha11-overlay.zip -d .
```

然后先执行核心验证：

```bash
npm run verify:core
```

需要完整浏览器门禁时：

```bash
npm run verify:v3
```

启动制作中心：

```bash
npm run studio:v3
```

浏览器访问：

```text
http://127.0.0.1:4173
```

## Alpha11 草稿说明

编辑过程中产生的恢复草稿保存在：

```text
.v3-drafts/
```

它不会提交到 Git，也不代表正式保存或正式发布。

## 历史刊修订说明

第一、第二期均可在制作中心编辑。对 `published` 期刊正式保存后会显示“未发布修订”，但不会直接覆盖线上 `/1/`、`/2/`。

完成审计和发布流程后再生成发布包：

```bash
npm run release:check -- --issue 001
npm run publish:v3 -- --issue 001
```

只有明确需要同步源稿发布状态时才使用：

```bash
npm run publish:v3 -- --issue 001 --mark-published
```
