# V3.0-RC2 Changelog

RC2 是外部门禁收口版，不扩展页面/block 数据模型。

- 新增 `rc:media:hydrate`：从固定 GitHub commit 安全补齐/修复第一、第二期历史媒体；默认 dry-run，下载前后验证大小和 Git blob SHA1。
- Safari 实机记录绑定当前 `3.0.0-rc.2`；旧 RC1 记录不继承。
- Safari 验收 API 校验真实 HTTP User-Agent，Chrome/Edge 不能通过手选设备类型伪装成 Safari gate。
- 新增 `rc:devices`：查看 Mac/iPhone Safari 当前版本验收状态。
- 新增 `rc:third:preflight`：在真实第三期全链试制前定位 issue/status/pages/media/TTS baseline/占位内容缺口。
- `rc:status` 升级为 RC2 版本绑定 readiness；第三期、部署、线上报告都必须来自当前 RC2。
- `online:check` 报告补充本地/远端 treeSha256 字段，便于候选包与线上版本对照。
- 保留 RC1 历史媒体 baseline commit，不允许候选阶段静默漂移历史资源。
