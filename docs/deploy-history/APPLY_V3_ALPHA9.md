# V3.0-alpha9 Overlay 使用说明

这是源码增量包，不覆盖现有 `/1/`、`/2/` 稳定目录，也不重复包含大型音视频。

## 覆盖到完整项目

请先进入真正的 `jinchang-magazine` 项目根目录；这里必须能看到 `package.json`、`scripts/`、`issues/`、`src/`。

```bash
cd "/你的实际路径/jinchang-magazine"
unzip -o ~/Downloads/jinchang-magazine-v3.0-alpha9-overlay.zip -d .
npm run verify:v3
npm run studio:v3
```

浏览器打开：

```text
http://127.0.0.1:4173
```

## Alpha9 重点

- 第一期已成为 18 页 V3 可编辑历史刊。
- 第二期保持 29 页 V3，并修正为 published 状态。
- 左侧期刊栏桌面固定。
- 期刊元信息默认折叠。
- 页面结构与页面编辑独立滚动，1366×768 首屏即可开始编辑。
- 已发布历史刊修改仍通过保存前快照保护；V3 构建不会直接覆盖 `/1/`、`/2/`。

## standalone overlay 提示

如果只解压 overlay 而没有完整仓库，会看到 `1/assets` / `2/assets` 不存在的非阻断警告。这是因为媒体资源故意不重复打包；将 overlay 合入完整仓库后会进行真实资源检查。
