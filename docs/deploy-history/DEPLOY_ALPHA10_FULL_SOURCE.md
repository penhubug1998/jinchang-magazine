# V3.1-alpha10 Full Source · /new-jc-magazine-admin 部署说明

本包是 Alpha10 可运行完整源码，不是只含 Studio 三文件的前端补丁。

## 必须保留的目录

- `package.json`
- `scripts/`（尤其 `studio-v3.mjs`、`new-issue-v3.mjs`、`lib-v3-production.mjs` 及其依赖）
- `src/studio/`
- `src/reader/`
- `issues/001/issue.json`、`issues/001/assets.json`
- `issues/002/issue.json`、`issues/002/assets.json`
- `baselines/`

第一期和第二期正文结构分别为 18 页、29 页。历史媒体实体目录 `1/assets`、`2/assets` 不在源码包内，部署时不要删除服务器上已经存在的这两个目录。

## Alpha10 Full Source R1 部署修复

1. 工程根目录不再依赖进程 `cwd`，改为根据 `scripts/lib-v3-production.mjs` 所在位置解析；也可通过 `JINCHANG_MAGAZINE_ROOT` 显式覆盖。
2. `issues/` 不存在时，新建一期会自动创建目录。
3. Studio 前端所有 `/api`、实时预览、媒体、审计报告和构建预览路径改为跟随当前页面基路径，可部署在 `/new-jc-magazine-admin/`。
4. Studio 启动日志会打印实际工程根目录，方便发现部署路径错误。

## 推荐 Nginx

```nginx
location = /new-jc-magazine-admin {
    return 301 /new-jc-magazine-admin/;
}

location /new-jc-magazine-admin/ {
    proxy_pass http://127.0.0.1:4199/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 100m;
}
```

`proxy_pass` 末尾的 `/` 用于把 `/new-jc-magazine-admin/...` 映射为 Studio 服务内部的 `/...`。

## 启动

```bash
cd /path/to/jinchang-magazine-v3.1-alpha10-full-source
npm run studio:v3 -- --host 127.0.0.1 --port 4199
```

即使 systemd/PM2 的 WorkingDirectory 配错，本修复版也会以源码自身位置解析工程根目录；生产环境仍建议设置正确的 WorkingDirectory 或：

```bash
export JINCHANG_MAGAZINE_ROOT=/path/to/jinchang-magazine-v3.1-alpha10-full-source
```

## 写权限

运行 Studio 的系统用户至少需要对以下路径有写权限：

- `issues/`（新建、保存期刊）
- `.v3-drafts/`
- `.v3-history/`
- `.v3-design-library/`
- `.v3-layout-library/`
- `.v3-editorial-plans/`
- `.v3-review-workspaces/`
- `.v3-review-handoffs/`
- `reports/`
- `dist-v3/`

如果这些路径不可写，新建一期、草稿、快照、校审或构建会失败。

## 部署后最小检查

```bash
curl -s http://127.0.0.1:4199/api/health
curl -s http://127.0.0.1:4199/api/issues
```

预期 health 版本为 `3.1.0-alpha.10`，并至少看到：

- `001`：18 页
- `002`：29 页

然后访问：

`https://www.jilv.online/new-jc-magazine-admin/`

新建一期时服务端应在本工程 `issues/` 下创建新的数字期号目录。

> 注意：内部开发回归 PASS 不改变 V3.0.0 正式门禁。正式门禁仍由 `npm run final:status` 的真实证据决定。
