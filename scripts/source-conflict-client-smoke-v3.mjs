import { createSourceConflictFetchGuard } from '../src/studio/workspace/inspector.js';

const assert=(condition,message)=>{if(!condition)throw new Error(message)};
class MemoryStorage{
  constructor(){this.map=new Map()}
  getItem(key){return this.map.has(key)?this.map.get(key):null}
  setItem(key,value){this.map.set(key,String(value))}
  removeItem(key){this.map.delete(key)}
}

let serverFingerprint='server-v2';
let draftExists=true;
const observed=[];
const fakeFetch=async(input,init={})=>{
  const url=new URL(String(input),'http://studio.test');
  const method=String(init.method||'GET').toUpperCase();
  if(url.pathname==='/api/issues/003'&&method==='PUT'){
    const payload=JSON.parse(init.body);observed.push(payload.sourceFingerprint);
    if(payload.sourceFingerprint!==serverFingerprint)return new Response(JSON.stringify({code:'SOURCE_DRIFT',error:'stale'}),{status:409,headers:{'Content-Type':'application/json'}});
    return new Response(JSON.stringify({issue:payload.issue,source:{fingerprint:serverFingerprint}}),{status:200,headers:{'Content-Type':'application/json'}});
  }
  if(url.pathname==='/api/issues/003'&&method==='GET')return new Response(JSON.stringify({id:'003',title:'server'}),{status:200,headers:{'Content-Type':'application/json'}});
  if(url.pathname==='/api/issues/003/source-status'&&method==='GET')return new Response(JSON.stringify({fingerprint:serverFingerprint}),{status:200,headers:{'Content-Type':'application/json'}});
  if(url.pathname==='/api/issues/003/draft'&&method==='GET')return new Response(JSON.stringify({exists:draftExists}),{status:200,headers:{'Content-Type':'application/json'}});
  if(url.pathname==='/api/issues/003/draft'&&method==='DELETE'){draftExists=false;return new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json'}})}
  return new Response(JSON.stringify({error:'not found'}),{status:404,headers:{'Content-Type':'application/json'}});
};

const storage=new MemoryStorage();
const guarded=createSourceConflictFetchGuard(fakeFetch,{storage});
const save=(fingerprint,text='local')=>guarded('/api/issues/003',{method:'PUT',body:JSON.stringify({issue:{id:'003',text},sourceFingerprint:fingerprint})});

let response=await save('server-v1','stale-local');
assert(response.status===409,'第一次旧基线保存必须被服务器拒绝');
assert(guarded.isBlocked('003'),'SOURCE_DRIFT 后必须锁定本标签页编辑基线');
assert(guarded.blockedFingerprint('003')==='server-v1','必须保留第一次被拒绝的编辑基线');

await guarded('/api/issues/003/source-status');
response=await save('server-v2','stale-local-retry');
assert(response.status===409,'刷新服务器状态后连续保存仍必须被拒绝');
assert(observed.at(-1)==='server-v1','连续保存不得把新服务器指纹当成旧稿编辑基线');

await guarded('/api/issues/003');
await guarded('/api/issues/003/draft');
assert(guarded.isBlocked('003'),'重新读取服务器版本但恢复草稿仍存在时不得解除冲突锁');
response=await save('server-v2','recovered-stale-draft');
assert(response.status===409,'恢复旧草稿后不得覆盖服务器新稿');
assert(observed.at(-1)==='server-v1','恢复旧草稿后仍应使用原冲突基线进行保护');

await guarded('/api/issues/003/draft',{method:'DELETE'});
assert(!guarded.isBlocked('003'),'重新读取服务器版本并丢弃恢复草稿后应解除冲突锁');
response=await save('server-v2','fresh-edit');
assert(response.ok,'解除冲突后基于最新服务器版本的新编辑应允许保存');
assert(observed.at(-1)==='server-v2','解除冲突后应使用最新编辑基线');

console.log('P0-02 客户端冲突回归通过：SOURCE_DRIFT 后连续保存、状态刷新和旧草稿恢复均不能覆盖服务器新稿。');
