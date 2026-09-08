# 项目文档

这里集中放置阅读器、V3 制作中心和发布流程文档。根目录只保留项目入口、源码入口和必要的配置文件。

## 按用途查找

- 管理后台登录：[`ADMIN_LOGIN.md`](ADMIN_LOGIN.md)
- V3 制作与发布流程：[`V3_PRODUCTION_WORKFLOW.md`](V3_PRODUCTION_WORKFLOW.md)、[`V3_STUDIO_AND_RELEASE.md`](V3_STUDIO_AND_RELEASE.md)
- 发布与缓存：[`V3_DEPLOYMENT_AND_CACHE.md`](V3_DEPLOYMENT_AND_CACHE.md)
- 管理端反向代理：[`deploy/jinchang-magazine-admin-nginx.conf`](../deploy/jinchang-magazine-admin-nginx.conf)
- 生产环境预检：`npm run production:preflight`；环境变量示例：[`deploy/jinchang-magazine.env.example`](../deploy/jinchang-magazine.env.example)
- 第三阶段试刊：[`V3_1_PHASE3_PRODUCTION_PREFLIGHT.md`](V3_1_PHASE3_PRODUCTION_PREFLIGHT.md)
- 公开链接交接：[`PUBLICATION_SHARE_HANDOFF.md`](PUBLICATION_SHARE_HANDOFF.md)
- 架构说明：[`V3_ARCHITECTURE.md`](V3_ARCHITECTURE.md)
- 历史发布说明：[`deploy-history/`](deploy-history/)

## 文档约定

- `V3_*`：稳定流程、架构和发布门禁文档。
- `V3_1_*`：V3.1 迭代记录、回归结果和工作台说明。
- `deploy-history/`：历史部署指令和阶段性记录，只作为追溯资料，不作为当前部署入口。

当前可执行命令以根目录 [`package.json`](../package.json) 中的 `npm run` 脚本为准。
