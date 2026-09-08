import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { root, exists } from './lib-v3-production.mjs';
import { FINAL_BUNDLE_FILE, FINAL_BUNDLE_MANIFEST_FILE, verifyBundleObjects } from './lib-p1-11-final-session-v3.mjs';

for(const rel of [FINAL_BUNDLE_FILE,FINAL_BUNDLE_MANIFEST_FILE])if(!(await exists(path.join(root,rel)))){console.error(`missing ${rel}`);process.exit(2)}
const bundle=JSON.parse(await readFile(path.join(root,FINAL_BUNDLE_FILE),'utf8'));
const manifest=JSON.parse(await readFile(path.join(root,FINAL_BUNDLE_MANIFEST_FILE),'utf8'));
const result=verifyBundleObjects(bundle,manifest);
if(!result.ok){console.error(`P1-11 evidence verify FAILED\n${result.errors.join('\n')}`);process.exit(1)}
console.log(`P1-11 evidence verify PASS\nbundleSha256=${result.bundleSha256}\nmanifestSha256=${result.manifestSha256}`);
