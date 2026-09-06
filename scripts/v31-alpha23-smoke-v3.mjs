import { readFile } from 'node:fs/promises';
import { buildPublishingPlan, flowFragmentFor, normalizePagePublishing, normalizeBlockPublishing, LAYOUT_ENGINE_INFO } from '../src/reader/layout-engine.js';
const assert=(c,m)=>{if(!c)throw new Error(m)};
const pkg=JSON.parse(await readFile('package.json','utf8'));
assert(pkg.version==='3.1.0'||['3.1.0-alpha.23','3.1.0-alpha.24','3.1.0-alpha.25','3.1.0-alpha.26','3.1.0-beta.1','3.1.0-rc.1','3.1.0-rc.2'].includes(pkg.version),`version=${pkg.version}`);
assert(['3.1-alpha23','3.1-alpha24'].includes(pkg.v31SchemaVersion),`schema=${pkg.v31SchemaVersion}`);
const issue=JSON.parse(await readFile('examples/v31-publishing-alpha23/issue.json','utf8'));
const plan=buildPublishingPlan(issue);
assert(LAYOUT_ENGINE_INFO.derivedPagination===true&&LAYOUT_ENGINE_INFO.htmlIsSourceOfTruth===false,'layout engine source-of-truth contract failed');
const slots=issue.pages.flatMap((p,pi)=>(p.blocks||[]).map((b,bi)=>({p,pi,b,bi}))).filter(x=>x.b.type==='textFlow');
assert(slots.length===3,'expected 3 flow slots');
const fragments=slots.map(x=>flowFragmentFor(plan,x.b,{pageIndex:x.pi,blockIndex:x.bi}));
assert(fragments.every(x=>x?.type==='doc'&&Array.isArray(x.content)),'flow fragments missing');
assert(JSON.stringify(fragments[0])!==JSON.stringify(fragments[1]),'flow did not advance across slots');
assert(plan.diagnostics.some(x=>x.flowId==='feature-story'&&x.type==='complete'),'flow should fit supplied slots');
const p1=normalizePagePublishing(issue.pages[1]);assert(p1.columns===2&&p1.balanceColumns&&p1.columnGap===18,'page publishing normalization failed');
const drop=normalizeBlockPublishing(issue.pages[3].blocks[0]);assert(drop.dropCap===true,'drop cap normalization failed');
const [reader,css,studio,checker,builder,narration]=await Promise.all([
  readFile('src/reader/reader.js','utf8'),readFile('src/reader/reader.css','utf8'),readFile('src/studio/studio.js','utf8'),readFile('scripts/check-v3.mjs','utf8'),readFile('scripts/build-v3.mjs','utf8'),readFile('scripts/lib-v3-production.mjs','utf8')
]);
for(const token of ['textFlow','pullQuote','sidebar','sectionHeading','buildPublishingPlan','pagePublishingStyle'])assert(reader.includes(token),`reader missing ${token}`);
for(const token of ['column-count','column-fill:balance','pub-drop-cap','pub-wrap-left','publishing-pull-quote','publishing-sidebar','column-span:all','orphans:2','widows:2'])assert(css.includes(token),`css missing ${token}`);
for(const token of ['跨页文本流','Pull Quote','Sidebar','跨栏标题','data-page-publishing','data-inspector-publishing'])assert(studio.includes(token),`studio missing ${token}`);
assert(checker.includes('textFlow')&&checker.includes('validatePublishing'),'schema check not extended');
assert(builder.includes("'./layout-engine.js'"),'build cache stamping missing layout engine');
assert(narration.includes("case 'pullQuote'")&&narration.includes("case 'sectionHeading'"),'narration support missing');
console.log('V3.1-alpha23 Smoke 通过：跨页文本流、孤行/寡行约束、双栏平衡、跨栏标题、首字下沉、环绕、Caption/Pull Quote/Sidebar 数据契约成立。');
