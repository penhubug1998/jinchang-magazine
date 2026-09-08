// Default issue templates produce the existing issue.json contract only.
// Every call creates fresh objects; no legacy issue content or remote assets are reused.
export const ISSUE_TEMPLATES = [
  { id: 'unit-red', name: '丹心红 · 单位综合刊', tagline: '记录日常，凝聚同行的力量', description: '朱红与暖纸，适合单位内刊、工作交流和离退休干部刊物。', accent: '#963d36', paper: '#fffaf2', canvas: '#302723', motif: 'arches', sections: ['卷首语', '本期要闻', '人物专访', '活动剪影', '生活随笔'] },
  { id: 'study-blue', name: '知行蓝 · 学习专题', tagline: '以阅读启思，以实践求知', description: '靛蓝与留白，适合理论学习、业务交流和专题研读。', accent: '#365c83', paper: '#f8fafc', canvas: '#222d3a', motif: 'grid', sections: ['专题导读', '重点研读', '观点交流', '实践笔记', '延伸阅读'] },
  { id: 'life-green', name: '青禾绿 · 活动纪实', tagline: '把相聚的时光，留在这一页', description: '墨绿与米白，适合文体活动、人物故事和生活纪念册。', accent: '#3d6c58', paper: '#fafbf5', canvas: '#26332b', motif: 'hills', sections: ['写在前面', '活动足迹', '光影相册', '人物故事', '心声寄语'] }
];
export function issueTemplateCatalog() {
  return ISSUE_TEMPLATES.map(t => ({ ...t, sections: [...t.sections], pageCount: 8 }));
}
const paragraph = (text, style = 'body') => ({ type: 'paragraph', style, text });
const card = (badge, title, text) => ({ type: 'cardline', badge, title, text: text.includes('【') ? text : `待补充：${text}`, tone: 'default' });
const columns = (left, right, layout = 'two-equal') => ({ type: 'container', layout, gap: 'md', align: 'start', mobile: 'stack', columns: [{ blocks: left }, { blocks: right }] });
const photo = caption => ({ type: 'image', src: 'assets/image/template-art.svg', alt: '模板抽象装饰插画，使用时可替换为本期照片', caption, frameRatio: '16:9', fit: 'cover', positionX: 50, positionY: 50 });

function artwork(t) {
  const shape = t.motif === 'hills'
    ? '<circle cx="850" cy="200" r="95" fill="#d8bd80"/><path d="M0 600 Q280 120 620 500 T1200 370 V800 H0Z" fill="#a4bbaa"/><path d="M0 740 Q430 280 820 610 T1200 540 V800 H0Z" fill="#527e67"/>'
    : t.motif === 'grid'
    ? '<g stroke="#a7bdd1" stroke-width="2"><path d="M100 180H1100M100 340H1100M100 500H1100M100 660H1100M220 100V720M480 100V720M740 100V720M1000 100V720"/></g><path d="M260 590V300Q460 140 620 300V590Q440 450 260 590Z" fill="#6c8caa"/><path d="M620 590V300Q800 140 980 300V590Q800 450 620 590Z" fill="#d1deea"/>'
    : '<circle cx="890" cy="195" r="95" fill="#d8b779"/><path d="M120 800V430a270 270 0 01540 0v370" fill="#c98775"/><path d="M350 800V510a260 260 0 01520 0v290" fill="#a95649"/><path d="M700 800V590a240 240 0 01480 0v210" fill="#e2bba4"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="${t.paper}"/>${shape}<rect x="42" y="42" width="1116" height="716" rx="8" fill="none" stroke="${t.accent}" stroke-opacity=".3" stroke-width="2"/></svg>`;
}

