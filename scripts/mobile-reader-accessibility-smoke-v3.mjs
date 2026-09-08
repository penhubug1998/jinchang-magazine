import { readFile } from 'node:fs/promises';

const [html, js, css] = await Promise.all([
  readFile('src/reader/index.html','utf8'),
  readFile('src/reader/reader.js','utf8'),
  readFile('src/reader/reader.css','utf8'),
]);
const assert=(condition,message)=>{if(!condition)throw new Error(message)};

for(const token of ['id="networkStatus"','id="networkRetry"'])assert(html.includes(token),`Reader shell missing ${token}`);
for(const token of ['fetchIssueWithRetry','currentNetworkMode','networkConnection','saveData','effectiveType','media-load-error','data-media-retry'])assert(js.includes(token),`Reader logic missing ${token}`);
assert(!html.includes('seniorButton')&&!html.includes('seniorDialogButton')&&!js.includes('seniorMode')&&!css.includes('senior-mode'),'senior mode must be removed from the Reader');
assert(js.includes('state.networkMode!=="normal"')&&js.includes('video.preload="none"'),'weak network video preload downgrade missing');
assert(js.includes('startMusic({manual:true})'),'explicit music override missing');
assert(js.includes('case "table"'),'table speech fallback missing');
for(const token of ['P1-06 · mobile Reader + weak-network recovery','.network-status','.media-retry','min-height:44px'])assert(css.includes(token),`Reader CSS missing ${token}`);
assert(/\.actions\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/.test(css),'mobile top actions must fit four controls');
console.log('P1-06 mobile Reader smoke PASS: four controls, 44px+ targets, weak-network state, retryable images, media downgrade and readable article/table styles are present.');
