import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collectReferencedAssets, exists, labelForIssue, normalizeIssueId, parseArgs, root, writeJson } from './lib-v3-production.mjs';

const args = parseArgs();
async function nextNumericIssueId(){
  const issuesDir = path.join(root, 'issues');
  await mkdir(issuesDir, { recursive:true });
  const entries = await readdir(issuesDir, { withFileTypes:true });
  const nums = entries.filter((e) => e.isDirectory() && /^\d+$/.test(e.name)).map((e) => Number(e.name)).filter(Number.isFinite);
  return String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}
const id = normalizeIssueId(args.id || args._[0] || await nextNumericIssueId());
if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
  console.error(`期号不合法：${id}`);
  process.exit(2);
}

const issueDir = path.join(root, 'issues', id);
if (await exists(issueDir)) {
  console.error(`issues/${id} 已存在。为避免覆盖既有期刊，脚手架已停止。`);
  process.exit(1);
}

const publication = String(args.publication || '中国人民银行金昌市分行离退休干部电子期刊').trim();
const publisher = String(args.publisher || '中国人民银行金昌市分行').trim();
const label = String(args.label || labelForIssue(id)).trim();
const subtitle = String(args.subtitle || '请填写本期主题').trim();
const sections = String(args.sections || '时政要闻,理论学习,反诈防骗,警示教育,时令养生')
  .split(/[,，]/).map((x) => x.trim()).filter(Boolean);
const assetSource = `issues/${id}/assets`;

const pages = [
  {
    type: 'cover', navTitle: '封面', title: subtitle, kicker: publisher,
    blocks: [
      { type: 'coverMeta', text: `${publication} · ${label}` },
      { type: 'coverSections', items: sections }
    ]
  },
  {
    type: 'article', navTitle: '卷首语', kicker: '卷首语', title: '请填写卷首语标题',
    blocks: [{ type: 'paragraph', style: 'lead', text: '请在这里填写本期卷首语正文。' }]
  },
  {
    type: 'toc', navTitle: '目录', kicker: 'CONTENTS', title: '本期导读',
    blocks: [{
      type: 'toc',
      items: sections.map((title, index) => ({
        number: String(index + 1).padStart(2, '0'), title, subtitle: '请填写栏目导语', page: index + 4
      }))
    }]
  },
  ...sections.map((title) => ({
    type: 'article', navTitle: title, kicker: title, title: `${title} · 待编辑`,
    blocks: [
      { type: 'paragraph', style: 'body', text: `请在这里编辑“${title}”栏目内容。` },
      { type: 'quote', text: '可继续添加 paragraph、quote、cardline、casePair、image、video、articleLink 等内容块。' }
    ]
  })),
  {
    type: 'closing', navTitle: '尾刊寄语', kicker: '编后寄语', title: '本期寄语',
    blocks: [
      { type: 'paragraph', style: 'body', text: '请在这里填写本期尾刊寄语。' },
      { type: 'producer', text: `${publisher}人事科制作` }
    ]
  }
];

const issue = {
  id, label, publication, publisher, subtitle,
  engine: 'v3', status: 'draft', assetSource, theme: 'classic-red',
  createdAt: new Date().toISOString(),
  features: {
    flipAnimation: true,
    fullscreen: true,
    music: { src: 'assets/music/bgm.mp3', defaultOn: false },
    narration: { pattern: 'assets/tts/page-{page}.mp3', fallback: 'speechSynthesis', continuousDefault: false, rate: 1 }
  },
  articles: {},
  pages
};

await mkdir(issueDir, { recursive: true });
for (const folder of ['music','tts','video','image']) {
  const dir = path.join(issueDir, 'assets', folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, '.gitkeep'), '', 'utf8');
}
await writeJson(path.join(issueDir, 'issue.json'), issue);
await writeJson(path.join(issueDir, 'assets.json'), { issue: id, assetSource, expected: collectReferencedAssets(issue) });
await writeFile(path.join(issueDir, 'README.md'), `# ${label} · V3 编辑区\n\n本目录由 \`npm run new:issue\` 自动创建。\n\n## 推荐流程\n\n1. 编辑 \`issue.json\` 中的标题、栏目与正文。\n2. 图片放入 \`assets/image/\`，视频放入 \`assets/video/\`，背景音乐放入 \`assets/music/bgm.mp3\`。\n3. 为每个阅读页准备 \`assets/tts/page-XX.mp3\`。\n4. 修改页面/媒体后执行：\`npm run assets:sync -- --issue ${id}\`。\n5. 日常检查：\`npm run audit:v3 -- --issue ${id}\`。\n6. 发布前：\`npm run release:check -- --issue ${id}\`。\n\n> \`status\` 默认为 \`draft\`。内容和资源全部确认后可改为 \`ready\`，发布后改为 \`published\`。\n`, 'utf8');

console.log(`V3 新一期已创建：issues/${id}`);
console.log(`- ${label}`);
console.log(`- 页面：${pages.length} 页（封面 + 卷首语 + 目录 + ${sections.length} 个栏目 + 尾刊）`);
console.log(`- 下一步：编辑 issues/${id}/issue.json，然后运行 npm run audit:v3 -- --issue ${id}`);
console.log(`- 可视化制作中心：npm run studio:v3`);
console.log(`- 发布前：将 status 改为 ready，再运行 npm run release:check -- --issue ${id}`);
console.log(`- 生成发布包：npm run publish:v3 -- --issue ${id}`);
