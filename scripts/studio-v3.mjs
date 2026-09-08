import http from 'node:http';
import { accessSync, createReadStream, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { chmod, cp, mkdir, mkdtemp, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { URL } from 'node:url';
import os from 'node:os';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  V3_VERSION, MiB, collectReferencedAssets, exists, humanBytes, listFilesRecursive, narrationPageDigests, narrationSourceDigest, normalizeIssueId, parseArgs,
  posix, readJson, root, stripAssetsPrefix
} from './lib-v3-production.mjs';
import { listSnapshots, readSnapshotIssue, restoreSnapshot, snapshotIssue } from './lib-v3-history.mjs';
import { parseImportedBuffer, parsePastedText, paginateImportedDocument } from './lib-v3-import.mjs';
import { PUBLICATION_OUTPUT_ROOT, buildPublicationStatus, readPublicationEvidence, sha256, writePublicationEvidence } from './lib-v3-publication.mjs';
import { buildArchiveHtml } from './lib-v3-catalog.mjs';
import { verifyIntegrity } from './lib-v3-deploy.mjs';
import { normalizeRichText, renderRichText } from '../src/reader/rich-text.js';
import { WHOLE_MAGAZINE_TEMPLATES, applyWholeMagazineTemplate } from '../src/studio/whole-magazine-templates.js';
import { buildPublishingPlan, flowFragmentFor, normalizePagePublishing, normalizeBlockPublishing } from '../src/reader/layout-engine.js';

const args = parseArgs();
const host = String(args.host || '127.0.0.1');
const port = Number(args.port || 4173);
const acceptanceOnly = Boolean(args['acceptance-only']);
const studioVersion = V3_VERSION;
const studioDir = path.join(root, 'src', 'studio');
const stockAssetDir = path.join(studioDir, 'stock');
const readerDir = path.join(root, 'src', 'reader');
const livePreviewIssues = new Map();
const adminLoginUser = String(process.env.STUDIO_ADMIN_USER || 'admin').trim() || 'admin';
const adminLoginPassword = String(process.env.STUDIO_ADMIN_PASSWORD || '');
const adminLoginEnabled = adminLoginPassword.length > 0;
const productionMode = process.env.NODE_ENV === 'production' || process.env.V3_FORMAL_MODE === '1' || process.env.STUDIO_PRODUCTION === '1';
if(productionMode&&!acceptanceOnly&&!adminLoginEnabled)throw new Error('正式模式必须配置 STUDIO_ADMIN_PASSWORD；为避免未鉴权启动，服务已拒绝启动。');
const ADMIN_SESSION_COOKIE = 'v3_studio_session';
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const adminSessions = new Map();
const loginAttempts = new Map();
const aiConfigFile = path.join(root,'.v3-ai-config.json');
const aiSummaryCacheDir = path.join(root,'.v3-ai-cache');
const aiSummaryInflight = new Map();
const aiPublicRate = new Map();
const backgroundJobs = new Map();
const issueWriteLocks = new Map();
const backgroundQueue = [];
let backgroundJobRunning = false;
const MAX_BACKGROUND_QUEUE = 8;
const MAX_BACKGROUND_JOBS = 100;
const backgroundJobFile=process.env.V3_BACKGROUND_JOB_FILE?path.resolve(process.env.V3_BACKGROUND_JOB_FILE):path.join(root,'.v3-background-jobs','jobs.json');
let backgroundJobPersistChain=Promise.resolve();
const publicMagazineRoot = process.env.V3_PUBLIC_MAGAZINE_ROOT
  ? path.resolve(process.env.V3_PUBLIC_MAGAZINE_ROOT)
  : '';
const publicMagazineBaseUrl = String(process.env.V3_PUBLIC_MAGAZINE_BASE_URL || '').replace(/\/+$/, '');
const sourceLedgerRoot = process.env.V3_SOURCE_LEDGER_ROOT ? path.resolve(process.env.V3_SOURCE_LEDGER_ROOT) : path.join(root,'.v3-source-ledger');
const allowedBlockTypes = new Set(['paragraph','heading','quote','chips','cardline','casePair','toc','articleLink','video','image','table','coverMeta','coverSections','blessing','producer','cards','container','textFlow','pullQuote','sidebar','sectionHeading']);
const allowedContainerLayouts = new Set(['single','two-equal','two-40-60','two-60-40','three-equal','media-left','media-right']);
const MAX_BLOCKS_PER_PAGE = 80;
const stockAssetNames = new Map([
  'cover-red-dawn','cover-gold-cloud','cover-green-hills','cover-blue-notes','divider-gold-cloud','divider-green-leaf','quote-ribbon-red','quote-ribbon-green','paper-linen'
].map(id=>[id,`${id}.svg`]));
const MAX_PAGE_BLOCK_NODES = 160;
const MAX_ARRAY_ITEMS = 40;
const MAX_TEXT_FIELD = 12000;
const designHex=/^#[0-9a-fA-F]{6}$/;
function validPageBackgroundAsset(value){
  const raw=String(value??'').split(/[?#]/)[0].replace(/^\.\//,'').replaceAll('\\','/');
  const parts=raw.split('/');
  return raw.startsWith('assets/')&&parts.length>1&&parts.every(part=>part&&part!=='.'&&part!=='..');
}
function validateDesignObject(design,label,scope){
  if(design==null)return;if(!design||typeof design!=='object'||Array.isArray(design))throw new Error(`${label} design 必须为对象`);
  const ranges=scope==='theme'?{fontBase:[11,18],radius:[0,24],spacing:[4,24]}:scope==='page'?{padding:[0,12],contentWidth:[60,100]}:{fontSize:[10,48],padding:[0,48],margin:[0,48],radius:[0,40],borderWidth:[0,6],width:[25,100]};
  const colors=scope==='theme'?['accent','paper','canvas','text','muted']:scope==='page'?['background','color','accent']:['color','background','borderColor'];
  for(const key of colors)if(design[key]!=null&&!designHex.test(String(design[key])))throw new Error(`${label} design.${key} 必须为 #RRGGBB`);
  for(const [key,[min,max]] of Object.entries(ranges))if(design[key]!=null&&(!Number.isFinite(Number(design[key]))||Number(design[key])<min||Number(design[key])>max))throw new Error(`${label} design.${key} 必须在 ${min}–${max}`);
  if(scope==='page'){
    if(design.backgroundImage!=null&&!validPageBackgroundAsset(design.backgroundImage))throw new Error(`${label} design.backgroundImage 必须是 assets/ 下的安全资源路径`);
    if(design.backgroundOverlay!=null&&(!Number.isFinite(Number(design.backgroundOverlay))||Number(design.backgroundOverlay)<0||Number(design.backgroundOverlay)>.92))throw new Error(`${label} design.backgroundOverlay 必须在 0–0.92`);
    if(design.backgroundFit!=null&&!['cover','contain'].includes(String(design.backgroundFit)))throw new Error(`${label} design.backgroundFit 不受支持`);
    if(design.backgroundPosition!=null&&!['center','top','bottom','left','right'].includes(String(design.backgroundPosition)))throw new Error(`${label} design.backgroundPosition 不受支持`);
  }
  if(scope==='block'){
    if(design.fontWeight!=null&&!['400','500','600','700','800'].includes(String(design.fontWeight)))throw new Error(`${label} design.fontWeight 不受支持`);
    if(design.shadow!=null&&!['none','sm','md','lg'].includes(String(design.shadow)))throw new Error(`${label} design.shadow 不受支持`);
    if(design.textAlign!=null&&!['left','center','right','justify'].includes(String(design.textAlign)))throw new Error(`${label} design.textAlign 不受支持`);
    if(design.alignSelf!=null&&!['left','center','right'].includes(String(design.alignSelf)))throw new Error(`${label} design.alignSelf 不受支持`);
  }
  if(scope==='theme'&&design.texture!=null&&!['paper','linen','grid','plain'].includes(String(design.texture)))throw new Error(`${label} design.texture 不受支持`);
}
const mime = {
  '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml',
  '.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.pdf':'application/pdf','.zip':'application/zip'
};
const uploadRules = {
  image: { max:8*MiB, exts:new Set(['.jpg','.jpeg','.png','.webp','.gif']) },
  video: { max:80*MiB, exts:new Set(['.mp4','.webm','.mov']) },
  music: { max:20*MiB, exts:new Set(['.mp3','.m4a','.wav']) },
  tts: { max:8*MiB, exts:new Set(['.mp3','.m4a','.wav']) }
};
function resolveTtsGenerator(){
  const configured=String(process.env.V3_TTS_BIN||'').trim();
  // Prefer the bundled neural voice CLI when it is available.  eSpeak remains
  // a last-resort accessibility fallback, not a suitable default for a
  // published Chinese magazine.
  const neuralCli=path.join(root,'.venv','bin','edge-tts');
  const candidates=[configured,neuralCli,'/usr/bin/espeak-ng','/usr/local/bin/espeak-ng','/usr/bin/espeak','/usr/local/bin/espeak','/usr/bin/say'].filter(Boolean);
  for(const bin of candidates){try{accessSync(bin);return bin}catch{}}
  return null;
}
function ttsOutputPattern(issue,bin=''){
  const current=String(issue?.features?.narration?.pattern||'');
  // edge-tts writes MP3.  Change the manifest at generation time so Reader
  // never requests an old WAV after natural voice generation completes.
  if(path.basename(String(bin)).toLowerCase().includes('edge-tts')){
    return current ? current.replace(/\.(wav|m4a)$/i,'.mp3') : 'assets/tts/page-{page}.mp3';
  }
  return /\.(wav|mp3|m4a)$/i.test(current)?current:'assets/tts/page-{page}.wav';
}
function ttsOutputPath(pattern,page){return pattern.replace('{page}',String(page).padStart(2,'0')).replace(/^assets\//,'');}
async function generateTtsFile(bin,target,text,{voice='',rate=1}={}){
  const base=path.basename(bin).toLowerCase(),args=[];
  if(base.includes('edge-tts')){
    const multiplier=Number(rate||1);
    const percentage=Math.max(-50,Math.min(100,Math.round((multiplier-1)*100)));
    const edgeRate=`${percentage>=0?'+':''}${percentage}%`;
    args.push('--voice',String(voice||'zh-CN-XiaoxiaoNeural').slice(0,80),'--rate',edgeRate,'--text',String(text),'--write-media',target);
  }
  else if(base.includes('espeak')){args.push('-w',target);args.push('-v',String(voice||'cmn').slice(0,40));const speed=Math.max(80,Math.min(450,Math.round(175*Number(rate||1))));args.push('-s',String(speed),String(text));}
  else if(base==='say'){
    const intermediate=`${target}.aiff`;
    const sayVoice=String(voice||'Tingting').slice(0,80);
    const sayArgs=['-v',sayVoice,'-o',intermediate,String(text)];
    const spoken=await runProcess(bin,sayArgs,{timeoutMs:90000});
    if(!spoken.ok)throw new Error(spoken.output||`say 进程退出 ${spoken.status}`);
    const converted=await runProcess('/usr/bin/afconvert',['-f','WAVE','-d','LEI16@22050',intermediate,target],{timeoutMs:90000});
    await rm(intermediate,{force:true}).catch(()=>{});
    if(!converted.ok)throw new Error(converted.output||`afconvert 进程退出 ${converted.status}`);
    return;
  }
  else if(process.env.V3_TTS_ARGS){let parsed;try{parsed=JSON.parse(process.env.V3_TTS_ARGS)}catch{throw new Error('V3_TTS_ARGS 必须是 JSON 数组')}if(!Array.isArray(parsed))throw new Error('V3_TTS_ARGS 必须是 JSON 数组');for(const token of parsed)args.push(String(token).replaceAll('{output}',target).replaceAll('{text}',String(text)).replaceAll('{voice}',String(voice)).replaceAll('{rate}',String(rate)));}
  else throw Object.assign(new Error(`已找到 ${bin}，但未配置其参数。请设置 V3_TTS_ARGS，例如 ["--output","{output}","{text}"]`),{code:'TTS_GENERATOR_CONFIG_REQUIRED'});
  const result=await runProcess(bin,args,{timeoutMs:90000});
  if(!result.ok)throw new Error(result.output||`TTS 进程退出 ${result.status}`);
}

async function atomicWriteText(file,text){const dir=path.dirname(file);await mkdir(dir,{recursive:true});const temp=path.join(dir,`.${path.basename(file)}.tmp-${process.pid}-${randomUUID()}`);try{await writeFile(temp,text,'utf8');await rename(temp,file);}catch(error){await rm(temp,{force:true}).catch(()=>{});throw error;}}
async function withIssueWriteLock(issueId,task){const key=String(issueId);const previous=issueWriteLocks.get(key)||Promise.resolve();let release;const gate=new Promise(resolve=>{release=resolve});const tail=previous.catch(()=>{}).then(()=>gate);issueWriteLocks.set(key,tail);await previous.catch(()=>{});try{return await task();}finally{release();if(issueWriteLocks.get(key)===tail)issueWriteLocks.delete(key);}}
function send(res,status,data,type='application/json; charset=utf-8',headers={}) {
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'SAMEORIGIN','Permissions-Policy':'camera=(), geolocation=(), microphone=()','Strict-Transport-Security':'max-age=31536000; includeSubDomains',...headers});
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}
function safeSecretEqual(left,right){const a=Buffer.from(String(left||''));const b=Buffer.from(String(right||''));return a.length===b.length&&timingSafeEqual(a,b);}
const AI_PUBLIC_HEADERS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'};
const AI_CONFIG_DEFAULTS={enabled:false,provider:'openai-compatible',baseUrl:'https://api.openai.com/v1',model:'gpt-4o-mini',publicEndpoint:'/new-jc-magazine/api/public/ai/summarize',apiKey:'',updatedAt:null};
function aiConfigPublic(config={}){return {enabled:Boolean(config.enabled&&config.apiKey),provider:String(config.provider||AI_CONFIG_DEFAULTS.provider),baseUrl:String(config.baseUrl||AI_CONFIG_DEFAULTS.baseUrl),model:String(config.model||AI_CONFIG_DEFAULTS.model),publicEndpoint:String(config.publicEndpoint||AI_CONFIG_DEFAULTS.publicEndpoint),apiKeyConfigured:Boolean(config.apiKey),updatedAt:config.updatedAt||null};}
async function readAiConfig(){
  let stored={};
  try{stored=await readJson(aiConfigFile)||{}}catch{}
  const envKey=String(process.env.STUDIO_AI_API_KEY||'');
  const merged={...AI_CONFIG_DEFAULTS,provider:String(process.env.STUDIO_AI_PROVIDER||AI_CONFIG_DEFAULTS.provider),baseUrl:String(process.env.STUDIO_AI_BASE_URL||AI_CONFIG_DEFAULTS.baseUrl),model:String(process.env.STUDIO_AI_MODEL||AI_CONFIG_DEFAULTS.model),publicEndpoint:String(process.env.STUDIO_AI_PUBLIC_ENDPOINT||AI_CONFIG_DEFAULTS.publicEndpoint),apiKey:envKey,...stored};
  merged.enabled=stored.enabled==null?Boolean(merged.apiKey):Boolean(stored.enabled);
  return merged;
}
function normalizeAiConfigInput(data={},current={}){
  const provider=String(data.provider??current.provider??AI_CONFIG_DEFAULTS.provider).trim().slice(0,80)||AI_CONFIG_DEFAULTS.provider;
  const baseUrl=String(data.baseUrl??current.baseUrl??AI_CONFIG_DEFAULTS.baseUrl).trim().replace(/\/+$/,'').slice(0,300);
  if(!/^https?:\/\//i.test(baseUrl))throw Object.assign(new Error('AI 服务地址必须以 http:// 或 https:// 开头'),{statusCode:400,code:'AI_CONFIG_INVALID'});
  const model=String(data.model??current.model??AI_CONFIG_DEFAULTS.model).trim().slice(0,120)||AI_CONFIG_DEFAULTS.model;
  const publicEndpoint=String(data.publicEndpoint??current.publicEndpoint??AI_CONFIG_DEFAULTS.publicEndpoint).trim().slice(0,500)||AI_CONFIG_DEFAULTS.publicEndpoint;
  if(!/^\/(?!\/)|^https:\/\//i.test(publicEndpoint))throw Object.assign(new Error('公开 AI 接口地址必须是站内路径或 https:// 地址'),{statusCode:400,code:'AI_CONFIG_INVALID'});
  const apiKey=Object.prototype.hasOwnProperty.call(data,'apiKey')&&String(data.apiKey||'').trim()?String(data.apiKey).trim().slice(0,1000):String(current.apiKey||'');
  const enabled=data.enabled==null?Boolean(apiKey):Boolean(data.enabled);
  return {enabled,provider,baseUrl,model,publicEndpoint,apiKey,updatedAt:new Date().toISOString()};
}
async function writeAiConfig(config){await writeFile(aiConfigFile,`${JSON.stringify(config,null,2)}\n`,'utf8');await chmod(aiConfigFile,0o600).catch(()=>{});return config;}
function aiCacheKey(url){return createHash('sha256').update(String(url)).digest('hex');}
function aiCacheFile(url){return path.join(aiSummaryCacheDir,`${aiCacheKey(url)}.json`);}
async function readAiSummaryCache(url){try{const x=await readJson(aiCacheFile(url));if(x&&x.url===url&&typeof x.summary==='string'&&x.summary.trim())return x;}catch{}return null;}
function aiPublicRateAllowed(req){const ip=requestIp(req),now=Date.now(),old=aiPublicRate.get(ip);if(!old||old.resetAt<=now){aiPublicRate.set(ip,{count:1,resetAt:now+10*60*1000});return true;}if(old.count>=30)return false;old.count++;return true;}
function normalizedExternalUrl(raw){
  let u;try{u=new URL(String(raw||'').trim());}catch{throw Object.assign(new Error('链接地址无效'),{statusCode:400,code:'AI_URL_INVALID'});}
  const host=u.hostname.toLowerCase();
  if(!['https:'].includes(u.protocol)||u.username||u.password)throw Object.assign(new Error('AI 总结仅支持不带账号信息的 HTTPS 链接'),{statusCode:400,code:'AI_URL_INVALID'});
  if(!host||host==='localhost'||host==='[::1]'||host==='::1'||/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host)||host==='0.0.0.0')throw Object.assign(new Error('出于安全原因，该链接地址不允许抓取'),{statusCode:400,code:'AI_URL_BLOCKED'});
  u.hash='';u.hostname=host;return u.toString();
}
function htmlToReadableText(html=''){
  const decode=s=>String(s).replace(/&#(x[0-9a-f]+|\d+);/gi,(_,v)=>{const n=String(v).toLowerCase().startsWith('x')?parseInt(v.slice(1),16):parseInt(v,10);return Number.isFinite(n)?String.fromCodePoint(Math.min(n,0x10ffff)):'';}).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;/g,"'");
  return decode(String(html).replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<noscript\b[\s\S]*?<\/noscript>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
}
async function fetchExternalArticleText(url){
  let currentUrl=url;
  let redirectCount=0;
  let response;
  for(;;){
    response=await fetch(currentUrl,{redirect:'manual',headers:{'user-agent':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36','accept':'text/html, text/plain;q=0.9,*/*;q=0.1','accept-language':'zh-CN,zh;q=0.9,en;q=0.8'},signal:AbortSignal.timeout(15000)});
    if(response.status>=300&&response.status<400){
      if(++redirectCount>5)throw Object.assign(new Error('链接跳转次数过多，无法安全总结'),{statusCode:422,code:'AI_SOURCE_REDIRECT_LIMIT'});
      const location=String(response.headers.get('location')||'').trim();
      if(!location)throw Object.assign(new Error('链接跳转地址缺失，无法总结'),{statusCode:422,code:'AI_SOURCE_REDIRECT_INVALID'});
      let nextUrl;
      try{nextUrl=new URL(location,currentUrl).toString();}catch{throw Object.assign(new Error('链接跳转地址无效，无法总结'),{statusCode:422,code:'AI_SOURCE_REDIRECT_INVALID'});}
      try{currentUrl=normalizedExternalUrl(nextUrl);}catch{throw Object.assign(new Error('链接跳转目标不是安全的 HTTPS 地址，无法总结'),{statusCode:422,code:'AI_SOURCE_REDIRECT_UNSAFE'});}
      continue;
    }
    break;
  }
  if(!response.ok)throw Object.assign(new Error(`链接内容读取失败（HTTP ${response.status}）`),{statusCode:502,code:'AI_SOURCE_FETCH_FAILED'});
  const type=String(response.headers.get('content-type')||'').toLowerCase();if(type&&!/(text\/html|text\/plain|application\/xhtml)/.test(type))throw Object.assign(new Error('链接不是可读取的网页文本内容'),{statusCode:415,code:'AI_SOURCE_UNSUPPORTED'});
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>8*1024*1024)throw Object.assign(new Error('链接内容超过 8MB，暂不支持总结'),{statusCode:413,code:'AI_SOURCE_TOO_LARGE'});
  const text=htmlToReadableText(new TextDecoder('utf-8',{fatal:false}).decode(bytes)).slice(0,30000);if(text.length<40)throw Object.assign(new Error('链接中没有读取到足够的正文内容'),{statusCode:422,code:'AI_SOURCE_EMPTY'});return {text,finalUrl:currentUrl};
}
function aiEndpoint(baseUrl){const base=String(baseUrl||'').replace(/\/+$/,'');return /\/chat\/completions$/i.test(base)?base:`${base}/chat/completions`;}
function extractAiSummary(data){
  const read=value=>{
    if(typeof value==='string')return value;
    if(Array.isArray(value))return value.map(read).filter(Boolean).join('');
    if(value&&typeof value==='object'){
      for(const key of ['text','content','output_text','summary','answer']){const part=read(value[key]);if(part.trim())return part;}
    }
    return '';
  };
  for(const value of [data?.choices?.[0]?.message?.content,data?.choices?.[0]?.text,data?.output_text,data?.output,data?.result?.summary,data?.summary]){const text=read(value);if(text.trim())return text.trim();}
  return '';
}
async function callAiSummary(text,config){
  const prompt=`请用简体中文总结下面网页正文，输出 3–5 条要点和一段不超过 120 字的概述。不要编造原文没有的信息，不要输出 Markdown 标题，不要提及你是 AI。\n\n网页正文：\n${String(text).slice(0,30000)}`;
  const payload={model:config.model,messages:[{role:'system',content:'你是严谨的中文新闻编辑。'},{role:'user',content:prompt}],temperature:0.2,max_tokens:500};
  let lastError=null;
  for(let attempt=0;attempt<2;attempt++){
    let response;
    try{response=await fetch(aiEndpoint(config.baseUrl),{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${config.apiKey}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(35000)});}catch(error){lastError=error;if(attempt===0)continue;throw Object.assign(new Error('AI 服务暂时不可用，请稍后重试'),{statusCode:502,code:'AI_PROVIDER_FAILED',cause:error});}
    let data={},raw='',parsed=false;try{raw=await response.text();if(raw){data=JSON.parse(raw);parsed=true;}}catch{}
    if(!response.ok){const error=Object.assign(new Error(data?.error?.message||`AI 服务调用失败（HTTP ${response.status}）`),{statusCode:502,code:'AI_PROVIDER_FAILED'});if(response.status>=500&&attempt===0){lastError=error;continue;}throw error;}
    const fallback=!parsed&&raw.trim()&&!/^\s*</.test(raw)?raw.trim():'';
    const summary=(extractAiSummary(data)||fallback).trim();
    if(summary)return summary.slice(0,5000);
    if(attempt===0)continue;
  }
  throw Object.assign(new Error('AI 服务暂时没有生成摘要，请稍后重试'),{statusCode:502,code:'AI_EMPTY_RESULT',cause:lastError||undefined});
}
async function summarizeExternalUrl(rawUrl){
  const url=normalizedExternalUrl(rawUrl),cached=await readAiSummaryCache(url);if(cached)return {...cached,cached:true};
  const key=aiCacheKey(url),pending=aiSummaryInflight.get(key);if(pending)return {...await pending,cached:true};
  const promise=(async()=>{const config=await readAiConfig();if(!config.enabled||!config.apiKey)throw Object.assign(new Error('尚未配置可用的 AI 服务，请先在管理端打开“AI 服务配置”'),{statusCode:503,code:'AI_NOT_CONFIGURED'});const fetched=await fetchExternalArticleText(url),summary=await callAiSummary(fetched.text,config),result={url,...(fetched.finalUrl!==url?{resolvedUrl:fetched.finalUrl}:{}),summary,sourceChars:fetched.text.length,model:config.model,createdAt:new Date().toISOString(),cached:false};await mkdir(aiSummaryCacheDir,{recursive:true});await writeFile(aiCacheFile(url),`${JSON.stringify(result,null,2)}\n`,'utf8');await chmod(aiCacheFile(url),0o600).catch(()=>{});return result;})();
  aiSummaryInflight.set(key,promise);try{return await promise}finally{aiSummaryInflight.delete(key);}
}
function requestCookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return i<0?[x,'']:[x.slice(0,i),decodeURIComponent(x.slice(i+1))]}));}
function adminSession(req){
  if(!adminLoginEnabled)return {user:adminLoginUser,expiresAt:Infinity,unprotected:true};
  const token=requestCookies(req)[ADMIN_SESSION_COOKIE];if(!token)return null;
  const session=adminSessions.get(token);if(!session||session.expiresAt<=Date.now()){if(session)adminSessions.delete(token);return null;}
  session.expiresAt=Date.now()+ADMIN_SESSION_TTL_MS;return session;
}
function sessionCookie(req,token,maxAge){
  const forwarded=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim();
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0,Math.round(maxAge))}${forwarded==='https'?'; Secure':''}`;
}
function findChromium(){
  const mac=['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge','/Applications/Chromium.app/Contents/MacOS/Chromium'];
  const linux=['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome','/usr/bin/google-chrome-stable'];
  const windows=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).flatMap(base=>[path.join(base,'Google/Chrome/Application/chrome.exe'),path.join(base,'Microsoft/Edge/Application/msedge.exe')]);
  for(const candidate of [process.env.CHROMIUM,...(process.platform==='darwin'?mac:process.platform==='win32'?windows:linux)].filter(Boolean)){try{accessSync(candidate,fsConstants.X_OK);return candidate}catch{}}
  return null;
}
async function runProcess(command,commandArgs=[],{cwd=root,timeoutMs=120000,maxBuffer=4*MiB}={}){
  return await new Promise(resolve=>{
    const child=spawn(command,commandArgs,{cwd,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',settled=false;
    const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);resolve(result);};
    const timer=setTimeout(()=>{child.kill('SIGTERM');finish({ok:false,status:null,output:`进程超时（${Math.round(timeoutMs/1000)} 秒）：${path.basename(command)}`});},timeoutMs);
    const append=(name,data)=>{const value=String(data);if(Buffer.byteLength(stdout)+Buffer.byteLength(stderr)+Buffer.byteLength(value)>maxBuffer){child.kill('SIGTERM');finish({ok:false,status:null,output:`进程输出超过 ${humanBytes(maxBuffer)}`});return;}if(name==='stdout')stdout+=value;else stderr+=value;};
    child.stdout?.on('data',data=>append('stdout',data));child.stderr?.on('data',data=>append('stderr',data));
    child.on('error',error=>finish({ok:false,status:null,output:error.message}));
    child.on('close',code=>finish({ok:code===0,status:code,output:[stdout,stderr].filter(Boolean).join('\n').trim()}));
  });
}
async function runAsync(command,commandArgs=[],options={}){return runProcess(command,commandArgs,options);}
async function runScriptAsync(script,scriptArgs=[],options={}){return runAsync(process.execPath,[path.join(root,'scripts',script),...scriptArgs],{cwd:root,...options});}
function publicationFailure(code,message,advice=[]){return Object.assign(new Error(message),{code,advice});}
function publicationExportCapabilities(){
  const chromium=findChromium();
  return {
    pdf:{available:Boolean(chromium),engine:chromium?'chromium-cdp':'missing',binary:chromium||null,advice:chromium?[]:['服务器未安装可执行的 Chromium，因此暂不能生成 Print PDF。','请安装 Chromium 或在服务环境配置 CHROMIUM=/可执行文件路径；安装后直接重试，Web Reader 与正式发布不受影响。']},
    archive:{available:true,engine:'node-native-zip',advice:['归档使用内置 ZIP 写入器，不再依赖服务器的 zip 命令。']}
  };
}
const zipCrcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let i=0;i<8;i++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);table[n]=c>>>0;}return table;})();
function zipCrc32(data){let c=0xffffffff;for(const byte of data)c=zipCrcTable[(c^byte)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
function zipDosStamp(value=new Date()){const d=value instanceof Date?value:new Date(value);const year=Math.max(1980,d.getFullYear());return {time:((d.getHours()<<11)|(d.getMinutes()<<5)|Math.floor(d.getSeconds()/2))&0xffff,date:(((year-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xffff};}
async function writeNativeZip(sourceDir,file){
  const files=(await listFilesRecursive(sourceDir)).sort((a,b)=>a.localeCompare(b,'en'));
  if(!files.length)throw publicationFailure('ARCHIVE_EMPTY','归档目录为空，无法生成 ZIP。',['请先生成 Web Reader 预览后再重试。']);
  const handle=await open(file,'w');let offset=0;const central=[];
  try{
    for(const input of files){
      const name=path.relative(sourceDir,input).split(path.sep).join('/');if(!name||name.startsWith('../'))throw publicationFailure('ARCHIVE_PATH_INVALID',`归档路径无效：${name}`);
      const nameBytes=Buffer.from(name,'utf8'),data=await readFile(input),info=await stat(input),crc=zipCrc32(data),stamp=zipDosStamp(info.mtime);
      if(nameBytes.length>0xffff||data.length>0xffffffff)throw publicationFailure('ARCHIVE_FILE_TOO_LARGE',`归档文件超出 ZIP 限制：${name}`);
      const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);local.writeUInt16LE(0,8);local.writeUInt16LE(stamp.time,10);local.writeUInt16LE(stamp.date,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBytes.length,26);local.writeUInt16LE(0,28);
      await handle.write(local);await handle.write(nameBytes);await handle.write(data);central.push({nameBytes,crc,size:data.length,time:stamp.time,date:stamp.date,offset});offset+=local.length+nameBytes.length+data.length;
    }
    const centralOffset=offset;
    for(const row of central){const header=Buffer.alloc(46);header.writeUInt32LE(0x02014b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(20,6);header.writeUInt16LE(0x0800,8);header.writeUInt16LE(0,10);header.writeUInt16LE(row.time,12);header.writeUInt16LE(row.date,14);header.writeUInt32LE(row.crc,16);header.writeUInt32LE(row.size,20);header.writeUInt32LE(row.size,24);header.writeUInt16LE(row.nameBytes.length,28);header.writeUInt16LE(0,30);header.writeUInt16LE(0,32);header.writeUInt16LE(0,34);header.writeUInt16LE(0,36);header.writeUInt32LE(0,38);header.writeUInt32LE(row.offset,42);await handle.write(header);await handle.write(row.nameBytes);offset+=header.length+row.nameBytes.length;}
    const centralSize=offset-centralOffset;if(central.length>0xffff||centralOffset>0xffffffff||centralSize>0xffffffff)throw publicationFailure('ARCHIVE_TOO_LARGE','归档条目或体积超过标准 ZIP 限制。',['请拆分期刊媒体后重新生成归档。']);
    const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(0,4);end.writeUInt16LE(0,6);end.writeUInt16LE(central.length,8);end.writeUInt16LE(central.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(centralOffset,16);end.writeUInt16LE(0,20);await handle.write(end);
  }finally{await handle.close();}
}
function publicationErrorPayload(error,fallbackCode){return {error:error?.message||String(error),code:error?.code||fallbackCode,advice:Array.isArray(error?.advice)?error.advice:[],capabilities:publicationExportCapabilities()};}
function summarizeCommandFailure(output,label='发布失败',issueId=''){
  const clean=String(output||'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').trim();
  const lines=clean.split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const scoped=issueId?lines.filter(x=>x.includes(String(issueId))):[];
  const pool=scoped.length?scoped:lines;
  const useful=pool.filter(x=>/(block|阻断|失败|缺失|未就绪|不可用|invalid|score=|blocked|门禁|audit)/i.test(x));
  return (useful.slice(-4).join('；')||`${label}未通过`).slice(0,1000);
}
async function body(req,max=4*MiB) {
  let raw='';
  for await (const c of req) { raw+=c; if (Buffer.byteLength(raw)>max) throw Object.assign(new Error('请求体过大'),{statusCode:413}); }
  return raw ? JSON.parse(raw) : {};
}
async function binaryBody(req,max) {
  const chunks=[]; let total=0;
  for await (const c of req) { total+=c.length; if (total>max) throw Object.assign(new Error(`文件超过上传上限 ${humanBytes(max)}`),{statusCode:413}); chunks.push(c); }
  return Buffer.concat(chunks,total);
}
function requestIp(req){return String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim().slice(0,120)||'unknown';}
function loginRate(ip){
  const now=Date.now(),current=loginAttempts.get(ip);
  if(!current||current.resetAt<=now)return {count:0,resetAt:now+10*60*1000,lockedUntil:0};
  return current;
}
function recordLoginFailure(ip){const current=loginRate(ip);current.count++;if(current.count>=5)current.lockedUntil=Date.now()+5*60*1000;loginAttempts.set(ip,current);return current;}
function clearLoginFailures(ip){loginAttempts.delete(ip);}
function jobView(job){return {id:job.id,kind:job.kind,issueId:job.issueId,status:job.status,progress:job.progress,createdAt:job.createdAt,startedAt:job.startedAt||null,finishedAt:job.finishedAt||null,statusUrl:`/api/jobs/${encodeURIComponent(job.id)}`,result:job.result||null,error:job.error||null,errorDetails:job.errorDetails||null,retryable:['failed','interrupted','cancelled'].includes(job.status),sourceFingerprint:job.sourceFingerprint||null};}
function durableJobRecord(job){return {id:job.id,kind:job.kind,issueId:job.issueId,payload:job.payload||{},sourceFingerprint:job.sourceFingerprint||null,status:job.status,progress:job.progress,createdAt:job.createdAt,startedAt:job.startedAt||null,finishedAt:job.finishedAt||null,result:job.result||null,error:job.error||null,errorDetails:job.errorDetails||null};}
function persistBackgroundJobs(){const data={version:1,updatedAt:new Date().toISOString(),jobs:[...backgroundJobs.values()].map(durableJobRecord)};backgroundJobPersistChain=backgroundJobPersistChain.catch(()=>{}).then(()=>atomicWriteText(backgroundJobFile,`${JSON.stringify(data,null,2)}\n`));return backgroundJobPersistChain;}
function backgroundTaskFor(kind,id,payload={}){switch(kind){
case 'publication-preflight':return report=>runPublicationPreflight(id,report);
case 'publication-preview':return async report=>{report({stage:'构建当前期刊',percent:10});const output=await ensurePublicationWeb(id);return {ok:true,output,status:await publicationStatus(id,{refreshAudit:false})};};
case 'publication-pdf':return async report=>{report({stage:'生成 PDF',percent:10});const output=await generatePublicationPdf(id);return {ok:true,output,status:await publicationStatus(id,{refreshAudit:false})};};
case 'publication-archive':return async report=>{report({stage:'生成归档包',percent:10});const output=await generatePublicationArchive(id);return {ok:true,output,status:await publicationStatus(id,{refreshAudit:false})};};
case 'publication-release':return async report=>{const output=await generateFormalRelease(id,report);const issueFile=path.join(root,'issues',id,'issue.json'),nextIssue=await readJson(issueFile),source=await writeSourceReceipt(id,nextIssue,{reason:'formal-release'});return {ok:true,output,status:await publicationStatus(id,{refreshAudit:true}),issue:nextIssue,source};};
case 'public-deploy':return async report=>{report({stage:'部署公开 Reader',percent:10});const deployment=await deployPublicIssue(id);report({stage:'在线校验',percent:90});return {ok:deployment.verified,deployment,status:await publicationStatus(id,{refreshAudit:false})};};
case 'audit':return async report=>{report({stage:'执行审计',percent:10});const argv=['--issue',id,'--quiet'];if(payload.strict)argv.push('--strict');const r=await runScriptAsync('audit-v3.mjs',argv),reportFile=path.join(root,'reports',`v3-release-audit-${id}.json`);let auditReport=null;try{auditReport=await readJson(reportFile)}catch{}return {ok:r.ok,output:r.output,strict:Boolean(payload.strict),generatedAt:auditReport?.generatedAt||null,audit:auditReport?.issues?.[0]||null,htmlUrl:`/reports/v3-release-audit-${id}.html`};};
case 'build':return async report=>{report({stage:'构建当前期刊',percent:10});const r=await runScriptAsync('build-v3.mjs',['--issue',id]);return {ok:r.ok,output:r.output,preview:`/preview/${id}/`};};
case 'tts-generate':return report=>{const bin=resolveTtsGenerator();if(!bin)throw Object.assign(new Error('服务器未配置 TTS 生成器'),{code:'TTS_GENERATOR_UNAVAILABLE'});return generateTtsForIssue(id,payload,bin,report);};
default:throw Object.assign(new Error(`未知后台任务类型：${kind}`),{code:'JOB_KIND_UNKNOWN'});
}}
async function assertBackgroundJobSource(job){if(!job.sourceFingerprint||!job.issueId)return;const file=path.join(root,'issues',job.issueId,'issue.json');const current=issueSourceFingerprint(await readJson(file));if(current!==job.sourceFingerprint)throw Object.assign(new Error('任务排队后源稿已变化；为避免用错误版本生成发布结果，本任务已停止。请基于当前稿件重新发起。'),{code:'JOB_SOURCE_CHANGED'});}
function enqueueBackgroundJob({kind,issueId,payload={},sourceFingerprint=null,task}){
  if(backgroundQueue.length>=MAX_BACKGROUND_QUEUE)throw Object.assign(new Error('后台任务队列已满，请稍后重试'),{statusCode:429,code:'JOB_QUEUE_FULL'});
  const job={id:`job-${Date.now().toString(36)}-${randomUUID().slice(0,8)}`,kind,issueId,payload,sourceFingerprint,status:'queued',progress:{stage:'排队中',percent:0},createdAt:new Date().toISOString(),task:task||backgroundTaskFor(kind,issueId,payload)};
  backgroundJobs.set(job.id,job);backgroundQueue.push(job);void persistBackgroundJobs();void pumpBackgroundJobs();return job;
}
async function restoreBackgroundJobs(){let data=null;try{data=await readJson(backgroundJobFile)}catch{}for(const row of Array.isArray(data?.jobs)?data.jobs.slice(-MAX_BACKGROUND_JOBS):[]){const job={...row,payload:row.payload||{},task:null};if(['queued','running'].includes(job.status)){job.status='interrupted';job.finishedAt=new Date().toISOString();job.error='服务重启时任务尚未结束，已安全标记为中断，可重新执行。';job.errorDetails={code:'SERVICE_RESTART',advice:['检查当前源稿版本后点击重试']};job.progress={stage:'服务重启 · 已中断',percent:Number(job.progress?.percent)||0};}backgroundJobs.set(job.id,job);}if(backgroundJobs.size)await persistBackgroundJobs();}
function cancelBackgroundJob(job){if(job.status!=='queued')throw Object.assign(new Error('仅排队中的任务可安全取消；运行中的发布/构建任务不会被强行终止。'),{statusCode:409,code:'JOB_NOT_CANCELLABLE'});const i=backgroundQueue.findIndex(x=>x.id===job.id);if(i>=0)backgroundQueue.splice(i,1);job.status='cancelled';job.finishedAt=new Date().toISOString();job.progress={stage:'已取消',percent:0};job.task=null;void persistBackgroundJobs();return job;}
function retryBackgroundJob(job){if(!['failed','interrupted','cancelled'].includes(job.status))throw Object.assign(new Error('当前任务状态不能重试'),{statusCode:409,code:'JOB_NOT_RETRYABLE'});return enqueueBackgroundJob({kind:job.kind,issueId:job.issueId,payload:job.payload||{},sourceFingerprint:job.sourceFingerprint,task:backgroundTaskFor(job.kind,job.issueId,job.payload||{})});}
async function pumpBackgroundJobs(){
  if(backgroundJobRunning)return;backgroundJobRunning=true;
  try{while(backgroundQueue.length){const job=backgroundQueue.shift();job.status='running';job.startedAt=new Date().toISOString();job.progress={stage:'开始执行',percent:1};await persistBackgroundJobs();try{await assertBackgroundJobSource(job);job.result=await job.task(progress=>{job.progress={...job.progress,...progress};void persistBackgroundJobs();});job.status='succeeded';job.progress={stage:'已完成',percent:100};}catch(error){job.status='failed';job.error=error?.message||String(error);job.errorDetails={code:error?.code||'',advice:Array.isArray(error?.advice)?error.advice:[]};job.progress={stage:'执行失败',percent:100};console.error(`[job:${job.id}] ${job.error}`);}job.finishedAt=new Date().toISOString();job.task=null;while(backgroundJobs.size>MAX_BACKGROUND_JOBS){const oldest=[...backgroundJobs.values()].find(x=>!['queued','running'].includes(x.status));if(!oldest)break;backgroundJobs.delete(oldest.id);}await persistBackgroundJobs();}}
  finally{backgroundJobRunning=false;}
}
function backgroundJobResponse(job){return {ok:true,async:true,jobId:job.id,status:job.status,statusUrl:`/api/jobs/${encodeURIComponent(job.id)}`};}
async function issueSummaries() {
  const issuesDir=path.join(root,'issues'); await mkdir(issuesDir,{recursive:true});
  const entries=await readdir(issuesDir,{withFileTypes:true}); const out=[];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try { const x=await readJson(path.join(root,'issues',e.name,'issue.json')); out.push({id:x.id,label:x.label,subtitle:x.subtitle||'',status:x.status,engine:x.engine,pageCount:Array.isArray(x.pages)?x.pages.length:null,revisionPending:Boolean(x.revision?.pending)}); } catch {}
  }
  return out.sort((a,b)=>b.id.localeCompare(a.id,'zh-CN'));
}
function validateBlock(block,pageIndex,blockIndex,{nested=false,pathLabel=''}={}) {
  const label=pathLabel||`第 ${pageIndex+1} 页第 ${blockIndex+1} 个内容块`;
  if (!block||typeof block!=='object') throw new Error(`${label}必须是对象`);
  if (!allowedBlockTypes.has(block.type)) throw new Error(`${label}类型 ${block.type||'(空)'} 不受支持`);
  if(nested&&block.type==='container')throw new Error(`${label}：V3.1-alpha1 暂不允许容器嵌套容器`);
  validateDesignObject(block.design,label,'block');
  const walk=(value,p='')=>{
    if (typeof value==='string'&&value.length>MAX_TEXT_FIELD) throw new Error(`第 ${pageIndex+1} 页第 ${blockIndex+1} 个内容块 ${p||'文本'} 超过 ${MAX_TEXT_FIELD} 个字符`);
    if (Array.isArray(value)) { if(value.length>MAX_ARRAY_ITEMS) throw new Error(`第 ${pageIndex+1} 页第 ${blockIndex+1} 个内容块数组条目超过 ${MAX_ARRAY_ITEMS} 项`); value.forEach((v,i)=>walk(v,`${p}[${i}]`)); }
    else if (value&&typeof value==='object') for (const [k,v] of Object.entries(value)) walk(v,p?`${p}.${k}`:k);
  };
  walk(block);
  if(block.type==='container'){
    if(!allowedContainerLayouts.has(block.layout||'two-equal'))throw new Error(`${label}布局类型不受支持`);
    if(!['sm','md','lg'].includes(block.gap||'md'))throw new Error(`${label}间距不受支持`);
    if(!['start','center','stretch'].includes(block.align||'start'))throw new Error(`${label}对齐方式不受支持`);
    if(!['stack','preserve'].includes(block.mobile||'stack'))throw new Error(`${label}移动端策略不受支持`);
    if(!Array.isArray(block.columns)||block.columns.length<1||block.columns.length>3)throw new Error(`${label}必须包含 1–3 列`);
    block.columns.forEach((column,ci)=>{if(!column||!Array.isArray(column.blocks))throw new Error(`${label}第 ${ci+1} 列 blocks 必须是数组`);if(column.blocks.length>20)throw new Error(`${label}第 ${ci+1} 列最多 20 个内容块`);column.blocks.forEach((child,bi)=>validateBlock(child,pageIndex,blockIndex,{nested:true,pathLabel:`${label}第 ${ci+1} 列第 ${bi+1} 个子块`}));});
    return;
  }
  if ((block.type==='image'||block.type==='video')&&String(block.src||'').length>500) throw new Error(`第 ${pageIndex+1} 页第 ${blockIndex+1} 个媒体路径过长`);
  if (block.type==='video'&&String(block.poster||'').length>500) throw new Error(`第 ${pageIndex+1} 页第 ${blockIndex+1} 个视频封面路径过长`);
  if (block.type==='image') {
    if(block.frameRatio!=null&&!['auto','16:9','4:3','3:2','1:1'].includes(block.frameRatio))throw new Error(`第 ${pageIndex+1} 页第 ${blockIndex+1} 个图片画框比例不受支持`);
    if(block.fit!=null&&!['contain','cover'].includes(block.fit))throw new Error(`第 ${pageIndex+1} 页第 ${blockIndex+1} 个图片填充方式不受支持`);
    for(const key of ['positionX','positionY'])if(block[key]!=null&&(!Number.isFinite(Number(block[key]))||Number(block[key])<0||Number(block[key])>100))throw new Error(`第 ${pageIndex+1} 页第 ${blockIndex+1} 个图片 ${key} 必须在 0–100 之间`);
  }
}
function countBlockNodes(block){
  if(!block||typeof block!=='object')return 0;
  if(block.type!=='container')return 1;
  return 1+(block.columns||[]).reduce((sum,column)=>sum+(column?.blocks||[]).reduce((n,child)=>n+countBlockNodes(child),0),0);
}
const stableEntityId=/^(?:page|block)_[a-z0-9][a-z0-9_-]{5,63}$/i;
function validateIssue(issue,id) {
  if (!issue||typeof issue!=='object') throw new Error('issue.json 必须是对象');
  if (issue.id!==id) throw new Error('不允许通过制作中心修改 issue.id');
  if (issue.engine!=='v3') throw new Error('制作中心仅编辑 V3 期刊');
  if(issue.features?.narration?.scope!=null&&!['page','page-and-articles'].includes(issue.features.narration.scope))throw new Error('朗读范围必须为 page 或 page-and-articles');
  if (String(issue.label||'').length>40) throw new Error('期名不能超过 40 个字符');
  if (String(issue.subtitle||'').length>120) throw new Error('本期主题不能超过 120 个字符');
  if (String(issue.publisher||'').length>120) throw new Error('发布单位不能超过 120 个字符');
  if (!Array.isArray(issue.pages)||!issue.pages.length) throw new Error('期刊至少需要 1 个页面');
  if(issue.design?.tokens)validateDesignObject(issue.design.tokens,'全刊 Theme','theme');
  if (issue.pages.length>200) throw new Error('制作中心最多支持 200 页');
  if (!issue.articles||typeof issue.articles!=='object'||Array.isArray(issue.articles)) issue.articles={};
  const articleEntries=Object.entries(issue.articles); if(articleEntries.length>100)throw new Error('文章库最多支持 100 篇文章');
  for(const [articleId,a] of articleEntries){ if(!/^[a-zA-Z0-9._-]{1,64}$/.test(articleId))throw new Error(`文章 ID ${articleId} 不合法`); if(!a||typeof a!=='object')throw new Error(`文章 ${articleId} 必须是对象`); if(String(a.title||'').length>200)throw new Error(`文章 ${articleId} 标题超过 200 个字符`); if(String(a.subtitle||'').length>120)throw new Error(`文章 ${articleId} 副标题超过 120 个字符`); if(String(a.url||'').length>1000)throw new Error(`文章 ${articleId} URL 超过 1000 个字符`); if(a.url&&!/^https:\/\//i.test(String(a.url)))throw new Error(`文章 ${articleId} URL 必须使用 https://`); if(String(a.linkTitle||'').length>200)throw new Error(`文章 ${articleId} 链接显示文字超过 200 个字符`); if(String(a.aiSummary||'').length>5000)throw new Error(`文章 ${articleId} AI 摘要超过 5000 个字符`); if(String(a.sourceNote||a.source_note||'').length>1000)throw new Error(`文章 ${articleId} 来源说明超过 1000 个字符`); if(!Array.isArray(a.paras))a.paras=[]; if(a.paras.length>50)throw new Error(`文章 ${articleId} 正文段落超过 50 段`); a.paras.forEach((text,i)=>{if(String(text||'').length>12000)throw new Error(`文章 ${articleId} 第 ${i+1} 段超过 12000 个字符`)}) }
  const seenPageIds=new Set(),seenBlockIds=new Set();
  for (const [i,p] of issue.pages.entries()) {
    if(p.id!=null){if(!stableEntityId.test(String(p.id))||!String(p.id).startsWith('page_'))throw new Error(`第 ${i+1} 页 id 不合法`);if(seenPageIds.has(p.id))throw new Error(`第 ${i+1} 页 id 重复`);seenPageIds.add(p.id);}
    if (!p.type||!p.title) throw new Error(`第 ${i+1} 页缺少 type 或 title`);
    validateDesignObject(p.design,`第 ${i+1} 页`,'page');
    for (const [field,value] of Object.entries({title:p.title,navTitle:p.navTitle,kicker:p.kicker,section:p.section})) if (String(value||'').length>120) throw new Error(`第 ${i+1} 页 ${field} 超过 120 个字符`);
    if (!Array.isArray(p.blocks)) p.blocks=[];
    if (p.blocks.length>MAX_BLOCKS_PER_PAGE) throw new Error(`第 ${i+1} 页内容块超过 ${MAX_BLOCKS_PER_PAGE} 个，请拆分页面`);
    const recursiveBlockCount=p.blocks.reduce((sum,b)=>sum+countBlockNodes(b),0);
    if(recursiveBlockCount>MAX_PAGE_BLOCK_NODES)throw new Error(`第 ${i+1} 页递归内容块总数 ${recursiveBlockCount} 超过 ${MAX_PAGE_BLOCK_NODES} 个，请拆分页面`);
    if (JSON.stringify(p.blocks).length>600000) throw new Error(`第 ${i+1} 页内容块超过 600KB，请拆分页面`);
    const collectIds=(blocks,path='')=>{for(const [bi,b] of (blocks||[]).entries()){if(b?.id!=null){if(!stableEntityId.test(String(b.id))||!String(b.id).startsWith('block_'))throw new Error(`第 ${i+1} 页${path}第 ${bi+1} 个内容块 id 不合法`);if(seenBlockIds.has(b.id))throw new Error(`内容块 id 重复：${b.id}`);seenBlockIds.add(b.id);}if(b?.type==='container')for(const [ci,col] of (b.columns||[]).entries())collectIds(col?.blocks||[],`${path}容器第 ${ci+1} 列`);}};collectIds(p.blocks);
    p.blocks.forEach((b,bi)=>validateBlock(b,i,bi));
  }
}
const rc1AcceptanceFile = path.join(root,'reports','v3-rc1-device-acceptance.json');
async function readRc1Acceptance(){
  try{return await readJson(rc1AcceptanceFile)}catch{return {version:V3_VERSION,updatedAt:null,records:[]}}
}
async function currentAcceptanceSource(){
  const [sha,at,branch]=await Promise.all([runProcess('git',['rev-parse','HEAD']),runProcess('git',['show','-s','--format=%cI','HEAD']),runProcess('git',['rev-parse','--abbrev-ref','HEAD'])]);
  const commit=sha.ok?String(sha.output||'').trim():'';const committedAt=at.ok?String(at.output||'').trim():'';
  if(!/^[0-9a-f]{40}$/i.test(commit)||!Number.isFinite(Date.parse(committedAt)))throw Object.assign(new Error('当前工作目录缺少可验证的 Git 源码身份，禁止写入 Final Acceptance 证据'),{statusCode:409,code:'FINAL_SOURCE_IDENTITY_UNAVAILABLE'});
  return {commit,committedAt,branch:branch.ok?String(branch.output||'').trim():null};
}
function acceptanceEvidenceSha(record){const copy={...record};delete copy.evidenceSha256;return createHash('sha256').update(JSON.stringify(copy)).digest('hex');}
async function writeRc1Acceptance(record){
  const report=await readRc1Acceptance();const source=await currentAcceptanceSource();
  report.version=V3_VERSION;report.updatedAt=new Date().toISOString();report.sourceCommit=source.commit;report.records=Array.isArray(report.records)?report.records:[];
  const key=`${record.deviceType||'other'}:${record.deviceName||''}`;
  const normalized={...record,version:V3_VERSION,key,recordedAt:new Date().toISOString(),userAgent:String(record.userAgent||'').slice(0,1000),sourceCommit:source.commit,sourceCommittedAt:source.committedAt,sourceBranch:source.branch};
  normalized.evidenceSha256=acceptanceEvidenceSha(normalized);
  const i=report.records.findIndex(x=>x.key===key);if(i>=0)report.records[i]=normalized;else report.records.push(normalized);
  await mkdir(path.dirname(rc1AcceptanceFile),{recursive:true});await writeFile(rc1AcceptanceFile,`${JSON.stringify(report,null,2)}\n`,'utf8');return report;
}
function lanUrls(port){
  const urls=[];for(const list of Object.values(os.networkInterfaces()))for(const x of list||[])if(x.family==='IPv4'&&!x.internal)urls.push(`http://${x.address}:${port}/`);return [...new Set(urls)];
}

function realBrowserUaMatches(type,ua=''){
  const s=String(ua);const safari=/Safari/i.test(s)&&!/(Chrome|Chromium|CriOS|Edg|EdgiOS|FxiOS|OPiOS)/i.test(s);
  if(type==='edge-desktop')return /Edg\//i.test(s)&&!/EdgiOS/i.test(s);
  if(type==='mac-safari')return safari&&/Macintosh/i.test(s)&&!/Mobile\//i.test(s);
  if(type==='iphone-safari')return safari&&/iPhone/i.test(s);
  if(type==='ipad-safari')return safari&&(/iPad/i.test(s)||(/Macintosh/i.test(s)&&/Mobile\//i.test(s)));
  if(type==='android-wechat')return /Android/i.test(s)&&/MicroMessenger/i.test(s);
  return true;
}
function firstVideoPath(issue={}){for(const p of issue.pages||[])for(const b of p.blocks||[])if(b.type==='video'&&b.src&&!/^https?:/i.test(b.src))return b.src;return null}
async function serveFile(req,res,file) {
  if (!(await exists(file))) return send(res,404,{error:'Not found'});
  const ext=path.extname(file).toLowerCase(); const type=mime[ext]||'application/octet-stream';
  // Only fingerprinted JS/CSS are immutable. Reader/admin HTML is a runtime
  // shell whose module URLs and bootstrap flags can change independently of
  // the product version, so caching it as immutable can pin an iframe to an
  // old Reader for a year. JSON must also remain live for issue switching.
  const cacheControl=/[?&]v=[^&]+/.test(String(req.url||''))&&['.js','.css'].includes(ext)
    ? 'public, max-age=31536000, immutable' : 'no-store';
  const streamable=/^(audio|video)\//.test(type);
  if(streamable){
    const info=await stat(file); const total=info.size; const range=String(req.headers.range||'');
    if(range){
      const m=/^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if(!m)return send(res,416,{error:'Invalid Range'});
      let start=m[1]?Number(m[1]):0; let end=m[2]?Number(m[2]):total-1;
      if(!m[1]&&m[2]){const suffix=Number(m[2]);start=Math.max(0,total-suffix);end=total-1;}
      if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start||start>=total){res.writeHead(416,{'Content-Range':`bytes */${total}`,'Cache-Control':'no-store'});return res.end();}
      end=Math.min(end,total-1);
      res.writeHead(206,{'Content-Type':type,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${total}`,'Accept-Ranges':'bytes','Cache-Control':cacheControl,'X-Content-Type-Options':'nosniff'});
      return createReadStream(file,{start,end}).pipe(res);
    }
    res.writeHead(200,{'Content-Type':type,'Content-Length':total,'Accept-Ranges':'bytes','Cache-Control':cacheControl,'X-Content-Type-Options':'nosniff'});
    return createReadStream(file).pipe(res);
  }
  const payload=await readFile(file);
  res.writeHead(200,{'Content-Type':type,'Content-Length':payload.length,'Cache-Control':cacheControl,'X-Content-Type-Options':'nosniff'});
  res.end(payload);
}
function issueAssetRoot(issue,id) {
  const rel=String(issue.assetSource||`issues/${id}/assets`).replaceAll('\\','/').replace(/^\/+/, '');
  const base=path.resolve(root,rel);
  if (base!==root&&!base.startsWith(root+path.sep)) throw new Error('assetSource 超出项目目录');
  return base;
}
function managedAssetRoot(id) { return path.resolve(root,'issues',id,'assets'); }
function isManagedAssetRoot(issue,id) { return issueAssetRoot(issue,id)===managedAssetRoot(id); }
function draftFile(id){return path.join(root,'.v3-drafts',`${id}.json`)}
async function readDraft(id){const file=draftFile(id);if(!(await exists(file)))return {exists:false};try{const x=await readJson(file);return {exists:true,...x}}catch{return {exists:false}}}
function validateDraftIssue(issue,id){if(!issue||typeof issue!=='object')throw new Error('草稿 issue 必须是对象');if(issue.id!==id)throw new Error('草稿 issue.id 与当前期刊不一致');if(issue.engine!=='v3')throw new Error('草稿仅支持 V3 期刊');if(!Array.isArray(issue.pages)||issue.pages.length>200)throw new Error('草稿页面结构无效或超过 200 页');}
async function writeDraft(id,issue){validateDraftIssue(issue,id);const savedAt=new Date().toISOString();await mkdir(path.dirname(draftFile(id)),{recursive:true});await writeFile(draftFile(id),`${JSON.stringify({savedAt,issue},null,2)}\n`,'utf8');return {exists:true,savedAt}}
async function deleteDraftFile(id){await rm(draftFile(id),{force:true});}
function validateLivePreviewIssue(issue,id){
  if(!issue||typeof issue!=='object')throw new Error('实时预览数据必须是对象');
  if(issue.id!==id)throw new Error('实时预览 issue.id 与当前期刊不一致');
  if(issue.engine!=='v3')throw new Error('实时预览仅支持 V3 期刊');
  if(!Array.isArray(issue.pages)||issue.pages.length<1||issue.pages.length>200)throw new Error('实时预览页面数量必须在 1–200 页之间');
}
function livePreviewIssue(id,fallback){ return livePreviewIssues.get(id) || fallback; }

function classifyAsset(file,base) {
  const rel=posix(path.relative(base,file)); const top=rel.split('/')[0]; const ext=path.extname(file).toLowerCase();
  let kind=['image','video','music','tts'].includes(top)?top:null;
  if (!kind) { if(uploadRules.image.exts.has(ext))kind='image'; else if(uploadRules.video.exts.has(ext))kind='video'; else if(uploadRules.music.exts.has(ext))kind='music'; }
  return {kind,rel};
}
async function mediaProbe(file) {
  const r=await runProcess('ffprobe',['-v','error','-show_entries','stream=width,height,duration:format=duration','-of','json',file],{timeoutMs:8000,maxBuffer:2*MiB});
  if(!r.ok)return {};
  try{const j=JSON.parse(r.output||'{}');const stream=(j.streams||[]).find(x=>x.width||x.height)||(j.streams||[])[0]||{};const duration=Number(j.format?.duration||stream.duration);return {width:Number(stream.width)||null,height:Number(stream.height)||null,duration:Number.isFinite(duration)?Number(duration.toFixed(2)):null};}catch{return {}}
}
function safeAssetRelative(input='') {
  const source=String(input||'').trim().replaceAll('\\','/');
  if(!source||source.startsWith('/')||/^[a-zA-Z]:\//.test(source))throw new Error('媒体路径不合法');
  const rel=stripAssetsPrefix(source);
  const segments=rel.split('/');
  if(!rel||segments.some(segment=>!segment||segment==='.'||segment==='..')||path.isAbsolute(rel))throw new Error('媒体路径不合法');
  return rel;
}
function assetReferences(issue) {
  const map=new Map();
  for(const ref of collectReferencedAssets(issue)){const key=stripAssetsPrefix(ref.path);const refs=ref.references||[];map.set(key,{kind:ref.kind,references:refs,page:ref.page||null,blockIndex:Number.isInteger(ref.blockIndex)?ref.blockIndex:null});}
  return map;
}
async function listAssets(issue,id) {
  const base=issueAssetRoot(issue,id); const files=await listFilesRecursive(base); const rows=[]; const refs=assetReferences(issue);
  for (const file of files) { const info=await stat(file); const {kind,rel}=classifyAsset(file,base); const ref=refs.get(rel); const probe=(kind==='image'||kind==='video')?await mediaProbe(file):{}; rows.push({path:`assets/${rel}`,kind:kind||'other',name:path.basename(file),bytes:info.size,size:humanBytes(info.size),...probe,used:Boolean(ref),referenceCount:ref?.references?.length||0,references:ref?.references||[]}); }
  rows.sort((a,b)=>a.kind.localeCompare(b.kind)||a.path.localeCompare(b.path,'zh-CN'));
  const ttsRefs=collectReferencedAssets(issue).filter(x=>x.kind==='tts'); const foundTts=new Set(rows.filter(x=>x.kind==='tts').map(x=>stripAssetsPrefix(x.path))); const missingTts=ttsRefs.filter(x=>!foundTts.has(stripAssetsPrefix(x.path))).map(x=>x.page).filter(Boolean);
  const stored=issue.features?.narration?.sourceDigest||null,current=narrationSourceDigest(issue);
  return {assetSource:issue.assetSource||`issues/${id}/assets`,writable:isManagedAssetRoot(issue,id),items:rows,summary:{total:rows.length,used:rows.filter(x=>x.used).length,unused:rows.filter(x=>!x.used).length,bytes:rows.reduce((n,x)=>n+x.bytes,0),size:humanBytes(rows.reduce((n,x)=>n+x.bytes,0))},tts:{expected:ttsRefs.length,found:ttsRefs.length-missingTts.length,missingPages:missingTts,stale:Boolean(stored&&stored!==current),baselinedAt:issue.features?.narration?.baselinedAt||null}};
}
function safeUploadName(input) {
  const raw=decodeURIComponent(String(input||'').trim()).normalize('NFKC');
  const base=path.basename(raw).replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/^\.+/,'').trim();
  if (!base||base.length>140) throw new Error('文件名为空或超过 140 个字符');
  return base;
}
function validateUploadSignature(data,ext) {
  const head=data.subarray(0,16); const ascii=head.toString('ascii');
  const ok = ext==='.png' ? head.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
    : (ext==='.jpg'||ext==='.jpeg') ? head[0]===0xff&&head[1]===0xd8&&head[2]===0xff
    : ext==='.gif' ? ascii.startsWith('GIF87a')||ascii.startsWith('GIF89a')
    : ext==='.webp' ? ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP'
    : (ext==='.mp4'||ext==='.mov'||ext==='.m4a') ? data.length>=12&&data.subarray(4,8).toString('ascii')==='ftyp'
    : ext==='.webm' ? head[0]===0x1a&&head[1]===0x45&&head[2]===0xdf&&head[3]===0xa3
    : ext==='.wav' ? ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WAVE'
    : ext==='.mp3' ? ascii.startsWith('ID3')||(head[0]===0xff&&(head[1]&0xe0)===0xe0)
    : false;
  if(!ok)throw new Error(`文件内容与扩展名 ${ext} 不匹配或文件头不受支持`);
}

async function uniqueFile(dir,name) {
  const ext=path.extname(name); const stem=path.basename(name,ext); let candidate=name;
  for (let i=2;await exists(path.join(dir,candidate));i++) candidate=`${stem}-${i}${ext}`;
  return candidate;
}
async function resolvedAssetFile(issue,id,input){const rel=safeAssetRelative(input);const base=issueAssetRoot(issue,id);const file=path.resolve(base,rel);if(file!==base&&!file.startsWith(base+path.sep))throw new Error('媒体路径越出资源目录');return {rel,base,file};}
async function deleteAsset(issue,id,input){if(!isManagedAssetRoot(issue,id))throw Object.assign(new Error('当前资源目录为只读，不能删除'),{statusCode:409,code:'ASSET_SOURCE_READONLY'});const {rel,file}=await resolvedAssetFile(issue,id,input);if(!(await exists(file)))throw Object.assign(new Error('媒体文件不存在'),{statusCode:404});const ref=assetReferences(issue).get(rel);if(ref?.references?.length)throw Object.assign(new Error(`媒体仍被 ${ref.references.length} 处引用，请先解除引用`),{statusCode:409,code:'ASSET_IN_USE',references:ref.references});await rm(file,{force:true});await runScriptAsync('sync-assets-v3.mjs',['--issue',id]);return {ok:true,path:`assets/${rel}`};}
async function cleanupAssets(issue,id,confirmDelete=false){if(!isManagedAssetRoot(issue,id))throw Object.assign(new Error('当前资源目录为只读，不能清理'),{statusCode:409,code:'ASSET_SOURCE_READONLY'});const listing=await listAssets(issue,id);const candidates=listing.items.filter(x=>!x.used&&['image','video','music','tts'].includes(x.kind));if(confirmDelete)for(const x of candidates){const {file}=await resolvedAssetFile(issue,id,x.path);await rm(file,{force:true});}if(confirmDelete)await runScriptAsync('sync-assets-v3.mjs',['--issue',id]);return {candidates:candidates.map(x=>({path:x.path,kind:x.kind,size:x.size,bytes:x.bytes})),count:candidates.length,bytes:candidates.reduce((n,x)=>n+x.bytes,0),size:humanBytes(candidates.reduce((n,x)=>n+x.bytes,0)),deleted:Boolean(confirmDelete)};}
async function generateVideoPoster(issue,id,input){if(!isManagedAssetRoot(issue,id))throw Object.assign(new Error('当前资源目录为只读，不能生成视频封面'),{statusCode:409,code:'ASSET_SOURCE_READONLY'});const {rel,file}=await resolvedAssetFile(issue,id,input);if(!rel.startsWith('video/'))throw Object.assign(new Error('只能为 video 资源生成封面'),{statusCode:400});if(!(await exists(file)))throw Object.assign(new Error('视频文件不存在'),{statusCode:404});const imageDir=path.join(managedAssetRoot(id),'image');await mkdir(imageDir,{recursive:true});const stem=path.basename(rel,path.extname(rel)).replace(/[^a-zA-Z0-9._-]+/g,'-')||'video';const name=await uniqueFile(imageDir,`${stem}-poster.jpg`);const out=path.join(imageDir,name);const r=await runProcess('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss','0.4','-i',file,'-frames:v','1','-vf','scale=1280:-2:force_original_aspect_ratio=decrease','-q:v','3',out],{timeoutMs:30000,maxBuffer:2*MiB});if(!r.ok){await rm(out,{force:true});throw Object.assign(new Error(`视频封面生成失败：${r.output||'ffmpeg error'}`),{statusCode:500});}await runScriptAsync('sync-assets-v3.mjs',['--issue',id]);const info=await stat(out);return {path:`assets/image/${name}`,kind:'image',name,bytes:info.size,size:humanBytes(info.size)};}
async function installStockAsset(issue,id,stockId){
  if(!isManagedAssetRoot(issue,id))throw Object.assign(new Error('当前资源目录为只读，不能安装内置素材'),{statusCode:409,code:'ASSET_SOURCE_READONLY'});
  const fileName=stockAssetNames.get(String(stockId||''));
  if(!fileName)throw Object.assign(new Error('未找到所选内置素材'),{statusCode:404,code:'STOCK_ASSET_NOT_FOUND'});
  const source=path.resolve(stockAssetDir,fileName);
  if(!source.startsWith(stockAssetDir+path.sep)||!(await exists(source)))throw Object.assign(new Error('内置素材文件缺失，请联系管理员补充部署'),{statusCode:500,code:'STOCK_ASSET_MISSING'});
  const imageDir=path.join(managedAssetRoot(id),'image');await mkdir(imageDir,{recursive:true});
  const name=`stock-${fileName}`,target=path.join(imageDir,name);await cp(source,target,{force:true});
  await runScriptAsync('sync-assets-v3.mjs',['--issue',id]);const info=await stat(target);
  return {path:`assets/image/${name}`,kind:'image',name,bytes:info.size,size:humanBytes(info.size),stockId:String(stockId)};
}
function cloneBlockStructure(block,target) {
  switch(block?.type){
    case 'paragraph': return {type:'paragraph',style:block.style||'body',text:'请填写正文内容。'};
    case 'quote': return {type:'quote',title:'',text:'请填写引言或提示内容。'};
    case 'chips': return {type:'chips',items:(block.items||[]).slice(0,8).map(x=>({text:'标签',tone:x?.tone||''}))};
    case 'cardline': return {type:'cardline',badge:block.badge||'1',title:'要点标题',text:'请填写说明内容。',tone:block.tone||'default'};
    case 'casePair': return {type:'casePair',case:'请填写案例内容。',warning:'请填写警示内容。'};
    case 'toc': return {type:'toc',items:[]};
    case 'articleLink': return {type:'articleLink',articleId:''};
    case 'video': return {type:'video',src:'',poster:'',caption:'请上传或选择视频'};
    case 'image': return {type:'image',src:'',alt:'请填写图片替代文字',caption:'',frameRatio:'auto',fit:'contain',positionX:50,positionY:50};
    case 'table': return {type:'table',rows:(block.rows||[['','']]).slice(0,12).map(r=>(r||[]).slice(0,8).map(()=>'')),headerRows:Number(block.headerRows)||0,caption:''};
    case 'coverMeta': return {type:'coverMeta',text:`${target.publication||''} · ${target.label||''}`};
    case 'coverSections': return {type:'coverSections',items:(block.items||[]).slice(0,10).map(String)};
    case 'blessing': return {type:'blessing',text:'请填写本期祝福语。'};
    case 'producer': return {type:'producer',text:`${target.publisher||'请填写制作单位'}制作`};
    case 'cards': return {type:'cards',items:(block.items||[]).slice(0,8).map(()=>({title:'卡片标题',text:'请填写卡片内容。'}))};
    default: return {type:'paragraph',style:'body',text:'请填写正文内容。'};
  }
}
function cloneStructure(source,target) {
  const pages=(source.pages||[]).map((p,i)=>{
    const special=p.type==='cover'||p.type==='toc'||p.type==='closing';
    const title=p.type==='cover'?target.subtitle:p.type==='toc'?'本期导读':p.type==='closing'?'本期寄语':`${p.navTitle||p.section||`第${i+1}页`} · 待编辑`;
    return {type:p.type||'article',navTitle:p.navTitle||title,kicker:p.kicker||'',title,section:p.section||'',blocks:(p.blocks||[]).map(b=>cloneBlockStructure(b,target))};
  });
  return {...target,theme:source.theme||target.theme,features:{...target.features,flipAnimation:source.features?.flipAnimation??true,turnAnimation:['smooth','slide','fade','three-d','none'].includes(source.features?.turnAnimation)?source.features.turnAnimation:'smooth',fullscreen:source.features?.fullscreen??true,music:{src:'assets/music/bgm.mp3',defaultOn:false},narration:{pattern:'assets/tts/page-{page}.mp3',fallback:'speechSynthesis',continuousDefault:false,rate:1}},articles:{},pages};
}

const designLibraryFile=process.env.V3_DESIGN_LIBRARY_FILE?path.resolve(process.env.V3_DESIGN_LIBRARY_FILE):path.join(root,'.v3-design-library','styles.json');
const DESIGN_LIBRARY_KEYS={
  theme:new Set(['accent','paper','canvas','texture','text','muted','fontBase','radius','spacing']),
  page:new Set(['background','color','accent','padding','contentWidth','backgroundOverlay','backgroundFit','backgroundPosition']),
  block:new Set(['fontSize','fontWeight','color','background','padding','margin','radius','borderWidth','borderColor','shadow','textAlign','width','alignSelf'])
};
async function readDesignLibrary(){try{const rows=await readJson(designLibraryFile);return Array.isArray(rows)?rows:[]}catch{return []}}
async function writeDesignLibrary(rows){await mkdir(path.dirname(designLibraryFile),{recursive:true});await writeFile(designLibraryFile,`${JSON.stringify(rows,null,2)}
`,'utf8')}
function sanitizeDesignAsset(data){
  const scope=String(data?.scope||'');if(!DESIGN_LIBRARY_KEYS[scope])throw new Error('样式作用域必须为 theme / page / block');
  const name=String(data?.name||'').trim();if(!name||name.length>60)throw new Error('样式名称需要 1–60 个字符');
  const raw=data?.payload;if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('样式内容必须为对象');
  const allowed=DESIGN_LIBRARY_KEYS[scope],payload={};for(const [key,value] of Object.entries(raw)){if(!allowed.has(key))throw new Error(`当前作用域不支持 ${key}`);if(value!==''&&value!=null)payload[key]=value;}
  if(!Object.keys(payload).length)throw new Error('当前作用域没有可保存的自定义样式');
  validateDesignObject(payload,'我的样式',scope);
  const contextType=String(data?.contextType||'').trim().slice(0,64);
  return {scope,name,payload,contextType};
}

const layoutLibraryFile=process.env.V3_LAYOUT_LIBRARY_FILE?path.resolve(process.env.V3_LAYOUT_LIBRARY_FILE):path.join(root,'.v3-layout-library','layouts.json');
const LAYOUT_LIBRARY_PRESETS=new Set(['single-focus','lead-two','two-balanced','media-left','media-right','three-brief']);
async function readLayoutLibrary(){try{const rows=await readJson(layoutLibraryFile);return Array.isArray(rows)?rows:[]}catch{return []}}
async function writeLayoutLibrary(rows){await mkdir(path.dirname(layoutLibraryFile),{recursive:true});await writeFile(layoutLibraryFile,`${JSON.stringify(rows,null,2)}\n`,'utf8')}
function sanitizeLayoutNode(node,{nested=false}={}){
  if(!node||typeof node!=='object'||Array.isArray(node))throw new Error('版式节点必须为对象');
  const kind=String(node.kind||'');
  if(kind==='slot'){
    const keys=Object.keys(node);if(keys.some(k=>k!=='kind'))throw new Error('内容槽位不允许携带正文或其他字段');return {kind:'slot'};
  }
  if(kind!=='container')throw new Error('版式节点只支持 slot / container');
  if(nested)throw new Error('版式资产暂不支持容器嵌套容器');
  const allowed=new Set(['kind','layout','gap','align','mobile','columns','design']);for(const key of Object.keys(node))if(!allowed.has(key))throw new Error(`版式容器不支持字段 ${key}`);
  const layout=String(node.layout||'two-equal'),gap=String(node.gap||'md'),align=String(node.align||'start'),mobile=String(node.mobile||'stack');
  if(!allowedContainerLayouts.has(layout))throw new Error(`版式容器布局 ${layout} 不受支持`);if(!['sm','md','lg'].includes(gap))throw new Error('版式容器 gap 不受支持');if(!['start','center','stretch'].includes(align))throw new Error('版式容器 align 不受支持');if(!['stack','preserve'].includes(mobile))throw new Error('版式容器 mobile 不受支持');
  if(!Array.isArray(node.columns)||node.columns.length<1||node.columns.length>3)throw new Error('版式容器必须包含 1–3 列');
  const columns=node.columns.map((col,ci)=>{if(!col||typeof col!=='object'||Array.isArray(col)||Object.keys(col).some(k=>k!=='nodes')||!Array.isArray(col.nodes))throw new Error(`版式第 ${ci+1} 列结构无效`);if(col.nodes.length>20)throw new Error(`版式第 ${ci+1} 列最多 20 个槽位`);return {nodes:col.nodes.map(x=>sanitizeLayoutNode(x,{nested:true}))}});
  const clean={kind:'container',layout,gap,align,mobile,columns};if(node.design&&Object.keys(node.design).length){validateDesignObject(node.design,'版式容器','block');clean.design=JSON.parse(JSON.stringify(node.design));}return clean;
}
function sanitizeLayoutBlueprint(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('版式 blueprint 必须为对象');const allowed=new Set(['pageDesign','nodes','slotCount']);for(const key of Object.keys(raw))if(!allowed.has(key))throw new Error(`版式 blueprint 不支持字段 ${key}`);
  if(!Array.isArray(raw.nodes)||raw.nodes.length<1||raw.nodes.length>80)throw new Error('版式顶层节点必须为 1–80 个');const nodes=raw.nodes.map(x=>sanitizeLayoutNode(x));
  const countSlots=node=>node.kind==='slot'?1:(node.columns||[]).reduce((sum,col)=>sum+(col.nodes||[]).reduce((n,x)=>n+countSlots(x),0),0);const slotCount=nodes.reduce((sum,x)=>sum+countSlots(x),0);if(slotCount<1||slotCount>MAX_PAGE_BLOCK_NODES)throw new Error(`版式内容槽位必须为 1–${MAX_PAGE_BLOCK_NODES} 个`);
  const clean={nodes,slotCount};if(raw.pageDesign&&Object.keys(raw.pageDesign).length){validateDesignObject(raw.pageDesign,'版式页面','page');clean.pageDesign=JSON.parse(JSON.stringify(raw.pageDesign));}return clean;
}
function sanitizeLayoutAsset(data){const name=String(data?.name||'').trim();if(!name||name.length>60)throw new Error('版式名称需要 1–60 个字符');const contextType=String(data?.contextType||'page').trim().slice(0,64);const previewPreset=String(data?.previewPreset||'two-balanced');if(!LAYOUT_LIBRARY_PRESETS.has(previewPreset))throw new Error('版式预览类型不受支持');return {name,contextType,previewPreset,blueprint:sanitizeLayoutBlueprint(data?.blueprint)};}


const editorialPlanDir=process.env.V3_EDITORIAL_PLAN_DIR?path.resolve(process.env.V3_EDITORIAL_PLAN_DIR):path.join(root,'.v3-editorial-plans');
const EDITORIAL_PLAN_LIMIT=120;
const EDITORIAL_PLAN_PAGE_TYPES=new Set(['article','news','theory','safety','discipline','health']);
const EDITORIAL_PLAN_STATUSES=new Set(['planned','in-progress','done','hold']);
function editorialPlanFile(id){return path.join(editorialPlanDir,`${id}.json`)}
async function readEditorialPlan(id){
  try{const plan=await readJson(editorialPlanFile(id));return sanitizeEditorialPlan(plan,id,{preserveIds:true,updatedAt:plan.updatedAt||null})}
  catch{return {version:1,issueId:id,title:'整刊内容计划',entries:[],updatedAt:null}}
}
async function writeEditorialPlan(id,plan){await mkdir(editorialPlanDir,{recursive:true});await writeFile(editorialPlanFile(id),`${JSON.stringify(plan,null,2)}\n`,'utf8')}
function sanitizeEditorialPlan(raw,id,{preserveIds=false,updatedAt=null}={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('整刊计划必须为对象');
  const allowedTop=new Set(['version','issueId','title','entries','updatedAt']);for(const key of Object.keys(raw))if(!allowedTop.has(key))throw new Error(`整刊计划不支持字段 ${key}`);
  if(raw.issueId!=null&&String(raw.issueId)!==id)throw new Error('整刊计划 issueId 与当前期刊不一致');
  const title=String(raw.title||'整刊内容计划').trim().slice(0,80)||'整刊内容计划';
  if(!Array.isArray(raw.entries))throw new Error('整刊计划 entries 必须为数组');if(raw.entries.length>EDITORIAL_PLAN_LIMIT)throw new Error(`整刊计划最多 ${EDITORIAL_PLAN_LIMIT} 项`);
  const ids=new Set(),entries=raw.entries.map((entry,index)=>{
    if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new Error(`计划第 ${index+1} 项必须为对象`);
    const allowed=new Set(['id','title','section','pageType','pages','layoutPreset','status','notes']);for(const key of Object.keys(entry))if(!allowed.has(key))throw new Error(`计划第 ${index+1} 项不支持字段 ${key}`);
    const entryId=String(entry.id||'').trim()||(preserveIds?`plan-${index+1}`:randomUUID());if(entryId.length>80||ids.has(entryId))throw new Error(`计划第 ${index+1} 项 id 无效或重复`);ids.add(entryId);
    const entryTitle=String(entry.title||'').trim();if(!entryTitle||entryTitle.length>120)throw new Error(`计划第 ${index+1} 项标题需要 1–120 个字符`);
    const section=String(entry.section||'').trim();if(section.length>120)throw new Error(`计划第 ${index+1} 项栏目不能超过 120 个字符`);
    const pageType=String(entry.pageType||'article');if(!EDITORIAL_PLAN_PAGE_TYPES.has(pageType))throw new Error(`计划第 ${index+1} 项页面类型不受支持`);
    const pages=Number(entry.pages||1);if(!Number.isInteger(pages)||pages<1||pages>8)throw new Error(`计划第 ${index+1} 项页数必须为 1–8`);
    const layoutPreset=String(entry.layoutPreset||'single-focus');if(!LAYOUT_LIBRARY_PRESETS.has(layoutPreset))throw new Error(`计划第 ${index+1} 项版式不受支持`);
    const status=String(entry.status||'planned');if(!EDITORIAL_PLAN_STATUSES.has(status))throw new Error(`计划第 ${index+1} 项状态不受支持`);
    const notes=String(entry.notes||'').trim();if(notes.length>500)throw new Error(`计划第 ${index+1} 项备注不能超过 500 个字符`);
    return {id:entryId,title:entryTitle,section,pageType,pages,layoutPreset,status,notes};
  });
  const totalPages=entries.reduce((n,x)=>n+x.pages,0);if(totalPages>180)throw new Error('整刊计划正文页合计不能超过 180 页');
  return {version:1,issueId:id,title,entries,updatedAt:updatedAt||new Date().toISOString()};
}


const reviewWorkspaceDir=process.env.V3_REVIEW_WORKSPACE_DIR?path.resolve(process.env.V3_REVIEW_WORKSPACE_DIR):path.join(root,'.v3-review-workspaces');
const REVIEW_WORKSPACE_LIMIT=200;
const REVIEW_STATUSES=new Set(['open','reviewed','hold']);
const REVIEW_SEVERITIES=new Set(['normal','important']);
const REVIEW_SOURCES=new Set(['manual','audit']);
function reviewWorkspaceFile(id){return path.join(reviewWorkspaceDir,`${id}.json`)}
async function readReviewWorkspace(id){
  try{const data=await readJson(reviewWorkspaceFile(id));return sanitizeReviewWorkspace(data,id,{preserveIds:true,updatedAt:data.updatedAt||null})}
  catch{return {version:1,issueId:id,items:[],updatedAt:null}}
}
async function writeReviewWorkspace(id,data){await mkdir(reviewWorkspaceDir,{recursive:true});await writeFile(reviewWorkspaceFile(id),`${JSON.stringify(data,null,2)}\n`,'utf8')}
function sanitizeReviewWorkspace(raw,id,{preserveIds=false,updatedAt=null}={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('内部校审工作区必须为对象');
  const allowedTop=new Set(['version','issueId','items','updatedAt']);for(const key of Object.keys(raw))if(!allowedTop.has(key))throw new Error(`内部校审工作区不支持字段 ${key}`);
  if(raw.issueId!=null&&String(raw.issueId)!==id)throw new Error('内部校审 issueId 与当前期刊不一致');
  if(!Array.isArray(raw.items))throw new Error('内部校审 items 必须为数组');if(raw.items.length>REVIEW_WORKSPACE_LIMIT)throw new Error(`内部校审最多 ${REVIEW_WORKSPACE_LIMIT} 项`);
  const ids=new Set(),items=raw.items.map((item,index)=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error(`校审第 ${index+1} 项必须为对象`);
    const allowed=new Set(['id','title','category','severity','status','page','note','source','auditKey','auditCode','createdAt','updatedAt']);for(const key of Object.keys(item))if(!allowed.has(key))throw new Error(`校审第 ${index+1} 项不支持字段 ${key}`);
    const itemId=String(item.id||'').trim()||(preserveIds?`review-${index+1}`:randomUUID());if(itemId.length>90||ids.has(itemId))throw new Error(`校审第 ${index+1} 项 id 无效或重复`);ids.add(itemId);
    const title=String(item.title||'').trim();if(!title||title.length>120)throw new Error(`校审第 ${index+1} 项标题需要 1–120 个字符`);
    const category=String(item.category||'人工校审').trim().slice(0,60)||'人工校审';
    const severity=String(item.severity||'normal');if(!REVIEW_SEVERITIES.has(severity))throw new Error(`校审第 ${index+1} 项重要性不受支持`);
    const status=String(item.status||'open');if(!REVIEW_STATUSES.has(status))throw new Error(`校审第 ${index+1} 项状态不受支持`);
    let page=null;if(item.page!=null&&item.page!==''){page=Number(item.page);if(!Number.isInteger(page)||page<1||page>200)throw new Error(`校审第 ${index+1} 项页码必须为 1–200`);}
    const note=String(item.note||'').trim();if(note.length>1200)throw new Error(`校审第 ${index+1} 项备注不能超过 1200 个字符`);
    const source=String(item.source||'manual');if(!REVIEW_SOURCES.has(source))throw new Error(`校审第 ${index+1} 项来源不受支持`);
    const auditKey=String(item.auditKey||'').trim();if(auditKey.length>500)throw new Error(`校审第 ${index+1} 项 auditKey 过长`);
    const auditCode=String(item.auditCode||'').trim();if(auditCode.length>80)throw new Error(`校审第 ${index+1} 项 auditCode 过长`);
    const createdAt=String(item.createdAt||new Date().toISOString()).slice(0,40),itemUpdatedAt=String(item.updatedAt||new Date().toISOString()).slice(0,40);
    return {id:itemId,title,category,severity,status,page,note,source,auditKey,auditCode,createdAt,updatedAt:itemUpdatedAt};
  });
  return {version:1,issueId:id,items,updatedAt:updatedAt||new Date().toISOString()};
}


const reviewHandoffDir=process.env.V3_REVIEW_HANDOFF_DIR?path.resolve(process.env.V3_REVIEW_HANDOFF_DIR):path.join(root,'.v3-review-handoffs');
const REVIEW_HANDOFF_LIMIT=80;
const REVIEW_HANDOFF_STATUSES=new Set(['draft','handed_off','accepted','returned']);
const REVIEW_HANDOFF_ROLES=new Set(['editor','reviewer','approver','other']);
function reviewHandoffFile(id){return path.join(reviewHandoffDir,`${id}.json`)}
async function readReviewHandoffs(id){
  try{const data=await readJson(reviewHandoffFile(id));return sanitizeReviewHandoffs(data,id,{preserveIds:true,updatedAt:data.updatedAt||null})}
  catch{return {version:1,issueId:id,handoffs:[],updatedAt:null}}
}
async function writeReviewHandoffs(id,data){await mkdir(reviewHandoffDir,{recursive:true});await writeFile(reviewHandoffFile(id),`${JSON.stringify(data,null,2)}\n`,'utf8')}
function sanitizeReviewHandoffs(raw,id,{preserveIds=false,updatedAt=null}={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('校审交接记录必须为对象');
  const allowedTop=new Set(['version','issueId','handoffs','updatedAt']);for(const key of Object.keys(raw))if(!allowedTop.has(key))throw new Error(`校审交接记录不支持字段 ${key}`);
  if(raw.issueId!=null&&String(raw.issueId)!==id)throw new Error('校审交接 issueId 与当前期刊不一致');
  if(!Array.isArray(raw.handoffs))throw new Error('校审交接 handoffs 必须为数组');if(raw.handoffs.length>REVIEW_HANDOFF_LIMIT)throw new Error(`校审交接最多 ${REVIEW_HANDOFF_LIMIT} 轮`);
  const ids=new Set(),rounds=new Set(),handoffs=raw.handoffs.map((item,index)=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error(`交接第 ${index+1} 项必须为对象`);
    const allowed=new Set(['id','round','title','recipient','role','status','note','decisionNote','requiredItems','baselineSnapshot','diffReviewedAt','diffReviewedFingerprint','createdAt','updatedAt','handedOffAt','acceptedAt','returnedAt']);for(const key of Object.keys(item))if(!allowed.has(key))throw new Error(`交接第 ${index+1} 项不支持字段 ${key}`);
    const handoffId=String(item.id||'').trim()||(preserveIds?`handoff-${index+1}`:randomUUID());if(handoffId.length>90||ids.has(handoffId))throw new Error(`交接第 ${index+1} 项 id 无效或重复`);ids.add(handoffId);
    const round=Number(item.round||index+1);if(!Number.isInteger(round)||round<1||round>50||rounds.has(round))throw new Error(`交接第 ${index+1} 项轮次必须为 1–50 且不能重复`);rounds.add(round);
    const title=String(item.title||`第 ${round} 轮校审交接`).trim();if(!title||title.length>120)throw new Error(`交接第 ${index+1} 项标题需要 1–120 个字符`);
    const recipient=String(item.recipient||'').trim();if(!recipient||recipient.length>80)throw new Error(`交接第 ${index+1} 项接收人需要 1–80 个字符`);
    const role=String(item.role||'reviewer');if(!REVIEW_HANDOFF_ROLES.has(role))throw new Error(`交接第 ${index+1} 项角色不受支持`);
    const status=String(item.status||'draft');if(!REVIEW_HANDOFF_STATUSES.has(status))throw new Error(`交接第 ${index+1} 项状态不受支持`);
    const note=String(item.note||'').trim();if(note.length>1600)throw new Error(`交接第 ${index+1} 项说明不能超过 1600 个字符`);
    const decisionNote=String(item.decisionNote||'').trim();if(decisionNote.length>1600)throw new Error(`交接第 ${index+1} 项签收说明不能超过 1600 个字符`);
    if(!Array.isArray(item.requiredItems))throw new Error(`交接第 ${index+1} 项 requiredItems 必须为数组`);if(item.requiredItems.length>200)throw new Error(`交接第 ${index+1} 项最多快照 200 个校审问题`);
    const reqIds=new Set(),requiredItems=item.requiredItems.map((req,ri)=>{
      if(!req||typeof req!=='object'||Array.isArray(req))throw new Error(`交接第 ${index+1} 项问题快照 ${ri+1} 必须为对象`);
      const allowedReq=new Set(['id','title','page','severity']);for(const key of Object.keys(req))if(!allowedReq.has(key))throw new Error(`交接第 ${index+1} 项问题快照不支持字段 ${key}`);
      const rid=String(req.id||'').trim();if(!rid||rid.length>90||reqIds.has(rid))throw new Error(`交接第 ${index+1} 项问题快照 id 无效或重复`);reqIds.add(rid);
      const rtitle=String(req.title||'').trim();if(!rtitle||rtitle.length>120)throw new Error(`交接第 ${index+1} 项问题快照标题需要 1–120 个字符`);
      let page=null;if(req.page!=null&&req.page!==''){page=Number(req.page);if(!Number.isInteger(page)||page<1||page>200)throw new Error(`交接第 ${index+1} 项问题快照页码必须为 1–200`);}
      const severity=String(req.severity||'normal');if(!REVIEW_SEVERITIES.has(severity))throw new Error(`交接第 ${index+1} 项问题快照重要性不受支持`);
      return {id:rid,title:rtitle,page,severity};
    });
    const cleanTime=value=>value?String(value).slice(0,40):null;
    let baselineSnapshot=null;if(item.baselineSnapshot!=null){if(!item.baselineSnapshot||typeof item.baselineSnapshot!=='object'||Array.isArray(item.baselineSnapshot))throw new Error(`交接第 ${index+1} 项 baselineSnapshot 必须为对象`);const allowedBaseline=new Set(['id','createdAt','issueSha256']);for(const key of Object.keys(item.baselineSnapshot))if(!allowedBaseline.has(key))throw new Error(`交接第 ${index+1} 项 baselineSnapshot 不支持字段 ${key}`);const bid=String(item.baselineSnapshot.id||'').trim();if(!bid||bid.length>120||bid.includes('/')||bid.includes('\\'))throw new Error(`交接第 ${index+1} 项 baselineSnapshot.id 无效`);const bsha=String(item.baselineSnapshot.issueSha256||'').trim();if(bsha&&!/^[0-9a-f]{64}$/i.test(bsha))throw new Error(`交接第 ${index+1} 项 baselineSnapshot.issueSha256 无效`);baselineSnapshot={id:bid,createdAt:cleanTime(item.baselineSnapshot.createdAt),issueSha256:bsha||null};}
    const diffReviewedAt=cleanTime(item.diffReviewedAt),diffReviewedFingerprint=String(item.diffReviewedFingerprint||'').trim();if(diffReviewedFingerprint&&(!/^[0-9a-f]{8}$/i.test(diffReviewedFingerprint)))throw new Error(`交接第 ${index+1} 项 diffReviewedFingerprint 无效`);
    return {id:handoffId,round,title,recipient,role,status,note,decisionNote,requiredItems,baselineSnapshot,diffReviewedAt,diffReviewedFingerprint:diffReviewedFingerprint||null,createdAt:cleanTime(item.createdAt)||new Date().toISOString(),updatedAt:cleanTime(item.updatedAt)||new Date().toISOString(),handedOffAt:cleanTime(item.handedOffAt),acceptedAt:cleanTime(item.acceptedAt),returnedAt:cleanTime(item.returnedAt)};
  });
  return {version:1,issueId:id,handoffs,updatedAt:updatedAt||new Date().toISOString()};
}

const userTemplateFile=process.env.V3_TEMPLATE_LIBRARY_FILE?path.resolve(process.env.V3_TEMPLATE_LIBRARY_FILE):path.join(root,'.v3-templates','page-templates.json');
async function readUserTemplates(){try{const rows=await readJson(userTemplateFile);return Array.isArray(rows)?rows:[]}catch{return []}}
async function writeUserTemplates(rows){await mkdir(path.dirname(userTemplateFile),{recursive:true});await writeFile(userTemplateFile,`${JSON.stringify(rows,null,2)}\n`,'utf8')}
function sanitizeTemplateBlock(block,index=0){
  const b=JSON.parse(JSON.stringify(block));validateBlock(b,0,index);
  if(b.type==='container'){b.columns=(b.columns||[]).map((col,ci)=>({blocks:(col.blocks||[]).map((child,bi)=>sanitizeTemplateBlock(child,bi+ci*20))}));return b;}
  if(b.type==='image')return {...b,src:'',caption:b.caption||'',alt:b.alt||'请填写图片说明'};
  if(b.type==='video')return {...b,src:'',poster:'',caption:b.caption||'请绑定视频资源'};
  if(b.type==='articleLink')return {...b,articleId:''};if(b.type==='toc')return {...b,items:[]};return b;
}
function sanitizeTemplatePage(page){
  const clean={type:page?.type||'article',navTitle:String(page?.navTitle||page?.title||'我的模板').slice(0,120),title:String(page?.title||page?.navTitle||'我的模板').slice(0,120),kicker:String(page?.kicker||'').slice(0,120),section:String(page?.section||'').slice(0,120),blocks:(page?.blocks||[]).slice(0,MAX_BLOCKS_PER_PAGE).map((b,i)=>sanitizeTemplateBlock(b,i))};
  if(page?.design&&Object.keys(page.design).length){validateDesignObject(page.design,'我的模板页面','page');clean.design=JSON.parse(JSON.stringify(page.design));delete clean.design.backgroundImage;}
  return clean;
}
function structureSkeleton(source,target){
  const pages=(source.pages||[]).filter(p=>!['cover','toc','closing'].includes(p.type)).map((p,i)=>({
    type:p.type||'article',navTitle:String(p.navTitle||p.section||`栏目 ${i+1}`).slice(0,120),title:`${String(p.section||p.navTitle||`栏目 ${i+1}`).slice(0,100)} · 待编辑`,kicker:String(p.kicker||'').slice(0,120),section:String(p.section||'').slice(0,120),blocks:(p.blocks||[]).map(b=>cloneBlockStructure(b,target)).slice(0,MAX_BLOCKS_PER_PAGE)
  }));
  return pages;
}
function importOptions(u){const structureMode=String(u.searchParams.get('structureMode')||'auto');return {targetChars:Number(u.searchParams.get('targetChars')||760),pageType:String(u.searchParams.get('pageType')||'article'),section:String(u.searchParams.get('section')||'').slice(0,120),kicker:String(u.searchParams.get('kicker')||'').slice(0,120),structureMode:['auto','periodical','article'].includes(structureMode)?structureMode:'auto'}}

async function readPublicationAudit(id,{refresh=true,strict=false}={}){
  const reportFile=path.join(root,'reports',`v3-release-audit-${id}.json`);let runResult=null;
  if(refresh){const argv=['--issue',id,'--quiet'];if(strict)argv.push('--strict');runResult=await runScriptAsync('audit-v3.mjs',argv);}
  let report=null;try{report=await readJson(reportFile)}catch{}
  return {run:runResult,report,audit:report?.issues?.[0]||null};
}
async function publicationStatus(id,{refreshAudit=true}={}){
  const issue=await readJson(path.join(root,'issues',id,'issue.json'));const {audit,run}=await readPublicationAudit(id,{refresh:true,strict:true});const evidence=await readPublicationEvidence(id);const status=buildPublicationStatus(issue,audit,evidence);
  return {...status,auditRun:{strict:true,ok:Boolean(run?.ok),checkedAt:new Date().toISOString()},exportCapabilities:publicationExportCapabilities(),publicShare:{configured:Boolean(publicMagazineRoot&&publicMagazineBaseUrl),url:publicMagazineBaseUrl?`${publicMagazineBaseUrl}/${publicIssuePath(id)}/`:null,archiveUrl:publicMagazineBaseUrl?`${publicMagazineBaseUrl}/`:null},publicDeployment:evidence.publicDeployment||null};
}
function publicIssuePath(id){const raw=String(id||'').trim();const n=Number(raw);return Number.isInteger(n)&&n>0?String(n).padStart(2,'0'):raw;}
function publicIssueUrl(id){return publicMagazineBaseUrl?`${publicMagazineBaseUrl}/${publicIssuePath(id)}/`:null;}
function legacyIssuePath(id){const raw=String(id||'').trim();return /^\d+$/.test(raw)?raw:'';}
function legacyIssueRedirectHtml(remotePath){
  const target=`../${remotePath}/`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=${target}"><title>正在前往期刊</title><script>location.replace(${JSON.stringify(target)})</script></head><body><p>正在前往新版期刊… <a href="${target}">继续</a></p></body></html>`;
}
async function ensureLegacyPublicRoute(id,remotePath){
  const legacyPath=legacyIssuePath(id);
  if(!legacyPath||legacyPath===remotePath)return {created:false,legacyPath:null,reason:'not-needed'};
  const legacyDir=path.join(publicMagazineRoot,legacyPath);
  if(await exists(legacyDir))return {created:false,legacyPath,reason:'existing-path'};
  await mkdir(legacyDir,{recursive:true});
  await atomicPublicWrite(path.join(legacyDir,'index.html'),legacyIssueRedirectHtml(remotePath));
  return {created:true,legacyPath,legacyDir};
}
async function readDeployedPublicCatalog(){
  if(!publicMagazineRoot||!(await exists(publicMagazineRoot)))return [];
  const rows=[];
  for(const entry of await readdir(publicMagazineRoot,{withFileTypes:true})){
    if(!entry.isDirectory()||entry.name.startsWith('.')||!/^[a-zA-Z0-9._-]+$/.test(entry.name))continue;
    try{
      const issue=await readJson(path.join(publicMagazineRoot,entry.name,'issue.json'));
      if(issue.engine!=='v3'||issue.status!=='published')continue;
      rows.push({id:issue.id||entry.name,label:issue.label||issue.id||entry.name,publication:issue.publication||'',subtitle:issue.subtitle||'',engine:'v3',status:'published',href:`./${entry.name}/`,legacyPath:null,pageCount:Array.isArray(issue.pages)?issue.pages.length:null});
    }catch{}
  }
  // 兼容旧的安全部署目录：历史 Reader 可能没有随包携带 issue.json，
  // 但只要 catalog 中的目标目录仍存在，就保留它，避免新一期发布时丢失旧入口。
  try{
    const previous=await readJson(path.join(publicMagazineRoot,'catalog.json'));const known=new Set(rows.map(x=>String(x.id)));
    for(const item of Array.isArray(previous)?previous:[]){
      const id=String(item?.id||'');if(!id||known.has(id))continue;const legacy=path.join(publicMagazineRoot,publicIssuePath(id));if(!(await exists(legacy)))continue;
      rows.push({...item,id,href:`./${publicIssuePath(id)}/`,status:'published'});known.add(id);
    }
  }catch{}
  return rows.sort((a,b)=>String(b.id).localeCompare(String(a.id),'zh-CN'));
}
async function atomicPublicWrite(file,content){
  const token=`${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;const temp=`${file}.tmp-${token}`,backup=`${file}.previous-${token}`;const had=await exists(file);await writeFile(temp,content,'utf8');
  try{if(had)await rename(file,backup);await rename(temp,file);if(had)await rm(backup,{force:true});}
  catch(error){await rm(temp,{force:true}).catch(()=>{});if(had&&await exists(backup)&&!(await exists(file)))await rename(backup,file).catch(()=>{});throw error;}
}
async function verifyPublicDeployment(id){
  const url=publicIssueUrl(id);if(!url)return {ok:false,configured:false,error:'服务器未配置 V3_PUBLIC_MAGAZINE_BASE_URL'};
  const result={ok:false,configured:true,url,checkedAt:new Date().toISOString(),pageStatus:null,issueStatus:null,title:null};
  try{
    const page=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(12000)});result.pageStatus=page.status;const html=await page.text();const title=html.match(/<title[^>]*>([^<]*)<\/title>/i);result.title=title?.[1]?.trim()||null;
    const meta=await fetch(`${url}issue.json`,{redirect:'error',signal:AbortSignal.timeout(12000)});result.issueStatus=meta.status;const issue=meta.ok?await meta.json():null;result.ok=Boolean(page.ok&&meta.ok&&issue?.id===id&&issue?.status==='published'&&html.includes('reader.js'));
    if(!result.ok)result.error='公开 Reader 或 issue.json 校验未通过';
  }catch(error){result.error=error?.message||String(error);}
  return result;
}
async function syncPublishedReaderRuntime(sourceDir,excludeId=''){
  const runtimeFiles=['index.html','reader.css','reader.js','rich-text.js','layout-engine.js'];
  for(const name of runtimeFiles)if(!(await exists(path.join(sourceDir,name))))throw new Error(`公开 Reader 运行时缺少 ${name}`);
  const synced=[];const entries=await readdir(publicMagazineRoot,{withFileTypes:true});
  for(const entry of entries){
    if(!entry.isDirectory()||entry.name.startsWith('.'))continue;
    const targetDir=path.join(publicMagazineRoot,entry.name);if(path.resolve(targetDir)===path.resolve(sourceDir))continue;
    let meta;try{meta=await readJson(path.join(targetDir,'issue.json'));}catch{continue;}
    if(meta?.engine!=='v3'||meta?.status!=='published'||String(meta.id||'')===String(excludeId))continue;
    for(const name of runtimeFiles)await cp(path.join(sourceDir,name),path.join(targetDir,name));
    const vendor=path.join(sourceDir,'vendor');if(await exists(vendor))await cp(vendor,path.join(targetDir,'vendor'),{recursive:true});
    synced.push(meta.id||entry.name);
  }
  return {ok:true,source:sourceDir,synced};
}
async function deployPublicIssue(id){
  if(!publicMagazineRoot)throw new Error('服务器未配置 V3_PUBLIC_MAGAZINE_ROOT，暂不能部署到公开网站');
  if(!publicMagazineBaseUrl)throw new Error('服务器未配置 V3_PUBLIC_MAGAZINE_BASE_URL，暂不能生成可分享链接');
  if(path.parse(publicMagazineRoot).root===publicMagazineRoot)throw new Error('拒绝把文件系统根目录作为公开部署目标');
  const source=path.join(root,'release-v3',id);if(!(await exists(source)))throw new Error(`正式发布包不存在：release-v3/${id}`);
  const releaseMeta=await readJson(path.join(source,'release.json'));if(releaseMeta.version!==V3_VERSION||releaseMeta.issue!==id||releaseMeta.sourceStatus!=='published')throw new Error('正式发布包不是当前已发布版本，不能生成公开分享链接');
  const sourceIntegrity=await verifyIntegrity(source);if(!sourceIntegrity.ok)throw new Error(`正式发布包完整性失败：${sourceIntegrity.errors.join('；')}`);
  await mkdir(publicMagazineRoot,{recursive:true});const remotePath=publicIssuePath(id),target=path.join(publicMagazineRoot,remotePath),control=path.join(publicMagazineRoot,'.v3-deployments'),token=`${new Date().toISOString().replace(/[:.]/g,'-')}-${process.pid}`;const backupDir=path.join(control,'backups',id,token),receiptDir=path.join(control,'receipts'),staging=path.join(publicMagazineRoot,`.${remotePath}.staging-${token}`);await mkdir(path.join(backupDir,'root'),{recursive:true});await mkdir(receiptDir,{recursive:true});await rm(staging,{recursive:true,force:true});await cp(source,staging,{recursive:true});const staged=await verifyIntegrity(staging);if(!staged.ok){await rm(staging,{recursive:true,force:true});throw new Error(`公开部署暂存完整性失败：${staged.errors.join('；')}`);}
  const rootFiles=['index.html','catalog.json','deploy-manifest.json'],rootState=rootFiles.map(name=>({name,existed:false}));const previousExisted=await exists(target);let targetSwapped=false,legacyRoute=null;
  try{
    if(previousExisted)await rename(target,path.join(backupDir,'issue'));
    await rename(staging,target);targetSwapped=true;const readerRuntime=await syncPublishedReaderRuntime(target,id);
    const catalog=await readDeployedPublicCatalog();const deployedAt=new Date().toISOString();const publicManifest={version:V3_VERSION,issue:id,deployedAt,source:`release-v3/${id}/`,remotePath,treeSha256:staged.manifest?.treeSha256||null,archiveRoot:publicMagazineBaseUrl,readerRuntime};
    const rootPayload={'index.html':buildArchiveHtml(catalog,{subtitle:'公开阅读 · 已发布期刊归档'}),'catalog.json':`${JSON.stringify(catalog,null,2)}\n`,'deploy-manifest.json':`${JSON.stringify(publicManifest,null,2)}\n`};
    for(const name of rootFiles){const file=path.join(publicMagazineRoot,name);const existed=await exists(file);rootState.find(x=>x.name===name).existed=existed;if(existed)await cp(file,path.join(backupDir,'root',name));await atomicPublicWrite(file,rootPayload[name]);}
    legacyRoute=await ensureLegacyPublicRoute(id,remotePath);
    const verification=await verifyPublicDeployment(id);const deployment={kind:'public',version:V3_VERSION,issue:id,remotePath,publicRoot:publicMagazineRoot,url:publicIssueUrl(id),archiveUrl:publicMagazineBaseUrl,deployedAt,treeSha256:staged.manifest?.treeSha256||null,verification,verified:Boolean(verification.ok),legacyRoute:legacyRoute?.legacyPath||null,backupDir:path.relative(root,backupDir).replaceAll('\\','/')};
    const receiptFile=path.join(receiptDir,`${id}-${token}.json`);await writeFile(receiptFile,`${JSON.stringify(deployment,null,2)}\n`,'utf8');await writeFile(path.join(receiptDir,`${id}-latest.json`),`${JSON.stringify(deployment,null,2)}\n`,'utf8');await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,'reports',`v3-public-deployment-${id}.json`),`${JSON.stringify({...deployment,receiptFile:path.relative(root,receiptFile).replaceAll('\\','/')},null,2)}\n`,'utf8');await writePublicationEvidence(id,{publicDeployment:deployment,outputs:{public:deployment}});return deployment;
  }catch(error){
    await rm(staging,{recursive:true,force:true}).catch(()=>{});if(targetSwapped)await rm(target,{recursive:true,force:true}).catch(()=>{});if(legacyRoute?.created)await rm(legacyRoute.legacyDir,{recursive:true,force:true}).catch(()=>{});if(previousExisted&&await exists(path.join(backupDir,'issue')))await rename(path.join(backupDir,'issue'),target).catch(()=>{});for(const row of rootState){const file=path.join(publicMagazineRoot,row.name),backup=path.join(backupDir,'root',row.name);if(row.existed&&await exists(backup))await cp(backup,file).catch(()=>{});else if(!row.existed)await rm(file,{force:true}).catch(()=>{});}throw error;
  }
}
async function ensurePublicationWeb(id){
  const build=await runScriptAsync('build-v3.mjs',['--issue',id]);if(!build.ok)throw new Error(build.output||'Web Reader 构建失败');
  const source=path.join(root,'dist-v3',id);if(!(await exists(path.join(source,'index.html'))))throw new Error(`构建产物不存在：dist-v3/${id}`);
  const target=path.join(PUBLICATION_OUTPUT_ROOT,id,'web');await rm(target,{recursive:true,force:true});await mkdir(path.dirname(target),{recursive:true});await cp(source,target,{recursive:true});
  const manifest={kind:'web',generatedAt:new Date().toISOString(),path:path.relative(root,target).replaceAll('\\','/'),url:`/publication-output/${id}/web/index.html`};await writePublicationEvidence(id,{outputs:{web:manifest}});return manifest;
}
function printEsc(v=''){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));}
async function publicationPrintFixture(id){
  const issue=await readJson(path.join(root,'issues',id,'issue.json'));const printImages=new Map(),assetRoot=issueAssetRoot(issue,id);
  for(const ref of collectReferencedAssets(issue).filter(x=>x.kind==='image')){
    const file=path.resolve(assetRoot,stripAssetsPrefix(ref.path));
    if(!file.startsWith(path.resolve(assetRoot)+path.sep))throw publicationFailure('PDF_IMAGE_INVALID','图片路径超出本期期刊资源目录',['请重新选择本期图片后导出。']);
    const mime=({'.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'})[path.extname(file).toLowerCase()];
    if(!mime)throw publicationFailure('PDF_IMAGE_INVALID',`PDF 暂不支持图片格式：${ref.path}`,['请将图片转成 PNG、JPEG、WebP 或 SVG 后导出。']);
    let bytes;try{const info=await stat(file);if(info.size>20*MiB)throw new Error('超过 20MB');bytes=await readFile(file)}catch(e){throw publicationFailure('PDF_IMAGE_UNAVAILABLE',`图片不可用：${ref.path}`,['请补齐图片或将其压缩到 20MB 以内后重试。']);}
    printImages.set(stripAssetsPrefix(ref.path),`data:${mime};base64,${bytes.toString('base64')}`);
  }
  const plan=buildPublishingPlan(issue);const articles=issue.articles&&typeof issue.articles==='object'?issue.articles:{};
  const generic=v=>{if(v==null)return '';if(typeof v==='string'||typeof v==='number')return `<p>${printEsc(v)}</p>`;if(Array.isArray(v))return `<ul>${v.map(x=>`<li>${printEsc(typeof x==='object'?(x.text||x.title||''):x)}</li>`).join('')}</ul>`;return `<p>${printEsc(v.text||v.title||v.caption||'')}</p>`;};
  const renderBlock=(b,pi,bi)=>{if(!b||typeof b!=='object')return '';const t=b.type||'paragraph',pub=normalizeBlockPublishing(b);const cls=['print-block',`print-${t}`,pub.keepWithNext?'keep-next':'',pub.avoidBreak?'avoid-break':'',pub.dropCap?'drop-cap':'',pub.spanAll?'span-all':'',pub.wrap!=='none'?`wrap-${pub.wrap}`:'',pub.role!=='body'?`role-${pub.role}`:''].filter(Boolean).join(' ');let body='';
    if(t==='paragraph'||t==='heading'||t==='textFlow'){const doc=t==='textFlow'?flowFragmentFor(plan,b,{pageIndex:pi,blockIndex:bi}):normalizeRichText(b.richText,b.text||b.title||'');body=t==='heading'&&!b.richText?`<h2>${printEsc(b.text||b.title||'')}</h2>`:renderRichText(doc);}
    else if(t==='quote'||t==='pullQuote')body=`<blockquote>${printEsc(b.text||b.quote||'')}</blockquote>`;
    else if(t==='sectionHeading')body=`<h2>${printEsc(b.text||b.title||'')}</h2>`;
    else if(t==='sidebar')body=`<aside><strong>${printEsc(b.title||'延伸阅读')}</strong>${b.richText?renderRichText(b.richText):`<p>${printEsc(b.text||'')}</p>`}</aside>`;
    else if(t==='cardline')body=`<div class="cardline"><span>${printEsc(b.badge||'')}</span><h3>${printEsc(b.title||'')}</h3><p>${printEsc(b.text||'')}</p></div>`;
    else if(t==='chips')body=`<ul class="chips">${(b.items||[]).map(x=>`<li>${printEsc(x?.text??x)}</li>`).join('')}</ul>`;
    else if(t==='toc')body=`<ol class="toc">${(b.items||[]).map(x=>`<li><span>${printEsc(x.number||'')}</span><strong>${printEsc(x.title||'')}</strong><small>${printEsc(x.subtitle||'')}</small><b>${printEsc(x.page||'')}</b></li>`).join('')}</ol>`;
    else if(t==='articleLink'){const a=articles[b.articleId]||{};body=`<article><h3>${printEsc(a.title||b.title||'延伸阅读')}</h3>${a.subtitle?`<p class="muted">${printEsc(a.subtitle)}</p>`:''}${(a.paras||[]).map(x=>`<p>${printEsc(x)}</p>`).join('')}</article>`;}
    else if(t==='table'){const rows=(b.rows||[]).slice(0,40),heads=Math.max(0,Math.min(rows.length,Number(b.headerRows)||0));body=`<figure class="print-table"><table>${rows.map((r,ri)=>`<tr>${(r||[]).slice(0,12).map(c=>ri<heads?`<th>${printEsc(c)}</th>`:`<td>${printEsc(c)}</td>`).join('')}</tr>`).join('')}</table>${b.caption?`<figcaption>${printEsc(b.caption)}</figcaption>`:''}</figure>`;}
    else if(t==='image')body=`<figure><div class="media-placeholder">图片</div>${b.caption?`<figcaption>${printEsc(pub.captionLabel?`${pub.captionLabel} ${b.caption}`:b.caption)}</figcaption>`:''}</figure>`;
    else if(t==='video')body=`<figure><div class="media-placeholder">视频内容 · 请在 Web Reader 中播放</div>${b.caption?`<figcaption>${printEsc(b.caption)}</figcaption>`:''}</figure>`;
    else if(t==='container')body=`<div class="print-container">${(b.columns||[]).map(col=>`<div>${(col.blocks||[]).map((x,i)=>renderBlock(x,pi,bi*100+i)).join('')}</div>`).join('')}</div>`;
    else if(t==='casePair')body=`<div class="case-pair">${generic(b.left||b.a)}${generic(b.right||b.b)}</div>`;
    else if(t==='cards')body=`<div class="cards">${(b.items||[]).map(x=>`<section><h3>${printEsc(x.title||'')}</h3><p>${printEsc(x.text||x.body||'')}</p></section>`).join('')}</div>`;
    else if(t==='coverSections')body=`<ul class="cover-sections">${(b.items||[]).map(x=>`<li>${printEsc(x)}</li>`).join('')}</ul>`;
    else if(['coverMeta','blessing','producer'].includes(t))body=`<p class="${t}">${printEsc(b.text||b.title||'')}</p>`;else body=generic(b.text||b.items||b);
    return `<div class="${cls}"${pub.wrap!=='none'?` style="--wrap-width:${pub.wrapWidth}%"`:''}>${body}</div>`;};
  const pages=(issue.pages||[]).map((p,pi)=>{const pub=normalizePagePublishing(p),cols=pub.columns>1?`column-count:${pub.columns};column-gap:${pub.columnGap}px;column-fill:${pub.balanceColumns?'balance':'auto'};${pub.columnRule?'column-rule:1px solid #d8c7b5;':''}`:'';const head=p.type==='cover'?`<div class="cover-title"><p>${printEsc(issue.publication||'电子期刊')}</p><h1>${printEsc(issue.label||p.title||'')}</h1><small>${printEsc(issue.subtitle||'')}</small></div>`:`<header>${p.kicker?`<p>${printEsc(p.kicker)}</p>`:''}<h1>${printEsc(p.title||p.navTitle||'')}</h1>${p.section?`<small>${printEsc(p.section)}</small>`:''}</header>`;return `<section class="print-page">${head}<main class="page-body" style="${cols}">${(p.blocks||[]).map((b,i)=>renderBlock(b,pi,i)).join('')}</main><footer>${printEsc(issue.label||issue.publication||'')} · ${pi+1}</footer></section>`;}).join('');
  const css=`@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#ddd;color:#2d2621;font-family:"Noto Serif CJK SC","Source Han Serif SC","Songti SC",serif}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.print-page{width:210mm;height:297mm;background:#fff;padding:18mm 17mm 15mm;overflow:hidden;position:relative;break-after:page}.print-page:last-child{break-after:auto}.print-page header{border-bottom:1px solid #d8c7b5;padding-bottom:5mm;margin-bottom:6mm}.print-page header p{margin:0 0 2mm;color:#9a6647;font-size:10pt}.print-page h1{font-size:22pt;line-height:1.28;margin:0 0 2mm}.cover-title{height:58mm;display:flex;flex-direction:column;justify-content:center;border-bottom:2px solid #9b6546;margin-bottom:8mm}.cover-title h1{font-size:34pt;margin:4mm 0}.page-body{overflow-wrap:anywhere;font-size:11.2pt;line-height:1.75;orphans:2;widows:2}.page-body p{margin:0 0 3.4mm;text-align:justify}.page-body h2{font-size:18pt;margin:5mm 0 3mm}.page-body h3{font-size:13.5pt;margin:3mm 0 2mm}.avoid-break,.role-pullQuote,.role-sidebar,figure,.cardline,.cards>section{break-inside:avoid}.keep-next{break-after:avoid}.span-all{column-span:all}.drop-cap p:first-child:first-letter{float:left;font-size:3.2em;line-height:.86;padding:.06em .12em 0 0;color:#9b6546}.wrap-left{float:left;width:var(--wrap-width);margin:0 5mm 3mm 0}.wrap-right{float:right;width:var(--wrap-width);margin:0 0 3mm 5mm}blockquote{margin:4mm 0;padding:4mm 5mm;border-left:3px solid #b87951;background:#f7f1eb;font-size:13pt}.role-pullQuote blockquote{font-size:17pt;text-align:center;border-left:0;border-top:1px solid #b87951;border-bottom:1px solid #b87951;background:transparent}.role-sidebar aside,.print-sidebar aside{padding:4mm;background:#f4efe9;border:1px solid #dccbbb}.cardline{padding:4mm;margin-bottom:3mm;background:#faf7f3;border:1px solid #e2d6c9}.cardline>span{display:inline-block;background:#9b6546;color:#fff;border-radius:99px;padding:0 2mm}.chips,.cover-sections{display:flex;gap:2mm;flex-wrap:wrap;list-style:none;padding:0}.chips li,.cover-sections li{padding:1.5mm 3mm;background:#f1e8df;border-radius:99px}.toc{list-style:none;padding:0}.toc li{display:grid;grid-template-columns:12mm 1fr 12mm;gap:2mm;padding:3mm 0;border-bottom:1px solid #eadfd4}.toc small{grid-column:2;color:#84766d}.toc b{text-align:right;grid-column:3;grid-row:1/3}.article{padding:4mm 0}.muted{color:#81736a;font-size:9.5pt}.print-image{display:block;width:100%;max-height:72mm;object-fit:contain}figure{margin:4mm 0}.media-placeholder{height:42mm;display:flex;align-items:center;justify-content:center;background:#eee7e0;color:#76685f;border:1px dashed #baa895}figcaption{text-align:center;color:#71645b;font-size:9pt;margin-top:2mm}.print-container,.case-pair,.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5mm}.producer,.blessing{text-align:center;font-weight:700;color:#8e5d40}footer{position:absolute;bottom:7mm;left:17mm;right:17mm;text-align:center;color:#9a8b80;font-size:8.5pt}@media print{html,body{background:#fff}}`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${printEsc(issue.label||id)} · Print</title><style>${css}</style></head><body>${pages}<script>window.__V3_PRINT_READY__=true</script></body></html>`;
}
// The compatibility implementation above remains as a fallback for old
// deployments. These final handlers are intentionally declared later so the
// current server never depends on xvfb-run or the system zip executable.
async function generatePublicationPdf(id){
  await ensurePublicationWeb(id);
  const chromium=findChromium();
  if(!chromium)throw publicationFailure('PDF_CHROMIUM_MISSING','未找到 Chromium，无法生成 Print PDF。',['请安装 Chromium 或配置 CHROMIUM=/可执行文件路径。','Web Reader、正式发布和 ZIP 归档不受影响。']);
  const dir=path.join(PUBLICATION_OUTPUT_ROOT,id),file=path.join(dir,`${id}-print.pdf`);
  await mkdir(dir,{recursive:true});const stagingFile=path.join(dir,`.${id}-print-${randomUUID()}.pdf`);
  const fixture=await publicationPrintFixture(id),userDataDir=await mkdtemp(path.join(os.tmpdir(),'jinchang-pdf-')),debugPort=13200+Math.floor(Math.random()*500);
  let chrome=null,ws=null;const pending=new Map();let seq=0;
  const cdpSend=(method,params={},timeoutMs=15000)=>new Promise((resolve,reject)=>{const requestId=++seq;pending.set(requestId,{resolve,reject});ws.send(JSON.stringify({id:requestId,method,params}));setTimeout(()=>{const p=pending.get(requestId);if(p){pending.delete(requestId);reject(publicationFailure('PDF_CDP_TIMEOUT',`CDP ${method} 超时`,['请检查服务器资源或稍后重试。']))}},timeoutMs)});
  try{
    let spawnError=null;
    chrome=spawn(chromium,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-allow-origins=*',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${userDataDir}`,'--no-first-run','about:blank'],{stdio:'ignore',detached:true,env:{...process.env,HOME:userDataDir,XDG_CONFIG_HOME:path.join(userDataDir,'config'),XDG_CACHE_HOME:path.join(userDataDir,'cache')}});
    chrome.once('error',error=>{spawnError=error});
    let tabs=null;for(let i=0;i<100;i++){if(spawnError)break;try{const response=await fetch(`http://127.0.0.1:${debugPort}/json/list`);if(response.ok){tabs=await response.json();if(tabs?.length)break}}catch{}await new Promise(resolve=>setTimeout(resolve,80));}
    if(spawnError)throw publicationFailure('PDF_CHROMIUM_START_FAILED',`Chromium 启动失败：${spawnError.message||spawnError}`,['请确认 CHROMIUM 指向可执行文件，并检查执行权限。','Web Reader、正式发布和 ZIP 归档不受影响。']);
    if(!tabs?.length)throw publicationFailure('PDF_CHROMIUM_START_FAILED','Chromium 未能启动 PDF 调试端口。',['请确认服务器 Chromium 可执行并允许无头模式运行。']);
    const tab=tabs.find(item=>item.type==='page')||tabs[0];ws=new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(publicationFailure('PDF_CDP_TIMEOUT','连接 Chromium CDP 超时',['请检查服务器资源或稍后重试。'])),8000);ws.onopen=()=>{clearTimeout(timer);resolve()};ws.onerror=()=>{clearTimeout(timer);reject(publicationFailure('PDF_CDP_FAILED','连接 Chromium CDP 失败',['请检查服务器 Chromium 版本和无头运行权限。']))}});
    ws.onmessage=event=>{const message=JSON.parse(event.data);if(!message.id)return;const request=pending.get(message.id);if(!request)return;pending.delete(message.id);message.error?request.reject(new Error(message.error.message)):request.resolve(message.result)};
    await cdpSend('Page.enable');const tree=await cdpSend('Page.getFrameTree');await cdpSend('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:fixture});
    const readiness=await cdpSend('Runtime.evaluate',{expression:`(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode()));const pages=[...document.querySelectorAll('.print-page')];return pages.map((page,i)=>{const body=page.querySelector('.page-body'),footer=page.querySelector('footer');const limit=footer.getBoundingClientRect().top-8;const bottom=Math.max(body.getBoundingClientRect().bottom,...[...body.querySelectorAll('*')].map(el=>el.getBoundingClientRect().bottom));return bottom>limit?i+1:null}).filter(Boolean)})()`,awaitPromise:true,returnByValue:true},30000);
    if(readiness.exceptionDetails)throw publicationFailure('PDF_RESOURCE_LOAD_FAILED','PDF 图片或字体未完成加载',['请检查图片文件是否可读取后重试。']);
    const overflowing=readiness.result?.value||[];
    if(overflowing.length)throw publicationFailure('PDF_CONTENT_OVERFLOW',`第 ${overflowing.join('、')} 页内容超出 A4 版面`,['请将这些页面拆分或缩短正文后重新导出，避免内容被裁切。']);
    const pdf=await cdpSend('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,paperWidth:8.2677165,paperHeight:11.6929134,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0,displayHeaderFooter:false,transferMode:'ReturnAsStream'},90000);
    if(!pdf?.stream)throw publicationFailure('PDF_EMPTY_STREAM','Chromium 未返回 PDF 数据流',['请重试；若持续失败，请检查 Chromium 版本。']);
    const chunks=[];let eof=false,total=0;while(!eof){const part=await cdpSend('IO.read',{handle:pdf.stream,size:1024*1024},30000);if(part?.data){const chunk=Buffer.from(part.data,part.base64Encoded?'base64':'utf8');chunks.push(chunk);total+=chunk.length;if(total>128*1024*1024)throw publicationFailure('PDF_TOO_LARGE','Print PDF 超过 128MB 安全上限',['请减少页面或媒体数量后重试。'])}eof=Boolean(part?.eof)}
    await cdpSend('IO.close',{handle:pdf.stream},5000).catch(()=>{});if(!chunks.length)throw publicationFailure('PDF_EMPTY','Chromium 返回了空 PDF 数据流',['请检查 Chromium 运行环境后重试。']);await writeFile(stagingFile,Buffer.concat(chunks));await rename(stagingFile,file);
  }finally{try{ws?.close()}catch{}if(chrome?.pid)try{process.kill(-chrome.pid,'SIGTERM')}catch{}await new Promise(resolve=>setTimeout(resolve,120));await rm(userDataDir,{recursive:true,force:true}).catch(()=>{});await rm(stagingFile,{force:true}).catch(()=>{})}
  if(!(await exists(file)))throw publicationFailure('PDF_NOT_CREATED','Print PDF 文件未生成',['请重试或检查 Chromium 日志。']);const info=await stat(file);const manifest={kind:'pdf',generatedAt:new Date().toISOString(),path:path.relative(root,file).replaceAll('\\','/'),url:`/publication-output/${id}/${path.basename(file)}`,bytes:info.size,sha256:await sha256(file)};await writePublicationEvidence(id,{outputs:{pdf:manifest}});return manifest;
}
async function generatePublicationArchive(id){
  const web=await ensurePublicationWeb(id),dir=path.join(PUBLICATION_OUTPUT_ROOT,id),stage=path.join(dir,'.archive-stage'),file=path.join(dir,`${id}-archive.zip`);
  await rm(stage,{recursive:true,force:true});await rm(file,{force:true});await mkdir(stage,{recursive:true});await cp(path.join(dir,'web'),path.join(stage,'web'),{recursive:true});await cp(path.join(root,'issues',id,'issue.json'),path.join(stage,'issue.json'));
  const reportFile=path.join(root,'reports',`v3-release-audit-${id}.json`);if(await exists(reportFile))await cp(reportFile,path.join(stage,'audit.json'));const evidence=await readPublicationEvidence(id);const manifest={version:V3_VERSION,issue:id,generatedAt:new Date().toISOString(),source:'issue.json',outputs:{web:'web/index.html',pdf:evidence.outputs?.pdf?.path?path.basename(evidence.outputs.pdf.path):null},note:'Archive ZIP 是 issue.json 的派生归档包；issue.json 仍是唯一事实来源。'};await writeFile(path.join(stage,'archive-manifest.json'),`${JSON.stringify(manifest,null,2)}\n`,'utf8');if(evidence.outputs?.pdf?.path){const pdf=path.join(root,evidence.outputs.pdf.path);if(await exists(pdf))await cp(pdf,path.join(stage,path.basename(pdf)))}
  try{await writeNativeZip(stage,file)}finally{await rm(stage,{recursive:true,force:true})}if(!(await exists(file)))throw publicationFailure('ARCHIVE_NOT_CREATED','Archive ZIP 生成失败',['请重试；归档使用 Node 内置 ZIP 写入器，不依赖系统 zip 命令。']);const info=await stat(file);const out={kind:'archive',generatedAt:new Date().toISOString(),path:path.relative(root,file).replaceAll('\\','/'),url:`/publication-output/${id}/${path.basename(file)}`,bytes:info.size,sha256:await sha256(file),web};await writePublicationEvidence(id,{outputs:{archive:out}});return out;
}

function publicationWorkflowFingerprint(issue){const s=JSON.stringify(issue||{});let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');}
async function publicationWorkflowStatus(id,{refreshAudit=false}={}){
  const issue=await readJson(path.join(root,'issues',id,'issue.json'));
  const [review,handoffs,status]=await Promise.all([readReviewWorkspace(id),readReviewHandoffs(id),publicationStatus(id,{refreshAudit})]);
  const unresolved=(review.items||[]).filter(item=>item.status!=='reviewed'),important=unresolved.filter(item=>item.severity==='important');
  const rows=[...(handoffs.handoffs||[])].sort((a,b)=>(Number(b.round)||0)-(Number(a.round)||0)),latest=rows[0]||null;
  const accepted=latest?.status==='accepted',fingerprint=publicationWorkflowFingerprint(issue),legacyAccepted=Boolean(accepted&&!latest?.baselineSnapshot?.id),fresh=Boolean(accepted&&(legacyAccepted||latest?.diffReviewedFingerprint===fingerprint));
  const reviewReady=unresolved.length===0,signoffReady=reviewReady&&fresh;
  const web=status.outputs?.web||{},buildReady=Boolean(web.url||web.href||web.path),gateReady=Boolean(status.canPublish);
  const releaseOutput=status.outputs?.release||{},releaseDone=Boolean(issue.status==='published'&&(releaseOutput.path||releaseOutput.generatedAt));
  const configured=Boolean(status.publicShare?.configured),verified=Boolean(status.publicDeployment?.verified||status.outputs?.public?.verified);
  let nextAction='done';
  if(!reviewReady)nextAction='review';else if(!signoffReady)nextAction='signoff';else if(!gateReady)nextAction='preflight';else if(!buildReady)nextAction='build';else if(!releaseDone)nextAction='release';else if(configured&&!verified)nextAction='deploy';
  return {version:1,issue:id,generatedAt:new Date().toISOString(),sourceFingerprint:fingerprint,nextAction,review:{ready:reviewReady,unresolved:unresolved.length,important:important.length,updatedAt:review.updatedAt||null},signoff:{ready:signoffReady,accepted:Boolean(accepted),fresh,legacy:legacyAccepted,round:latest?.round||null,recipient:latest?.recipient||'',role:latest?.role||'',acceptedAt:latest?.acceptedAt||null,status:latest?.status||'missing'},gate:{ready:gateReady,lastPreflight:status.lastPreflight||null,reason:status.reason||''},build:{ready:buildReady,web},release:{ready:reviewReady&&signoffReady&&gateReady&&buildReady,completed:releaseDone,output:releaseOutput},deployment:{configured,verified,url:status.publicShare?.url||status.publicDeployment?.url||''}};
}
async function assertPublicationWorkflowReleaseReady(id){
  const workflow=await publicationWorkflowStatus(id,{refreshAudit:false});
  if(!workflow.review.ready)throw Object.assign(new Error(`内部校审仍有 ${workflow.review.unresolved} 项未清零，正式发布已阻断`),{statusCode:409,code:'REVIEW_NOT_CLOSED'});
  if(!workflow.signoff.ready)throw Object.assign(new Error(workflow.signoff.accepted?'内部签收已过期：签收后期刊发生变化，请重新核对并签收':'缺少有效的最新内部签收，正式发布已阻断'),{statusCode:409,code:'REVIEW_SIGNOFF_REQUIRED'});
  if(!workflow.build.ready)await ensurePublicationWeb(id);
  return workflow;
}

async function generateFormalRelease(id,report=()=>{}){await assertPublicationWorkflowReleaseReady(id);report({stage:'执行正式发布门禁',percent:15});const result=await runScriptAsync('publish-v3.mjs',['--issue',id,'--mark-published','--strict','--skip-browser']);if(!result.ok){const detail=summarizeCommandFailure(result.output,'正式发布门禁',id);throw Object.assign(new Error(detail),{statusCode:409,code:'PUBLICATION_RELEASE_BLOCKED',details:detail});}report({stage:'写入发布回执',percent:90});const releaseDir=path.join(root,'release-v3',id);const manifest={kind:'release',generatedAt:new Date().toISOString(),path:path.relative(root,releaseDir).replaceAll('\\','/'),output:result.output};await writePublicationEvidence(id,{outputs:{release:manifest}});return manifest;}
async function generateTtsForIssue(id,data,bin,report=()=>{}){
  const issueFile=path.join(root,'issues',id,'issue.json'),issue=await readJson(issueFile),rows=Array.isArray(data.pages)?data.pages.slice(0,200):[];
  if(!rows.length)throw Object.assign(new Error('没有可生成的页面正文'),{statusCode:400,code:'TTS_NO_PAGES'});
  const pattern=ttsOutputPattern(issue,bin),base=managedAssetRoot(id),snapshot=await snapshotIssue(id,'tts-generate-before'),generated=[],failed=[];await mkdir(path.join(base,'tts'),{recursive:true});
  for(const [index,row] of rows.entries()){
    const page=Number(row.page),text=String(row.text||'').trim();report({stage:`生成 TTS：第 ${page||'?'} 页`,percent:Math.min(90,5+Math.round((index/Math.max(1,rows.length))*80))});
    if(!Number.isInteger(page)||page<1||page>(issue.pages?.length||0)||!text){failed.push({page,error:'页面编号或正文无效'});continue;}
    const rel=ttsOutputPath(pattern,page),target=path.resolve(base,rel);if(!target.startsWith(path.resolve(base)+path.sep)){failed.push({page,error:'TTS 输出路径越界'});continue;}
    try{await rm(target,{force:true});await generateTtsFile(bin,target,text,{voice:data.voice,rate:data.rate});const info=await stat(target);if(!info.size)throw new Error('生成了空音频');generated.push({page,path:`assets/${rel}`,bytes:info.size,size:humanBytes(info.size)});}catch(e){await rm(target,{force:true});failed.push({page,error:e.message||String(e)});}
  }
  if(generated.length){const neural=path.basename(bin).toLowerCase().includes('edge-tts');issue.features ||= {};issue.features.narration ||= {};issue.features.narration.pattern=pattern;issue.features.narration.rate=Number(data.rate)||issue.features.narration.rate||1;issue.features.narration.generator=neural?'edge-neural':'server';if(neural)issue.features.narration.voice=String(data.voice||'zh-CN-XiaoxiaoNeural');issue.features.narration.generatedAt=new Date().toISOString();await writeFile(issueFile,`${JSON.stringify(issue,null,2)}\n`,'utf8');await runScriptAsync('sync-assets-v3.mjs',['--issue',id]);}
  const source=generated.length?await writeSourceReceipt(id,issue,{reason:'tts-generate',snapshot}):null;report({stage:'TTS 结果已写入',percent:95});return {ok:Boolean(generated.length),snapshot,pattern,generated,failed,narration:issue.features?.narration||null,issue:generated.length?issue:null,source};
}

function issueSourceFingerprint(issue){return createHash('sha256').update(JSON.stringify(issue||{})).digest('hex');}
function sourceReceiptDirectory(id){return path.join(sourceLedgerRoot,normalizeIssueId(id));}
async function sourceReceiptHistory(id,limit=6){
  const dir=sourceReceiptDirectory(id);let names=[];try{names=await readdir(dir);}catch{return []}
  const rows=[];for(const name of names.filter(x=>x.endsWith('.json')&&x!=='latest.json').sort().reverse().slice(0,Math.max(0,limit))){try{rows.push(await readJson(path.join(dir,name)));}catch{}}
  return rows;
}
async function writeSourceReceipt(id,issue,{reason='studio-save',snapshot=null}={}){
  const cleanId=normalizeIssueId(id),dir=sourceReceiptDirectory(cleanId),now=new Date().toISOString();await mkdir(dir,{recursive:true});
  const receipt={version:1,issueId:cleanId,authority:'server',reason,createdAt:now,fingerprint:issueSourceFingerprint(issue),pageCount:Array.isArray(issue?.pages)?issue.pages.length:0,status:String(issue?.status||'draft'),snapshot:snapshot?{id:snapshot.id||null,createdAt:snapshot.createdAt||null,label:snapshot.label||null}:null};
  const stamp=now.replace(/[:.]/g,'-');await writeFile(path.join(dir,`${stamp}-${randomUUID().slice(0,8)}.json`),`${JSON.stringify(receipt,null,2)}\n`,'utf8');await writeFile(path.join(dir,'latest.json'),`${JSON.stringify(receipt,null,2)}\n`,'utf8');
  const old=(await readdir(dir)).filter(x=>x.endsWith('.json')&&x!=='latest.json').sort().slice(60);await Promise.all(old.map(name=>rm(path.join(dir,name),{force:true})));return receipt;
}
async function readSourceStatus(id,issue){
  const cleanId=normalizeIssueId(id),issueFile=path.join(root,'issues',cleanId,'issue.json'),info=await stat(issueFile),snapshots=await listSnapshots(cleanId),history=await sourceReceiptHistory(cleanId,1);return {authority:'server',issueId:cleanId,fingerprint:issueSourceFingerprint(issue),savedAt:info.mtime.toISOString(),pageCount:Array.isArray(issue?.pages)?issue.pages.length:0,status:String(issue?.status||'draft'),snapshotCount:snapshots.length,latestSnapshot:snapshots[0]?{id:snapshots[0].id,createdAt:snapshots[0].createdAt,label:snapshots[0].label}:null,latestReceipt:history[0]||null,protection:'snapshot-before-save-and-version-check'};
}
async function sourceExport(id,issue){
  const assets=await listAssets(issue,id);return {format:'jinchang-magazine-v3-server-source-export',version:1,exportedAt:new Date().toISOString(),source:await readSourceStatus(id,issue),issue,assetInventory:{summary:assets.summary||{},tts:assets.tts||{},items:(assets.items||[]).map(x=>({path:x.path,kind:x.kind,bytes:x.bytes||null,size:x.size||'',references:x.references||[]}))},note:'这是服务器制作源稿和资源清单。媒体二进制文件不包含在 JSON 中；保存前快照保留在服务器端。'};
}


function readBrandField(issue,field){return String(field).split('.').reduce((value,key)=>value==null?undefined:value[key],issue);}
function assertBrandLock(fresh,next){const lock=fresh?.brandLock;if(!lock?.enabled)return;if(next?.brandLock?.enabled!==true)throw Object.assign(new Error('当前整刊模板启用了品牌锁定；不能通过普通保存关闭锁定。'),{code:'BRAND_LOCKED'});for(const field of lock.lockedFields||[]){if(JSON.stringify(readBrandField(fresh,field))!==JSON.stringify(readBrandField(next,field)))throw Object.assign(new Error(`品牌锁定项不可修改：${field}`),{code:'BRAND_LOCKED',field});}}

const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,`http://${req.headers.host||`${host}:${port}`}`); const seg=u.pathname.split('/').filter(Boolean);
  if(seg[0]==='api'&&['rc','rc1'].includes(seg[1])&&seg[2]==='acceptance'){
    if(req.method==='GET')return send(res,200,await readRc1Acceptance());
    if(req.method==='POST'){
      if(productionMode&&!acceptanceOnly&&!adminSession(req))return send(res,401,{error:'正式模式下验收记录写入需要已认证管理会话',code:'AUTH_REQUIRED'});
      const data=await body(req,512*1024);const allowed=new Set(['edge-desktop','mac-safari','iphone-safari','ipad-safari','android-wechat','other']);
      if(!allowed.has(data.deviceType))return send(res,400,{error:'deviceType 不受支持',code:'VALIDATION_ERROR'});
      if(!data.checks||typeof data.checks!=='object')return send(res,400,{error:'缺少 checks',code:'VALIDATION_ERROR'});
      const actualUa=String(req.headers['user-agent']||data.userAgent||'').slice(0,1000);data.userAgent=actualUa;
      if(['edge-desktop','mac-safari','iphone-safari','ipad-safari','android-wechat'].includes(data.deviceType)&&!realBrowserUaMatches(data.deviceType,actualUa))return send(res,400,{error:`当前浏览器 UA 与 ${data.deviceType} 不匹配，不能记为真实浏览器通过`,code:'UA_MISMATCH',userAgent:actualUa});
      return send(res,200,await writeRc1Acceptance(data));
    }
  }
  if(seg[0]==='api'&&['rc','rc1'].includes(seg[1])&&seg[2]==='probe'&&req.method==='GET'){
    const id=normalizeIssueId(u.searchParams.get('issue')||'002');const file=path.join(root,'issues',id,'issue.json');if(!(await exists(file)))return send(res,404,{error:`找不到 issues/${id}`});
    const issue=await readJson(file);const video=firstVideoPath(issue);const base=issueAssetRoot(issue,id);const videoFile=video?path.join(base,stripAssetsPrefix(video)):null;
    return send(res,200,{version:V3_VERSION,issue:id,pages:issue.pages?.length||0,assetSource:issue.assetSource||null,mediaAvailable:await exists(base),video:video||null,videoAvailable:Boolean(videoFile&&await exists(videoFile)),reader:`/live-preview/${id}/`});
  }
  if(u.pathname==='/api/final/acceptance'&&req.method==='GET'){
    const r=await runScriptAsync('p1-10-final-acceptance-gate-v3.mjs');let report=null;try{report=await readJson(path.join(root,'reports/p1-10-final-acceptance.json'))}catch{}
    return send(res,report?200:500,{ok:Boolean(report),runOk:r.ok,output:r.output,report});
  }
  if(acceptanceOnly&&seg[0]==='api'&&u.pathname!=='/api/health')return send(res,403,{error:'Final Acceptance 模式禁止编辑 API',code:'READ_ONLY'});
  if(!acceptanceOnly&&u.pathname==='/api/auth/session'&&req.method==='GET'){
    const session=adminSession(req);
    return send(res,200,{enabled:adminLoginEnabled,authenticated:Boolean(session),user:session?.user||null});
  }
  if(!acceptanceOnly&&u.pathname==='/api/auth/login'&&req.method==='POST'){
    if(!adminLoginEnabled)return send(res,503,{error:'管理端尚未配置登录密码，请设置 STUDIO_ADMIN_PASSWORD',code:'AUTH_NOT_CONFIGURED'});
    const ip=requestIp(req),rate=loginRate(ip);
    if(rate.lockedUntil>Date.now())return send(res,429,{error:'登录失败次数过多，请 5 分钟后重试',code:'AUTH_RATE_LIMITED'});
    let data;try{data=await body(req,32*1024)}catch{return send(res,400,{error:'登录请求格式无效',code:'INVALID_LOGIN_REQUEST'});}
    const username=String(data?.username||'').trim(),password=String(data?.password||'');
    if(!safeSecretEqual(username,adminLoginUser)||!safeSecretEqual(password,adminLoginPassword)){const next=recordLoginFailure(ip);return send(res,next.lockedUntil>Date.now()?429:401,{error:next.lockedUntil>Date.now()?'登录失败次数过多，请 5 分钟后重试':'用户名或密码错误',code:next.lockedUntil>Date.now()?'AUTH_RATE_LIMITED':'AUTH_INVALID'});}
    clearLoginFailures(ip);
    for(const [token,session] of adminSessions)if(session.expiresAt<=Date.now())adminSessions.delete(token);
    const token=randomUUID();adminSessions.set(token,{user:adminLoginUser,expiresAt:Date.now()+ADMIN_SESSION_TTL_MS});
    return send(res,200,{ok:true,user:adminLoginUser},'application/json; charset=utf-8',{'Set-Cookie':sessionCookie(req,token,ADMIN_SESSION_TTL_MS/1000)});
  }
  if(!acceptanceOnly&&u.pathname==='/api/auth/logout'&&req.method==='POST'){
    const cookies=requestCookies(req),token=cookies[ADMIN_SESSION_COOKIE];if(token)adminSessions.delete(token);
    return send(res,200,{ok:true},'application/json; charset=utf-8',{'Set-Cookie':sessionCookie(req,'',0)});
  }
  if(!acceptanceOnly&&u.pathname==='/api/public/ai/summarize'&&req.method==='OPTIONS')return send(res,204,'','text/plain; charset=utf-8',AI_PUBLIC_HEADERS);
  if(!acceptanceOnly&&u.pathname==='/api/public/ai/config'&&req.method==='GET'){const config=await readAiConfig();return send(res,200,{publicEndpoint:config.publicEndpoint||AI_CONFIG_DEFAULTS.publicEndpoint},'application/json; charset=utf-8',AI_PUBLIC_HEADERS);}
  if(!acceptanceOnly&&u.pathname==='/api/public/ai/summarize'&&req.method==='POST'){
    if(!aiPublicRateAllowed(req))return send(res,429,{error:'AI 总结请求过于频繁，请稍后再试',code:'AI_RATE_LIMITED'},'application/json; charset=utf-8',AI_PUBLIC_HEADERS);
    let data;try{data=await body(req,32*1024)}catch{return send(res,400,{error:'请求格式无效',code:'AI_REQUEST_INVALID'},'application/json; charset=utf-8',AI_PUBLIC_HEADERS);}
    try{const result=await summarizeExternalUrl(data?.url);return send(res,200,{ok:true,...result},'application/json; charset=utf-8',AI_PUBLIC_HEADERS);}catch(e){return send(res,e.statusCode||500,{error:e.message||String(e),code:e.code||'AI_SUMMARY_FAILED'},'application/json; charset=utf-8',AI_PUBLIC_HEADERS);}
  }
  if(!acceptanceOnly&&adminLoginEnabled&&!adminSession(req)&&u.pathname!=='/api/health'){
    const publicLoginAsset=['/login.html','/login.css','/login.js'].includes(u.pathname);
    if(u.pathname==='/'||u.pathname==='/index.html')return serveFile(req,res,path.join(studioDir,'login.html'));
    if(publicLoginAsset)return serveFile(req,res,path.join(studioDir,u.pathname.slice(1)));
    return send(res,401,{error:'请先登录管理端',code:'AUTH_REQUIRED'});
  }
  if(!acceptanceOnly&&seg[0]==='api'&&seg[1]==='jobs'&&seg[2]){const job=backgroundJobs.get(seg[2]);if(!job)return send(res,404,{error:'后台任务不存在或已过期',code:'JOB_NOT_FOUND'});if(req.method==='GET')return send(res,200,jobView(job));if(seg[3]==='cancel'&&req.method==='POST'){try{return send(res,200,jobView(cancelBackgroundJob(job)))}catch(e){return send(res,e.statusCode||409,{error:e.message,code:e.code})}}if(seg[3]==='retry'&&req.method==='POST'){try{const next=retryBackgroundJob(job);return send(res,202,backgroundJobResponse(next))}catch(e){return send(res,e.statusCode||409,{error:e.message,code:e.code})}}}
  if (u.pathname==='/api/health') return send(res,200,{ok:true,version:studioVersion});
  if (u.pathname==='/api/ai/config'&&req.method==='GET') return send(res,200,aiConfigPublic(await readAiConfig()));
  if (u.pathname==='/api/ai/config'&&req.method==='PUT') {
    let data;try{data=await body(req,32*1024)}catch{return send(res,400,{error:'AI 配置格式无效',code:'AI_CONFIG_INVALID'});}
    try{const next=normalizeAiConfigInput(data,await readAiConfig());await writeAiConfig(next);return send(res,200,aiConfigPublic(next));}catch(e){return send(res,e.statusCode||400,{error:e.message||String(e),code:e.code||'AI_CONFIG_INVALID'});}
  }
  if (u.pathname==='/api/ai/summarize'&&req.method==='POST') {
    let data;try{data=await body(req,32*1024)}catch{return send(res,400,{error:'AI 总结请求格式无效',code:'AI_REQUEST_INVALID'});}
    let url=String(data?.url||'').trim(),article=null,issueId=String(data?.issueId||'').trim(),articleId=String(data?.articleId||'').trim();
    if(issueId&&articleId){const file=path.join(root,'issues',normalizeIssueId(issueId),'issue.json');try{const issue=await readJson(file);article=issue?.articles?.[articleId]||null;url=url||String(article?.url||'');}catch{return send(res,404,{error:'找不到指定文章',code:'AI_ARTICLE_NOT_FOUND'});}}
    try{const result=await summarizeExternalUrl(url);return send(res,200,{ok:true,issueId:issueId||null,articleId:articleId||null,...result});}catch(e){return send(res,e.statusCode||500,{error:e.message||String(e),code:e.code||'AI_SUMMARY_FAILED'});}
  }
  if (u.pathname==='/api/final/status'&&req.method==='GET') {
    const id=normalizeIssueId(u.searchParams.get('issue')||'003');
    const r=await runScriptAsync('final-readiness-v3.mjs',['--issue',id]);
    const reportFile=path.join(root,'reports','v3-final-readiness.json');
    let report=null;try{report=await readJson(reportFile)}catch{}
    return send(res,200,{ok:r.ok,output:r.output,report});
  }
  if (u.pathname==='/api/final/doctor'&&req.method==='GET') {
    const id=normalizeIssueId(u.searchParams.get('issue')||'003');
    const r=await runScriptAsync('final-doctor-v3.mjs',['--issue',id]);
    const reportFile=path.join(root,'reports','v3-final-doctor.json');
    let report=null;try{report=await readJson(reportFile)}catch{}
    return send(res,200,{ok:r.ok,output:r.output,report});
  }
  if (u.pathname==='/api/import/parse'&&req.method==='POST') {
    const opts=importOptions(u); const contentType=String(req.headers['content-type']||''); let doc;
    try {
      if(contentType.includes('application/json')){const data=await body(req,2*MiB);const text=String(data.text||'');if(!text.trim())return send(res,400,{error:'没有可导入的正文',code:'VALIDATION_ERROR'});doc=parsePastedText(text,{format:String(data.format||'auto'),filename:String(data.filename||'粘贴正文')});if(data.section!=null)opts.section=String(data.section).slice(0,120);if(data.pageType)opts.pageType=String(data.pageType);if(data.targetChars)opts.targetChars=Number(data.targetChars);if(data.structureMode&&['auto','periodical','article'].includes(String(data.structureMode)))opts.structureMode=String(data.structureMode);}
      else {const filename=decodeURIComponent(String(req.headers['x-file-name']||u.searchParams.get('filename')||'import.txt'));const data=await binaryBody(req,12*MiB);doc=await parseImportedBuffer(data,{filename});}
      const pagination=paginateImportedDocument(doc,opts);return send(res,200,{document:doc,pagination,options:opts});
    } catch(e){return send(res,400,{error:e.message||String(e),code:e.code||'IMPORT_ERROR'});}
  }
  if (u.pathname==='/api/layout-library'&&req.method==='GET') return send(res,200,{layouts:await readLayoutLibrary()});
  if (u.pathname==='/api/layout-library'&&req.method==='POST') {
    const data=await body(req);let clean;try{clean=sanitizeLayoutAsset(data)}catch(e){return send(res,400,{error:e.message||String(e),code:'VALIDATION_ERROR'})}
    const rows=await readLayoutLibrary();if(rows.length>=40)return send(res,409,{error:'我的版式最多保存 40 个',code:'LAYOUT_LIBRARY_LIMIT'});const item={id:`layout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,...clean,createdAt:new Date().toISOString()};rows.unshift(item);await writeLayoutLibrary(rows);return send(res,201,item);
  }
  if (seg[0]==='api'&&seg[1]==='layout-library'&&seg[2]&&req.method==='DELETE') {const rows=await readLayoutLibrary();const next=rows.filter(x=>x.id!==seg[2]);if(next.length===rows.length)return send(res,404,{error:'版式不存在'});await writeLayoutLibrary(next);return send(res,200,{ok:true});}

  if(seg[0]==='api'&&seg[1]==='editorial-plan'&&seg[2]){
    const id=normalizeIssueId(seg[2]);const issueFile=path.join(root,'issues',id,'issue.json');if(!(await exists(issueFile)))return send(res,404,{error:`找不到 issues/${id}`});
    if(req.method==='GET')return send(res,200,await readEditorialPlan(id));
    if(req.method==='PUT'){
      const data=await body(req,512*1024);let plan;try{plan=sanitizeEditorialPlan(data,id)}catch(e){return send(res,400,{error:e.message||String(e),code:'VALIDATION_ERROR'})}
      await writeEditorialPlan(id,plan);return send(res,200,plan);
    }
    if(req.method==='DELETE'){await rm(editorialPlanFile(id),{force:true});return send(res,200,{ok:true});}
  }

  if (u.pathname==='/api/design-library'&&req.method==='GET') return send(res,200,{styles:await readDesignLibrary()});
  if (u.pathname==='/api/design-library'&&req.method==='POST') {
    const data=await body(req);let clean;try{clean=sanitizeDesignAsset(data)}catch(e){return send(res,400,{error:e.message||String(e),code:'VALIDATION_ERROR'})}
    const rows=await readDesignLibrary();if(rows.length>=60)return send(res,409,{error:'我的样式最多保存 60 个',code:'DESIGN_LIBRARY_LIMIT'});
    const item={id:`style-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,...clean,createdAt:new Date().toISOString()};rows.unshift(item);await writeDesignLibrary(rows);return send(res,201,item);
  }
  if (seg[0]==='api'&&seg[1]==='design-library'&&seg[2]&&req.method==='DELETE') {const rows=await readDesignLibrary();const next=rows.filter(x=>x.id!==seg[2]);if(next.length===rows.length)return send(res,404,{error:'样式不存在'});await writeDesignLibrary(next);return send(res,200,{ok:true});}
  if (u.pathname==='/api/templates'&&req.method==='GET') return send(res,200,{templates:await readUserTemplates()});
  if (u.pathname==='/api/templates'&&req.method==='POST') {
    const data=await body(req);const name=String(data.name||'').trim();if(!name||name.length>60)return send(res,400,{error:'模板名称需要 1–60 个字符',code:'VALIDATION_ERROR'});let page;try{page=sanitizeTemplatePage(data.page)}catch(e){return send(res,400,{error:e.message||String(e),code:'VALIDATION_ERROR'})}const rows=await readUserTemplates();if(rows.length>=50)return send(res,409,{error:'我的模板最多保存 50 个',code:'TEMPLATE_LIMIT'});const item={id:`tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,name,createdAt:new Date().toISOString(),page};rows.unshift(item);await writeUserTemplates(rows);return send(res,201,item);
  }
  if (seg[0]==='api'&&seg[1]==='templates'&&seg[2]&&req.method==='DELETE') {const rows=await readUserTemplates();const next=rows.filter(x=>x.id!==seg[2]);if(next.length===rows.length)return send(res,404,{error:'模板不存在'});await writeUserTemplates(next);return send(res,200,{ok:true});}
  if (u.pathname==='/api/issues'&&req.method==='GET') return send(res,200,await issueSummaries());
  if (u.pathname==='/api/whole-magazine-templates'&&req.method==='GET') return send(res,200,{templates:WHOLE_MAGAZINE_TEMPLATES});
  if (u.pathname==='/api/issues'&&req.method==='POST') {
    const data=await body(req);
    if(String(data.subtitle||'').length>120)return send(res,400,{error:'本期主题不能超过 120 个字符',code:'VALIDATION_ERROR'});
    if(String(data.label||'').length>40)return send(res,400,{error:'期名不能超过 40 个字符',code:'VALIDATION_ERROR'});
    const allowedStartModes=new Set(['clone','import','template','blank']);
    const startMode=allowedStartModes.has(String(data.startMode||''))?String(data.startMode):(data.cloneFrom?'clone':data.templateId?'template':'blank');
    const templateId=String(data.templateId||'').trim();
    if(startMode==='template'&&!WHOLE_MAGAZINE_TEMPLATES.some(x=>x.id===templateId))return send(res,400,{error:'请选择有效的整刊模板',code:'VALIDATION_ERROR'});
    let cloneSource=null;
    if(startMode==='clone'){if(!data.cloneFrom)return send(res,400,{error:'复制上期需要选择来源期刊',code:'VALIDATION_ERROR'});const sourceId=normalizeIssueId(data.cloneFrom);const sourceFile=path.join(root,'issues',sourceId,'issue.json');if(!(await exists(sourceFile)))return send(res,400,{error:`结构来源 ${sourceId} 不存在`,code:'VALIDATION_ERROR'});cloneSource=await readJson(sourceFile);if(cloneSource.engine!=='v3')return send(res,400,{error:'只能复制 V3 期刊结构',code:'VALIDATION_ERROR'});if(!Array.isArray(cloneSource.pages)||cloneSource.pages.length<1||cloneSource.pages.length>200)return send(res,400,{error:'结构来源页面数量不在 1–200 页允许范围内',code:'VALIDATION_ERROR'});}
    const before=new Set((await issueSummaries()).map(x=>x.id)); const argv=['--subtitle',String(data.subtitle||'请填写本期主题')]; if(data.label)argv.push('--label',String(data.label));
    const r=await runScriptAsync('new-issue-v3.mjs',argv); if(!r.ok)return send(res,400,{error:r.output}); const after=await issueSummaries(); const created=after.find(x=>!before.has(x.id));
    if (cloneSource) {
      const targetFile=path.join(root,'issues',created.id,'issue.json'); const target=await readJson(targetFile); const cloned=cloneStructure(cloneSource,target); validateIssue(cloned,created.id); await writeFile(targetFile,`${JSON.stringify(cloned,null,2)}\n`,'utf8'); await runScriptAsync('sync-assets-v3.mjs',['--issue',created.id]); created.pageCount=cloned.pages.length;
    } else if(startMode==='template') {
      const targetFile=path.join(root,'issues',created.id,'issue.json'); const target=await readJson(targetFile); const templated=applyWholeMagazineTemplate(templateId,target); validateIssue(templated,created.id); await atomicWriteText(targetFile,`${JSON.stringify(templated,null,2)}\n`); await runScriptAsync('sync-assets-v3.mjs',['--issue',created.id]); created.pageCount=templated.pages.length; created.wholeTemplate=templated.wholeTemplate;
    }
    const createdIssue=await readJson(path.join(root,'issues',created.id,'issue.json'));const source=await writeSourceReceipt(created.id,createdIssue,{reason:`issue-created:${startMode}`});
    return send(res,201,{issue:created,output:r.output,source,startMode,next:startMode==='import'?'import':startMode==='template'?'layout':'content'});
  }
  if (seg[0]==='api'&&seg[1]==='issues'&&seg[2]) {
    const id=normalizeIssueId(seg[2]); const issueFile=path.join(root,'issues',id,'issue.json'); if(!(await exists(issueFile)))return send(res,404,{error:`找不到 issues/${id}`}); const issue=await readJson(issueFile);
    if (seg.length===3&&req.method==='GET') return send(res,200,issue);
    if (seg[3]==='source-status'&&req.method==='GET') return send(res,200,await readSourceStatus(id,issue));
    if (seg[3]==='source-export'&&req.method==='GET') return send(res,200,await sourceExport(id,issue),'application/json; charset=utf-8',{'Content-Disposition':`attachment; filename="jinchang-${id}-source.json"`});
    if (seg[3]==='live-preview'&&req.method==='POST') {
      const data=await body(req,8*MiB);
      try{validateLivePreviewIssue(data,id)}catch(e){return send(res,400,{error:e.message||String(e),code:'VALIDATION_ERROR'});}
      const preview=JSON.parse(JSON.stringify(data));
      livePreviewIssues.set(id,preview);
      return send(res,200,{ok:true,preview:`/live-preview/${id}/`,pages:preview.pages.length});
    }
    if (seg[3]==='skeleton'&&req.method==='GET') { const sourceId=normalizeIssueId(u.searchParams.get('source')||''); const sourceFile=path.join(root,'issues',sourceId,'issue.json'); if(!(await exists(sourceFile)))return send(res,404,{error:`结构来源 ${sourceId} 不存在`}); const source=await readJson(sourceFile); if(source.engine!=='v3')return send(res,400,{error:'只能复制 V3 期刊栏目骨架',code:'VALIDATION_ERROR'}); return send(res,200,{source:{id:source.id,label:source.label,pageCount:source.pages?.length||0},pages:structureSkeleton(source,issue)}); }
    if (seg.length===3&&req.method==='PUT') { const payload=await body(req);const data=payload?.issue&&typeof payload.issue==='object'&&!Array.isArray(payload.issue)?payload.issue:payload;const protectedEnvelope=Boolean(payload?.issue&&typeof payload.issue==='object'&&!Array.isArray(payload.issue));const expectedFingerprint=String(payload?.sourceFingerprint||'');if(protectedEnvelope&&!expectedFingerprint)return send(res,428,{error:'保存请求缺少编辑基线指纹，请重新打开本期后再保存。',code:'SOURCE_FINGERPRINT_REQUIRED'});return withIssueWriteLock(id,async()=>{const freshIssue=await readJson(issueFile);const currentFingerprint=issueSourceFingerprint(freshIssue);if(expectedFingerprint&&expectedFingerprint!==currentFingerprint)return send(res,409,{error:'服务器制作源已更新；为避免覆盖新内容，本次保存已拒绝。请重新打开本期后再合并修改。',code:'SOURCE_DRIFT',source:await readSourceStatus(id,freshIssue)});try{assertBrandLock(freshIssue,data);validateIssue(data,id)}catch(e){return send(res,400,{error:e.message||String(e),code:e.code||'VALIDATION_ERROR',field:e.field||null})}if(freshIssue.status==='published'&&data.status==='published'){data.revision={...(data.revision||{}),pending:true,updatedAt:new Date().toISOString(),basePublishedAt:freshIssue.publishedAt||null,source:'studio'};}const snap=await snapshotIssue(id,'studio-before-save');await atomicWriteText(issueFile,`${JSON.stringify(data,null,2)}\n`);await deleteDraftFile(id);await runScriptAsync('sync-assets-v3.mjs',['--issue',id]);const source=await writeSourceReceipt(id,data,{reason:'studio-save',snapshot:snap});return send(res,200,{issue:data,snapshot:snap,source});}); }
    if (seg[3]==='review-workspace'&&req.method==='GET') return send(res,200,await readReviewWorkspace(id));
    if (seg[3]==='review-workspace'&&req.method==='PUT') {const data=await body(req);try{const clean=sanitizeReviewWorkspace(data,id);await writeReviewWorkspace(id,clean);return send(res,200,clean);}catch(e){return send(res,400,{error:e.message||String(e),code:'VALIDATION_ERROR'});}}
    if (seg[3]==='review-workspace'&&req.method==='DELETE') {await rm(reviewWorkspaceFile(id),{force:true});return send(res,200,{ok:true});}
    if (seg[3]==='review-handoffs'&&req.method==='GET') return send(res,200,await readReviewHandoffs(id));
    if (seg[3]==='review-handoffs'&&req.method==='PUT') {const data=await body(req);try{const clean=sanitizeReviewHandoffs(data,id);await writeReviewHandoffs(id,clean);return send(res,200,clean);}catch(e){return send(res,400,{error:e.message||String(e),code:'VALIDATION_ERROR'});}}
    if (seg[3]==='review-handoffs'&&req.method==='DELETE') {await rm(reviewHandoffFile(id),{force:true});return send(res,200,{ok:true});}
    if (seg[3]==='draft'&&req.method==='GET') return send(res,200,await readDraft(id));
    if (seg[3]==='draft'&&req.method==='PUT') { const data=await body(req); if(!data.issue)return send(res,400,{error:'缺少 issue 草稿数据',code:'VALIDATION_ERROR'}); try{return send(res,200,await writeDraft(id,data.issue));}catch(e){return send(res,400,{error:e.message||String(e),code:'VALIDATION_ERROR'});} }
    if (seg[3]==='draft'&&req.method==='DELETE') { await deleteDraftFile(id); return send(res,200,{ok:true}); }
    if (seg[3]==='snapshots'&&seg[4]&&seg[5]==='issue'&&req.method==='GET') {try{return send(res,200,await readSnapshotIssue(id,seg[4]));}catch(e){return send(res,404,{error:e.message||String(e),code:'SNAPSHOT_NOT_FOUND'});}}
    if (seg[3]==='snapshots'&&req.method==='GET') return send(res,200,await listSnapshots(id));
    if (seg[3]==='snapshot'&&req.method==='POST') { const data=await body(req); return send(res,201,await snapshotIssue(id,data.label||'studio-manual')); }
    if (seg[3]==='rollback'&&req.method==='POST') { const data=await body(req); if(!data.snapshot)return send(res,400,{error:'缺少 snapshot'}); const x=await restoreSnapshot(id,data.snapshot); await deleteDraftFile(id); await runScriptAsync('sync-assets-v3.mjs',['--issue',id]);const restoredIssue=await readJson(issueFile),source=await writeSourceReceipt(id,restoredIssue,{reason:'snapshot-rollback',snapshot:x}); return send(res,200,{restored:x,source}); }
    if (seg[3]==='publication'&&seg[4]==='workflow'&&req.method==='GET') { const refresh=u.searchParams.get('refresh')==='1'; return send(res,200,await publicationWorkflowStatus(id,{refreshAudit:refresh})); }
    if (seg[3]==='publication'&&seg[4]==='status'&&req.method==='GET') { const refresh=u.searchParams.get('refresh')!=='0'; return send(res,200,await publicationStatus(id,{refreshAudit:refresh})); }
    if (seg[3]==='publication'&&seg[4]==='preflight'&&req.method==='POST') { try{const data=await body(req,32*1024);if(data.async){const job=enqueueBackgroundJob({kind:'publication-preflight',issueId:id,sourceFingerprint:issueSourceFingerprint(issue),task:report=>runPublicationPreflight(id,report)});return send(res,202,backgroundJobResponse(job));}return send(res,200,await runPublicationPreflight(id));}catch(e){return send(res,e.statusCode||400,{error:e.message||String(e),code:e.code||'PUBLICATION_PREFLIGHT_FAILED'});} }
    if (seg[3]==='publication'&&seg[4]==='preview'&&req.method==='POST') { try{const data=await body(req,32*1024);if(data.async){const job=enqueueBackgroundJob({kind:'publication-preview',issueId:id,sourceFingerprint:issueSourceFingerprint(issue),task:async report=>{report({stage:'构建当前期刊',percent:10});const output=await ensurePublicationWeb(id);return {ok:true,output,status:await publicationStatus(id,{refreshAudit:false})};}});return send(res,202,backgroundJobResponse(job));}const output=await ensurePublicationWeb(id);return send(res,200,{ok:true,output,status:await publicationStatus(id,{refreshAudit:false})});}catch(e){return send(res,e.statusCode||400,{error:e.message||String(e),code:e.code||'PUBLICATION_PREVIEW_FAILED'});} }
    if (seg[3]==='publication'&&seg[4]==='pdf'&&req.method==='POST') { try{const data=await body(req,32*1024);if(data.async){const job=enqueueBackgroundJob({kind:'publication-pdf',issueId:id,sourceFingerprint:issueSourceFingerprint(issue),task:async report=>{report({stage:'生成 PDF',percent:10});const output=await generatePublicationPdf(id);return {ok:true,output,status:await publicationStatus(id,{refreshAudit:false})};}});return send(res,202,backgroundJobResponse(job));}const output=await generatePublicationPdf(id);return send(res,200,{ok:true,output,status:await publicationStatus(id,{refreshAudit:false})});}catch(e){return send(res,e.statusCode||400,{error:e.message||String(e),code:e.code||'PUBLICATION_PDF_FAILED'});} }
    if (seg[3]==='publication'&&seg[4]==='archive'&&req.method==='POST') { try{const data=await body(req,32*1024);if(data.async){const job=enqueueBackgroundJob({kind:'publication-archive',issueId:id,sourceFingerprint:issueSourceFingerprint(issue),task:async report=>{report({stage:'生成归档包',percent:10});const output=await generatePublicationArchive(id);return {ok:true,output,status:await publicationStatus(id,{refreshAudit:false})};}});return send(res,202,backgroundJobResponse(job));}const output=await generatePublicationArchive(id);return send(res,200,{ok:true,output,status:await publicationStatus(id,{refreshAudit:false})});}catch(e){return send(res,e.statusCode||400,{error:e.message||String(e),code:e.code||'PUBLICATION_ARCHIVE_FAILED'});} }
    if (seg[3]==='publication'&&seg[4]==='release'&&req.method==='POST') { try{const data=await body(req,32*1024);if(data.async){const job=enqueueBackgroundJob({kind:'publication-release',issueId:id,sourceFingerprint:issueSourceFingerprint(issue),task:async report=>{const output=await generateFormalRelease(id,report);const nextIssue=await readJson(issueFile),source=await writeSourceReceipt(id,nextIssue,{reason:'formal-release'});return {ok:true,output,status:await publicationStatus(id,{refreshAudit:true}),issue:nextIssue,source};}});return send(res,202,backgroundJobResponse(job));}const output=await generateFormalRelease(id);const nextIssue=await readJson(issueFile),source=await writeSourceReceipt(id,nextIssue,{reason:'formal-release'});return send(res,200,{ok:true,output,status:await publicationStatus(id,{refreshAudit:true}),issue:nextIssue,source});}catch(e){return send(res,e.statusCode||409,{error:e.message||String(e),code:e.code||'PUBLICATION_RELEASE_BLOCKED'});} }
    if (seg[3]==='publication'&&seg[4]==='deploy'&&req.method==='POST') { try{const data=await body(req,32*1024);if(data.async){const job=enqueueBackgroundJob({kind:'public-deploy',issueId:id,sourceFingerprint:issueSourceFingerprint(issue),task:async report=>{report({stage:'部署公开 Reader',percent:10});const deployment=await deployPublicIssue(id);report({stage:'在线校验',percent:90});return {ok:deployment.verified,deployment,status:await publicationStatus(id,{refreshAudit:false})};}});return send(res,202,backgroundJobResponse(job));}const deployment=await deployPublicIssue(id);return send(res,deployment.verified?200:502,{ok:deployment.verified,deployment,status:await publicationStatus(id,{refreshAudit:false})});}catch(e){return send(res,e.statusCode||409,{error:e.message||String(e),code:e.code||'PUBLIC_DEPLOYMENT_FAILED'});} }
    if (seg[3]==='audit'&&req.method==='POST') { const data=await body(req,32*1024);const argv=['--issue',id,'--quiet'];if(data.strict)argv.push('--strict');if(data.async){const job=enqueueBackgroundJob({kind:'audit',issueId:id,payload:{strict:Boolean(data.strict)},sourceFingerprint:issueSourceFingerprint(issue),task:async report=>{report({stage:'执行审计',percent:10});const r=await runScriptAsync('audit-v3.mjs',argv);const reportFile=path.join(root,'reports',`v3-release-audit-${id}.json`);let auditReport=null;try{auditReport=await readJson(reportFile)}catch{}return {ok:r.ok,output:r.output,strict:Boolean(data.strict),generatedAt:auditReport?.generatedAt||null,audit:auditReport?.issues?.[0]||null,htmlUrl:`/reports/v3-release-audit-${id}.html`};}});return send(res,202,backgroundJobResponse(job));}const r=await runScriptAsync('audit-v3.mjs',argv);const reportFile=path.join(root,'reports',`v3-release-audit-${id}.json`);let report=null;try{report=await readJson(reportFile)}catch{}const audit=report?.issues?.[0]||null;return send(res,200,{ok:r.ok,output:r.output,strict:Boolean(data.strict),generatedAt:report?.generatedAt||null,audit,htmlUrl:`/reports/v3-release-audit-${id}.html`}); }
    if (seg[3]==='build'&&req.method==='POST') { const data=await body(req,32*1024);if(data.async){const job=enqueueBackgroundJob({kind:'build',issueId:id,sourceFingerprint:issueSourceFingerprint(issue),task:async report=>{report({stage:'构建当前期刊',percent:10});const r=await runScriptAsync('build-v3.mjs',['--issue',id]);return {ok:r.ok,output:r.output,preview:`/preview/${id}/`};}});return send(res,202,backgroundJobResponse(job));}const r=await runScriptAsync('build-v3.mjs',['--issue',id]);return send(res,r.ok?200:400,{ok:r.ok,output:r.output,preview:`/preview/${id}/`}); }
    if (seg[3]==='assets'&&seg.length===4&&req.method==='GET') return send(res,200,await listAssets(issue,id));
    if (seg[3]==='assets'&&seg[4]==='stock'&&req.method==='POST') { const data=await body(req,32*1024); try{return send(res,201,await installStockAsset(issue,id,data.stockId));}catch(e){return send(res,e.statusCode||400,{error:e.message,code:e.code||'STOCK_ASSET_INSTALL_FAILED'});} }
    if (seg[3]==='assets'&&seg[4]==='delete'&&req.method==='DELETE') { const data=await body(req); try{return send(res,200,await deleteAsset(issue,id,data.path));}catch(e){return send(res,e.statusCode||400,{error:e.message,code:e.code||'VALIDATION_ERROR',references:e.references||[]});} }
    if (seg[3]==='assets'&&seg[4]==='cleanup'&&req.method==='POST') { const data=await body(req); try{return send(res,200,await cleanupAssets(issue,id,Boolean(data.confirm)));}catch(e){return send(res,e.statusCode||400,{error:e.message,code:e.code||'VALIDATION_ERROR'});} }
    if (seg[3]==='assets'&&seg[4]==='poster'&&req.method==='POST') { const data=await body(req); try{return send(res,201,await generateVideoPoster(issue,id,data.path));}catch(e){return send(res,e.statusCode||400,{error:e.message,code:e.code||'VALIDATION_ERROR'});} }
    if (seg[3]==='tts'&&seg[4]==='generate'&&req.method==='POST') {
      if(!isManagedAssetRoot(issue,id))return send(res,409,{error:'当前期刊使用历史/外部 assetSource，不能直接写入 TTS。请先迁移到本期独立 assets 目录。',code:'ASSET_SOURCE_READONLY'});
      const bin=resolveTtsGenerator();if(!bin)return send(res,501,{error:'服务器未配置 TTS 生成器。请在服务环境安装 espeak-ng，或设置 V3_TTS_BIN 与 V3_TTS_ARGS；浏览器朗读回退仍可用。',code:'TTS_GENERATOR_UNAVAILABLE'});
      const data=await body(req,2*MiB);
      if(data.async){const job=enqueueBackgroundJob({kind:'tts-generate',issueId:id,payload:data,sourceFingerprint:issueSourceFingerprint(issue),task:report=>generateTtsForIssue(id,data,bin,report)});return send(res,202,backgroundJobResponse(job));}
      try{const result=await generateTtsForIssue(id,data,bin);return send(res,result.generated.length&&result.failed.length?207:result.generated.length?200:422,result);}catch(e){return send(res,e.statusCode||400,{error:e.message||String(e),code:e.code||'TTS_GENERATE_FAILED'});}
    }
    if (seg[3]==='tts'&&seg[4]==='baseline'&&req.method==='POST') { const refs=collectReferencedAssets(issue).filter(x=>x.kind==='tts');const base=issueAssetRoot(issue,id);const missing=[];for(const ref of refs)if(!(await exists(path.join(base,ref.path))))missing.push(ref.page);if(missing.length)return send(res,409,{error:`TTS 尚未补齐，缺失 ${missing.length} 页`,code:'TTS_INCOMPLETE',missingPages:missing});const snap=await snapshotIssue(id,'tts-baseline-before');issue.features ||= {};issue.features.narration ||= {};issue.features.narration.sourceDigest=narrationSourceDigest(issue);issue.features.narration.pageDigests=narrationPageDigests(issue);issue.features.narration.baselinedAt=new Date().toISOString();await writeFile(issueFile,`${JSON.stringify(issue,null,2)}\n`,'utf8');const source=await writeSourceReceipt(id,issue,{reason:'tts-baseline',snapshot:snap});return send(res,200,{ok:true,snapshot:snap,narration:issue.features.narration,source}); }
    if (seg[3]==='assets'&&seg[4]==='upload'&&req.method==='POST') {
      if(!isManagedAssetRoot(issue,id))return send(res,409,{error:'当前期刊使用历史/外部 assetSource，制作中心按只读处理。请在新一期自身 assets 目录中上传资源。',code:'ASSET_SOURCE_READONLY'});
      const kind=String(u.searchParams.get('kind')||''); const rule=uploadRules[kind]; if(!rule)return send(res,400,{error:'不支持的媒体类型',code:'VALIDATION_ERROR'});
      let name; try{name=safeUploadName(req.headers['x-file-name']||u.searchParams.get('filename')||'')}catch(e){return send(res,400,{error:e.message,code:'VALIDATION_ERROR'})}
      const ext=path.extname(name).toLowerCase(); if(!rule.exts.has(ext))return send(res,415,{error:`${kind} 不支持 ${ext||'(无扩展名)'} 文件`,code:'UNSUPPORTED_MEDIA_TYPE'});
      const data=await binaryBody(req,rule.max); if(!data.length)return send(res,400,{error:'上传文件为空',code:'VALIDATION_ERROR'}); try{validateUploadSignature(data,ext)}catch(e){return send(res,415,{error:e.message,code:'INVALID_MEDIA_SIGNATURE'})}
      const dir=path.join(managedAssetRoot(id),kind); await mkdir(dir,{recursive:true}); const stored=await uniqueFile(dir,name); await writeFile(path.join(dir,stored),data); await runScriptAsync('sync-assets-v3.mjs',['--issue',id]);
      return send(res,201,{path:`assets/${kind}/${stored}`,kind,name:stored,bytes:data.length,size:humanBytes(data.length),renamed:stored!==name});
    }
  }
  if (seg[0]==='live-preview'&&seg[1]) {
    const id=normalizeIssueId(seg[1]);
    const issueFile=path.join(root,'issues',id,'issue.json');
    if(!(await exists(issueFile)))return send(res,404,{error:'Issue not found'});
    const diskIssue=await readJson(issueFile);
    const issue=livePreviewIssue(id,diskIssue);
    const rest=decodeURIComponent(seg.slice(2).join('/'))||'index.html';
    if(rest==='issue.json')return send(res,200,issue);
    if(rest==='index.html'||rest==='reader.css'||rest==='reader.js'||rest==='rich-text.js'||rest==='layout-engine.js')return serveFile(req,res,path.join(readerDir,rest));
    if(rest.startsWith('vendor/')){const file=path.resolve(readerDir,rest);const vendorRoot=path.resolve(readerDir,'vendor');if(!file.startsWith(vendorRoot+path.sep)&&file!==vendorRoot)return send(res,403,{error:'Forbidden'});return serveFile(req,res,file);}
    if(rest.startsWith('assets/')){
      const base=issueAssetRoot(issue,id);
      const rel=stripAssetsPrefix(rest);
      const file=path.resolve(base,rel);
      if(!file.startsWith(base+path.sep)&&file!==base)return send(res,403,{error:'Forbidden'});
      return serveFile(req,res,file);
    }
    return send(res,404,{error:'Live preview resource not found'});
  }
  if (seg[0]==='issue-assets'&&seg[1]) {
    const id=normalizeIssueId(seg[1]); const issueFile=path.join(root,'issues',id,'issue.json'); if(!(await exists(issueFile)))return send(res,404,{error:'Issue not found'}); const issue=await readJson(issueFile); const base=issueAssetRoot(issue,id); const rest=stripAssetsPrefix(decodeURIComponent(seg.slice(2).join('/'))); const file=path.resolve(base,rest); if(!file.startsWith(base+path.sep)&&file!==base)return send(res,403,{error:'Forbidden'}); return serveFile(req,res,file);
  }
  if (seg[0]==='reports'&&seg[1]) { const base=path.resolve(root,'reports'); const file=path.resolve(base,seg.slice(1).join('/')); if(!file.startsWith(base+path.sep)&&file!==base)return send(res,403,{error:'Forbidden'}); return serveFile(req,res,file); }
  if (seg[0]==='publication-output'&&seg[1]) { const id=normalizeIssueId(seg[1]); const base=path.resolve(PUBLICATION_OUTPUT_ROOT,id); const rest=decodeURIComponent(seg.slice(2).join('/'))||'web/index.html'; const file=path.resolve(base,rest); if(!file.startsWith(base+path.sep)&&file!==base)return send(res,403,{error:'Forbidden'}); return serveFile(req,res,file); }
  if (seg[0]==='preview'&&seg[1]) { const id=normalizeIssueId(seg[1]); const rest=seg.slice(2).join('/')||'index.html'; const base=path.resolve(root,'dist-v3',id); const file=path.resolve(base,rest); if(!file.startsWith(base+path.sep)&&file!==base)return send(res,403,{error:'Forbidden'}); return serveFile(req,res,file); }
  if (u.pathname==='/'||u.pathname==='/index.html'||u.pathname==='/workspace'||u.pathname==='/workspace/') return serveFile(req,res,path.join(studioDir,acceptanceOnly?'final-acceptance.html':'index.html'));
  // Beta1: real nested Studio modules (e.g. /workspace/viewport.js) must win before the legacy /workspace/* compatibility fallback.
  const staticFile=path.resolve(studioDir,'.'+u.pathname);
  if(staticFile.startsWith(studioDir+path.sep)&&await exists(staticFile))return serveFile(req,res,staticFile);
  if(seg[0]==='workspace'&&seg.length>1){const rest=seg.slice(1).join('/');const file=path.resolve(studioDir,rest);if(file.startsWith(studioDir+path.sep))return serveFile(req,res,file);}
  if(staticFile.startsWith(studioDir+path.sep))return serveFile(req,res,staticFile);
  return send(res,404,{error:'Not found'});
}catch(e){console.error(e);return send(res,e.statusCode||500,{error:e.message||String(e),code:e.statusCode===413?'PAYLOAD_TOO_LARGE':undefined})}});

async function runPublicationPreflight(id,report=()=>{}){
  const steps=[];const exec=async(label,script,args=[])=>{report({stage:label,percent:Math.min(95,10+steps.length*20)});const result=await runScriptAsync(script,args);steps.push({label,ok:result.ok,output:result.output});return result};
  const check=await exec('数据校验','check-v3.mjs',['--issue',id]);const build=check.ok?await exec('构建','build-v3.mjs',['--issue',id]):{ok:false};const smoke=build.ok?await exec('静态 Smoke','smoke-v3.mjs',['--issue',id]):{ok:false};steps.push({label:'设备回归（提示项）',ok:true,skipped:true,advisory:true,output:'设备兼容性回归属于提示项，不阻断正式发布'});const audit=await exec('发布审计（硬性门禁 + 提示项）','audit-v3.mjs',['--issue',id,'--quiet','--strict']);const hardOk=Boolean(check.ok&&build.ok&&smoke.ok&&audit.ok);const previous=await readPublicationEvidence(id);const evidence=await writePublicationEvidence(id,{devices:{mobile:previous.devices?.mobile||'pending',desktop:previous.devices?.desktop||'pending',checkedAt:previous.devices?.checkedAt||null,policy:'advisory'},lastPreflight:{ok:hardOk,strict:true,at:new Date().toISOString(),steps:steps.map(item=>({label:item.label,ok:item.ok,skipped:Boolean(item.skipped),advisory:Boolean(item.advisory)}))}});return {ok:hardOk,steps,evidence,status:await publicationStatus(id,{refreshAudit:false})};
}
if(args.check){for(const f of ['index.html','studio.css','studio.js','publication-center.js','design-presets.js','login.html','login.css','login.js','rc1-acceptance.html','rc1-acceptance.css','rc1-acceptance.js','final-acceptance.html','final-acceptance.css','final-acceptance.js']){if(!(await exists(path.join(studioDir,f))))throw new Error(`制作中心缺少 ${f}`)}for(const f of ['index.html','reader.css','reader.js','rich-text.js','layout-engine.js']){if(!(await exists(path.join(readerDir,f))))throw new Error(`Reader 缺少 ${f}`)}console.log('V3 制作中心自检通过。');process.exit(0)}
await restoreBackgroundJobs();
server.listen(port,host,()=>{console.log(`${acceptanceOnly?`V3 ${V3_VERSION} Final Acceptance 真实环境验收台`:'V3 制作中心'}：http://${host}:${port}`);console.log(`工程根目录：${root}`);if(acceptanceOnly){for(const url of lanUrls(port))console.log(`局域网设备：http://${url.replace('http://','')}`);console.log('仅建议在可信局域网使用；acceptance-only 模式已禁用编辑 API。')}console.log('按 Ctrl+C 退出。')});
