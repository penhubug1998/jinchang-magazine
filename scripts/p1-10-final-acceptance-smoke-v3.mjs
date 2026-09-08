import assert from 'node:assert/strict';
import { deviceEvidenceStatus, evidenceSha256, summarizeAcceptance, uaMatches } from './lib-p1-10-final-acceptance-v3.mjs';

const source={commit:'a'.repeat(40),committedAt:'2026-09-08T01:00:00.000Z',available:true};
const checks={readerVisible:true,navigation:true,toc:true,font:true,narration:true,music:true,video:true,fullscreen:true,resume:true};
const edgeUa='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0';
const wechatUa='Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/139.0 Mobile Safari/537.36 MicroMessenger/8.0.60.2800';
assert.equal(uaMatches('edge-desktop',edgeUa),true);
assert.equal(uaMatches('android-wechat',wechatUa),true);
assert.equal(uaMatches('edge-desktop','Mozilla/5.0 Chrome/140 Safari/537.36'),false);

const ready={deviceType:'edge-desktop',deviceName:'Windows 11 Edge',userAgent:edgeUa,issue:'002',checks,auto:{corePass:true},passed:true,version:'3.1.0',key:'edge-desktop:Windows 11 Edge',recordedAt:'2026-09-08T02:00:00.000Z',sourceCommit:source.commit,sourceCommittedAt:source.committedAt};
ready.evidenceSha256=evidenceSha256(ready);
assert.equal(deviceEvidenceStatus(ready,source,'edge-desktop').status,'READY');
const stale={...ready,sourceCommit:'b'.repeat(40)};stale.evidenceSha256=evidenceSha256(stale);assert.equal(deviceEvidenceStatus(stale,source,'edge-desktop').status,'STALE');
const tampered={...ready,deviceName:'tampered'};assert.equal(deviceEvidenceStatus(tampered,source,'edge-desktop').status,'FAILED');
const old={...ready};delete old.evidenceSha256;assert.equal(deviceEvidenceStatus(old,source,'edge-desktop').status,'STALE');
const wechat={...ready,deviceType:'android-wechat',deviceName:'Pixel WeChat',userAgent:wechatUa,key:'android-wechat:Pixel WeChat'};wechat.evidenceSha256=evidenceSha256(wechat);assert.equal(deviceEvidenceStatus(wechat,source,'android-wechat').status,'READY');

const eight={gates:Array.from({length:8},(_,i)=>({id:String(i),status:'READY'}))};assert.deepEqual(summarizeAcceptance(eight),{ready:8,total:8,allowed:true});
eight.gates[7].status='STALE';assert.deepEqual(summarizeAcceptance(eight),{ready:7,total:8,allowed:false});
console.log('P1-10 Final Acceptance evidence smoke PASS');
