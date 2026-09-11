import { readFile } from 'node:fs/promises';

const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const root=new URL('../',import.meta.url);
const [html,css,studio]=await Promise.all([
  readFile(new URL('src/studio/index.html',root),'utf8'),
  readFile(new URL('src/studio/studio.css',root),'utf8'),
  readFile(new URL('src/studio/studio.js',root),'utf8'),
]);
for(const token of ['peerReadOnlyBanner','peerTakeoverBtn'])assert(html.includes(token),`制作中心缺少 ${token}`);
for(const token of ['peer-readonly-banner','body.peer-readonly','workspace-peer-state.readonly'])assert(css.includes(token),`只读状态样式缺少 ${token}`);
for(const token of ['PEER_LOCK_STALE_MS','reconcilePeerLock','requestPeerTakeover','lock-release','bindPeerReadOnlyGuard','当前窗口为只读'])assert(studio.includes(token),`多窗口编辑保护缺少 ${token}`);
console.log('V3.1-alpha32 Smoke 通过：多窗口编辑锁、只读降级、心跳、失联接管与保存保护契约完整。');
