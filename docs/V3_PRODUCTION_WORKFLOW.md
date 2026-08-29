# V3 电子期刊生产与发布工作流

## 1. 创建新一期

最简命令：

```bash
npm run new:issue -- --subtitle "本期主题"
```

系统会读取 `issues/` 中现有数字期号并自动选择下一期，例如当前存在 `001`、`002` 时自动创建 `003`。

也可以手动指定：

```bash
npm run new:issue -- --id 003 --label 第三期 --subtitle "本期主题"
```

自定义栏目：

```bash
npm run new:issue -- --subtitle "本期主题" --sections "时政要闻,理论学习,反诈防骗,警示教育,时令养生"
```

生成结果：

```text
issues/003/
├── issue.json
├── assets.json
├── README.md
└── assets/
    ├── image/
    ├── music/
    ├── tts/
    └── video/
```

## 2. 编辑内容

只编辑 `issue.json`，不再复制或修改阅读器 HTML。

常用内容块：

- `paragraph`：正文
- `quote`：引文/重点提示
- `chips`：标签
- `cardline`：序号卡片
- `casePair`：案例 + 警示双栏
- `articleLink`：外部文章弹窗
- `image`：图片
- `video`：视频
- `toc`：目录

## 3. 放置媒体

默认目录：

```text
assets/music/bgm.mp3
assets/tts/page-01.mp3
assets/tts/page-02.mp3
...
assets/image/*
assets/video/*
```

修改页面数量或媒体引用后：

```bash
npm run assets:sync -- --issue 003
```

这会重新生成 `assets.json`，无需手工维护 TTS 页码列表。

## 4. 草稿预览

`status=draft` 时允许资源暂未齐全：

```bash
npm run build:v3
python -m http.server 8080
```

访问：

```text
http://localhost:8080/dist-v3/003/
```

缺少媒体只会在草稿阶段给出警告，不阻止页面预览。

## 5. 日常审计

```bash
npm run audit:v3 -- --issue 003
```

生成：

```text
reports/v3-release-audit-003.json
reports/v3-release-audit-003.md
reports/v3-release-audit-003.html
```

HTML 报告适合直接用浏览器查看。

## 6. 发布前门禁

内容、页面、TTS 和媒体全部确认后，将：

```json
"status": "draft"
```

改为：

```json
"status": "ready"
```

执行：

```bash
npm run release:check -- --issue 003
```

检查顺序：

1. 数据结构
2. V3 构建
3. 静态 smoke
4. 五档真实 Chromium 回归
5. 严格媒体/TTS/状态审计

只有全部通过才输出“发布前检查通过”。

开发机如果只需要快速检查、明确暂时不跑浏览器，可以：

```bash
npm run release:check -- --issue 003 --skip-browser
```

正式发布前仍建议运行完整版本。

## 7. 发布

Alpha4 只完成“制作 + 检查”基础设施，不自动替换线上 `/1/`、`/2/`。正式发布目录由后续发布脚本负责，以避免测试构建误覆盖生产站点。
