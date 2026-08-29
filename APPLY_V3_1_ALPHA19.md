# V3.1-alpha19 · 工作区控制修复 / Reader 强同步 / 菜单可读性

Alpha19 直接继承 V3.1-alpha18 Full Source，不改变 `issue.json` schema，也不新增 Reader 运行时数据依赖。

## 本版修复

1. Reader 工具条取消常驻“重新同步”，同步异常由自动机制处理。
2. “全屏画布”优先使用浏览器 Fullscreen API；不支持时才回退为 CSS 沉浸模式。
3. “工作台新窗口”打开完整 `/workspace/`，继承布局、设备、编辑模式、画布模式和选择状态；当前有未保存稿时先写自动草稿，并以 `handoff=1` 自动恢复。
4. Studio→Reader 页码同步加入 request/ack 协议。Reader 明确回报旧页时，Studio 保持目标页并补发；ACK 后解除同步锁。Reader 主动翻页且没有待确认目标时，反向同步 Studio。
5. 只有“明确检测到 Reader 仍在旧页”且多次补发失败时才允许 URL 重载；普通正文编辑不会因为 ACK 沉默重建 iframe。
6. 制作型二级 Dialog 的说明文字提高可读性，整刊编排台/制作看板密集说明从 7–9px 级提升到约 10–12px，手机端进一步提高。

## 证据边界

- V3.0.0 正式发布门禁不受本版开发 PASS 影响。
- `issue.status` 不因 Alpha19 自动改变。
- V3.0 final gate 关键脚本继续按 `baselines/v3.0-final-gate-lock-alpha19.json` 锁定。
