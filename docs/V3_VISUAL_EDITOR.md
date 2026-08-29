# V3 可视化内容块编辑器

## 推荐使用方式

启动：

```bash
npm run studio:v3
```

访问 `http://127.0.0.1:4173`。

选择一期 -> 选择页面 -> 在“内容块”区域编辑。

### 常规制作

1. 点击“＋ 内容块”。
2. 选择语义最接近的类型。
3. 直接填写字段。
4. 使用 ↑ / ↓ 调整顺序；桌面可拖拽。
5. 右侧实时预览检查层级和密度。
6. 点击保存。
7. 运行“日常审计”。

### 高级 JSON

只有以下情况建议切换高级 JSON：

- 批量复制/替换结构；
- 处理暂未提供专用表单的字段；
- 开发调试。

切回可视化前会解析 JSON。非法 JSON 不会覆盖当前合法内容块。

## 内容块选择建议

- 连续正文：paragraph
- 强调语句：quote
- 三到五个简短关键词：chips
- 分步骤/注意事项：cardline
- 纪法案例：casePair
- 导航页：toc
- 媒体：image/video
- 外链全文：articleLink

不要用 quote/cardline 模拟所有内容；语义越准确，阅读器表现和审计越可靠。

## 边界

制作中心的限制不是“建议值”而是数据安全边界：

- 80 blocks/page
- 40 items/block-array
- 12000 chars/deep text field
- 600KB blocks JSON/page

超过后服务端返回 `VALIDATION_ERROR`，不会创建保存前快照，也不会覆盖当前 issue.json。
