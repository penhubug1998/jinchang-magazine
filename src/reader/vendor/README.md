# Tiptap self-hosted runtime

`src/reader/vendor/tiptap-runtime.js` 默认是安全占位模块。正式部署前，在可访问 npm 的构建机执行：

```bash
npm install
npm run vendor:tiptap
npm run build:v3
```

脚本会使用项目固定版本的 Tiptap 依赖和 esbuild 生成单文件 ESM bundle，并写入 `tiptap-runtime.manifest.json`。Reader 只尝试加载这个本地模块，不再访问外部 CDN。

如果 bundle 尚未生成或损坏，V3.1-alpha22.1 会自动启用本地结构化 fallback editor；RichText JSON 仍然是持久化事实来源。
