#!/usr/bin/env python3
import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
file=root/'package.json'
pkg=json.loads(file.read_text(encoding='utf-8'))
s=pkg.setdefault('scripts',{})
updates={
  'test:p1-12':'node scripts/p1-12-finalization-smoke-v3.mjs',
  'final:v31:gate':'node scripts/p1-12-finalization-gate-v3.mjs --strict',
  'final:v31:finalization:status':'node scripts/p1-12-finalization-gate-v3.mjs',
  'final:v31':'node scripts/p1-12-finalize-v3.mjs'
}
changed=False
for k,v in updates.items():
    if s.get(k)!=v:
        s[k]=v;changed=True
if changed:file.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('P1-12 package scripts '+('updated' if changed else 'already present'))
