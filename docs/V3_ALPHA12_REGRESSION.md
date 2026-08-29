# V3.0-alpha12 回归报告

## 自动验证

- `npm run verify:core`：PASS
- `npm run test:browser:001`：PASS
- `npm run test:browser`（002）：PASS
- `npm run test:studio-browser`：PASS
- `npm run test:alpha12`：PASS
- `npm run test:studio-workflow`：PASS

## Alpha12 专项覆盖

1. 图片 `frameRatio / fit / positionX / positionY` Reader 与 Studio 双端支持。
2. 320×740 至 1920×1080 图片裁切与焦点对话框无横向越界。
3. 图片上传优化逻辑不覆盖原文件，重名继续自动改名。
4. 媒体列表能返回使用状态、引用数量和引用位置。
5. 被引用媒体删除返回 409 / `ASSET_IN_USE`。
6. 解除引用后的 managed media 可删除。
7. 未引用媒体清理先返回预检清单。
8. 本环境存在 ffmpeg 时，真实生成测试 MP4 并验证 poster 自动截取。
9. TTS 文件齐全后可建立正文基线；修改一页标题后 `tts.stale=true`。
10. 001（18页）与 002（29页）的既有 TTS 基线与当前迁移正文一致。

## 浏览器尺寸

制作中心：

- 320×740
- 390×844
- 768×1024
- 1366×768
- 1920×1080

第一、第二期 Reader：

- 390×844
- 412×915
- 820×1180
- 1366×768
- 1920×1080
