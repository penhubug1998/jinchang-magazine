import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  narrationPageDigests,
  narrationSourceDigest,
  normalizeIssueId,
  parseArgs,
  root
} from './lib-v3-production.mjs';

const args = parseArgs();
const explicit = normalizeIssueId(args.issue || args.id || args._?.[0] || '');
const ids = explicit ? [explicit] : ['001', '002'];
const reportOnly = Boolean(args['report-only']);
const rows = [];

function candidateBlockSpeechText(block = {}, articles = {}, articleMode = 'current') {
  switch (block.type) {
    case 'paragraph': case 'heading': case 'textFlow': case 'sectionHeading':
    case 'blessing': case 'producer': case 'coverMeta': return block.text || block.title || '';
    case 'pullQuote': return [block.label, block.text, block.attribution].filter(Boolean).join('。');
    case 'sidebar': return [block.title, block.text].filter(Boolean).join('。');
    case 'quote': return [block.title, block.text].filter(Boolean).join('。');
    case 'chips': return (block.items || []).map(x => x?.text || '').filter(Boolean).join('，');
    case 'cardline': return [block.title, block.text].filter(Boolean).join('。');
    case 'casePair': return [block.case, block.warning].filter(Boolean).join('。');
    case 'video': return block.caption || '';
    case 'image': return block.caption || '';
    case 'coverSections': return (block.items || []).filter(Boolean).join('，');
    case 'cards': return (block.items || []).flatMap(x => [x?.title, x?.text, x?.body]).filter(Boolean).join('。');
    case 'articleLink': {
      const article = articles?.[block.articleId] || {};
      if (articleMode === 'omit-link') return '';
      if (articleMode === 'link-title-only') return block.title || '';
      if (articleMode === 'article-meta') return [block.title, article.title, article.subtitle].filter(Boolean).join('。');
      if (articleMode === 'article-without-block-title') return [article.title, article.subtitle, ...(article.paras || [])].filter(Boolean).join('。');
      return [block.title, article.title, article.subtitle, ...(article.paras || [])].filter(Boolean).join('。');
    }
    case 'container': return (block.columns || []).flatMap(column => (column.blocks || []).map(child => candidateBlockSpeechText(child, articles, articleMode))).filter(Boolean).join('。');
    default: return '';
  }
}

function candidatePageDigest(page = {}, articles = {}, articleMode = 'current') {
  const text = [
    page.kicker,
    page.title,
    page.subtitle,
    ...(page.body || []),
    ...(page.blocks || []).map(block => candidateBlockSpeechText(block, articles, articleMode))
  ].filter(Boolean).join('。').replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 20);
}

const candidateModes = ['link-title-only', 'article-meta', 'article-without-block-title', 'omit-link'];

for (const id of ids) {
  const file = path.join(root, 'issues', id, 'issue.json');
  let issue;
  try {
    issue = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    rows.push({ issue: id, ok: false, error: `无法读取 ${file}: ${error.message}` });
    continue;
  }

  const narration = issue.features?.narration || {};
  const storedPages = Array.isArray(narration.pageDigests) ? narration.pageDigests : [];
  const currentPages = narrationPageDigests(issue);
  const changedPages = [];
  const max = Math.max(storedPages.length, currentPages.length);
  for (let index = 0; index < max; index++) {
    if (storedPages[index] === currentPages[index]) continue;
    const page = issue.pages?.[index] || {};
    const compatibilityCandidates = Object.fromEntries(candidateModes.map(mode => [mode, candidatePageDigest(page, issue.articles || {}, mode)]));
    const compatibilityMatches = Object.entries(compatibilityCandidates)
      .filter(([, digest]) => digest === storedPages[index])
      .map(([mode]) => mode);
    changedPages.push({
      page: index + 1,
      navTitle: page.navTitle || null,
      title: page.title || null,
      storedDigest: storedPages[index] || null,
      currentDigest: currentPages[index] || null,
      compatibilityMatches,
      compatibilityCandidates
    });
  }

  const currentSourceDigest = narrationSourceDigest(issue);
  const sourceMatches = narration.sourceDigest === currentSourceDigest;
  const pageCountMatches = storedPages.length === currentPages.length;
  const pageDigestsMatch = changedPages.length === 0;
  rows.push({
    issue: id,
    ok: sourceMatches && pageCountMatches && pageDigestsMatch,
    baselinedAt: narration.baselinedAt || null,
    storedSourceDigest: narration.sourceDigest || null,
    currentSourceDigest,
    storedPageCount: storedPages.length,
    currentPageCount: currentPages.length,
    changedPages
  });
}

const stale = rows.filter(row => !row.ok);
const report = {
  generatedAt: new Date().toISOString(),
  ok: stale.length === 0,
  checkedIssues: rows.length,
  staleIssues: stale.map(row => row.issue),
  issues: rows
};

await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, 'reports', 'v3-tts-baseline-doctor.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

for (const row of rows) {
  if (row.ok) {
    console.log(`TTS Doctor ${row.issue}: PASS`);
    continue;
  }
  console.error(`TTS Doctor ${row.issue}: STALE`);
  if (row.error) {
    console.error(`  ${row.error}`);
    continue;
  }
  console.error(`  baseline: ${row.storedSourceDigest || 'missing'}`);
  console.error(`  current : ${row.currentSourceDigest}`);
  if (row.storedPageCount !== row.currentPageCount) {
    console.error(`  page count: stored ${row.storedPageCount} / current ${row.currentPageCount}`);
  }
  for (const page of row.changedPages) {
    const label = page.navTitle || page.title || `第 ${page.page} 页`;
    const compat = page.compatibilityMatches.length ? ` · legacy=${page.compatibilityMatches.join(',')}` : '';
    console.error(`  page ${page.page} ${label}: ${page.storedDigest || 'missing'} -> ${page.currentDigest || 'missing'}${compat}`);
  }
}

console.log(`TTS Doctor report: reports/v3-tts-baseline-doctor.json`);
if (stale.length && !reportOnly) process.exitCode = 1;
