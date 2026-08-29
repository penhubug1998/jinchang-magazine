# 正式发布与分享交接

发布中心现在将“生成正式发布包”和“上线公开网站”明确拆成两步：

1. 点击“正式发布”，执行发布前硬性门禁、建立快照、生成 `release-v3/<issue>/`，并把源稿状态标记为 `published`。
2. 点击“部署到公开网站”，服务端校验当前正式包的 `integrity.json`，以原子方式写入公开目录，并重新生成公开归档首页。
3. 服务端读取公开 Reader 与 `issue.json`，确认 HTTP 状态、期刊 ID、`published` 状态和 Reader 标记都正确后，制作中心才显示“已上线”。

部署完成后，发布中心会提供：

- 可复制的公开 Reader 链接；
- 系统分享入口，支持浏览器可用的 `navigator.share`，不支持时自动回退复制；
- 二维码（二维码组件加载失败时不影响复制链接）；
- 公开目录归档链接。

QQ 和微信个人号不会被网页强制唤起。实际分享方式是复制链接、系统分享或扫码发送，避免依赖桌面端/移动端私有协议。

## 服务环境配置

正式服务器启动环境需要提供：

```ini
V3_PUBLIC_MAGAZINE_ROOT=/var/www/jilv.online/new-jc-magazine
V3_PUBLIC_MAGAZINE_BASE_URL=https://www.jilv.online/new-jc-magazine
```

运行用户必须能写入公开目录；systemd 的 `ReadWritePaths` 也必须显式包含该目录。服务启动后，部署接口只接受制作中心内置的期刊 ID，不接受任意文件系统路径。

二维码增强使用 [danielgjackson/qrcodejs](https://github.com/danielgjackson/qrcodejs) 的浏览器模块；二维码不是发布链路的硬性依赖，无法加载时仍保留复制和系统分享能力。
