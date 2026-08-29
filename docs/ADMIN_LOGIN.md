# 管理端登录

制作中心支持可选的管理端登录层。启用后，未登录请求只能访问登录页、登录接口和健康检查；登录成功后通过 HttpOnly 会话 Cookie 进入制作中心，默认会话有效期为 8 小时。

## 启用

不要把密码写入仓库或前端文件，在启动管理端的运行环境中配置：

```bash
export STUDIO_ADMIN_USER=admin
export STUDIO_ADMIN_PASSWORD='在服务器环境中安全设置的长密码'
npm run studio:v3 -- --host 127.0.0.1 --port 4180
```

反向代理继续保留现有的 HTTPS 和 Basic Auth 外层保护。未设置 `STUDIO_ADMIN_PASSWORD` 时，服务会返回 `enabled: false`，以便本地开发和验收台继续工作；正式管理端部署前应配置密码。

## 接口

- `GET /api/auth/session`：读取登录层状态
- `POST /api/auth/login`：提交 `{ "username": "...", "password": "..." }`
- `POST /api/auth/logout`：注销当前会话

验收命令：

```bash
npm run test:admin-auth
```
