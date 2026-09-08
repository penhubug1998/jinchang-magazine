import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildArchiveHtml, catalogHref } from "./lib-v3-catalog.mjs";
import { V3_VERSION, collectReferencedAssets, normalizeIssueId, parseArgs, stripAssetsPrefix } from "./lib-v3-production.mjs";

const root = process.cwd();
const args = parseArgs();
const output = path.join(root, "dist-v3");
const readerSource = path.join(root, "src", "reader");
const readerAssetTag = `${V3_VERSION}-issue-templates-20260908-final`;
const selectedIssue = String(args.issue || "").trim() ? normalizeIssueId(args.issue) : "";
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const checkArgs = selectedIssue ? ["--issue", selectedIssue] : [];
const check = spawnSync(process.execPath, [path.join(root, "scripts", "check-v3.mjs"), ...checkArgs], { cwd:root, stdio:"inherit" });
if (check.status !== 0) process.exit(check.status ?? 1);

if (selectedIssue) {
  const selectedFile = path.join(root, "issues", selectedIssue, "issue.json");
  if (!(await exists(selectedFile))) {
    console.error(`找不到 issues/${selectedIssue}`);
    process.exit(1);
  }
  // Issue-scoped builds preserve the other preview artifacts. This prevents a
  // quick edit of one issue from blanking the remaining Reader previews.
  await rm(path.join(output, selectedIssue), { recursive:true, force:true });
} else {
  await rm(output, { recursive:true, force:true });
}
await mkdir(output, { recursive:true });
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

async function emitV3Issue(issueDir, targetName){
  const issueFile = path.join(issueDir, "issue.json");
  const issue = await readJson(issueFile);
  if (issue.engine !== "v3") return null;
  const target = path.join(output, targetName);
  await mkdir(target, { recursive:true });
  await cp(readerSource, target, { recursive:true });
  const readerIndex=path.join(target,"index.html");
  const stamped=(await readFile(readerIndex,"utf8"))
    .replace(/\.\/reader\.css(?:\?[^"']*)?/,`./reader.css?v=${readerAssetTag}`)
    .replace(/\.\/reader\.js(?:\?[^"']*)?/,`./reader.js?v=${readerAssetTag}`);
  await writeFile(readerIndex,stamped,"utf8");
  const readerJs=path.join(target,'reader.js');
  await writeFile(readerJs,(await readFile(readerJs,'utf8')).replace("'./rich-text.js'",`'./rich-text.js?v=${V3_VERSION}'`).replace("'./layout-engine.js'",`'./layout-engine.js?v=${V3_VERSION}'`),'utf8');
  await writeFile(path.join(target, "issue.json"), `${JSON.stringify(issue, null, 2)}\n`, "utf8");

  if (issue.assetSource) {
    const sourceAssets = path.join(root, issue.assetSource);
    if (await exists(sourceAssets)) {
      // A release must contain exactly the resources referenced by its own
      // issue.json.  Copying the entire working media directory can retain
      // stale page-XX narration from an older pagination and make an online
      // reader appear to use the wrong recording.
      for (const ref of collectReferencedAssets(issue)) {
        const relative = stripAssetsPrefix(ref.path);
        const source = path.resolve(sourceAssets, relative);
        if (!source.startsWith(path.resolve(sourceAssets) + path.sep)) throw new Error(`资源路径越界：${relative}`);
        if (!(await exists(source))) {
          console.warn(`构建提示：${issue.id} 缺少引用资源 ${relative}，未复制。`);
          continue;
        }
        const destination = path.join(target, "assets", relative);
        await mkdir(path.dirname(destination), { recursive:true });
        await cp(source, destination, { recursive:true });
      }
    }
    else console.warn(`构建提示：${issue.id} 的资源目录 ${issue.assetSource} 不在当前 overlay 工作区，未复制媒体资源。`);
  }
  return target;
}

for (const base of ["examples", "issues"]) {
  const dir = path.join(root, base);
  const entries = await readdir(dir, { withFileTypes:true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (selectedIssue && (base === "examples" || entry.name !== selectedIssue)) continue;
    const name = base === "examples" ? `preview-${entry.name}` : entry.name;
    await emitV3Issue(path.join(dir, entry.name), name);
  }
}

const entries = await readdir(path.join(root, "issues"), { withFileTypes:true });
const catalog = [];
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const issue = await readJson(path.join(root, "issues", entry.name, "issue.json"));
  catalog.push({
    id:issue.id,label:issue.label,publication:issue.publication,subtitle:issue.subtitle || "",engine:issue.engine,status:issue.status,
    href:catalogHref(issue),
    legacyPath:issue.legacyPath || null,
    pageCount:Array.isArray(issue.pages) ? issue.pages.length : null
  });
}
catalog.sort((a,b) => b.id.localeCompare(a.id, "zh-CN"));
await writeFile(path.join(output, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
await writeFile(path.join(output, "index.html"), buildArchiveHtml(catalog, { subtitle:"归档阅读 · V3 构建预览" }), "utf8");
console.log(`V3 构建完成${selectedIssue ? `（仅 ${selectedIssue}）` : ""}：${path.relative(root, output)}`);
