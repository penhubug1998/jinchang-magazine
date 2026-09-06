import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  narrationDigestProfile,
  narrationPageDigests,
  narrationSourceDigest,
  root,
  TTS_DIGEST_PROFILE_ARTICLE_SUMMARY_V2,
  TTS_DIGEST_PROFILE_PAGE_V1
} from './lib-v3-production.mjs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };

for (const id of ['001', '002']) {
  const issue = JSON.parse(await readFile(path.join(root, 'issues', id, 'issue.json'), 'utf8'));
  assert(narrationDigestProfile(issue) === TTS_DIGEST_PROFILE_PAGE_V1, `${id} 应命中已发布 page-v1 TTS 兼容档`);
  assert(narrationSourceDigest(issue) === issue.features.narration.sourceDigest, `${id} page-v1 sourceDigest 未恢复`);
  assert(JSON.stringify(narrationPageDigests(issue)) === JSON.stringify(issue.features.narration.pageDigests), `${id} page-v1 页级指纹未恢复`);

  const upgraded = structuredClone(issue);
  upgraded.features.narration.digestProfile = TTS_DIGEST_PROFILE_ARTICLE_SUMMARY_V2;
  assert(narrationDigestProfile(upgraded) === TTS_DIGEST_PROFILE_ARTICLE_SUMMARY_V2, `${id} 显式 v2 未生效`);
  assert(narrationSourceDigest(upgraded) !== issue.features.narration.sourceDigest, `${id} 升级到 v2 后应要求重新生成 TTS`);
}

const fresh = { id: '999', features: { narration: {} }, pages: [] };
assert(narrationDigestProfile(fresh) === TTS_DIGEST_PROFILE_ARTICLE_SUMMARY_V2, '新一期应默认使用 article-summary-v2');

console.log('TTS profile smoke 通过：001/002 保留已发布 page-v1 音频语义，新一期默认 article-summary-v2，显式升级会触发重新生成。');
