# V3.0-beta2 回归结果

Beta2 核心门禁覆盖 Alpha9～Alpha14、Beta1 冻结/恢复以及 Beta2 真实生产演练。

## 生产演练结果

- DOCX 导入：3 页；
- Markdown 导入：2 页；
- 最终演练刊：10 页；
- 图片 / 视频 / 音乐 / TTS：PASS；
- TTS baseline：PASS；
- strict audit：PASS；
- publish：PASS；
- deploy integrity：PASS；
- MP4 Range `bytes=0-99`：HTTP 206，100 bytes；
- 正文变化触发 `TTS_SOURCE_STALE`：PASS；
- snapshot rollback 后重新审计：PASS；
- 故意发布失败后上一 release 保持完整：PASS。

## 浏览器

001、002、Beta1 block matrix 的 Reader 五档均通过。Studio、Alpha13 导入、Alpha14 真实 Reader 也分别通过既有五档回归。

Beta2 额外执行 Safari-like compatibility mode：移除 `visualViewport` 与页面 Fullscreen API 后，002 仍在五档 Chromium 通过，手机端 fullscreen 按钮成功进入沉浸模式。

## 兼容性声明

Edge/Chrome 由 Chromium 真实回归覆盖。自动化环境没有原生 Safari，所以 Safari 专项结论为“代码 fallback + capability-degraded Chromium PASS”，不是原生 Safari 实机认证。RC1 前仍需 Mac/iPhone Safari 人工验收。

## 总命令说明

`npm run verify:beta2` 已串行完整通过 `verify:core` 与第一期 Reader，随后在第二期 Reader 阶段触发当前执行器的 600 秒单次命令上限。该阶段没有断言失败。随后第二期 Reader、Studio、Alpha13、Alpha14、Beta1 matrix、Beta2 Safari-like 六套浏览器回归均在同一最终代码上分别重跑并完整 PASS。
