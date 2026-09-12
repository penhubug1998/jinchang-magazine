# V3.0-alpha2 架构说明

## 目标

V3 的核心目标是把“期刊内容、媒体配置”和“阅读器代码”彻底分离，并且在迁移阶段保持现有线上 `/1/`、`/2/` 完全不变。

V3.0-alpha2 已完成第二期真实内容的数据化迁移预览：第二期共 29 个阅读页（封面 + 编号 01—28），对应现有 29 个逐页 TTS 文件。

## 稳定版与 V3 的关系

```text
1/                       现网第一期（不修改）
2/                       现网第二期（不修改）
issues/001/issue.json    第一期登记信息
issues/002/issue.json    第二期 V3 结构化迁移数据
src/reader/              V3 公共阅读器
scripts/                 校验、构建、冒烟测试
dist-v3/                 本地构建产物（不提交）
```

V3 验证通过前，不把 `dist-v3/002/` 替换现网 `/2/`。

## alpha2 已完成

- 第二期 29 页真实内容迁移为 `issues/002/issue.json`
- 第二期文章弹窗数据迁移（news1 / news2 / news3 / theory1 / theory2）
- 公共阅读器支持 PC 双页与移动端单页
- PC 端公共 3D 翻页动画
- 手机左右滑动翻页
- 目录与页码直达
- `?page=N` 深链接
- 字号设置与本地记忆
- 阅读位置本地记忆
- 背景音乐配置
- 逐页自然语音：`assets/tts/page-{page}.mp3`
- 自然语音缺失时浏览器 `speechSynthesis` 回退
- 连续听刊开关
- 朗读速度 0.8× / 1.0× / 1.2× / 1.5×
- 全屏阅读
- 图片、视频、卡片、案例双栏、目录、引文等结构化内容块
- 视频默认 `preload="metadata"`
- 资源清单 `issues/002/assets.json`
- 数据校验、构建和 smoke test
- 兼容 alpha1 的 `body` 与 `cards` schema

## issue.json（alpha2）

```json
{
  "id": "002",
  "label": "第二期",
  "engine": "v3",
  "status": "migration-preview",
  "legacyPath": "../../2/",
  "assetSource": "2/assets",
  "features": {
    "flipAnimation": true,
    "fullscreen": true,
    "music": {
      "src": "assets/music/bgm.mp3"
    },
    "narration": {
      "pattern": "assets/tts/page-{page}.mp3",
      "fallback": "speechSynthesis"
    }
  },
  "pages": []
}
```

`assetSource` 只用于构建阶段从完整仓库复制现有媒体资源。增量开发包不会重复携带第二期的大体积音视频。

## 支持的页面类型

- `cover`
- `article`
- `toc`
- `news`
- `theory`
- `safety`
- `discipline`
- `health`
- `closing`

## 支持的内容块

- `paragraph`
- `quote`
- `chips`
- `cardline`
- `casePair`
- `toc`
- `articleLink`
- `video`
- `image`
- `coverMeta`
- `coverSections`
- `blessing`
- `producer`
- `cards`（兼容 alpha1）

## 验证

```bash
npm run verify:v3
```

当前 alpha3 的完整验证链为：

```bash
npm run check:v3
npm run build:v3
npm run test:v3
npm run test:browser
```

其中浏览器回归覆盖 390×844、412×915、820×1180、1366×768、1920×1080 五档视口，并检查书本首跨页、正反向翻页、移动端跟手拖拽、目录、文章弹窗、字号和视频自定义全屏。若机器缺少 Chromium 或 `xvfb-run`，浏览器阶段会自动跳过。

## 本地预览

完整仓库中执行：

```bash
npm run build:v3
python -m http.server 8080
```

然后访问：

```text
http://localhost:8080/dist-v3/002/
```

第二期 V3 与稳定版对照：

```text
V3 迁移预览：/dist-v3/002/
现网稳定版：  /2/
```

## 下一阶段建议

1. alpha4 建立视觉基线清单，对重点页做人工验收并固化截图。
2. 增加一键创建新一期的脚手架命令，避免手工复制 JSON。
3. 增加媒体体积检查和视频压缩建议，阻止过大的资源进入发布包。
4. 在 beta 阶段加入字号调节、继续阅读入口和一页一码分享能力。
5. 阅读内核冻结后，让第三期正式采用 V3 数据生产流程。

## Alpha4：生产与发布层

V3 从 Alpha4 起形成三层：

1. **Reader**：`src/reader/`，只负责渲染与交互。
2. **Issue Data**：`issues/<id>/issue.json`，只负责每一期内容。
3. **Production Tooling**：`scripts/new-issue-v3.mjs`、`sync-assets-v3.mjs`、`audit-v3.mjs`、`release-check-v3.mjs`，负责新刊创建、资源清单和发布门禁。

