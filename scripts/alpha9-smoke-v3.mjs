import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { V3_VERSION } from './lib-v3-production.mjs';

const root=process.cwd();
const readJson=async rel=>JSON.parse(await readFile(path.join(root,rel),'utf8'));
const assert=(condition,message)=>{if(!condition) throw new Error(message)};

const [pkg,issue1,assets1,issue2,studioHtml,studioCss,studioJs]=await Promise.all([
  readJson('package.json'),readJson('issues/001/issue.json'),readJson('issues/001/assets.json'),readJson('issues/002/issue.json'),
  readFile(path.join(root,'src/studio/index.html'),'utf8'),readFile(path.join(root,'src/studio/studio.css'),'utf8'),readFile(path.join(root,'src/studio/studio.js'),'utf8')
]);
assert(pkg.version===V3_VERSION,'Alpha9 基线：package 与统一版本源不一致');
assert(issue1.engine==='v3','第一期仍不是 V3');
assert(issue1.status==='published','第一期已发布状态未保留');
assert(issue1.legacyPath==='../../1/','第一期 legacyPath 丢失');
assert(issue1.assetSource==='1/assets','第一期 assetSource 未复用历史资源');
assert(Array.isArray(issue1.pages)&&issue1.pages.length===18,'第一期应为 18 个阅读页');
const legacyTitles=['封面','卷首语','目录','时政会议｜科技强国','时政会议｜人工智能','时政会议｜基础教育','理论学习｜习近平党建思想','理论学习｜正确政绩观','平安守护｜风险解读①','平安守护｜风险解读②','平安守护｜防范指南①','平安守护｜温情帮扶','健康生活｜合理起居','健康生活｜补水膳食','健康生活｜适度运动','健康生活｜慢病与居家','纪律提醒｜视频','尾刊寄语'];
assert(JSON.stringify(issue1.pages.map(p=>p.navTitle))===JSON.stringify(legacyTitles),'第一期 18 页标题顺序与旧刊不一致');
assert(issue1.pages[0]?.type==='cover'&&issue1.pages[0]?.navTitle==='封面','第一期封面迁移异常');
assert(issue1.pages.at(-1)?.type==='closing'&&issue1.pages.at(-1)?.navTitle==='尾刊寄语','第一期尾页迁移异常');
assert(JSON.stringify(Object.keys(issue1.articles||{}).sort())===JSON.stringify(['news1','news2','news3','theory1','theory2'].sort()),'第一期应迁移原有 5 篇文章链接内容');
assert(!issue1.pages.at(-1)?.blocks?.some(b=>b.type==='producer'),'第一期迁移不得新增旧刊不存在的制作单位块');
const expectedAssets=assets1.expected||assets1.assets||[];
const paths=expectedAssets.map(x=>typeof x==='string'?x:x.path).filter(Boolean);
assert(paths.includes('music/bgm.mp3'),'第一期音乐清单缺失');
assert(paths.includes('video/discipline.mp4'),'第一期视频清单缺失');
assert(paths.includes('tts/page-01.mp3')&&paths.includes('tts/page-18.mp3'),'第一期 TTS 应覆盖 page-01 到 page-18');
assert(paths.filter(x=>x.startsWith('tts/page-')).length===18,'第一期 TTS 清单数量应为 18');
assert(paths.length===20,'第一期资源清单应为 18 个 TTS + 1 音乐 + 1 视频');
assert(issue2.engine==='v3'&&issue2.status==='published','第二期应为 published V3 可编辑状态');
assert(studioHtml.includes('id="metaToggle"')&&studioHtml.includes('id="metaSummaryTitle"')&&studioHtml.includes('id="historyPanel"'),'制作中心缺少 Alpha9 折叠元数据/历史结构');
assert(studioCss.includes('height:100dvh')&&studioCss.includes('position:fixed')&&studioCss.includes('.issue-meta.is-collapsed'),'制作中心缺少固定工作台/折叠元信息 CSS');
assert(studioJs.includes('setMetaExpanded')&&studioJs.includes('v3StudioMetaExpanded'),'制作中心缺少折叠状态逻辑');
console.log('Alpha9 专项自测通过：第一期 18 页已迁移为 V3，历史内容保护与固定工作台结构正常。');
