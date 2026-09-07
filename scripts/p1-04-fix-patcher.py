from pathlib import Path

p=Path('scripts/p1-04-docx-rich-import-patch.py')
s=p.read_text()
old="replace_between('scripts/lib-v3-import.mjs','function finalizeDocument(doc) {','\\n\\nfunction parseDocxXml',r'''"
new="replace_between('scripts/lib-v3-import.mjs','function finalizeDocument(doc) {','\\n\\nfunction commandExists',r'''"
if old not in s:
    raise SystemExit('P1-04 parser replacement boundary marker drifted')
p.write_text(s.replace(old,new,1))
print('P1-04 parser replacement now removes the legacy parseDocxXml implementation')
