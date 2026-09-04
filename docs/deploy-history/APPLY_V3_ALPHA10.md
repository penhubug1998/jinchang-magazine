# V3.0-alpha10 Overlay 使用说明

这是增量包，请覆盖到包含 `package.json`、`issues/`、`scripts/`、`src/` 的完整项目根目录。

```bash
cd "/你的实际路径/jinchang-magazine"
unzip -o ~/Downloads/jinchang-magazine-v3.0-alpha10-overlay.zip -d .
npm run verify:core   # 快速验证数据、生产链和制作中心逻辑
npm run verify:v3     # 完整验证；会连续运行两期期刊 + 制作中心真实浏览器回归
npm run studio:v3
```

制作中心：`http://127.0.0.1:4173`

## Alpha10 重点

- 期刊信息默认折叠；
- 页面基础信息也默认折叠；
- 审计定位会自动展开对应折叠区；
- 普通页面可复制；
- 保存前显示差异；
- 未保存修改可整体撤销；
- 第一、第二期继续保持 V3 可编辑；
- `/1/`、`/2/` 线上稳定目录不会由 Studio 保存动作自动覆盖。

单独运行 overlay 时未包含 `1/assets` / `2/assets` 大型媒体，因此资源存在性检查会给出非阻断提示。合入完整仓库后会检查真实资源。

> `verify:v3` 会启动三套 Chromium 回归，执行时间明显长于 `verify:core`。日常编辑前可先用 `verify:core`，发布前再跑完整 `verify:v3`。
