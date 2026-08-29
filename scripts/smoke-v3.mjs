import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { V3_VERSION, normalizeIssueId } from './lib-v3-production.mjs';

const root = process.cwd();
const out = path.join(root, "dist-v3");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const issueArgIndex=process.argv.findIndex(x=>x==='--issue'||x==='--id');
const targetId=issueArgIndex>=0?normalizeIssueId(process.argv[issueArgIndex+1]||''):'';

for (const file of ["src/reader/reader.js","src/reader/index.html","src/reader/reader.css"]) await access(path.join(root,file));
const syntax = spawnSync(process.execPath, ["--check", path.join(root,"src/reader/reader.js")], { stdio:"inherit" });
assert(syntax.status === 0, "reader.js 语法检查失败");
for (const file of ["scripts/new-issue-v3.mjs","scripts/sync-assets-v3.mjs","scripts/audit-v3.mjs","scripts/release-check-v3.mjs","scripts/publish-v3.mjs","scripts/snapshot-v3.mjs","scripts/rollback-v3.mjs","scripts/studio-v3.mjs","scripts/lib-v3-import.mjs","src/studio/index.html"]) await access(path.join(root,file));
const pkg = JSON.parse(await readFile(path.join(root,"package.json"), "utf8"));
assert(pkg.version === V3_VERSION, `package 版本 ${pkg.version} 与运行时 ${V3_VERSION} 不一致`);
assert(pkg.scripts?.["new:issue"] && pkg.scripts?.["audit:v3"] && pkg.scripts?.["release:check"], "生产命令未注册");
assert(pkg.scripts?.["studio:v3"] && pkg.scripts?.["publish:v3"] && pkg.scripts?.["snapshot:v3"] && pkg.scripts?.["rollback:v3"], "平台/发布/历史命令未注册");
const readerSource = await readFile(path.join(root,"src/reader/reader.js"), "utf8");
assert(readerSource.includes("spreadNumberForPage"), "reader 缺少书本跨页映射");
assert(readerSource.includes("visualViewport"), "reader 缺少 visualViewport 适配");
assert(readerSource.includes("swipe-layer"), "reader 缺少移动端跟手翻页层");

if(targetId){
  const target=path.join(out,targetId);
  await access(path.join(target,'index.html'));await access(path.join(target,'reader.js'));await access(path.join(target,'reader.css'));
  const issue=JSON.parse(await readFile(path.join(target,'issue.json'),'utf8'));
  assert(issue.engine==='v3',`${targetId} 不是 V3 构建`);
  assert(issue.id===targetId,`${targetId} 构建内 issue.id=${issue.id} 不一致`);
  assert(Array.isArray(issue.pages)&&issue.pages.length>0,`${targetId} 构建 pages 为空`);
  assert(issue.pages[0]?.type==='cover',`${targetId} 首页面不是 cover`);
  assert(issue.pages.at(-1)?.type==='closing',`${targetId} 末页面不是 closing`);
  console.log(`V3 目标期刊 smoke 通过：${targetId} · ${issue.pages.length} 页。`);
} else {
  await access(path.join(out,"002","index.html"));
  await access(path.join(out,"002","reader.js"));
  const issue = JSON.parse(await readFile(path.join(out,"002","issue.json"), "utf8"));
  assert(issue.engine === "v3", "第二期未切换到 V3");
  assert(issue.pages.length === 29, `第二期应为 29 个阅读页，实际 ${issue.pages.length}`);
  assert(issue.pages[0].navTitle === "封面", "第二期首屏不是封面");
  assert(issue.pages.at(-1).navTitle === "尾刊寄语", "第二期末页不是尾刊寄语");
  assert(issue.features?.narration?.pattern === "assets/tts/page-{page}.mp3", "TTS 规则异常");
  assert(issue.migration?.alpha3?.bookSpreadSemantics === true, "alpha3 书本跨页语义未启用");
  assert(issue.migration?.alpha3?.mobileDragFlip === true, "alpha3 移动端跟手翻页未启用");
  const catalog = JSON.parse(await readFile(path.join(out,"catalog.json"), "utf8"));
  const second = catalog.find((x) => x.id === "002");
  assert(second?.href === "./002/", "catalog 未指向 V3 第二期预览");
  assert(second?.legacyPath === "../../2/", "catalog 未保留第二期 legacyPath");
  await access(path.join(out,"index.html"));
  const archiveHtml = await readFile(path.join(out,"index.html"), "utf8");
  assert(archiveHtml.includes("DIGITAL MAGAZINE ARCHIVE"), "自动归档首页未生成");
  const first = catalog.find((x) => x.id === "001");
  assert(first?.href === "./001/", `V3 第一期归档链接异常：${first?.href}`);
  await access(path.join(out,"001","issue.json"));
  const firstIssue = JSON.parse(await readFile(path.join(out,"001","issue.json"), "utf8"));
  assert(firstIssue.engine === "v3" && firstIssue.pages.length === 18, `第一期应迁移为 18 页 V3，实际 ${firstIssue.engine}/${firstIssue.pages?.length}`);
  assert(Object.keys(firstIssue.articles || {}).length === 5, "第一期外部文章库迁移不完整");
  assert(firstIssue.assetSource === "1/assets", "第一期未复用原 1/assets");
  console.log("V3 smoke test 通过：第一期 18 页与第二期 29 页均为 V3，可视化生产、归档、历史与制作中心命令正常。");
}
