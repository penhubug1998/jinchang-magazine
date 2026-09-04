# V3.0-RC2 overlay

RC2 基于已验收 RC1，仅收口外部门禁，不新增大型编辑功能。

覆盖到完整项目根目录后：

```bash
npm run verify:core
npm run studio:v3 -- --port 4181
```

优先补齐 RC1 遗留门禁：

```bash
# 先预览历史媒体缺失情况
npm run rc:media:hydrate

# 确认后从固定 GitHub commit 补齐历史媒体
npm run rc:media:hydrate -- --confirm
npm run rc:media

# Safari 实机
npm run rc:safari -- --port 4182
npm run rc:devices

# 第三期真实材料准备度
npm run rc:third:preflight -- --issue 003

# 当前门禁状态
npm run rc:status
```

注意：Safari 与真实第三期仍必须由真实设备/真实稿件完成，RC2 不使用模拟结果代替。
