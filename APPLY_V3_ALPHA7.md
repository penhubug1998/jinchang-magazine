# Jinchang Magazine V3.0-alpha7 Overlay

这是在 V3.0-alpha6 基础上的增量源码包，不包含线上 `/1/`、`/2/` 和第二期大型媒体资源。

## 应用

将压缩包内容覆盖到完整项目根目录，然后执行：

```bash
npm run verify:v3
npm run studio:v3
```

制作中心：

```text
http://127.0.0.1:4173
```

## alpha7 重点

- 可视化内容块编辑
- 高级 JSON 双向同步
- 上移/下移/复制/删除/桌面拖拽
- 当前页实时预览
- 审计直接定位到具体内容块
- 内容块/数组/文本服务端硬边界
- 新增 `npm run test:visual-editor`

## 注意

`issues/002/assetSource` 仍指向完整仓库中的 `2/assets`。单独解压 overlay 运行时会出现资源目录不存在的非阻断提示，这是预期行为。
