# V3.0-beta1 Overlay 应用说明

Beta1 是 V3 功能冻结与全局回归版本，不再引入大型产品功能，重点锁定历史刊、Reader、Studio、导入、媒体、TTS、修订、发布与回滚链路。

## 覆盖到完整仓库

```bash
cd "/你的实际路径/jinchang-magazine"
unzip -o ~/Downloads/jinchang-magazine-v3.0-beta1-overlay.zip -d .
```

确认项目根目录存在：

```text
package.json
issues/
scripts/
src/
```

## 快速门禁

```bash
npm run verify:core
```

完整 Beta 门禁（包含真实浏览器）：

```bash
npm run verify:beta
```

`npm run verify:v3` 现在等价于 `verify:beta`。

## 启动制作中心

如果 4173～4176 已被之前 Alpha 占用，可继续使用新端口：

```bash
npm run studio:v3 -- --port 4177
```

健康检查：

```text
http://127.0.0.1:4177/api/health
```

应返回版本 `3.0.0-beta.1`。

## Beta1 冻结基线

`baselines/v3-beta1.json` 锁定：

- 第一期：18 页；
- 第二期：29 页；
- 页面标题与顺序；
- 文章 ID；
- 页面结构摘要；
- 文章库摘要；
- TTS 正文指纹。

如果未来确实要修订已经发布的第一/第二期，应先通过 Studio 正常修订、审计和发布流程，再明确更新 baseline。不要为了让测试通过而直接改 baseline。

## 发布安全

Beta1 发布器使用 staging 原子替换：

```text
build → release/.<id>.staging-* → 写完整 release.json → 原子切换正式目录
```

如果发布前检查失败，上一份 `release-v3/<id>/` 保持不动。回滚仍会在恢复前自动创建安全快照。

## Overlay 媒体提示

源码增量包仍不重复包含 `1/assets`、`2/assets` 的历史大型媒体。因此单独解压 overlay 执行校验时会出现两条非阻断资源提示；合并到完整仓库后才会检查真实历史媒体。
