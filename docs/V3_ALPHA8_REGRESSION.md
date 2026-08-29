# V3.0-alpha8 Regression Report

## 自动测试

`npm run verify:v3` 必须全部通过：

- `check:v3`
- `build:v3`
- `test:v3`
- `test:production`
- `test:platform`
- `test:visual-editor`
- `test:studio-workflow`
- `test:browser`
- `test:studio-browser`

## Alpha8 专项链路

### 结构复制
- 无效结构来源先失败，不能创建半成品期刊。
- V3 来源可复制页面/块结构。
- 旧正文、旧 article 内容和媒体绑定不会进入新一期。

### 媒体
- 外部/历史 assetSource = 只读。
- 新刊自身 assetSource = 可写。
- 中文文件名可上传和读取。
- 同名第二次上传自动改名。
- 假 PNG 文件头被拒绝。
- `../escape.png` 不可逃出受管目录。

### 数据边界
- `section` > 120 字符：HTTP 400 `VALIDATION_ERROR`。
- 101 篇 articles：HTTP 400。
- HTTP 文章链接：HTTP 400，要求 HTTPS。
- Alpha7 的 80 blocks / 40 items / 未知 block.type 边界继续有效。

### 制作中心浏览器尺寸
- 320×740
- 390×844
- 768×1024
- 1366×768
- 1920×1080

自动操作包括：
- 48 页压力数据加载。
- 内容块新增、复制、Visual ⇄ JSON。
- 审计定位页面、元数据和 blockIndex。
- 新建一期弹窗。
- 页面模板弹窗与模板插入。
- 自动目录生成并验证页码/40 项边界。
- 媒体库加载。
- 文章库新增文章。
- 快速预览 ⇄ 成刊预览切换。

### 阅读器回归
第二期继续验证：390×844、412×915、820×1180、1366×768、1920×1080。
