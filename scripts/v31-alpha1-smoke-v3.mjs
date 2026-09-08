import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import { collectReferencedAssets, narrationPageText } from './lib-v3-production.mjs';
const pkg=JSON.parse(await readFile('package.json','utf8'));
if(pkg.version!=='3.1.0'&&!/^3\.1\.0-alpha\.(?:[1-9]|10|11|12|13|14|15|16|17|18|19)$/.test(pkg.version))throw new Error(`V3.1 alpha1 回归不支持当前版本：${pkg.version}`);
if(pkg.v3StableVersion!=='3.0.0')throw new Error('V3.0.0 稳定发布锁未保留');
const schema=JSON.parse(await readFile('baselines/v3-schema-3.1-alpha1.json','utf8'));
if(!schema.blockTypes.includes('container')||schema.container.layouts.length!==7)throw new Error('V3.1 container schema 不完整');
const issue=JSON.parse(await readFile('examples/v31-layout-matrix/issue.json','utf8'));
const layouts=issue.pages.flatMap(p=>(p.blocks||[]).filter(b=>b.type==='container').map(b=>b.layout));
for(const layout of schema.container.layouts)if(!layouts.includes(layout))throw new Error(`布局矩阵缺少 ${layout}`);
const [reader,css,studio,check,prod]=await Promise.all(['src/reader/reader.js','src/reader/reader.css','src/studio/studio.js','scripts/check-v3.mjs','scripts/lib-v3-production.mjs'].map(f=>readFile(f,'utf8')));
for(const token of ['layout-container','layout-two-equal','mobile-stack'])if(!css.includes(token))throw new Error(`Reader CSS 缺少 ${token}`);
if(!reader.includes('case "container"'))throw new Error('Reader 未渲染 container');
for(const token of ['renderContainerEditor','container-add-child','container-child-field','addLayoutBtn','blockContainsAsset'])if(!studio.includes(token))throw new Error(`Studio 容器编辑缺少 ${token}`);
if(!check.includes('allowedContainerLayouts'))throw new Error('check:v3 未校验 container');
if(!prod.includes('walkBlockAssets')||!prod.includes("case 'container'"))throw new Error('媒体/TTS 未递归处理 container');
if(!check.includes('MAX_PAGE_BLOCK_NODES')||!studio.includes('totalBlockNodesPerPage'))throw new Error('V3.1 递归页面边界未固化');
await readFile('examples/v31-layout-matrix/assets/image/demo.svg','utf8');

const nestedIssue={id:'nested-test',features:{music:{src:'assets/music/bgm.mp3'}},pages:[{navTitle:'嵌套测试',title:'布局正文',blocks:[{type:'container',layout:'two-equal',columns:[{blocks:[{type:'image',src:'assets/image/nested.jpg',alt:'nested'}]},{blocks:[{type:'paragraph',text:'容器里的朗读正文'}]}]}]}]};
const nestedRefs=collectReferencedAssets(nestedIssue);
if(!nestedRefs.some(r=>r.path==='image/nested.jpg'&&String(r.field).includes('columns.0.blocks.0.src')))throw new Error('容器内媒体引用未递归收集');
if(!narrationPageText(nestedIssue.pages[0]).includes('容器里的朗读正文'))throw new Error('容器内正文未进入 TTS 指纹文本');

const digest=crypto.createHash('sha256').update(JSON.stringify(schema)).digest('hex').slice(0,16);
console.log(`V3.1-alpha1 smoke 通过：7 种容器布局、Reader/Studio/校验/媒体/TTS 递归和 V3.0 稳定发布锁正常。schema=${digest}`);
