import { evaluateStudioExposure, isLoopbackHost } from './lib-v3-studio-security.mjs';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const host of ['127.0.0.1', 'localhost', '::1', '[::1]']) {
  assert(isLoopbackHost(host), `应识别 loopback: ${host}`);
  assert(evaluateStudioExposure({ host }).ok, `loopback 不应要求密码: ${host}`);
}

const blocked = evaluateStudioExposure({ host: '0.0.0.0', acceptanceOnly: false, adminPassword: '' });
assert(!blocked.ok, '未配置密码时 0.0.0.0 必须 fail-closed');
assert(blocked.mode === 'blocked-unprotected-remote', '远程未鉴权模式标识错误');

const protectedRemote = evaluateStudioExposure({ host: '0.0.0.0', acceptanceOnly: false, adminPassword: 'configured-secret' });
assert(protectedRemote.ok && protectedRemote.mode === 'authenticated-remote', '配置密码后应允许远程管理端');

const readonlyLan = evaluateStudioExposure({ host: '0.0.0.0', acceptanceOnly: true, adminPassword: '' });
assert(readonlyLan.ok && readonlyLan.mode === 'acceptance-readonly', 'acceptance-only 应保留设备验收入口');

console.log('Studio security smoke 通过：loopback、本地开发、远程鉴权与 acceptance-only 暴露策略正常。');
