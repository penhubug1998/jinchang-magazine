#!/usr/bin/env python3
import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
pkg_path=root/'package.json'
pkg=json.loads(pkg_path.read_text(encoding='utf-8'))
scripts=pkg.setdefault('scripts',{})
updates={
  'test:p1-11':'node scripts/p1-11-final-session-smoke-v3.mjs',
  'final:v31:session:start':'node scripts/p1-11-final-session-v3.mjs start',
  'final:v31:session:status':'node scripts/p1-11-final-session-v3.mjs status',
  'final:v31:session:show':'node scripts/p1-11-final-session-v3.mjs show',
  'final:v31:session:seal':'node scripts/p1-11-final-session-v3.mjs seal',
  'final:v31:evidence:bundle':'node scripts/p1-11-final-evidence-bundle-v3.mjs',
  'final:v31:evidence:bundle:strict':'node scripts/p1-11-final-evidence-bundle-v3.mjs --strict',
  'final:v31:evidence:verify':'node scripts/p1-11-final-evidence-verify-v3.mjs'
}
changed=False
for key,value in updates.items():
    if scripts.get(key)!=value:
        scripts[key]=value
        changed=True
if changed:
    pkg_path.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('P1-11 package scripts '+('updated' if changed else 'already present'))
