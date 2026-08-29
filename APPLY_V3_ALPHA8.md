# Jinchang Magazine V3.0-alpha8 Overlay

Alpha8 是增量包。请覆盖到**完整项目根目录**，不要在用户主目录直接执行 `npm run`。

## macOS 示例

```bash
cd /你的路径/jinchang-magazine
unzip -o ~/Downloads/jinchang-magazine-v3.0-alpha8-overlay.zip -d .
npm run verify:v3
npm run studio:v3
```

打开：

```text
http://127.0.0.1:4173
```

如果终端提示找不到 `package.json`，先执行 `pwd` / `ls`，确认当前目录就是包含 `package.json`、`scripts/`、`src/`、`issues/` 的项目根目录。

## Alpha8 使用建议

1. 新建一期时，可选择“标准新刊模板”或“复制既有 V3 栏目结构”。
2. 给连续多页填写统一的“栏目归属”，再点击“自动目录”。
3. 图片/视频块点击“选择资源”，从媒体库选择或上传。
4. 外部文章在顶部“文章库”维护，再通过 `articleLink` 内容块引用。
5. 快速预览用于编辑反馈；成刊预览需要“保存并刷新”。
6. 内容完成后依次运行日常审计、发布前检查、`release:check`。

## 安全边界

- `/1/`、`/2/` 稳定目录不会被本 overlay 覆盖。
- `2/assets` 等历史/外部资源在制作中心只读。
- 上传媒体不会静默覆盖同名文件。
- Alpha8 overlay 不包含第二期的大型视频/TTS。
