from pathlib import Path
p=Path('scripts/p1-07-publish-wizard-patch.py')
s=p.read_text()
bad='replace_once(js,"publicationSnapshots:[], publicationWorkflow:null, studioEntry:\'content\' };","publicationSnapshots:[], publicationWorkflow:null, studioEntry:\'content\' };")\n'
if bad in s:
    s=s.replace(bad,'',1)
p.write_text(s)
print('P1-07 patch self-check fixed')