因此未来一期的标准动作从“复制上一期 HTML”变为：

```text
new:issue → 编辑 issue.json → assets:sync → build/audit → status=ready → release:check
```

## Alpha5：制作平台层

Alpha5 在 Reader + Issue Data + Production Scripts 之上增加第四层：Studio / Release。

```text
Studio (localhost:4173)
  ↓ save / snapshot / rollback / audit / build
issues/<id>/issue.json
  ↓
build:v3
  ↓
dist-v3/<id>/ + dist-v3/index.html
  ↓ release:check
publish:v3
  ↓
release-v3/<id>/ + deploy-manifest.json
```

发布包与源数据分离，避免构建动作直接触碰线上历史目录。


## V3.0-alpha7 制作层

制作中心已从 JSON 辅助编辑升级为可视化 block editor。可视化与高级 JSON 共享同一 `page.blocks` 数据结构，不引入第二套内容模型。Studio 实时预览只作为制作辅助；正式阅读结果仍由公共 reader 构建并通过浏览器回归验证。

## V3.0-alpha8 制作层

Alpha8 在 `src/studio` / `scripts/studio-v3.mjs` 增加四个边界明确的制作能力：

- Page Templates：模板生成 `page` 与 `blocks`，不引入另一套数据模型。
- Article Library：仍直接维护 `issue.articles`。
- Media Library：只写 `issues/<id>/assets`；外部 `assetSource` 只读。
- Built Preview：真实调用 `build-v3.mjs`，嵌入生成后的 V3 Reader。

因此编辑器、审计器、构建器和阅读器仍共享同一份 `issue.json`，没有额外的影子数据库。

## V3.0-alpha9：历史刊统一与固定工作台

Alpha9 将 `issues/001` 从 legacy 路由占位升级为 18 页 V3 结构化数据，因此第一、第二期现在都可由 Studio 读取和编辑；原 `/1/`、`/2/` 仍作为线上稳定版本和迁移对照源保留。

制作中心桌面布局从普通文档流切换为固定工作台：左侧 Issue Rail 固定，顶部元信息折叠，中部 Page Structure 与右侧 Page Editor 各自滚动。桌面 `document` 不再承担主要纵向滚动，从而保证 1366×768 首屏即可看到核心编辑区域。900px 以下保持移动端纵向工作流，避免固定三栏造成窄屏边界问题。

## V3.0-alpha10：折叠页面信息与修订安全

Alpha10 将页面级基础字段从永久展开表单改为默认折叠摘要，使内容块编辑成为 Page Editor 的第一视觉层级。手工保存加入客户端差异确认，未保存状态可一键恢复到最近保存版本；普通内容页允许安全复制，结构页仍受边界保护。历史已发布刊的 Studio 保存只修改 V3 制作源稿并建立快照，不直接覆盖稳定线上目录。

## V3.0-alpha12：媒体制作与 TTS 一致性

Alpha12 继续沿用同一 `issue.json` 内容模型，不复制媒体数据，也不对原素材做破坏性裁切。图片块新增可选显示参数：

```json
{
  "type": "image",
  "src": "assets/image/example.webp",
  "alt": "图片说明",
  "caption": "图注",
  "frameRatio": "16:9",
  "fit": "cover",
  "positionX": 50,
  "positionY": 40
}
```

其中 `frameRatio` 仅允许 `auto / 16:9 / 4:3 / 3:2 / 1:1`，`fit` 仅允许 `contain / cover`，焦点坐标范围为 0–100。调整这些字段只改变 Reader 的展示窗口，原图片文件保持不变。

视频块支持独立 poster：

```json
{
  "type": "video",
  "src": "assets/video/example.mp4",
  "poster": "assets/image/example-poster.jpg",
  "caption": "视频说明"
}
```

媒体库会根据 `collectReferencedAssets()` 建立引用关系。被页面、背景音乐、视频 poster 或 TTS 使用的文件禁止直接删除；未使用媒体必须先预检再确认清理。

TTS 不再只按文件数量判断完整性。`features.narration` 可保存：

- `sourceDigest`：整期期刊当前朗读源摘要。
- `pageDigests`：逐页朗读正文摘要。
- `baselinedAt`：最近一次确认音频与文本一致的时间。

页面标题、正文或顺序变化后，如果摘要与基线不一致，审计会标记 `TTS_SOURCE_STALE`。完成重新生成 TTS 后使用 `npm run tts:baseline -- --issue <id>` 重新建立基线。


## V3.0-alpha13：统一内容导入层

Alpha13 新增 `scripts/lib-v3-import.mjs`，将 Word / Markdown / TXT / 粘贴正文先解析为统一中间结构：

```text
ImportedDocument
  title
  format
  sourceName
  blocks[]
```

