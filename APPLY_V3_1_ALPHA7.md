# 应用 V3.1-alpha7 Overlay

V3.1-alpha7 以用户本机真实验收通过的 V3.1-alpha6 overlay 为唯一父基线。

父基线 SHA256：

```text
af4c52aa8844f48ebc8a4cc06aad13ef305f2795d1804bd5074fd36250df14a1
```

## 1. 覆盖源码

将本 overlay 解压覆盖到 V3.1-alpha6 工程根目录。不要用 GitHub main 的旧目录替代 Alpha6 基线。

## 2. 核验版本

```bash
node -p "require('./package.json').version"
# 3.1.0-alpha.7
```

## 3. 核心回归与正式状态

```bash
npm run verify:core
npm run final:status
```

Alpha7 的 Production Board / smoke / Chromium PASS 不能满足 V3.0.0 正式发布门禁。

## 4. 浏览器回归

```bash
npm run test:studio-browser
npm run test:v31-alpha2-browser
npm run test:v31-alpha3-browser
npm run test:v31-alpha4-browser
npm run test:v31-alpha5-browser
npm run test:v31-alpha6-browser
npm run test:v31-alpha7-browser
```

## 5. Studio

建议本机验收使用新端口，例如：

```bash
npm run studio:v3 -- --port 4196
```

Alpha7 不增加新的运行时目录；继续使用 Alpha6：

```text
.v3-editorial-plans/<issueId>.json
```

制作看板完全由该 sidecar 与当前 issue 页面派生，不写入 Reader 运行时数据。
