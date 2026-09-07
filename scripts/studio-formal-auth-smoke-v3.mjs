import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const entry=path.join(root,'scripts','studio-secure-entry-v3.mjs');
const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
for(const key of ['studio:v3','studio:check']){
  const command=String(pkg.scripts?.[key]||'');
  if(!command.includes('studio-secure-entry-v3.mjs'))throw new Error(`${key} 必须通过 studio-secure-entry-v3.mjs 启动，当前：${command||'(missing)'}`);
}
const env={...process.env,NODE_ENV:'production',V3_FORMAL_MODE:'1'};
delete env.STUDIO_ADMIN_PASSWORD;

const result=spawnSync(process.execPath,[entry,'--check'],{cwd:root,env,encoding:'utf8'});
if(result.status!==78)throw new Error(`正式模式缺少 STUDIO_ADMIN_PASSWORD 应以 78 拒绝启动，实际 ${result.status}: ${result.stderr||result.stdout}`);
const output=`${result.stdout||''}\n${result.stderr||''}`;
if(!output.includes('正式模式拒绝启动')||!output.includes('STUDIO_ADMIN_PASSWORD'))throw new Error(`正式模式拒绝提示不明确：${output}`);

console.log('P0-03 正式认证入口回归通过：默认 npm Studio 命令锁定安全入口，正式模式缺密码 fail-closed。');
