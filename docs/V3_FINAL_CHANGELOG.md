# V3.0.0 Changelog

V3.0.0 以 RC3 为功能冻结基线，不新增新的 Reader schema 或一级创作功能。

## 正式版收口

- 版本统一为 `3.0.0`，移除 prerelease 后缀。
- Studio 标识切换为 V3.0.0 正式版。
- 冻结 `baselines/v3-schema-3.0.json`：9 类页面、14 类内容块及核心制作边界。
- `verify:v3` 切换为 `verify:final`；`verify:full-repo` 追加完整历史媒体严格检查。
- 新增 `final:status`，区分 5 项部署前门禁与 6 项完整上线门禁。
- 新增两阶段正式发布：`final:release` 生成可部署正式包，`final:seal` 在 HTTPS 实测后正式封版。
- 正式封版锁定部署包 `treeSha256`，避免“线上验证的是 A，最终签名却是 B”。
- RC1/RC2 历史自动回归允许在 3.0.0 上继续执行，但 Safari/iPhone/第三期/线上报告必须重新绑定 3.0.0，不继承旧 RC 结果。
- Safari 实机验收台正式版默认端口调整为 4186。

## 不变的功能冻结基线

保留 RC3 已验收的快速导入、一键成刊预览、可收束导航、编辑/Reader 自定义分割、真实 Reader、多尺寸预览、媒体/TTS、审计、快照/回滚、原子发布与线上校验能力。
