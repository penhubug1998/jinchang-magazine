# V3.1-alpha22.1 Rich Text Production Hardening

## 数据原则

```text
issue.json
  └─ block
      ├─ richText   # 结构化正文，事实来源
      └─ text       # 纯文本镜像：TTS / 搜索 / 摘要 / 向后兼容
```

不持久化 HTML。

## Runtime 策略

```text
Reader
  ↓
./vendor/tiptap-runtime.js
  ├─ READY → Tiptap Core
  └─ unavailable / placeholder → Structured Native Fallback
                                     ↓
                                  RichText JSON
```

生产环境因此不依赖公网 CDN。

## History 策略

```text
开始编辑
  ↓ sessionId
Reader snapshot (180ms)
  ↓ save/sync, no Studio history
Reader snapshot
  ↓ save/sync, no Studio history
结束编辑
  ↓ final=true
Studio creates one undo boundary
```

Reader 内部 Undo/Redo 与 Studio 全局 Undo/Redo 分层处理。

## Paste Pipeline

```text
Clipboard
  ↓
sanitize HTML / text
  ↓
allowed DOM structure
  ↓
Tiptap or structured fallback parser
  ↓
RichText JSON
  ↓
issue.json
```

## 部署建议

生产部署前在能访问 npm 的构建机执行：

```bash
npm install
npm run vendor:tiptap
npm run check:v3
npm run build:v3
```

构建机生成 vendor bundle 后，线上 Reader 只读取本站静态资源。
