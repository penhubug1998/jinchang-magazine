# V3.0 RC2 门禁收口

RC2 不增加大型编辑能力，只处理 RC1 外部门禁的真实性、可执行性和复验成本。

## 1. 历史媒体：从固定 GitHub commit 补齐

RC2 继续使用 `baselines/v3-rc1-media.json` 作为不可漂移的历史媒体源，固定仓库 `penhubug1998/jinchang-magazine` commit `e603ad3add77514a6474d0a1d67e34bff7f0e9b4`。

只看计划，不下载：

```bash
npm run rc:media:hydrate
```

只补第一期：

```bash
npm run rc:media:hydrate -- --issue 001 --confirm
```

补齐第一、第二期：

```bash
npm run rc:media:hydrate -- --confirm
npm run rc:media
```

默认只下载缺失文件；如果本地已有文件与 baseline 大小或 Git blob SHA1 不一致，脚本拒绝覆盖。确认需要恢复到固定历史版本时：

```bash
npm run rc:media:hydrate -- --repair --confirm
npm run rc:media
```

`--repair` 会覆盖不一致历史媒体，使用前必须确认这些文件并非有意修订。

## 2. Safari 实机记录绑定 RC2

```bash
npm run rc:safari
npm run rc:devices
```

RC2 只接受记录中 `version=3.0.0-rc.2` 的 Mac Safari / iPhone Safari 通过结果。旧 RC1 记录不会继承。

验收 API 还会比对实际 HTTP User-Agent：Chrome / Edge 即使手动选择“Mac Safari”，也不能保存为 Safari 实机通过。

## 3. 第三期真实材料先预检

在真正跑完整试制之前：

```bash
npm run rc:third:preflight -- --issue 003
```

预检会指出：

- `issues/003/issue.json` 是否存在；
- 是否为 V3；
- 是否 `ready/published`；
- 页面是否已形成真实内容；
- 媒体引用是否缺失；
- TTS baseline 是否覆盖当前页数；
- 是否仍残留“待编辑 / 请填写 / TODO / 占位”等文本。

预检无误后才执行：

```bash
npm run rc:third -- --issue 003 --confirm-real-material
```

## 4. 正式 HTTPS

真实部署后：

```bash
npm run online:check -- \
  --base https://www.jilv.online/jinchang-magazine \
  --issue 003 \
  --strict
```

RC2 readiness 只接受当前版本生成的线上验证报告，旧 RC1 报告不会继承。

## 5. 统一查看门禁

```bash
npm run rc:status
```

最终：

```bash
npm run rc:status -- --strict
```

6 个 gate 全部 READY 才适合推进正式 `3.0.0`。
