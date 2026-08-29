# V3.1-alpha4 Regression

最终候选于 2026-08-22 完成以下独立证据链；V3.1 开发回归与 V3.0.0 正式发布门禁分开判定。

## Core

- `npm run verify:core`：exit 0。
- V3.0 历史回归链、final smoke、final gates / final ops 均 PASS。
- V3.1-alpha1：PASS，schema=`f95e1a6caea947d0`。
- V3.1-alpha2：PASS，schema=`f796dc7d6bf9f9fc`。
- V3.1-alpha3：PASS，schema=`c7a570f2eb26f216`。
- V3.1-alpha4：PASS，schema=`96d2686428713c3d`。
- 当前 overlay 仍只有 `1/assets`、`2/assets` 缺失的两条既有非阻断警告。

## Alpha4 专项

- 项目本地“我的样式”支持 Theme / Page / Block 保存、读取、应用、删除；不向 `issue.json` 写库引用。
- 服务端拒绝未知字段、越界样式值与空样式。
- 整刊一致性治理统计页面/组件覆盖率，并检测同类型组件显式样式分叉；结果仅作编辑建议，不是正式发布 gate。
- 分叉项可以定位回 Studio 对应页面/组件。
- Alpha3 主题预设、复制粘贴、批量套用、设计撤销/重做和 Reader 点选直达继续回归通过。

## Browser

- `npm run test:studio-browser`：PASS，覆盖 320×740、390×844、768×1024、1366×768、1920×1080。
- `npm run test:v31-alpha2-browser`：PASS，覆盖 390×844、412×915、820×1180、1366×768、1920×1080 Reader 样式矩阵。
- `npm run test:v31-alpha3-browser`：PASS。
- `npm run test:v31-alpha4-browser`：PASS，覆盖“我的样式”保存/应用/删除、一致性分叉检测/定位、Alpha3 设计复用回归、真实 Reader 源码点选直达与 390×844 边界。

执行环境会阻止 Chromium 直接导航 localhost，因此 Alpha3/Alpha4 专项浏览器脚本采用两条证据：真实 Studio 本地进程健康检查 + Chromium/CDP 加载项目实际 Studio/Reader 源码及真实 issue fixture 执行 UI 交互。该证据不冒充 Mac/iPhone Safari 实机或正式 HTTPS 门禁。

## Real Studio process

在独立端口 `4192` 启动真实 Studio：

- `/api/health` → `{"ok":true,"version":"3.1.0-alpha.4"}`；
- 页面 `<title>` → `V3.1 自由创作期刊制作中心`；
- 品牌标识 → `V3.1 alpha4 · 设计资产库 / 一致性治理`；
- `/api/issues` → 第一期 18 页、第二期 29 页。

## V3.0.0 official release lock

单独执行 `npm run final:status`：

- 正式发布门禁：`PENDING · 0/6 READY`；
- 部署前门禁：`PENDING · 0/5 READY`。

尚未完成的正式证据仍为完整历史媒体、Mac Safari、iPhone Safari、第三期真实材料、部署/回滚正式演练、正式 HTTPS 线上完整性。Alpha4 smoke / Chromium PASS 不会转换这些正式 gate。
