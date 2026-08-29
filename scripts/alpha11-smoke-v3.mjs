import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { V3_VERSION } from './lib-v3-production.mjs';
const root=process.cwd();
const assert=(c,m)=>{if(!c)throw new Error(m)};
const [html,js,css,server,pkg,publish]=await Promise.all([
  readFile(path.join(root,'src/studio/index.html'),'utf8'),
  readFile(path.join(root,'src/studio/studio.js'),'utf8'),
  readFile(path.join(root,'src/studio/studio.css'),'utf8'),
  readFile(path.join(root,'scripts/studio-v3.mjs'),'utf8'),
  readFile(path.join(root,'package.json'),'utf8'),
  readFile(path.join(root,'scripts/publish-v3.mjs'),'utf8')
]);
assert(JSON.parse(pkg).version===V3_VERSION,'Alpha11 基线：package 与统一版本源不一致');
for(const id of ['redoBtn','discardBtn','batchPageBar','selectFilteredPages','draftRecoveryDialog'])assert(html.includes(`id="${id}"`),`制作中心缺少 ${id}`);
for(const token of ['selectedPages','undoStack','redoStack','saveDraftNow','askDraftRecovery','batchMovePages','UNPUBLISHED_REVISION']){
  if(token==='UNPUBLISHED_REVISION')assert((await readFile(path.join(root,'scripts/audit-v3.mjs'),'utf8')).includes(token),`审计缺少 ${token}`);
  else assert(js.includes(token),`Studio JS 缺少 ${token}`);
}
assert(server.includes("seg[3]==='draft'"),'Studio API 缺少 draft 路由');
assert(server.includes('revisionPending'),'期刊摘要缺少 revisionPending');
assert(server.includes("data.revision={"),'已发布期刊保存未持久化修订状态');
assert(publish.includes('pending:false')&&publish.includes('releaseSnapshot'),'发布后显式标记未清理 revision.pending');
assert(css.includes('.page-row.selected'),'多选页面样式缺失');
assert(css.includes('.action-menu'),'顶部动作菜单样式缺失');
for(const id of ['001','002']){const issue=JSON.parse(await readFile(path.join(root,'issues',id,'issue.json'),'utf8'));assert(issue.engine==='v3',`${id} 必须保持 V3`);assert(Array.isArray(issue.pages)&&issue.pages.length>0,`${id} 页面数据异常`);}
console.log('Alpha11 smoke 通过：页面批量操作、多级撤销/重做、自动草稿恢复、未发布修订与顶部动作收敛结构完整。');
