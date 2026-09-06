# 管理端登录

制作中心支持管理端登录层。未登录请求只能访问登录页、登录接口和健康检查；登录成功后通过 HttpOnly 会话 Cookie 进入制作中心，默认会话有效期为 8 小时。

## 启用

不要把密码写入仓库或前端文件，在启动管理端的运行环境中配置：

```bash
export STUDIO_ADMIN_USER=admin
export STUDIO_ADMIN_PASSWORD='在服务器环境中安全设置的长密码'
npm run studio:v3 -- --host 127.0.0.1 --port 4180
```

`npm run studio:v3` 现在先经过安全启动器：绑定 `127.0.0.1` / `localhost` / `::1` 时可继续用于本地开发；只要绑定 `0.0.0.0`、局域网地址或公网地址，并且不是 `--acceptance-only` 只读验收模式，就必须配置 `STUDIO_ADMIN_PASSWORD`，否则启动器会直接拒绝启动。这样可以避免因为漏配环境变量而把可编辑制作中心裸露到网络。

反向代理只负责 HTTPS 和路径转发，不要再叠加 Nginx `auth_basic`；否则浏览器会先弹出一次基础认证，再显示制作中心登录页，造成“登录两次”。正式管理端应始终通过 `npm run studio:v3` 启动，不要绕过安全启动器直接执行 `scripts/studio-v3.mjs`。

线上管理端入口：`https://www.jilv.online/new-jc-magazine-admin/`。`admin.jilv.online` 是另一套服务的入口，不是本期刊制作中心。

## 接口

- `GET /api/auth/session`：读取登录层状态
- `POST /api/auth/login`：提交 `{ "username": "...", "password": "..." }`
- `POST /api/auth/logout`：注销当前会话

验收命令：

```bash
npm run test:admin-auth
npm run test:studio-security
```
