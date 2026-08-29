# V3.1-alpha1 自由创作基础架构

## 目标
在不牺牲移动可读性和 V3.0 兼容性的前提下，引入受约束的自由布局。

## Container schema
- `type: container`
- `layout`: `single` / `two-equal` / `two-40-60` / `two-60-40` / `three-equal` / `media-left` / `media-right`
- `gap`: `sm` / `md` / `lg`
- `align`: `start` / `center` / `stretch`
- `mobile`: `stack`（推荐）/ `preserve`（高级）
- `columns`: 1–3 列，每列最多 20 个子块

Alpha1 暂不允许容器嵌套容器，避免无限嵌套带来的可读性与响应式风险。

## Studio
布局容器在可视化模式内直接编辑；每列可以添加正文、引言、卡片、案例警示、图片、视频和强调文字，并支持子块上下移动与删除。

## Reader
桌面使用 CSS Grid；手机默认自动纵向堆叠。`mobile=preserve` 仅作为高级选项，审计会给出可读性警告。

## V3.0 兼容
`v3StableVersion=3.0.0` 保留原正式发布锁。3.1 开发版本可以继续读取 V3.0 issue.json；原 V3.0 frozen schema 文件不修改。