随后统一通过 `paginateImportedDocument()` 转成现有 V3 `page.blocks`。这意味着导入功能没有创建第二套发布数据模型：应用导入后，构建器、Reader、审计器、撤销/草稿、TTS 指纹仍然只读取 `issue.json`。

栏目骨架与“我的模板”同样只生成普通 V3 pages/blocks。跨期复用时会主动清空媒体、文章和目录的历史绑定，防止隐式跨期依赖。

## V3.0-alpha14：真实 Reader 实时预览层

Alpha14 不在 Studio 复制一套期刊渲染器。右侧预览直接加载 `src/reader` 的正式 Reader 源码，当前未保存 `issue` 通过内存 live-preview 与 `postMessage` 双通道同步。

```text
Studio editing state
  ├─ postMessage ───────────────→ Reader iframe
  └─ POST live-preview cache ───→ /live-preview/<id>/issue.json
                                      ↓
                                  src/reader
                                      │
                         page / ready / synced
                                      ↓
                                    Studio
```

live-preview 缓存只存在当前 Studio Node 进程内，不能替代 `issue.json` 保存；服务重启后未正式保存的数据仍以 Alpha11 的 `.v3-drafts` 恢复机制为准。

iframe 使用真实目标 viewport（390 / 412 / 820 / 1366 / 1920 CSS px）运行，外层只做视觉缩放。因此 Reader 原有 `760px` 移动断点真实生效：手机单页，820 及桌面双页。

## V3.0-beta1：功能冻结与恢复基线

Beta1 引入 `baselines/v3-beta1.json` 与 `examples/beta1-matrix`。前者保护第一/二期已迁移历史数据，后者确保 Reader 的 9 类页面与 14 类内容块在真实浏览器中都有固定回归样本。

发布器改为 staging 原子替换：构建产物和 release 元数据完整生成后才替换现有 `release-v3/<id>`。目标期刊发布检查的静态 smoke 也改为使用 `--issue`，不再依赖固定第二期。

## V3.0-beta2：真实生产演练与兼容收口

Beta2 不扩展内容模型。新增完整 003 生产演练、Safari/iOS fullscreen 与 Range 流媒体 fallback、文件级发布完整性、缓存策略以及完整媒体仓库检查。发布产物通过 `integrity.json` + `deploy-manifest.json` 双层校验；Reader 构建代码使用版本 query cache-bust。Beta1 的历史刊与 block matrix baseline 继续保持冻结。

## V3.0-RC1：候选发布与外部门禁

RC1 继续冻结内容模型。历史媒体新增 `baselines/v3-rc1-media.json`：001/002 不只检查存在性，还按公开 GitHub main 固定文件数量、字节数与 Git blob SHA1。Studio 增加只读 LAN Safari/iPhone 实机验收台；部署层增加目录 staging 原子切换、receipt 回滚以及正式 URL 的 Cache-Control / SHA256 / Range 206 校验。

RC1 readiness 刻意不把模拟第三期、Safari-like Chromium 或本地部署演练当成真实外部验收。完整历史媒体、Mac Safari、iPhone Safari、第三期真实材料和正式 HTTPS 均由 `rc1-readiness-v3.mjs` 独立追踪，全部 READY 后才适合从 RC1 推进 V3.0 正式版。

## V3.0-RC2：外部门禁收口

RC2 不改变 V3 页面/block 数据模型。它补充历史媒体 hydrate/repair、当前 RC 版本绑定的 Safari 实机记录、第三期真实材料 preflight，以及版本绑定的 readiness。历史媒体下载固定到 RC baseline 的 GitHub commit，下载后仍必须经过严格大小与 Git blob SHA1 校验；Safari gate 由服务端校验实际 User-Agent，防止 Chromium 被手工选择成 Safari 后误记通过。

## V3.0-RC3 工作区与快速成刊

RC3 不新增 Reader schema，而是在 Studio 层增加可收束导航、编辑/Reader 可调分隔与快速成刊编排。快速成刊复用 Alpha13 导入内核、Alpha11 快照/修订、Alpha6 审计、Alpha14 live Reader 和 Beta/RC 发布门禁；因此不存在另一份导入或发布数据模型。

## V3.0.0 正式版冻结

V3.0.0 将当前 Reader/Studio 数据契约冻结为 `baselines/v3-schema-3.0.json`：9 类页面类型、14 类内容块和既有制作边界。正式版不再通过新增一级入口或破坏旧 `issue.json` 的方式扩展功能。后续自由创作能力放入 V3.1，并以兼容 V3.0 数据或显式迁移为前提。

正式发布采用“两层锁”：代码版本可以是 3.0.0，但 `final:release` 只有在六项真实门禁全部 READY 时才会生成 `V3.0.0-RELEASE.json`；服务器写入仍需要 `deploy:apply --confirm`。
