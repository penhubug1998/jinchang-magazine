# 管理端登录

制作中心支持管理端登录层。未登录请求只能访问登录页、登录接口和健康检查；登录成功后通过 HttpOnly 会话 Cookie 进入制作中心，默认会话有效期为 8 小时。

## 启用

不要把密码写入仓库或前端文件，在启动管理端的运行环境中配置：

```bash
export STUDIO_ADMIN_USER=admin
export STUDIO_ADMIN_PASSWORD='在服务器环境中安全设置的长密码'
npm run studio:v3 -- --host 127.0.0.1 --port 4180
```

反向代理只负责 HTTPS 和路径转发，不要再叠加 Nginx `auth_basic`；否则浏览器会先弹出一次基础认证，再显示制作中心登录页，造成“登录两次”。未设置 `STUDIO_ADMIN_PASSWORD` 时，服务会返回 `enabled: false`，以便本地开发和验收台继续工作；正式管理端部署前应配置密码。

线上管理端入口：`https://www.jilv.online/new-jc-magazine-admin/`。`admin.jilv.online` 是另一套服务的入口，不是本期刊制作中心。

## 接口

- `GET /api/auth/session`：读取登录层状态
- `POST /api/auth/login`：提交 `{ "username": "...", "password": "..." }`
- `POST /api/auth/logout`：注销当前会话

验收命令：

```bash
npm run test:admin-auth
```
