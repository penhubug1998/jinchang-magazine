import path from 'node:path';
import { access, constants, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { collectReferencedAssets, exists, normalizeIssueId, parseArgs, root, stripAssetsPrefix, V3_VERSION } from './lib-v3-production.mjs';

const args = parseArgs();
const requestedIssue = args.issue || args.id || args._[0] || '';
const reportPath = path.resolve(root, String(args.report || 'reports/v3-production-preflight.json'));
const report = { version: V3_VERSION, checkedAt: new Date().toISOString(), checks: [], errors: [] };
const issueRoot = path.join(root, 'issues');
const publicRoot = String(process.env.V3_PUBLIC_MAGAZINE_ROOT || '').trim() ? path.resolve(String(process.env.V3_PUBLIC_MAGAZINE_ROOT)) : '';
const publicBase = String(process.env.V3_PUBLIC_MAGAZINE_BASE_URL || '').trim().replace(/\/+$/, '');
const chromiumCandidates = [process.env.CHROMIUM, ...(process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'] : process.platform === 'win32' ? [process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'), process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'), process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe'), process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe')] : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'])].filter(Boolean);

function check(name, ok, message, extra = {}) { const item = { name, ok, ...extra }; if (!ok) { item.message = message; report.errors.push(message); } report.checks.push(item); }
async function writableDirectory(dir) { try { await stat(dir); await access(dir, constants.R_OK | constants.W_OK | constants.X_OK); return true; } catch { return false; } }
function safeIssueId(value) { try { return normalizeIssueId(value); } catch { return ''; } }
async function issueIds() { if (requestedIssue) return [safeIssueId(requestedIssue)].filter(Boolean); try { return (await readdir(issueRoot, { withFileTypes: true })).filter(x => x.isDirectory() && /^\d+$/.test(x.name)).map(x => x.name); } catch { return []; } }

check('version', V3_VERSION === '3.1.0', `当前发布版本 ${V3_VERSION} 不是 3.1.0`);
check('admin-password', String(process.env.STUDIO_ADMIN_PASSWORD || '').length >= 12, 'STUDIO_ADMIN_PASSWORD 必须至少 12 个字符，不能使用空密码上线');
let baseUrlOk = false; try { const url = new URL(publicBase); baseUrlOk = url.protocol === 'https:' && Boolean(url.hostname); } catch {}
check('public-base-url', baseUrlOk, 'V3_PUBLIC_MAGAZINE_BASE_URL 必须是 HTTPS 地址', { value: publicBase ? '[configured]' : '[missing]' });
check('public-root-configured', Boolean(publicRoot), '必须配置 V3_PUBLIC_MAGAZINE_ROOT');
if (publicRoot) { const relative = path.relative(root, publicRoot); const insideSource = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); check('public-root-isolated', !insideSource, '公开目录不能位于制作源目录内，避免暴露 issue.json、快照和管理文件', { publicRoot }); check('public-root-writable', await writableDirectory(publicRoot), '公开目录不存在或当前运行用户没有读写权限', { publicRoot }); }
let chromium = ''; for (const candidate of chromiumCandidates) { try { await access(candidate, constants.X_OK); chromium = candidate; break; } catch {} }
check('pdf-browser', Boolean(chromium), '未找到可执行的 Chrome、Edge 或 Chromium；请设置 CHROMIUM', { executable: chromium || null });
const ids = await issueIds(); check('issues-found', ids.length > 0, requestedIssue ? `找不到期刊 ${requestedIssue}` : 'issues 目录中没有数字期刊目录', { issues: ids });
for (const id of ids) { const file = path.join(issueRoot, id, 'issue.json'); let issue; try { issue = JSON.parse(await readFile(file, 'utf8')); check(`issue:${id}:json`, issue?.id === id && issue?.engine === 'v3', `期刊 ${id} 的 issue.json 不是有效 V3 源稿`); } catch { check(`issue:${id}:json`, false, `期刊 ${id} 的 issue.json 无法读取或解析`); continue; } const assetBase = path.resolve(root, String(issue.assetSource || `issues/${id}/assets`).replaceAll('\\', '/').replace(/^\/+/, '')), missing = []; for (const ref of collectReferencedAssets(issue)) { if (!ref?.path || /^https?:/i.test(String(ref.path))) continue; const candidate = path.resolve(assetBase, stripAssetsPrefix(ref.path)); if (!assetBase.startsWith(root + path.sep) || !candidate.startsWith(assetBase + path.sep) || !(await exists(candidate))) missing.push(ref.path); } check(`issue:${id}:media`, missing.length === 0, `期刊 ${id} 存在缺失或越界媒体引用`, { missing }); }
await mkdir(path.dirname(reportPath), { recursive: true }); report.ok = report.errors.length === 0; await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); console.log(`生产环境预检：${report.ok ? '通过' : '失败'}（${report.checks.length} 项检查）`); console.log(`报告：${path.relative(root, reportPath).replaceAll('\\', '/')}`); if (!report.ok) process.exit(1);
