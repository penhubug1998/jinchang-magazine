import { access, readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const moduleRoot = path.resolve(moduleDir, '..');
const MODULE_PACKAGE_META = JSON.parse(readFileSync(path.join(moduleRoot, 'package.json'), 'utf8'));
const cwdRoot = path.resolve(process.cwd());
let cwdMatchesProjectVersion = false;
try {
  const cwdPackage = JSON.parse(readFileSync(path.join(cwdRoot, 'package.json'), 'utf8'));
  cwdMatchesProjectVersion = String(cwdPackage.version || '') === String(MODULE_PACKAGE_META.version || '');
} catch {}
export const root = path.resolve(process.env.JINCHANG_MAGAZINE_ROOT || (cwdMatchesProjectVersion ? cwdRoot : moduleRoot));

const PACKAGE_META = MODULE_PACKAGE_META;
export const V3_VERSION = PACKAGE_META.version;
export const V3_STABLE_VERSION = PACKAGE_META.v3StableVersion || V3_VERSION;
export const V31_SCHEMA_VERSION = PACKAGE_META.v31SchemaVersion || null;
export const MiB = 1024 * 1024;
export const exists = async (file) => { try { await access(file); return true; } catch { return false; } };
export const posix = (file) => file.replaceAll('\\', '/');
export const rel = (file) => posix(path.relative(root, file));
export const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
export const writeJson = async (file, data) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { out._.push(arg); continue; }
    const eq = arg.indexOf('=');
    if (eq > 2) { out[arg.slice(2, eq)] = arg.slice(eq + 1); continue; }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next != null && !next.startsWith('--')) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

export function normalizeIssueId(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return raw.padStart(3, '0');
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

export function labelForIssue(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return `第${id}期`;
  const cn = ['零','一','二','三','四','五','六','七','八','九'];
  if (n < 10) return `第${cn[n]}期`;
  if (n < 20) return `第十${n === 10 ? '' : cn[n - 10]}期`;
  if (n < 100) {
    const tens = Math.floor(n / 10), ones = n % 10;
    return `第${cn[tens]}十${ones ? cn[ones] : ''}期`;
  }
  return `第${n}期`;
}

export function stripAssetsPrefix(src = '') {
  const clean = String(src).split(/[?#]/)[0].replace(/^\.\//, '');
  return clean.startsWith('assets/') ? clean.slice('assets/'.length) : clean;
}

export function pageNarrationPath(issue, pageNumber) {
  const pattern = issue?.features?.narration?.pattern;
  if (!pattern) return null;
  const page = String(pageNumber).padStart(2, '0');
  return stripAssetsPrefix(pattern.replaceAll('{page}', page));
}

export function collectReferencedAssets(issue) {
  const refs = [];
  const add = (p, kind, extra = {}) => {
    if (!p || /^(https?:|data:|javascript:)/i.test(p)) return;
    refs.push({ path: stripAssetsPrefix(p), kind, ...extra });
  };
  add(issue?.features?.music?.src, 'music', { source: 'features.music.src' });
  if (issue?.features?.narration?.pattern) {
    for (let i = 1; i <= (issue.pages?.length || 0); i++) add(pageNarrationPath(issue, i), 'tts', { page: i, source: 'features.narration.pattern' });
  }
  const walkBlockAssets = (block, pageIndex, blockIndex, nestedPath = '') => {
    if (!block || typeof block !== 'object') return;
    const prefix = nestedPath ? `${nestedPath}.` : '';
    if (block.type === 'video') {
      add(block.src, 'video', { page: pageIndex + 1, blockIndex, field: `${prefix}src` });
      add(block.poster, 'image', { page: pageIndex + 1, blockIndex, field: `${prefix}poster`, source: 'video.poster' });
    }
    if (block.type === 'image') add(block.src, 'image', { page: pageIndex + 1, blockIndex, field: `${prefix}src` });
    if (block.type === 'container') for (const [ci,column] of (block.columns || []).entries()) for (const [bi,child] of (column.blocks || []).entries()) walkBlockAssets(child,pageIndex,blockIndex,`columns.${ci}.blocks.${bi}`);
  };
  for (const [pageIndex, page] of (issue.pages || []).entries()) {
    // A page background is a real asset dependency too. Keep it in the same
    // reference graph as normal image blocks so cleanup and publishing never
    // silently remove it.
    add(page?.design?.backgroundImage, 'image', { page: pageIndex + 1, field: 'design.backgroundImage', source: 'page.design.backgroundImage' });
    for (const [blockIndex, block] of (page.blocks || []).entries()) walkBlockAssets(block,pageIndex,blockIndex);
  }
  const dedup = new Map();
  for (const item of refs) {
    const key = `${item.kind}:${item.path}`;
    if (!dedup.has(key)) dedup.set(key, { ...item, references: [] });
    const row = dedup.get(key);
    row.references.push({ page: item.page || null, blockIndex: Number.isInteger(item.blockIndex) ? item.blockIndex : null, field: item.field || null, source: item.source || null });
    if (!row.page && item.page) row.page = item.page;
    if (!Number.isInteger(row.blockIndex) && Number.isInteger(item.blockIndex)) row.blockIndex = item.blockIndex;
  }
  return [...dedup.values()].sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
}

function blockSpeechText(block = {}, articles = {}) {
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
    case 'table': return [block.caption, ...(block.rows || []).flatMap(row => (row || []).map(cell => String(cell ?? '')))].filter(Boolean).join('。');
    case 'coverSections': return (block.items || []).filter(Boolean).join('，');
    case 'cards': return (block.items || []).flatMap(x => [x?.title, x?.text, x?.body]).filter(Boolean).join('。');
    // articleLink opens a separate reading surface. Its linked article must not
    // be injected into the current page narration, otherwise the same content
    // is spoken twice and an interaction-only link invalidates existing TTS.
    case 'articleLink': return '';
    case 'container': return (block.columns || []).flatMap(column => (column.blocks || []).map(child => blockSpeechText(child, articles))).filter(Boolean).join('。');
    default: return '';
  }
}

export function narrationPageText(page = {}, articles = {}) {
  return [page.kicker, page.title, page.subtitle, ...(page.body || []), ...(page.blocks || []).map(block => blockSpeechText(block, articles))]
    .filter(Boolean).join('。').replace(/\s+/g, ' ').trim();
}

export function narrationPageDigests(issue = {}) {
  return (issue.pages || []).map(page => crypto.createHash('sha256').update(narrationPageText(page, issue.articles || {})).digest('hex').slice(0, 20));
}

export function narrationSourceDigest(issue = {}) {
  return crypto.createHash('sha256').update(narrationPageDigests(issue).join('|')).digest('hex');
}

export async function listFilesRecursive(dir) {
  const output = [];
  if (!(await exists(dir))) return output;
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && entry.name !== '.gitkeep') output.push(file);
    }
  };
  await walk(dir);
  return output;
}

export async function fileMeta(file) {
  const info = await stat(file);
  return { bytes: info.size, mib: Number((info.size / MiB).toFixed(2)) };
}

export function humanBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MiB) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / MiB).toFixed(2)} MB`;
}
