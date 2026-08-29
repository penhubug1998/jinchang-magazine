# V3 部署完整性与缓存策略（RC1）

## 发布包

执行：

```bash
npm run publish:v3 -- --issue 003
npm run deploy:check -- --issue 003
```

生成：

```text
release-v3/
  index.html
  catalog.json
  deploy-manifest.json
  nginx-cache-snippet.conf
  003/
    index.html
    reader.css
    reader.js
    issue.json
    assets/...
    release.json
    integrity.json
```

`integrity.json` 保存每个文件的 SHA256 和大小。部署前 `deploy:check` 会逐文件重新计算并比较，同时确认 `deploy-manifest.json` 的 treeSha256 与发布目录一致。

## 缓存原则

- HTML/JSON：`no-cache, max-age=0, must-revalidate`；
- JS/CSS/SVG/ICO：1 小时短缓存 + revalidate；
- 图片/音视频：1 天缓存 + revalidate；
- Reader CSS/JS 构建 URL 自动带 `?v=3.0.0-rc.1`。

不要对 `/issue.json` 使用长期 immutable 缓存，否则正文与 Reader/媒体容易产生版本错配。媒体若需要替换，优先使用新文件名，而不是同名覆盖。

`nginx-cache-snippet.conf` 是可合并配置片段，不应不检查现有 `location` 结构就整段覆盖线上 Nginx 配置。
