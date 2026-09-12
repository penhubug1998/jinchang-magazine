import assert from 'node:assert/strict';
import { changedTtsPages, narrationPageDigests, ttsGenerationDigests } from './lib-v3-production.mjs';

const issue = {
  id: 'tts-smoke',
  pages: [
    { type: 'article', title: '第一页', body: ['正文一'], blocks: [] },
    { type: 'article', title: '第二页', body: ['正文二'], blocks: [] },
    { type: 'article', title: '第三页', body: ['正文三'], blocks: [] }
  ],
  features: { narration: { pattern: 'assets/tts/page-{page}.mp3', scope: 'page', rate: 1 } }
};

const legacy = structuredClone(issue);
legacy.features.narration.pageDigests = narrationPageDigests(legacy);
legacy.features.narration.sourceDigest = legacy.features.narration.pageDigests.join('|');
assert.deepEqual(changedTtsPages(legacy), [], '旧版只有 pageDigests 时，未修改页面不应被判为变更');

const changed = structuredClone(legacy);
changed.pages[1].title += '（已修改）';
assert.deepEqual(changedTtsPages(changed), [2], '修改单页只应命中该页');

const partial = structuredClone(legacy);
partial.features.narration.generationDigests = ttsGenerationDigests(partial).map((value, index) => index === 0 ? value : undefined);
partial.pages[1].body[0] += '（已修改）';
assert.deepEqual(changedTtsPages(partial), [2], '部分页已有新指纹时，仍应保留旧页级基线作为回退');

const voiceChanged = structuredClone(legacy);
voiceChanged.features.narration.generationDigests = ttsGenerationDigests(voiceChanged);
voiceChanged.features.narration.voice = 'zh-CN-YunxiNeural';
assert.deepEqual(changedTtsPages(voiceChanged), [1, 2, 3], '声音改变时应重新生成全部页面');

const rateChanged = structuredClone(legacy);
rateChanged.features.narration.generationDigests = ttsGenerationDigests(rateChanged);
rateChanged.features.narration.rate = 1.15;
assert.deepEqual(changedTtsPages(rateChanged), [1, 2, 3], '语速改变时应重新生成全部页面');

const legacyVoiceChanged = structuredClone(legacy);
legacyVoiceChanged.features.narration.voice = 'zh-CN-YunxiNeural';
legacyVoiceChanged.features.narration.generationConfigChanged = true;
assert.deepEqual(changedTtsPages(legacyVoiceChanged), [1, 2, 3], '旧版页级基线改变声音后应全量更新');

console.log('增量 TTS 指纹回归通过：旧基线兼容、单页变更、部分基线、声音与语速变更均按预期识别。');
