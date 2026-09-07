from pathlib import Path
import re

p = Path('scripts/p1-02-03-studio-flow-patch.py')
s = p.read_text()
pat = re.compile(r"replace_once\('scripts/studio-v3\.mjs', '''    if \(cloneSource\) \{[\s\S]*?, 'template application server'\)\n")
replacement = """p=Path('scripts/studio-v3.mjs'); s=p.read_text()
route_start=\"    if (cloneSource) {\"
route_end=\"  }\\n  if (seg[0]==='api'&&seg[1]==='issues'&&seg[2]) {\"
start=s.find(route_start,s.find(\"if (u.pathname==='/api/issues'&&req.method==='POST')\"))
end=s.find(route_end,start)
if start<0 or end<0: raise SystemExit('template application server boundary drifted')
new_tail=(
\"    if (cloneSource) {\\n\"
\"      const targetFile=path.join(root,'issues',created.id,'issue.json'); const target=await readJson(targetFile); const cloned=cloneStructure(cloneSource,target); validateIssue(cloned,created.id); await writeFile(targetFile,`${JSON.stringify(cloned,null,2)}\\\\n`,'utf8'); await runScriptAsync('sync-assets-v3.mjs',['--issue',created.id]); created.pageCount=cloned.pages.length;\\n\"
\"    } else if(startMode==='template') {\\n\"
\"      const targetFile=path.join(root,'issues',created.id,'issue.json'); const target=await readJson(targetFile); const templated=applyWholeMagazineTemplate(templateId,target); validateIssue(templated,created.id); await atomicWriteText(targetFile,`${JSON.stringify(templated,null,2)}\\\\n`); await runScriptAsync('sync-assets-v3.mjs',['--issue',created.id]); created.pageCount=templated.pages.length; created.wholeTemplate=templated.wholeTemplate;\\n\"
\"    }\\n\"
\"    const createdIssue=await readJson(path.join(root,'issues',created.id,'issue.json'));const source=await writeSourceReceipt(created.id,createdIssue,{reason:`issue-created:${startMode}`});\\n\"
\"    return send(res,201,{issue:created,output:r.output,source,startMode,next:startMode==='import'?'import':startMode==='template'?'layout':'content'});\\n\"
)
s=s[:start]+new_tail+s[end:]
p.write_text(s)
"""
s2, n = pat.subn(lambda _: replacement, s, count=1)
if n != 1:
    raise SystemExit(f'could not rewrite template application patch block: {n}')
p.write_text(s2)
print('rewrote P1-02/03 patcher to use stable route boundaries')
