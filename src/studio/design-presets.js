export const DESIGN_PRESETS = [
  {id:'editorial-warm',name:'暖纸编辑',description:'延续现有期刊的暖纸与深红强调，适合综合刊物。',tokens:{accent:'#8d1f1c',paper:'#fffaf0',canvas:'#1f1a17',texture:'paper',text:'#3b2d26',muted:'#8a7566',fontBase:13.3,radius:12,spacing:10}},
  {id:'red-classic',name:'丹心红',description:'稳重的朱红与象牙纸色，适合党建、理论和人物专题。',tokens:{accent:'#9b2f27',paper:'#fffdf7',canvas:'#2b1818',texture:'linen',text:'#352823',muted:'#806f65',fontBase:13.5,radius:10,spacing:10}},
  {id:'ink-green',name:'墨绿雅刊',description:'低饱和墨绿与米白底色，适合养生、文化和生活页面。',tokens:{accent:'#315f4a',paper:'#fbfcf7',canvas:'#1b2923',texture:'linen',text:'#2d3831',muted:'#718077',fontBase:13.4,radius:14,spacing:11}},
  {id:'modern-blue',name:'清朗蓝',description:'清晰蓝灰对比，适合资讯、数据和科技内容。',tokens:{accent:'#315f86',paper:'#fbfcfe',canvas:'#1c2834',texture:'grid',text:'#29343d',muted:'#6e7b86',fontBase:13.2,radius:12,spacing:10}},
  {id:'warm-gold',name:'鎏金暖调',description:'棕金强调与柔和纸色，适合节庆、人物和封面专题。',tokens:{accent:'#8a5a24',paper:'#fffaf2',canvas:'#33271d',texture:'paper',text:'#3e3025',muted:'#8a7764',fontBase:13.5,radius:16,spacing:12}},
  {id:'high-contrast',name:'高对比阅读',description:'提升文字与背景反差，适合长文和高可读性场景。',tokens:{accent:'#7b1e1e',paper:'#ffffff',canvas:'#181818',texture:'plain',text:'#202020',muted:'#666666',fontBase:14.2,radius:8,spacing:11}},
  {id:'celadon-morning',name:'青瓷晨光',description:'青灰外框与玉色纸张，适合养生、生活和节气专题。',tokens:{accent:'#3f766a',paper:'#f5faf5',canvas:'#203932',texture:'linen',text:'#293a35',muted:'#70867e',fontBase:13.5,radius:16,spacing:12}},
  {id:'indigo-night',name:'靛蓝夜读',description:'靛蓝外框和冷白纸张，适合深度阅读、学习与数据内容。',tokens:{accent:'#3f557f',paper:'#f8faff',canvas:'#182238',texture:'grid',text:'#293348',muted:'#748099',fontBase:13.5,radius:12,spacing:11}},
  {id:'begonia-orange',name:'海棠橘',description:'砖橘强调与柔白纸张，适合活动纪实、人物和节庆。',tokens:{accent:'#ae5538',paper:'#fff8f2',canvas:'#3b241d',texture:'paper',text:'#442d25',muted:'#947264',fontBase:13.4,radius:16,spacing:12}},
  {id:'wisteria-art',name:'紫藤艺刊',description:'低饱和紫灰与细腻纹理，适合文化、书画和作品选刊。',tokens:{accent:'#6c527d',paper:'#fcf9ff',canvas:'#2d2335',texture:'linen',text:'#382f40',muted:'#82758b',fontBase:13.4,radius:18,spacing:12}},
  {id:'landscape-ink',name:'山水墨韵',description:'水墨青灰与留白纸张，适合散文、文化和专题长文。',tokens:{accent:'#3f5960',paper:'#f8faf7',canvas:'#202b2d',texture:'paper',text:'#283538',muted:'#718084',fontBase:13.8,radius:8,spacing:13}},
  {id:'frost-minimal',name:'霜青极简',description:'冷青外框与纯净留白，适合公告、资讯和高密度阅读。',tokens:{accent:'#39738a',paper:'#fcfefe',canvas:'#213239',texture:'plain',text:'#26373d',muted:'#6f858d',fontBase:13.7,radius:10,spacing:11}}
];

export const DESIGN_PRESET_IDS = DESIGN_PRESETS.map(x=>x.id);

export const DESIGN_PRESET_GROUPS = [
  {id:'featured',name:'推荐',description:'常用且适合绝大多数期刊的四套起点。',ids:['editorial-warm','red-classic','ink-green','modern-blue']},
  {id:'formal',name:'庄重',description:'适合党建、理论、历史与正式出版内容。',ids:['warm-gold','landscape-ink']},
  {id:'fresh',name:'清新',description:'适合生活、养生、资讯和轻阅读。',ids:['celadon-morning','frost-minimal','begonia-orange']},
  {id:'reading',name:'阅读',description:'强调长文、夜读或高对比可读性。',ids:['high-contrast','indigo-night']},
  {id:'art',name:'艺术',description:'适合专题封面、文化和视觉表达页面。',ids:['wisteria-art']}
];
