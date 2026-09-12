import { buildEvidenceBundle } from './lib-p1-11-final-session-v3.mjs';

const strict=process.argv.includes('--strict');
const {bundle,manifest}=await buildEvidenceBundle({strict});
console.log(`P1-11 evidence bundle ${strict?'STRICT':'PARTIAL'}\nready=${bundle.acceptance.ready}/${bundle.acceptance.total}\nsource=${bundle.source?.commit||'unavailable'}\nbundleSha256=${manifest.bundleSha256}\nmanifestSha256=${manifest.manifestSha256}`);
