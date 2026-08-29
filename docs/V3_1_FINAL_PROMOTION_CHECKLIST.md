# V3.1 Final Promotion Checklist

RC2 本地自动化已经通过。以下项目必须在对应真实环境执行，不应使用模拟结果代替。

## 1. 完整媒体仓库

将 RC2 overlay 合并回包含 `1/assets`、`2/assets` 的完整仓库，然后执行：

```bash
npm run test:v31-rc2-media-local
```

要求：51 个历史媒体文件大小、总量、Git blob SHA1 与 baseline 全部一致；引用资源全部存在。

## 2. Microsoft Edge actual binary

在安装 Edge 的机器上，将 `CHROMIUM` 指向真实 Edge 可执行文件，再运行 Reader 回归。

macOS 示例：

```bash
CHROMIUM="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
node scripts/browser-regression-v3.mjs --issue 001 --desktop-only
```

Windows PowerShell 示例：

```powershell
$env:CHROMIUM="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
node scripts/browser-regression-v3.mjs --issue 001 --desktop-only
```

## 3. macOS Safari / iPhone Safari

启动只读实机验收台：

```bash
npm run rc:safari
```

在 Mac Safari、iPhone Safari 打开验收地址，完成 Reader、翻页、全屏/沉浸、字号、目录、视频、手机 Studio 基础检查并保存当前 RC2 的通过记录。

## 4. 正式 HTTPS RC2 升级与回滚

先对正式站点做备份，然后按正式 release 目录执行：

```bash
npm run deploy:apply -- --issue 001 --target /var/www/jilv.online/jinchang-magazine --confirm
npm run online:check -- --base https://www.jilv.online/jinchang-magazine --issue 001 --strict
```

确认线上通过后，再至少做一次 receipt rollback 演练：

```bash
npm run deploy:rollback -- --issue 001 --target /var/www/jilv.online/jinchang-magazine --confirm
```

随后重新部署 RC2，并再次执行 `online:check`。

## 5. Final 决策

全部外部 Gate 完成后：

- P0 = 0
- P1 = 0
- 不再修改 `v31SchemaVersion`
- 不再新增大功能
- 只允许 Final 文档、版本号、发布包、部署说明与必要阻断 Bug 修复

满足后进入 `V3.1.0 Final`。
