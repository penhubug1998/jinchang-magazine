# 第三期 · V3 编辑区

本目录由 `npm run new:issue` 自动创建。

## 推荐流程

1. 编辑 `issue.json` 中的标题、栏目与正文。
2. 图片放入 `assets/image/`，视频放入 `assets/video/`，背景音乐放入 `assets/music/bgm.mp3`。
3. 为每个阅读页准备 `assets/tts/page-XX.mp3`。
4. 修改页面/媒体后执行：`npm run assets:sync -- --issue 003`。
5. 日常检查：`npm run audit:v3 -- --issue 003`。
6. 发布前：`npm run release:check -- --issue 003`。

> `status` 默认为 `draft`。内容和资源全部确认后可改为 `ready`，发布后改为 `published`。
