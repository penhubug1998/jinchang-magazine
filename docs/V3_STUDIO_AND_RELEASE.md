# V3 制作中心与发布器使用指南

## 一、日常制作

### 创建新一期

```bash
npm run new:issue -- --subtitle "本期主题"
```

也可以直接启动制作中心，在左侧点击“新建一期”。

### 启动制作中心

```bash
npm run studio:v3
```

浏览器访问：

```text
http://127.0.0.1:4173
```

制作中心只监听本机 `127.0.0.1`，默认不向局域网或公网暴露。

## 二、保存与版本历史

制作中心点击“保存修改”时会自动执行：

1. 为保存前版本建立快照；
2. 写回 `issues/<期号>/issue.json`；
3. 自动同步 `assets.json`。

手工命令：

```bash
npm run snapshot:v3 -- --issue 003 --label "完成时政栏目"
npm run snapshots:v3 -- --issue 003
npm run rollback:v3 -- --issue 003 --latest
```

快照位于 `.v3-snapshots/`，默认被 Git 忽略。

## 三、构建与归档首页

```bash
npm run build:v3
```

产物：

```text
dist-v3/
  index.html       # 自动期刊归档首页
  catalog.json
  002/
  003/
  ...
```

如只需要重新生成归档页：

```bash
npm run catalog:v3
```

## 四、发布前门禁

当内容与资源完成后，把：

```json
"status": "draft"
```

改为：

```json
"status": "ready"
```

然后运行：

```bash
npm run release:check -- --issue 003
```

该命令会针对 003 本身执行：

- 数据校验；
- 构建；
- 静态 smoke；
- 五档 Chromium 回归；
- TTS / 音乐 / 视频 / 图片严格审计。

## 五、生成正式发布包

```bash
npm run publish:v3 -- --issue 003
```

生成：

```text
release-v3/
  index.html
  catalog.json
  deploy-manifest.json
  003/
    index.html
    reader.css
    reader.js
    issue.json
    assets/
    release.json
```

发布器不会自动替换服务器目录。

`deploy-manifest.json` 会告诉部署流程本次来源目录和建议目标目录，最终上线仍需人工确认。

## 六、status 建议

- `draft`：编辑中，可缺资源，可预览。
- `ready`：内容与资源完整，允许进入严格发布检查和发布器。
- `published`：确认已经正式上线后使用。

如希望发布器在生成发布包后同步把源数据标记为 `published`：

```bash
npm run publish:v3 -- --issue 003 --mark-published
```

建议只有在已经确定本次发布包就是最终上线版本时才使用。

## 七、Alpha6 审计中心

制作中心顶部提供“日常审计”和“发布前检查”。审计结果会直接显示阻断、警告、可发布度、TTS/媒体完整度，并支持定位到具体页面或字段。

修改内容后旧审计会自动标记为“审计已过期”，应重新运行复检。完整说明见 `docs/V3_AUDIT_CENTER.md`。

制作中心自身还可执行：

```bash
npm run test:studio-browser
```

用于检查 320px 极窄屏到 1920px 大屏的界面边界。


## 八、Alpha7 可视化内容块

默认使用可视化模式编辑 `page.blocks`；高级 JSON 保留为兜底。审计的 `location.blockIndex` 会直接定位并展开对应内容块。详见 `docs/V3_VISUAL_EDITOR.md`。

## 九、Alpha8 高效制作工作流

Alpha8 新增页面模板、自动目录、结构复制、媒体库、文章库和双层预览。

推荐第三期开始使用：

1. 制作中心“新建一期”，选择标准结构或复制上一期栏目结构。
2. 使用页面模板快速建立新页，并填写 `栏目归属`。
3. 自动生成目录后人工检查栏目名称、导语与跳转页码。
4. 图片/视频通过媒体库选择或上传；不要手工复制到历史资源目录。
5. 外部文章通过文章库维护，页面只放 `articleLink` 引用。
6. 快速预览完成排版初检，再切换成刊预览验证真实阅读器。
7. 修改后重新审计，最终执行 `npm run release:check -- --issue <id>`。

## 十、Alpha9—Alpha11 工作台与修订安全

- Alpha9 将第一期迁移为 18 页 V3，并将桌面制作中心改为固定工作台；
- Alpha10 将期刊元信息和页面基础信息降级为可折叠次级信息，加入保存前差异确认；
- Alpha11 新增页面多选批量操作、多级撤销/重做、自动恢复草稿以及历史刊“未发布修订”状态。

编辑历史刊时应区分三个状态：

1. **未保存修改**：只存在当前编辑态，并自动同步到 `.v3-drafts/`；
2. **已保存、未发布修订**：V3 源稿已经保存并建立快照，但线上稳定目录尚未重新发布；
3. **已发布**：通过发布检查并完成实际部署后的版本。

因此不要把“点击保存”理解成“线上立即更新”。

## 十一、Alpha12 媒体制作与 TTS 对应

媒体库升级为媒体制作工作台：

- 图片可设置画框比例、contain/cover 和 X/Y 焦点；
- 图片上传可自动优化为更适合网页的尺寸与 WebP；
- 视频可选择 poster，也可用本机 ffmpeg 自动截取封面；
- 媒体会展示引用页面/内容块，正在使用的文件不可删除；
- 未使用媒体采用“预检后确认”的清理方式；
- TTS 不再只按文件数量判断，页面正文和顺序会生成指纹。

页面内容调整后如果出现“朗读音频可能与当前页面不一致”，应先重新生成对应 `page-XX.mp3`，再执行：

```bash
npm run tts:baseline -- --issue <id>
```

不要通过“重新建立基线”来掩盖尚未重新生成的旧音频。

## 十二、Alpha13 内容快速导入

制作中心“内容 → 快速导入”提供：粘贴正文、单文件导入、批量文章和栏目骨架。

支持 `.docx / .doc / .md / .markdown / .txt / .text`。导入内容先进入预览，不会直接修改期刊；确认“应用生成页面”后才进入当前 `issue.pages`，并自动纳入撤销/重做、草稿恢复、保存差异和未发布修订状态。

长文章可按目标内容密度自动建议 1～N 页。分页后必须再通过成刊预览检查真实阅读器排版，不能把自动分页结果视为最终排版。

“我的模板”用于保存常用页面结构；为了安全复用，模板会移除媒体路径、video poster、articleId 和目录跳转项。详细规则见 `docs/V3_CONTENT_IMPORT.md`。

## 十三、Alpha14 真实 Reader 联动

右侧预览默认改为正式 V3 Reader，而不再把简化结构预览当作最终版式依据。

编辑中的未保存内容会自动同步到 Reader；无需为了查看版式反复点击“保存 → 构建”。Reader 内翻页会反向更新 Studio 当前编辑页，Studio 选择页面也会同步 Reader。

设备档提供 1366×768、1920×1080、820×1180、390×844、412×915。目标尺寸是 iframe 的真实 viewport，外层缩放仅用于在制作中心内完整显示。

需要注意：

1. 实时 Reader 不会把未保存稿写回 `issue.json`；
2. 实时预览 PASS 不等于发布检查 PASS；
3. 正式发布仍执行 `release:check`；
4. “快速结构”模式保留用于快速查看 blocks，不承担最终成刊验收。

详细设计见 `docs/V3_LIVE_READER_PREVIEW.md`。
