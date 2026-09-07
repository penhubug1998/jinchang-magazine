from pathlib import Path

p=Path('scripts/p1-02-03-studio-flow-patch.py')
s=p.read_text()
start=s.find("replace_once('scripts/studio-v3.mjs', '''    if (cloneSource) {")
label=", 'template application server')"
end=s.find(label,start)
if start<0 or end<0:
    raise SystemExit('template application patch call not found')
end+=len(label)
replacement=r'''p=Path('scripts/studio-v3.mjs'); s=p.read_text()
route_anchor="const before=new Set((await issueSummaries()).map(x=>x.id));"
route_pos=s.find(route_anchor)
block_start=s.find("    if (cloneSource) {",route_pos)
block_end_marker="    return send(res,201,{issue:created,output:r.output,source});"
block_end=s.find(block_end_marker,block_start)
if route_pos<0 or block_start<0 or block_end<0:
    raise SystemExit('template application server boundaries drifted')
block_end+=len(block_end_marker)
new_block='''    if (cloneSource) {
      const targetFile=path.join(root,'issues',created.id,'issue.json'); const target=await readJson(targetFile); const cloned=cloneStructure(cloneSource,target); validateIssue(cloned,created.id); await writeFile(targetFile,`${JSON.stringify(cloned,null,2)}\\n`,'utf8'); await runScriptAsync('sync-assets-v3.mjs',['--issue',created.id]); created.pageCount=cloned.pages.length;
    } else if(startMode==='template') {
      const targetFile=path.join(root,'issues',created.id,'issue.json'); const target=await readJson(targetFile); const templated=applyWholeMagazineTemplate(templateId,target); validateIssue(templated,created.id); await atomicWriteText(targetFile,`${JSON.stringify(templated,null,2)}\\n`); await runScriptAsync('sync-assets-v3.mjs',['--issue',created.id]); created.pageCount=templated.pages.length; created.wholeTemplate=templated.wholeTemplate;
    }
    const createdIssue=await readJson(path.join(root,'issues',created.id,'issue.json'));const source=await writeSourceReceipt(created.id,createdIssue,{reason:`issue-created:${startMode}`});
    return send(res,201,{issue:created,output:r.output,source,startMode,next:startMode==='import'?'import':startMode==='template'?'layout':'content'});'''
s=s[:block_start]+new_block+s[block_end:]
p.write_text(s)'''
s=s[:start]+replacement+s[end:]
p.write_text(s)
print('P1-02/03 bootstrap: replaced fragile route patch with boundary-based patching.')