export function createIssueTemplate(templateId, { subtitle, publication, publisher, label }) {
  const t = ISSUE_TEMPLATES.find(x => x.id === templateId);
  if (!t) throw new Error(`未知整刊模板：${templateId}`);
  const makePage = (index, title, blocks) => ({ type: 'article', navTitle: t.sections[index], section: t.sections[index], kicker: `${String(index + 1).padStart(2, '0')} / ${t.sections[index]}`, title, design: { accent: t.accent }, blocks });
  let inner;
  if (t.id === 'unit-red') inner = [
    makePage(0, '在平凡日常里，看见新的风景', [paragraph('【卷首语导语】围绕本期主题，写下希望与读者分享的一段话。', 'lead'), paragraph('【正文】可从一次见面、一项工作或一个值得记住的瞬间展开。交代本期关注的话题，让读者知道接下来可以读到什么。'), { type: 'quote', text: '【本期金句】用一句简洁的话，表达这一期的精神。' }]),
    makePage(1, '本期要闻 · 三则速览', [paragraph('【栏目导语】选择本期最值得关注的三件事。', 'lead'), card('01', '【要闻标题一】', '填写事件时间、主要内容与进展。'), card('02', '【要闻标题二】', '填写与读者相关的工作动态。'), card('03', '【要闻标题三】', '填写服务安排或后续事项。')]),
    makePage(2, '一位同行者的故事', [paragraph('【人物简介】填写姓名、身份与采访缘起。', 'lead'), columns([paragraph('【问】哪一段经历最难忘？', 'subhead'), paragraph('【答】用人物自己的讲述，还原一个具体场景。')], [paragraph('【问】有什么话想对大家说？', 'subhead'), paragraph('【答】保留朴素而真实的表达。')]), { type: 'quote', text: '【人物原话】选取一句经受访者确认的引语。' }]),
    makePage(3, '定格相聚的瞬间', [photo('【照片说明】填写活动名称、时间、地点和摄影者。'), paragraph('【活动记述】记录发生了什么、有哪些人参与，以及一个值得记住的细节。')]),
    makePage(4, '生活的留白，也是收获', [paragraph('【随笔导语】从阅读、散步、摄影或日常感悟中选择一个小主题。', 'lead'), paragraph('【正文】用两到三段文字分享观察与体会。可替换为读者来稿，保留作者署名。'), { type: 'sidebar', title: '来稿小记', text: '【署名与来源】填写作者、投稿日期及授权说明。' }])
  ];
  else if (t.id === 'study-blue') inner = [
    makePage(0, '带着问题，开启本次研读', [paragraph('【学习主题】说明本期学习的背景与目标。', 'lead'), card('01', '读什么', '填写本期研读的文件、文章或课程名称。'), card('02', '想什么', '列出一个希望通过学习解决的问题。'), card('03', '做什么', '提出一个可落实的实践方向。')]),
    makePage(1, '从关键概念到深入理解', [paragraph('【导语】用简洁语言说明本页关注的核心问题。', 'lead'), paragraph('一、核心观点', 'subhead'), paragraph('【正文】填写经核对的原文解读，明确区分引用与个人理解。'), { type: 'quote', text: '【原文摘录】填写准确引文，并标明出处。' }, paragraph('【来源】文件或文章名称、发布单位、日期。', 'small')]),
    makePage(2, '同一个问题，两种观察', [columns([paragraph('观察一 · 理解', 'subhead'), paragraph('【观点】解释一个概念，并给出依据。')], [paragraph('观察二 · 应用', 'subhead'), paragraph('【观点】结合具体工作说明如何应用。')]), { type: 'sidebar', title: '讨论问题', text: '【提问】这个观点与我们的实际工作有什么联系？' }]),
    makePage(3, '把所学写进实践', [card('01', '遇到的问题', '【情境】描述一个真实问题及其背景。'), card('02', '尝试的方法', '【行动】记录采用的方法与执行过程。'), card('03', '复盘与改进', '【反思】记录结果、局限与下一步。')]),
    makePage(4, '继续阅读，继续思考', [paragraph('【阅读清单】选择三份与主题相关的资料，并核对来源。', 'lead'), card('01', '【资料名称】', '填写作者、来源与推荐理由。'), card('02', '【资料名称】', '填写作者、来源与推荐理由。'), card('03', '【资料名称】', '填写作者、来源与推荐理由。')])
  ];
  else inner = [
    makePage(0, '这一程，因相聚而温暖', [paragraph('【开篇】写下本次活动的缘起与希望留下的记忆。', 'lead'), { type: 'quote', text: '【主题寄语】用一句话表达这次相聚的意义。' }, paragraph('【活动信息】填写活动名称、时间、地点与组织单位。')]),
    makePage(1, '沿着时间，重温这一天', [card('01', '出发 · 相聚', '【活动开场】记录集合、出发或开场环节。'), card('02', '同行 · 体验', '【核心环节】记录最精彩的体验与交流。'), card('03', '回望 · 留念', '【活动尾声】记录合影、分享与收获。')]),
    makePage(2, '光影之间，都是好时光', [photo('【主图说明】替换为活动照片，填写摄影者与图注。'), columns([paragraph('镜头里的故事', 'subhead'), paragraph('【细节】描述画面中的一个动作或表情。')], [paragraph('镜头外的记忆', 'subhead'), paragraph('【记忆】补充照片背后的故事。')])]),
    makePage(3, '把故事，讲给你听', [paragraph('【人物导语】介绍一位活动参与者。', 'lead'), paragraph('【人物故事】从一个具体片段展开，记录参与者的体验与感受。'), { type: 'quote', text: '【参与者寄语】填写经本人确认的一句话。' }]),
    makePage(4, '把心声留在这里', [card('01', '【参与者署名】', '【感言】用简短文字记录一份收获。'), card('02', '【参与者署名】', '【感言】写下一个难忘瞬间。'), card('03', '【参与者署名】', '【感言】表达对下一次相聚的期待。')])
  ];
  const pages = [
    { type: 'cover', navTitle: '封面', kicker: publisher, title: subtitle, design: { background: t.paper, color: t.accent, accent: t.accent, backgroundImage: 'assets/image/template-cover.svg', backgroundOverlay: 0.2, backgroundFit: 'cover', backgroundPosition: 'center' }, blocks: [{ type: 'coverMeta', text: `${publication} · ${label}` }, { type: 'quote', text: t.tagline }, { type: 'coverSections', items: [...t.sections] }] },
    { type: 'toc', navTitle: '目录', kicker: 'CONTENTS / 本期导读', title: '翻开这一期', design: { accent: t.accent }, blocks: [{ type: 'toc', items: inner.map((page, index) => ({ number: String(index + 1).padStart(2, '0'), title: page.section, subtitle: page.title, page: index + 3 })) }] },
    ...inner,
    { type: 'closing', navTitle: '封底', kicker: '编后记 / 下期再见', title: '每一次记录，都值得珍藏', design: { background: t.paper, color: t.accent, accent: t.accent, backgroundImage: 'assets/image/template-cover.svg', backgroundOverlay: 0.65 }, blocks: [paragraph('【编后记】感谢本期作者、读者与参与者，填写下一期的主题或征稿安排。', 'lead'), { type: 'quote', text: t.tagline }, { type: 'producer', text: `${publisher}制作` }, paragraph('【编辑信息】填写编辑、审核人员及发行日期。', 'small')] }
  ];
  // Use the existing strict-audit marker for every editable placeholder, including nested columns.
  const markPlaceholders=value=>typeof value==='string'?value.replaceAll('【','【待补充·'):Array.isArray(value)?value.map(markPlaceholders):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,markPlaceholders(item)])):value;
  const markedPages=pages.map(markPlaceholders);
  return { pages: markedPages, design: { tokens: { accent: t.accent, paper: t.paper, canvas: t.canvas, text: '#303735', muted: '#747970', texture: 'plain', fontBase: 14, radius: 10, spacing: 12 } }, features: { flipAnimation: true, fullscreen: true, narration: { fallback: 'speechSynthesis', continuousDefault: false, rate: 1 } }, assets: [{ path: 'image/template-art.svg', content: artwork(t) }, { path: 'image/template-cover.svg', content: `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200"><rect width="900" height="1200" fill="${t.paper}"/>${artwork(t).replace('width="1200" height="800"', 'x="0" y="610" width="900" height="590"')}</svg>` }] };
}
