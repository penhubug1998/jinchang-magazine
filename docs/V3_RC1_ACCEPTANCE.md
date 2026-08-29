# V3.0 RC1 实机验收

RC1 明确区分“自动兼容回归”和“真实 Safari 实机认证”。Chromium/Safari-like fallback 通过，**不能**替代 Mac Safari 与 iPhone Safari 的真实操作确认。

## 1. 启动只读验收台

在完整项目根目录：

```bash
npm run rc:safari
```

默认监听 `0.0.0.0:4180`。终端会打印 Mac 本机地址和局域网 IPv4 地址。只在可信局域网使用；该模式会禁止期刊编辑 API。

如果端口被占用：

```bash
npm run rc:safari -- --port 4181
```

## 2. Mac Safari

用 Safari 打开终端输出的地址，例如 `http://192.168.1.20:4180/`，设备类型选择 **Mac Safari**。验收台会自动检查 Reader 数据、localStorage、视觉能力以及完整仓库里的视频 Range 206。

人工逐项确认：翻页、目录跳转、字号、逐页朗读、背景音乐、视频拖动、页面全屏/沉浸模式、刷新后的状态。

全部确认后提交。结果写入：

`reports/v3-rc1-device-acceptance.json`

## 3. iPhone Safari

Mac 与 iPhone 在同一可信 Wi‑Fi。iPhone Safari 打开同一个局域网地址，设备类型选择 **iPhone Safari**。重点确认：

- 横向滑动翻页；
- 390×844 单页布局无横向溢出；
- 视频可播放、拖动进度并进入 iOS 系统视频全屏；
- 页面 Fullscreen 不可用时沉浸 fallback 正常；
- 横竖屏切换后 Reader 和底部工具栏不漂移；
- TTS/音乐切页状态正确。

RC1 readiness 同时要求 `mac-safari` 和 `iphone-safari` 至少各有一条 `passed=true` 的记录。

## 4. 查看就绪状态

```bash
npm run rc:status
```

正式决定 RC1 是否满足所有外部 gate 时：

```bash
npm run rc:status -- --strict
```
