const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();

export const SMART_LAYOUT_ENGINE_INFO={
  version:'3.1-alpha24',
  deterministic:true,
  explainable:true,
  autoApply:false,
  htmlIsSourceOfTruth:false,
  sourceOfTruth:'issue.json',
  signals:['titleChars','bodyChars','media','quotes','points','headings','visualHealth','semantic','textFlow']
};

function richTextStats(node,stats={chars:0,headings:0,lists:0,listItems:0,quotes:0}){
  if(!node||typeof node!=='object')return stats;
  if(node.type==='text')stats.chars+=clean(node.text).length;
  if(node.type==='heading')stats.headings++;
  if(node.type==='bulletList'||node.type==='orderedList')stats.lists++;
  if(node.type==='listItem')stats.listItems++;
  if(node.type==='blockquote')stats.quotes++;
  for(const child of node.content||[])richTextStats(child,stats);
  return stats;
}
function blockTextChars(block){
  if(!block||typeof block!=='object')return 0;
  const rich=richTextStats(block.richText);
  if(rich.chars)return rich.chars;
  let total=0;
  for(const key of ['text','case','warning','caption','attribution'])total+=clean(block[key]).length;
  if(block.type==='cards')for(const item of block.items||[])total+=clean(item?.title).length+clean(item?.text).length;
  if(block.type==='chips')for(const item of block.items||[])total+=clean(item?.text??item).length;
  return total;
}
function flattenBlocks(blocks=[],out=[]){
  for(const block of blocks||[]){
    if(!block||typeof block!=='object')continue;
    if(block.type==='container'){for(const column of block.columns||[])flattenBlocks(column?.blocks||[],out);continue;}
    out.push(block);
  }
  return out;
}
function inferSemantic(page={}){
  const explicit=clean(page.semanticType||page.semantic?.type||'').toLowerCase();
  if(explicit)return explicit;
  const type=clean(page.type).toLowerCase();
  if(['news','theory','safety','discipline','health'].includes(type))return type;
  const hint=`${clean(page.section)} ${clean(page.kicker)} ${clean(page.title)} ${clean(page.navTitle)}`;
  const rules=[
    ['profile',/人物|风采|榜样|先进|银龄故事|老同志/],['culture',/文苑|文化|书画|摄影|诗词|文学|作品/],['finance',/金融|人民币|征信|支付|存款|国债|理财/],['activity',/活动|纪实|参观|座谈|慰问|主题党日/],['safety',/安全|反诈|诈骗|防范|风险/],['health',/健康|养生|节气|保健|康养/],['theory',/理论|学习|党建|党史|思想/],['news',/时政|要闻|新闻|动态/]
  ];
  return rules.find(([,re])=>re.test(hint))?.[0]||'general';
}
function healthFromMetric(metric){
  if(!metric)return {state:'unknown',fill:0,overflow:false};
  const fill=clamp(Number(metric.fillRatio)||0,0,2),overflow=Boolean(metric.overflow);
  if(overflow||fill>.96)return {state:'dense',fill,overflow};
  if(fill<.38)return {state:'sparse',fill,overflow};
  return {state:'good',fill,overflow};
}
export function analyzeSmartLayoutProfile(page={}, {visualMetric=null}={}){
  const blocks=flattenBlocks(page.blocks||[]),title=clean(page.title||page.navTitle||''),semantic=inferSemantic(page);let bodyChars=0,images=0,videos=0,quotes=0,points=0,headings=0,cards=0,textFlowSlots=0,richLists=0;
  for(const block of blocks){
    bodyChars+=blockTextChars(block);
    const rich=richTextStats(block.richText);headings+=rich.headings;quotes+=rich.quotes;points+=rich.listItems;richLists+=rich.lists;
    if(block.type==='image')images++;if(block.type==='video')videos++;
    if(block.type==='quote'||block.type==='pullQuote')quotes++;
    if(block.type==='sectionHeading')headings++;
    if(block.type==='textFlow')textFlowSlots++;
    if(block.type==='cardline'){points++;cards++;}
    if(block.type==='cards'){points+=(block.items||[]).length;cards+=(block.items||[]).length;}
    if(block.type==='chips')points+=(block.items||[]).length;
    if(block.type==='casePair'){points+=2;cards+=2;}
  }
  const health=healthFromMetric(visualMetric),media=images+videos,units=blocks.length;
  return {
    title,titleChars:title.length,bodyChars,images,videos,media,quotes,points,headings,cards,richLists,textFlowSlots,units,
    containers:(page.blocks||[]).filter(x=>x?.type==='container').length,semantic,pageType:page.type||'article',section:clean(page.section),
    visualHealth:health.state,fillRatio:health.fill,overflow:health.overflow,
    density:units?Math.round(bodyChars/units):bodyChars,
    currentColumns:clamp(Number(page.publishing?.columns)||1,1,3)
  };
}

