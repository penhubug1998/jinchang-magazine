import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './lib-v3-production.mjs';
function run(script,args=[]){const r=spawnSync(process.execPath,[path.join(root,'scripts',script),...args],{cwd:root,encoding:'utf8'});if(r.status!==0)throw new Error(`${script} failed\n${r.stdout}\n${r.stderr}`);return r.stdout||''}
const next=run('final-next-v3.mjs',['--issue','003']);
if(!next.includes('NEXT ·'))throw new Error('final:next 未输出 NEXT');
run('rc2-media-hydrate-v3.mjs',['--jobs','4']);
const hydration=JSON.parse(await readFile(path.join(root,'reports/v3-rc2-media-hydration.json'),'utf8'));
if(hydration.summary?.expected!==51)throw new Error(`媒体补全应扫描 51 个文件，实际 ${hydration.summary?.expected}`);
if(hydration.jobs!==4)throw new Error(`--jobs 4 未写入报告，实际 ${hydration.jobs}`);
if(hydration.mode!=='dry-run')throw new Error('smoke 不应真正下载媒体');
console.log('V3.0.0 final ops smoke 通过：final:next 给出唯一下一步；媒体补全支持并发参数且 dry-run 覆盖 51 个历史媒体。');
