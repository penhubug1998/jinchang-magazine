# 应用 V3.1-alpha5 Overlay

V3.1-alpha5 以已验收 V3.1-alpha4 overlay 为唯一父基线。

## 1. 覆盖源码

将本 overlay 解压覆盖到 V3.1-alpha4 工程根目录。不要用 GitHub main 的旧期刊目录替代 Alpha4 基线。

## 2. 核验版本

```bash
node -p "require('./package.json').version"
# 3.1.0-alpha.5
```

## 3. 运行核心回归

```bash
npm run verify:core
npm run final:status
```

`verify:core` 的开发回归 PASS 不代表 V3.0.0 正式发布门禁 PASS。`final:status` 必须独立读取真实证据。

## 4. 浏览器回归

```bash
npm run test:studio-browser
npm run test:v31-alpha2-browser
npm run test:v31-alpha3-browser
npm run test:v31-alpha4-browser
npm run test:v31-alpha5-browser
```

## 5. Studio

```bash
npm run studio:v3 -- --port 4193
```

Alpha5 的项目本地资产目录：

- `.v3-templates/`：整页“我的模板”；
- `.v3-design-library/`：Theme/Page/Block“我的样式”；
- `.v3-layout-library/`：只含布局槽位/容器骨架的“我的版式”。

这些制作侧资产都不写入 `issue.json`。应用后成刊仍只依赖标准 V3 页面、container 和 design 数据。
