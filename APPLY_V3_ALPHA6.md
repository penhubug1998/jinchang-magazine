# Jinchang Magazine V3.0-alpha6 Overlay

本包基于 alpha5 增量升级，重点增强制作中心界面边界和发布审计可用性。

## 覆盖方式

将压缩包内容覆盖到现有 `jinchang-magazine` 仓库根目录。

不会主动删除或覆盖历史 `/1/`、`/2/` 线上稳定目录。

## 完整验证

```bash
npm run verify:v3
```

其中新增制作中心边界回归：

```bash
npm run test:studio-browser
```

## 启动制作中心

```bash
npm run studio:v3
```

浏览器打开：

```text
http://127.0.0.1:4173
```

## 审计

日常制作：

```bash
npm run audit:v3 -- --issue 003
```

发布前：

```bash
npm run audit:v3 -- --strict --issue 003
npm run release:check -- --issue 003
```

制作中心中也可以直接点击“日常审计”或“发布前检查”，并通过每条问题后的“定位”回到相应字段。
