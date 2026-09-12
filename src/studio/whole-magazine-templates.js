const text=(value,style='body',design={})=>({type:'paragraph',style,text:value,design});
const image=(caption,ratio='4:3')=>({type:'image',src:'',alt:'请上传图片并填写替代文字',caption,frameRatio:ratio,fit:'cover',positionX:50,positionY:50});
const heading=(value)=>({type:'sectionHeading',text:value,level:2,design:{fontSize:28,fontWeight:'700'}});
const chrome=(publication,section='')=>({header:section?`${publication} · ${section}`:publication,footer:'第 {page} 页'});
const cover=(target,sections,accent)=>({type:'cover',navTitle:'封面',title:target.subtitle||'请填写本期主题',kicker:target.publisher||'',design:{accent,padding:7,contentWidth:88},blocks:[{type:'coverMeta',text:`${target.publication||''} · ${target.label||''}`},{type:'coverSections',items:sections}]});
const toc=(sections)=>({type:'toc',navTitle:'目录',kicker:'CONTENTS',title:'本期导读',blocks:[{type:'toc',items:sections.map((title,index)=>({number:String(index+1).padStart(2,'0'),title,subtitle:'进入栏目',page:index*2+4}))}]});
const closing=(target,accent)=>({type:'closing',navTitle:'尾页',kicker:'EDITORIAL',title:'本期寄语',design:{accent,padding:8,contentWidth:82},blocks:[text('请在这里填写本期寄语。','lead'),{type:'producer',text:`${target.publisher||'制作单位'}制作`}]});
const sectionPage=(target,{section,strapline,accent,ratio='16:9'})=>({type:'article',role:'section',navTitle:`${section}｜栏目页`,section,kicker:'SECTION',title:section,chrome:chrome(target.publication,section),design:{accent,padding:8,contentWidth:86},blocks:[heading(section),text(strapline,'lead',{fontSize:20,fontWeight:'500'}),image(`${section}栏目主视觉`,ratio)]});
const articlePage=(target,{section,title,accent,ratio='4:3',layout='media-left'})=>({type:'article',navTitle:title,section,kicker:section,title,chrome:chrome(target.publication,section),design:{accent,padding:6,contentWidth:92},blocks:[{type:'container',layout,gap:'lg',align:'start',mobile:'stack',columns:[{blocks:[image(`${title}配图`,ratio)]},{blocks:[text('请在这里填写导语。','lead',{fontSize:19,fontWeight:'500'}),text('请在这里填写正文。正文建议按自然段组织，可继续添加图片、引言、卡片或链接。','body',{fontSize:16})]}]}]});

const definitions={
  comprehensive:{
    id:'comprehensive',name:'单位综合刊',description:'适合单位月刊、季刊和综合信息发布；栏目清晰、正式稳重、图文平衡。',accent:'#8d1f1c',tokens:{accent:'#8d1f1c',paper:'#fffaf0',canvas:'#211916',texture:'paper',text:'#332823',muted:'#826f63',fontBase:14.2,radius:10,spacing:11},sections:['时政要闻','理论学习','安全防范','健康生活'],ratios:['16:9','4:3','4:3','3:2']
  },
  gallery:{
    id:'gallery',name:'活动图集',description:'适合活动纪实、荣誉展示和摄影图集；大图优先、图注统一、视觉节奏更强。',accent:'#ae5538',tokens:{accent:'#ae5538',paper:'#fff8f2',canvas:'#33231d',texture:'plain',text:'#3d2b25',muted:'#8e7064',fontBase:14.4,radius:16,spacing:12},sections:['活动速览','精彩瞬间','人物风采','温暖回声'],ratios:['16:9','3:2','1:1','16:9']
  },
  study:{
    id:'study',name:'学习专题',description:'适合理论学习、政策解读和专题研讨；长文阅读优先，层级和引用更清楚。',accent:'#3f557f',tokens:{accent:'#3f557f',paper:'#fbfcff',canvas:'#1b2436',texture:'linen',text:'#293348',muted:'#748099',fontBase:15,radius:8,spacing:13},sections:['学习导读','核心要点','原文研读','交流思考'],ratios:['16:9','4:3','4:3','3:2']
  }
};

function templatePages(def,target){
  const pages=[cover(target,def.sections,def.accent),{type:'article',navTitle:'卷首语',kicker:'FOREWORD',title:def.id==='gallery'?'把美好瞬间留在这一期':def.id==='study'?'以学铸魂 · 常学常新':'凝心聚力 · 共阅新篇',chrome:chrome(target.publication,'卷首语'),design:{accent:def.accent,padding:8,contentWidth:82},blocks:[text('请填写本期卷首语，说明本期主题、编排思路与阅读提示。','lead',{fontSize:20,fontWeight:'500'}),{type:'quote',text:'模板已预置栏目页、页眉页脚、字号层级、品牌色和图片比例，可在不破坏品牌锁定项的前提下继续编辑内容。'}]},toc(def.sections)];
  def.sections.forEach((section,index)=>{
    pages.push(sectionPage(target,{section,strapline:def.id==='gallery'?'用影像记录现场，用图注补全时间、地点与人物。':def.id==='study'?'先建立学习框架，再进入正文、要点和交流思考。':'以栏目页建立阅读节奏，正文页承载完整信息。',accent:def.accent,ratio:def.ratios[index]}));
    const page=articlePage(target,{section,title:def.id==='gallery'?`${section}｜图集页`:def.id==='study'?`${section}｜学习页`:`${section}｜内容页`,accent:def.accent,ratio:def.ratios[index],layout:def.id==='gallery'?(index%2?'media-right':'media-left'):'media-left'});
    if(def.id==='gallery')page.blocks.push({type:'container',layout:'two-equal',gap:'md',align:'start',mobile:'stack',columns:[{blocks:[image('补充照片 A','4:3')]},{blocks:[image('补充照片 B','4:3')]}]});
    if(def.id==='study')page.blocks.push({type:'pullQuote',label:'学习提示',text:'请摘录本页最重要的一句话。',attribution:''},{type:'sidebar',title:'学习要点',text:'1. 要点一\n2. 要点二\n3. 要点三'});
    pages.push(page);
  });
  pages.push(closing(target,def.accent));
  pages.forEach((page,index)=>{if(!page.chrome&& !['cover','toc','closing'].includes(page.type))page.chrome=chrome(target.publication,page.section||'');if(page.chrome)page.chrome.footer=`${target.label||'本期'} · 第 {page}/${pages.length} 页`;page.templateSlot={templateId:def.id,index,lockedBrand:true};});
  return pages;
}

export const WHOLE_MAGAZINE_TEMPLATES=Object.freeze(Object.values(definitions).map(def=>({id:def.id,name:def.name,description:def.description,sections:[...def.sections],accent:def.accent})));
export function wholeMagazineTemplate(id){return definitions[String(id||'')]||null;}
export function applyWholeMagazineTemplate(id,target){
  const def=wholeMagazineTemplate(id);if(!def)throw new Error(`未知整刊模板：${id}`);
  const pages=templatePages(def,target);
  return {...target,theme:def.id==='gallery'?'begonia-orange':def.id==='study'?'indigo-night':'classic-red',design:{...(target.design||{}),tokens:{...def.tokens}},brandLock:{enabled:true,templateId:def.id,templateName:def.name,lockedFields:['publication','publisher','design.tokens.accent'],accent:def.accent,appliedAt:new Date().toISOString()},wholeTemplate:{id:def.id,name:def.name,version:1,appliedAt:new Date().toISOString(),imageRatios:[...new Set(def.ratios)]},articles:{},pages};
}
