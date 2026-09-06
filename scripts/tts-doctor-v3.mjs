import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
    changedPages.push({
      page: index + 1,
      navTitle: page.navTitle || null,
      title: page.title || null,
      storedDigest: storedPages[index] || null,
      currentDigest: currentPages[index] || null
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
    console.error(`  page ${page.page} ${label}: ${page.storedDigest || 'missing'} -> ${page.currentDigest || 'missing'}`);
  }
}

console.log(`TTS Doctor report: reports/v3-tts-baseline-doctor.json`);
if (stale.length && !reportOnly) process.exitCode = 1;
