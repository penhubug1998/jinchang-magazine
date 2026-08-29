# V3.1-alpha20 · Core 架构治理 / 稳定 ID / Command Bus

Alpha20 是 V3.1 的架构治理版本，目标不是继续堆叠表层按钮，而是降低 Studio / Reader 双向编辑继续扩展时的同步风险。

## 1. Page / Block 稳定身份

- 页面支持可选 `page_<id>`；内容块支持可选 `block_<id>`。
- 旧 V3 期刊无需人工迁移：Studio 加载时会在内存中补齐 ID；发生真实编辑并保存时自然固化。
- 重复或非法 ID 会在 Studio 迁移阶段修复；服务端对“已经存在的 ID”执行格式与全刊唯一性校验。
- 复制内容块会重新生成自身以及容器子块 ID，避免克隆后身份冲突。
- JSON 模式粘贴旧内容块仍可使用，应用时自动补 ID。

## 2. Command Bus 第一阶段

新增 `src/studio/core/command-bus.js`，建立统一命令入口。目前首批接入：

- `block:update`
- `block:design`
- `block:reorder`

Reader 画布的正文修改、Resize、对齐、拖动重排已经切入命令通道；命令完成后统一进入 ID 修复、JSON 同步、Block 列表渲染、Dirty/History/草稿/Reader 刷新链路。

## 3. Studio Core 模块拆分

新增：

- `src/studio/core/identity.js`
- `src/studio/core/command-bus.js`
- `src/studio/core/history.js`

本版先拆出可独立测试的 Core，不一次性重写整个 `studio.js`。后续版本将继续迁移 History、Reader Bridge、Workspace 与 Dialog Manager，避免大爆炸式重构。

## 4. Reader Bridge 身份升级

Reader 的顶层设计目标现在可携带 `data-block-id`，Canvas select / reorder / resize / align 等消息同时发送 `blockId`。Studio 优先以稳定 ID 定位组件，旧 `blockIndex` 继续作为回退，确保 Alpha19 数据和旧 Reader 行为兼容。

## 5. 兼容边界

- V3.0.0 正式发布锁不改变。
- 旧 `issue.json` 不要求立即添加 ID，服务端仍接受无 ID 数据。
- Alpha20 的 schema 变化仅为向后兼容的可选身份字段；现有内容字段、页面结构和 Reader 输出语义不被破坏。
