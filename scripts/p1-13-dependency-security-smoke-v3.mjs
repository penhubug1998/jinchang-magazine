import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const EXPECTED='3.31.3';
const DIRECT=['@tiptap/core','@tiptap/starter-kit','@tiptap/extension-text-style','@tiptap/extension-highlight','@tiptap/extension-text-align'];
const readJson=async rel=>JSON.parse(await readFile(path.join(root,rel),'utf8'));
const assert=(condition,message)=>{if(!condition)throw new Error(message)};

const pkg=await readJson('package.json');
for(const name of DIRECT) assert(pkg.dependencies?.[name]===EXPECTED,`${name} must be pinned to ${EXPECTED}, got ${pkg.dependencies?.[name]}`);
assert(pkg.richTextEngine?.version===EXPECTED,`richTextEngine.version must be ${EXPECTED}`);

const lock=await readJson('package-lock.json');
for(const name of DIRECT) assert(lock.packages?.['']?.dependencies?.[name]===EXPECTED,`package-lock root ${name} must be ${EXPECTED}`);
for(const [key,row] of Object.entries(lock.packages||{})){
  if(!key.startsWith('node_modules/@tiptap/')) continue;
  const version=String(row?.version||'');
  if(!version) continue;
  const [major,minor,patch]=version.split('.').map(Number);
  const vulnerable=major===3&&(minor<30||(minor===30&&patch<=3));
  assert(!vulnerable,`vulnerable Tiptap package remains: ${key} ${version}`);
}

const manifest=await readJson('src/reader/vendor/tiptap-runtime.manifest.json');
const runtime=await readFile(path.join(root,'src/reader/vendor/tiptap-runtime.js'));
const sha256=crypto.createHash('sha256').update(runtime).digest('hex');
assert(manifest.version===EXPECTED,`vendor manifest version must be ${EXPECTED}`);
assert(manifest.sha256===sha256,'vendor runtime SHA-256 does not match manifest');
assert(runtime.toString('utf8').includes(EXPECTED),'vendor runtime does not embed expected Tiptap version');

console.log(`P1-13 dependency security smoke PASS · Tiptap ${EXPECTED} · vendor ${runtime.length} bytes · ${sha256}`);
