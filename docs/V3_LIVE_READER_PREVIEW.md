# V3 Live Reader Preview

## 设计原则

Alpha14 的“所见即所得”必须使用正式 Reader 本身，而不是在 Studio 再复制一套 HTML/CSS 版式。

```text
Studio editor state
     │
     ├── POST /api/issues/:id/live-preview  （进程内存，便于新窗口访问）
     │
     └── postMessage(issue)                  （当前 iframe 即时同步）
              ↓
       src/reader 实际运行
              ↓
       postMessage(page/ready/synced)
              ↓
          Studio UI
```

## 为什么同时有 POST 和 postMessage

- `postMessage`：让当前 iframe 立即收到未保存数据，延迟最低。
- 内存 live-preview API：让 iframe 初次打开、新窗口打开和刷新时也能取得同一份未保存编辑稿。

两者都不修改磁盘正式稿。

## 设备视口

Studio 不通过给 Reader 添加“mobile class”来伪造设备，而是直接设置 iframe 的目标 CSS viewport。Reader 自己的 `matchMedia` / CSS media query 决定单页还是双页。

当前 Reader 移动断点为 `max-width:760px`，因此：

- 390 / 412：移动单页；
- 820：平板双页；
- 1366 / 1920：PC 双页。

外层使用 scale 只负责把目标 viewport 完整放进 Studio 卡片，不改变内部逻辑宽度。

## 数据隔离

Studio embed Reader：

- 不持久化 reader progress；
- 不持久化 Reader 字号；
- 不持久化音乐偏好；
- 默认不自动播放背景音乐；
- 不因预览切页修改 `issue.json`。

正式编辑数据仍由 Studio 保存链管理。

## 发布边界

实时 Reader 是制作工具，不是发布门禁。正式上线前仍必须：

```bash
npm run release:check -- --issue <id>
```

历史刊修订仍要遵循 snapshot / revision.pending / publish 流程。
