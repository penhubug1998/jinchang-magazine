# 中国人民银行金昌市分行离退休干部电子期刊

离退休干部电子期刊（3D 仿真翻页 H5），支持手机端手势翻页、语音朗读、字号调节、上下期切换、全屏阅读。
配套一个制作中心（管理后台），编辑可以在里面导入 Word 稿件、排版、生成朗读、预览并发布。

## 访问地址

线上正式环境（2026-09 起）：

| 期 | 地址 |
|---|---|
| 期刊总目录 | <https://www.jilv.online/new-jc-magazine/> |
| 第一期 | <https://www.jilv.online/new-jc-magazine/01/> |
| 第二期 | <https://www.jilv.online/new-jc-magazine/02/> |
| 第三期 | <https://www.jilv.online/new-jc-magazine/03/> |

制作中心（管理后台）只对制作人员开放：<https://www.jilv.online/new-jc-magazine-admin/>，
由 nginx 反向代理到服务器本机的 `127.0.0.1:4180`，端口本身不对外暴露。

## 目录结构

```text
index.html            期刊总目录入口页（发布到站点根目录）
01/ 02/ 03/           线上期刊的发布产物（由制作中心发布生成，不在仓库里）
1/、2/                早期静态期刊（保留作历史参考，线上已不再使用）
src/reader/           阅读器（Reader）源码
src/studio/           制作中心（Studio）前端源码
scripts/              校验、构建、导入、朗读、发布与回滚脚本
issues/               V3 期刊制作源稿（issues/<期号>/issue.json）与期刊资源
baselines/            发布基线与验收快照
deploy/               部署配置与公开站点入口
docs/                 使用、发布、架构与版本文档
dist-v3/ release-v3/  本地构建产物（已加入 .gitignore）
reports/              审计与媒体检查报告（已加入 .gitignore）
RETIRED-BROWSER-SUITES.md  浏览器套件的取舍记录（哪些退役、为什么）
```

历史版本的发布说明统一归档在 [`docs/deploy-history/`](docs/deploy-history/)，不参与运行时。

## 功能

- PC 端双页 3D 仿真翻页，手机端手指左右拖动翻页
- 画布编辑：选中内容块后可拖动、缩放、方向键微调、复制/粘贴、图层调整、对齐分布、框选多选
- Word 导入：文字、标题、项目符号/编号列表、图片、表格、链接一并导入，并自动识别版块与分页
- 🔊 语音朗读：服务器逐页生成自然语音（`assets/tts/page-XX.mp3`），缺失时自动使用浏览器语音
- 图片放大查看、AI 摘要逐字动效
- 字号调节：标准 / 较大 / 特大三档，本地记忆，跨期保留
- 上下期切换：底部工具栏一键跳转另一期
- 全屏阅读：手机端系统全屏，内容上下居中
- 背景音乐、目录跳转、链接内容弹窗、页码进度

## 本地预览

阅读器与制作中心都需要用 HTTP 打开（直接双击 `file://` 时视频、音乐与模块加载都不可靠）：

```bash
npm install
npm run studio:v3 -- --host 127.0.0.1 --port 4180   # 制作中心 http://127.0.0.1:4180
npm run build:v3 -- --issue 003                      # 构建某一期到 dist-v3/
python -m http.server 8080                           # 或直接静态预览已构建产物
```

## 开发与门禁

提交前请跑完整门禁（与 CI 的必需作业一致）：

```bash
npm run verify:gate
```

它包含数据校验、构建、导入完整性、画布编辑契约、朗读范围、发布包能力（图片放大 / AI 逐字动效）、
发布目录卫生、仓库体积与密钥卫生，以及 11 个真实浏览器回归套件。
浏览器套件的取舍原则见 [`RETIRED-BROWSER-SUITES.md`](RETIRED-BROWSER-SUITES.md)。

### 关于 main 的保护（重要）

仓库目前是 **private**。GitHub Free 套餐对私有仓库**不提供分支保护**
（经典保护与 Rulesets 都会提示 `Upgrade to GitHub Pro`），因此 main 没有服务端必需检查。

替代做法：

- 正常改动走**功能分支 + PR**，等 CI 的 `verify` 变绿再合并（这也是本项目一直的做法）；
- 本仓库自带 `pre-push` 钩子：**推送到 main 之前会先跑 `npm run verify:gate`，失败就拒绝推送**。
  在新克隆里启用一次：

  ```bash
  npm run hooks:install
  ```

  紧急绕过：`SKIP_VERIFY_GATE=1 git push`（会打印警告，请事后补跑门禁）。

如果想恢复服务端硬门禁，可选：把仓库改回 public，或升级 GitHub Pro 后重新开启分支保护。

## 部署

**不要手工上传文件覆盖线上期刊。** 线上发布由制作中心完成：

1. 在制作中心编辑并保存该期（源稿在 `issues/<期号>/issue.json`）；
2. 生成朗读（只用重录正文有变化的页）；
3. 执行「正式发布」（生成 `release-v3/<期号>/` 发布包并做严格审计）；
4. 执行「部署公开 Reader」，由服务把发布包写入 `/var/www/jilv.online/new-jc-magazine/<期号>/` 并在线校验。

服务器上的目录约定：

```text
/opt/jinchang-magazine-admin/            应用目录（部署目标，不是 git 工作区）
/var/www/jilv.online/new-jc-magazine/    对外发布根目录（01/ 02/ 03/ …）
/opt/backups/jinchang-magazine/          备份与隔离区（应用目录之外）
```

服务由 systemd 托管（`jinchang-magazine-admin.service`，用户 `www-data`，监听 `127.0.0.1:4180`）。
改动应用目录里的文件后必须核对**属主仍为 `www-data`**——应用保存用的是原地覆盖写，
属主变成 root 会让编辑保存直接失败。

管理后台和 V3 制作源的流程说明见 [`docs/README.md`](docs/README.md)。