const recipes=[
  {
    id:'longform-media-spread',name:'双页长文 · 左文右图',preset:'media-right',readerMode:'深度阅读',pages:2,columns:2,columnGap:20,
    score:p=>52+(p.bodyChars>=1600?34:0)+(p.bodyChars>=2100?8:0)+(p.media>=1?28:0)+(p.quotes?5:0)+(p.titleChars>=12&&p.titleChars<=38?4:0)-(p.media===0?28:0),
    reason:p=>[`正文 ${p.bodyChars} 字，适合拆成连续阅读节奏`,`${p.media} 个媒体可形成右侧视觉锚点`,p.quotes?`${p.quotes} 处引用可作为跨栏重点`:'双栏缩短长文单行阅读距离'],
    when:p=>p.bodyChars>=1300&&p.media>=1
  },
  {
    id:'brief-three-column',name:'三栏速览',preset:'three-brief',readerMode:'快速扫描',pages:1,columns:3,columnGap:16,
    score:p=>48+(p.bodyChars>=260&&p.bodyChars<=850?22:0)+(p.points>=5?35:0)+(p.media===0?12:0)+(p.cards>=3?8:0)-(p.bodyChars>1100?30:0),
    reason:p=>[`${p.bodyChars} 字正文适合单页快速阅读`,`${p.points} 个要点/列表可分散到三栏`,p.media?'媒体较少时效果最佳':'无媒体干扰，信息密度可控'],
    when:p=>p.bodyChars<=1050&&p.points>=4
  },
  {
    id:'balanced-deep-read',name:'双栏深读',preset:'two-balanced',readerMode:'连续阅读',pages:2,columns:2,columnGap:18,
    score:p=>50+(p.bodyChars>=900?30:0)+(p.bodyChars>=1800?12:0)+(p.units>=5?10:0)+(p.media===0?6:0)+(p.visualHealth==='dense'?8:0),
    reason:p=>[`${p.bodyChars} 字正文需要降低纵向长度`,`${p.units} 个内容单元适合均衡分栏`,p.visualHealth==='dense'?'Reader 已检测到版面偏密':'双栏能保持稳定阅读节奏'],
    when:p=>p.bodyChars>=850
  },
  {
    id:'visual-feature',name:'图文特写 · 左图右文',preset:'media-left',readerMode:'视觉叙事',pages:1,columns:2,columnGap:22,
    score:p=>48+(p.media>=1?35:0)+(p.bodyChars>=350&&p.bodyChars<=1450?20:0)+(['profile','activity','culture'].includes(p.semantic)?12:0)-(p.media===0?35:0),
    reason:p=>[`${p.media} 个媒体适合作为首屏视觉入口`,`${p.bodyChars} 字正文可与主图并列`,['profile','activity','culture'].includes(p.semantic)?`“${p.semantic}”栏目语义偏视觉叙事`:'图文并列减少上下跳读'],
    when:p=>p.media>=1&&p.bodyChars<=1700
  },
  {
    id:'lead-news',name:'头条引领 · 双栏跟进',preset:'lead-two',readerMode:'重点优先',pages:1,columns:2,columnGap:18,
    score:p=>45+(['news','theory','finance'].includes(p.semantic)?28:0)+(p.units>=3?15:0)+(p.headings>=1?8:0)+(p.bodyChars>=500?8:0),
    reason:p=>[`${p.semantic==='general'?'当前':'“'+p.semantic+'”'}栏目适合先突出主信息`,`${p.units} 个内容单元可在首屏重点后分流`,p.headings?`${p.headings} 个层级标题利于形成阅读路径`:'首个内容块可作为导语或摘要'],
    when:p=>p.units>=3
  },
  {
    id:'single-focus',name:'单页聚焦',preset:'single-focus',readerMode:'安静阅读',pages:1,columns:1,columnGap:0,
    score:p=>44+(p.bodyChars<=750?25:0)+(p.units<=3?25:0)+(p.visualHealth==='sparse'?12:0)-(p.bodyChars>1400?22:0),
    reason:p=>[`${p.bodyChars} 字内容无需复杂分栏`,`${p.units} 个内容单元适合保持自然顺序`,p.visualHealth==='sparse'?'Reader 检测到留白较多，可用单栏放宽节奏':'保守方案对手机和桌面都最稳定'],
    when:p=>true
  }
];
function pagesFor(recipe,p){
  if(recipe.id==='balanced-deep-read')return clamp(Math.ceil(p.bodyChars/1450),1,3);
  if(recipe.id==='longform-media-spread')return clamp(Math.ceil(p.bodyChars/1750),2,3);
  return recipe.pages;
}
function confidence(score){return score>=96?'high':score>=78?'medium':'low';}
export function recommendSmartLayouts(page={},options={}){
  const profile=analyzeSmartLayoutProfile(page,options),rows=[];
  for(const recipe of recipes){
    if(!recipe.when(profile))continue;
    let score=Math.round(recipe.score(profile));
    if(profile.overflow&&recipe.columns>1)score+=6;
    if(profile.textFlowSlots&&pagesFor(recipe,profile)>1)score+=8;
    if(profile.currentColumns===recipe.columns)score+=2;
    score=clamp(score,0,120);
    const recommendedPages=pagesFor(recipe,profile),reasons=recipe.reason(profile).filter(Boolean).slice(0,3);
    rows.push({...recipe,score,confidence:confidence(score),recommendedPages,reasons,profile,publishing:{columns:recipe.columns,columnGap:recipe.columnGap,balanceColumns:recipe.columns>1},requiresPagination:recommendedPages>1&&profile.textFlowSlots===0});
  }
  const unique=[];
  for(const row of rows.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))){if(unique.some(x=>x.preset===row.preset))continue;unique.push(row);if(unique.length===3)break;}
  return unique;
}
