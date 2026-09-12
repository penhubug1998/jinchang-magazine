import { parsePlainText } from './lib-v3-import.mjs';

const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const source=count=>Array.from({length:count},(_,i)=>`第 ${i+1} 段正文，用于验证长稿导入完整性。`).join('\n\n');

for(const count of [499,500]){
  const doc=parsePlainText(source(count),{filename:`boundary-${count}.txt`});
  assert(doc.blocks.length===count,`${count} 段导入不完整：实际 ${doc.blocks.length}`);
  assert(doc.stats?.blocks===count,`${count} 段统计不一致：${doc.stats?.blocks}`);
  assert(doc.blocks.at(-1)?.text.includes(`第 ${count} 段正文`),`${count} 段末段内容丢失`);
}

for(const count of [501,510]){
  let error=null;
  try{parsePlainText(source(count),{filename:`boundary-${count}.txt`})}catch(e){error=e}
  assert(error,`${count} 段超限稿件不应静默成功`);
  assert(error.code==='IMPORT_BLOCK_LIMIT_EXCEEDED',`${count} 段错误码异常：${error.code||'none'}`);
  assert(error.statusCode===413,`${count} 段错误状态异常：${error.statusCode||'none'}`);
  assert(error.details?.blockCount===count,`${count} 段错误未保留真实块数：${error.details?.blockCount}`);
  assert(error.details?.limit===500,`${count} 段错误未返回 500 块上限`);
  assert(String(error.message).includes('为避免内容丢失'),`${count} 段错误未明确说明内容保护`);
}

console.log('P0-01 导入完整性回归通过：499/500 块完整保留，501/510 块明确拒绝且不静默截断。');
