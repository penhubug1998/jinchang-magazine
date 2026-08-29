# V3.0-alpha2 变更记录

## 版本目标

把现有第二期从单体 HTML 迁移为“内容数据 + 公共阅读器”，但暂不替换线上 `/2/`。

## 新增

- 第二期 29 个真实阅读页的结构化数据
- 第二期 5 个链接文章弹窗数据
- `issues/002/assets.json` 资源清单
- 公共 3D 翻页
- 移动端左右滑动
- 背景音乐
- 逐页 MP3 自然语音
- 浏览器 TTS 回退
- 连续听刊
- 朗读速度选择
- 全屏阅读
- 文章链接弹窗
- `casePair`、`chips`、`cardline` 等内容组件
- `npm run test:v3`
- `npm run verify:v3`
- alpha2 回归清单

## 兼容性

- 保留 alpha1 `page.body` 格式支持
- 保留 alpha1 `cards` 内容块支持
- 不修改现有 `/1/`、`/2/`
- 不重复打包现有大体积音频/视频；合入完整仓库后构建脚本从 `2/assets` 复制

## 已验证

```text
npm run check:v3   PASS
npm run build:v3   PASS
npm run test:v3    PASS
HTTP 静态预览      PASS
```

增量包环境没有原仓库的 `2/assets`，因此资源存在性校验会出现一条非阻断警告；把增量包覆盖到完整仓库根目录后即可执行真实资源存在性检查。
