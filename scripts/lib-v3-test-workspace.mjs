import {cp,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import net from 'node:net';
export const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function freePort(){return await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})})}
export async function createTestWorkspace(prefix='publication'){
  const dir=await mkdtemp(path.join(process.cwd(),`.tmp-v3-${prefix}-`));
  for(const name of ['scripts','src','baselines'])await cp(path.join(process.cwd(),name),path.join(dir,name),{recursive:true});
  await cp('package.json',path.join(dir,'package.json'));await mkdir(path.join(dir,'examples'));
  return dir;
}
export async function writePublicationFixture(dir,id='003'){
  const issue={id,label:'流程验收刊',publication:'电子期刊流程验收',publisher:'本地验收环境',subtitle:'阅读与记录',engine:'v3',status:'ready',theme:'classic-red',assetSource:`issues/${id}/assets`,features:{},articles:{},pages:[
    {type:'cover',navTitle:'封面',title:'阅读与记录',kicker:'本地验收环境',blocks:[{type:'coverMeta',text:'流程验收刊 · 阅读与记录'},{type:'quote',text:'让阅读成为日常，让记录延续交流。'}]},
    {type:'toc',navTitle:'目录',title:'本期导读',kicker:'CONTENTS',blocks:[{type:'toc',items:[{number:'01',title:'阅读札记',subtitle:'从阅读走向交流',page:3}]}]},
    {type:'article',navTitle:'阅读札记',section:'阅读札记',title:'从阅读走向交流',kicker:'阅读札记',blocks:[{type:'paragraph',style:'lead',text:'读书的价值，在于让新的观察与已有经验相遇。把阅读中的疑问记录下来，再与同伴交流，往往能获得更丰富的理解。'},{type:'paragraph',text:'制作这份刊物时，先整理稿件，再检查结构和文字，最后核对图片、署名与目录。每个环节保留清晰的修改记录，便于回看，也便于继续完善。期刊承载的不只是结论，还有观察、思考和交流的过程。'},{type:'image',src:'assets/image/reading.svg',alt:'书页与叶片构成的阅读插画',caption:'阅读与记录 · 插画'}]},
    {type:'closing',navTitle:'编后记',title:'让交流继续',kicker:'编后记',blocks:[{type:'paragraph',text:'这份刊物用于本地制作流程验收。通过整理文字、核对目录、预览版面和保留版本，编辑者能够逐步完成从稿件到成刊的过程。'},{type:'producer',text:'本地验收环境制作'}]}
  ]};
  await mkdir(path.join(dir,issue.assetSource,'image'),{recursive:true});
  await writeFile(path.join(dir,issue.assetSource,'image/reading.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="220" viewBox="0 0 640 220"><rect width="640" height="220" fill="#eaf1ed"/><path d="M80 175V45Q200 5 320 65V185Q210 125 80 175Z" fill="#537662"/><path d="M320 185V65Q440 5 560 45V175Q430 125 320 185Z" fill="#a7beb0"/><circle cx="570" cy="40" r="18" fill="#d9b965"/></svg>');
  await writeFile(path.join(dir,'issues',id,'issue.json'),JSON.stringify(issue,null,2)+'\n');return issue;
}
export async function startTestStudio(dir,env={}){
  const port=await freePort();let logs='';
  const child=spawn(process.execPath,['scripts/studio-v3.mjs','--host','127.0.0.1','--port',String(port)],{cwd:dir,env:{...process.env,STUDIO_ADMIN_PASSWORD:'',JINCHANG_MAGAZINE_ROOT:dir,V3_PUBLICATION_OUTPUT_ROOT:path.join(dir,'outputs-v3'),...env},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);const base=`http://127.0.0.1:${port}`;
  for(let n=0;n<100;n++){try{if((await fetch(base+'/api/health')).ok)return {child,base,logs:()=>logs};}catch{}if(child.exitCode!==null)break;await pause(60);}
  child.kill();throw Error('测试服务未启动：'+logs);
}
export async function stopTestStudio(server){if(server?.child&&server.child.exitCode===null){const done=new Promise(resolve=>server.child.once('exit',resolve));server.child.kill();await done;}}
export async function removeTestWorkspace(dir){await rm(dir,{recursive:true,force:true})}
