# V3.0.0 发布门禁收口增量

## 目标

保持产品版本 `3.0.0` 不变，只增强正式上线前的门禁可用性与证据可信度。

## 变更

- `final:doctor`：汇总六项真实门禁并给出唯一推荐下一步。
- `final:gate`：统一 media/devices/third/deployment/online/status/doctor 操作入口。
- Studio 顶部新增“正式发布”门禁面板，显示 6 项真实状态和可复制命令。
- 历史媒体 PASS 增加证据时效性：检查后媒体、issue 或 baseline 变化会自动失效。
- 第三期真实试制报告绑定 `issueSha256`；源稿/资源变化后旧 PASS 自动失效。
- HTTPS 验证绑定当前 `release-v3/<issue>/integrity.json` 的 `treeSha256`；发布包变化后旧 PASS 自动失效。
- `test:final-gates` 新增证据失效、media dry-run 51 文件和 Studio gate API 回归。
- Studio 五档边界回归新增正式发布门禁弹窗检查。

## 当前真实状态

Overlay 环境保持 `1/6 READY`，未完成项仍需要真实媒体、Mac Safari、iPhone Safari、第三期真实稿和正式 HTTPS 环境。
