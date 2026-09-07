import { readFile } from 'node:fs/promises';

const [html, js, css] = await Promise.all([
  readFile('src/reader/index.html','utf8'),
  readFile('src/reader/reader.js','utf8'),
  readFile('src/reader/reader.css','utf8'),
]);
const assert=(condition,message)=>{if(!condition)throw new Error(message)};

for(const token of ['id="seniorButton"','id="seniorDialogButton"','id="networkStatus"','id="networkRetry"'])assert(html.includes(token),`Reader shell missing ${token}`);
for(const token of ['seniorMode: false','fetchIssueWithRetry','currentNetworkMode','networkConnection','saveData','effectiveType','media-load-error','data-media-retry','storageKey("senior")'])assert(js.includes(token),`Reader logic missing ${token}`);
assert(js.includes('state.seniorMode && isMobile()')&&js.includes('return "none"'),'senior mode must reduce mobile page animation');
assert(js.includes('state.networkMode!=="normal"')&&js.includes('video.preload="none"'),'weak network video preload downgrade missing');
assert(js.includes('startMusic({manual:true})'),'explicit music override missing');
assert(js.includes('case "table"'),'table speech fallback missing');
for(const token of ['P1-06 · Senior mobile Reader + weak-network recovery','body.senior-mode','.network-status','.senior-mode-card','.media-retry','min-height:44px'])assert(css.includes(token),`Reader CSS missing ${token}`);
assert(/\.actions\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/.test(css),'mobile top actions must fit five controls');
assert(/body\.senior-mode \.toolbar\{height:64px/.test(css),'senior toolbar enlargement missing');
assert(/body\.senior-mode \.page p[^}]*line-height:1\.94/.test(css),'senior paragraph line-height missing');
assert(/body\.senior-mode \.article-body p\{font-size:16px;line-height:1\.95/.test(css),'senior linked article readability missing');
console.log('P1-06 mobile Reader smoke PASS: senior mode, 44px+ controls, weak-network state, retryable images, media downgrade and readable article/table styles are present.');
