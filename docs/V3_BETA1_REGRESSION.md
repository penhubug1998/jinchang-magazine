# V3.0-beta1 回归结果

## 核心门禁

`npm run verify:core`：PASS。

覆盖：

- check / build / V3 smoke；
- Alpha9～Alpha14 历史专项；
- Beta1 baseline；
- Beta1 发布恢复；
- production / platform；
- visual-editor / studio-workflow。

Overlay 环境仅有两条已知非阻断警告：缺少历史 `1/assets`、`2/assets`。

## Reader 五档回归

001、002、Beta1 block matrix 均通过：

- 390×844；
- 412×915；
- 820×1180；
- 1366×768；
- 1920×1080。

其中 Beta1 matrix 额外断言 14 类 block 在真实 Reader DOM 中实际出现，而不仅是 schema 校验通过。

## Studio 五档边界

通过：

- 320×740；
- 390×844；
- 768×1024；
- 1366×768；
- 1920×1080。

## Alpha13 / Alpha14 回归

- 内容快速导入五档 Chromium：PASS；
- 真实 Reader 联动五档 viewport：PASS；
- Studio → Reader / Reader → Studio 双向页联动：PASS。

## 发布恢复专项

通过：

1. 同一 issue 连续 build 目录摘要一致；
2. 快照修改后可完整 rollback；
3. rollback 前自动安全快照存在；
4. ready 状态可生成 release；
5. 发布失败时上一 release 摘要不变；
6. 失败后无 `.staging-*` / `.previous-*` 残留。

## 总命令执行说明

`npm run verify:beta` 在当前工具执行窗口中串行完成了 `verify:core`、001 Reader、002 Reader，并在进入 Studio 浏览器回归时达到单次命令时间限制。该停止点不是断言失败。

同一份最终代码随后/此前已分别完整执行并 PASS：

- `test:studio-browser`；
- `test:alpha13-browser`；
- `test:alpha14-browser`；
- `test:beta1-browser`。

因此 Beta1 交付结论以“核心门禁完整 PASS + 所有浏览器套件分项完整 PASS”为准。
