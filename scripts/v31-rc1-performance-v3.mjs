import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { root, V3_VERSION } from './lib-v3-production.mjs';
const gzip=promisify(zlib.gzip);const assert=(c,m)=>{if(!c)throw new Error(m)};
const budgets={
 'src/studio/studio.js':380*1024,
 'src/studio/studio.css':220*1024,
 'src/reader/reader.js':96*1024,
 'src/reader/rich-text.js':32*1024,
 'src/reader/layout-engine.js':24*1024,
 'src/reader/reader.css':48*1024,
 'issues/001/issue.json':320*1024,
 'issues/002/issue.json':520*1024
};
const files={};let failed=[];
for(const [rel,budget] of Object.entries(budgets)){const file=path.join(root,rel),buf=await readFile(file),gz=await gzip(buf);files[rel]={bytes:buf.length,gzipBytes:gz.length,budget,ratio:Number((buf.length/budget).toFixed(3)),pass:buf.length<=budget};if(buf.length>budget)failed.push(`${rel} ${buf.length}>${budget}`)}
const readerJs=['src/reader/reader.js','src/reader/rich-text.js','src/reader/layout-engine.js'].reduce((n,k)=>n+files[k].bytes,0);const readerBudget=140*1024;if(readerJs>readerBudget)failed.push(`reader JS total ${readerJs}>${readerBudget}`);
const report={version:V3_VERSION,generatedAt:new Date().toISOString(),budgets,files,totals:{readerJsBytes:readerJs,readerJsBudget:readerBudget},status:failed.length?'failed':'passed',failures:failed};
await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,'reports','v31-rc1-performance.json'),JSON.stringify(report,null,2)+'\n');
assert(!failed.length,`RC1 performance budget exceeded: ${failed.join('; ')}`);
console.log(`V3.1 RC1 性能预算通过：Studio JS ${Math.round(files['src/studio/studio.js'].bytes/1024)} KB；Reader JS 总量 ${Math.round(readerJs/1024)} KB；第一/二期数据均在冻结预算内。`);
