# V3.0-alpha13 回归结果

## 功能专项

`npm run test:alpha13` 已验证：

- Markdown 一级/二级标题识别；
- Markdown 引用；
- 有序/无序列表；
- TXT 标题和引用推断；
- 长文自动分页；
- 最小 DOCX 的 Title / Heading / Quote / List 解析；
- Studio 粘贴导入 API；
- 二进制文本文件导入 API；
- 我的模板新增 / 查询 / 删除；
- 模板保存时媒体与 articleId 去绑定；
- V3 栏目骨架接口；
- 栏目骨架不泄露历史正文/媒体。

## 制作中心 Alpha13 浏览器专项

`npm run test:alpha13-browser` 五档通过：

- 320×740
- 390×844
- 768×1024
- 1366×768
- 1920×1080

真实操作包括：

- 打开快速导入弹窗；
- 粘贴 Markdown → 解析 → 预览 → 生成页面；
- 320 / 1366 下保存“我的模板”；
- 预览并应用上一期栏目骨架；
- 1366×768 下用两个 File 对象执行批量文章导入，生成 2 个预览结果并成功插入 2 页；
- 弹窗和页面无横向越界。

## 既有能力回归

Alpha13 代码上已经分别通过：

```text
verify:core            PASS
browser:001            PASS
browser:002            PASS
studio-browser         PASS
alpha13-browser        PASS
```

`verify:core` 包含 Alpha9 / 10 / 11 / 12 / 13 smoke、生产链、平台 API、可视化编辑器和 Studio 工作流。

本执行环境中一次性运行 `npm run verify:v3` 时，在前述 core、001、002 已通过后，连续进入 Studio Chromium 阶段触发单次命令执行窗口超时；相同代码的 `test:studio-browser` 和 `test:alpha13-browser` 已分别完整 PASS，因此属于执行时长限制，不是测试失败。

## Overlay 提示

源码 overlay 不重复打包历史大媒体，因此 `check:v3` 会出现两个预期非阻断警告：

- 当前工作区没有 `1/assets`
- 当前工作区没有 `2/assets`

合并到完整仓库后会执行真实历史媒体存在性检查。
