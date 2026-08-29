# 应用 V3.1-alpha6 Overlay

V3.1-alpha6 以用户本机真实验收通过的 V3.1-alpha5 overlay 为唯一父基线。

父基线 SHA256：

```text
5345d592c55c39f7385747799534347e38afcb1f775264fdef653969677f81c5
```

## 1. 覆盖源码

将本 overlay 解压覆盖到 V3.1-alpha5 工程根目录。不要用 GitHub main 的旧期刊目录代替 Alpha5 基线。

## 2. 核验版本

```bash
node -p "require('./package.json').version"
# 3.1.0-alpha.6
```

## 3. 运行核心回归

```bash
npm run verify:core
npm run final:status
```

`verify:core` 的 Alpha6 开发回归 PASS 不代表 V3.0.0 正式发布门禁 PASS。`final:status` 继续独立读取真实证据。

## 4. 浏览器回归

```bash
npm run test:studio-browser
npm run test:v31-alpha2-browser
npm run test:v31-alpha3-browser
npm run test:v31-alpha4-browser
npm run test:v31-alpha5-browser
npm run test:v31-alpha6-browser
```

## 5. Studio

```bash
npm run studio:v3 -- --port 4195
```

Alpha6 新增项目本地目录：

```text
.v3-editorial-plans/<issueId>.json
```

它只保存整刊制作计划，不写入 `issue.json`，也不是 Reader 或 V3.0.0 正式发布的运行时依赖。
