import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStudioExposureSafe } from './lib-v3-studio-security.mjs';

const argv = process.argv.slice(2);
const valueFor = (name, fallback = '') => {
  const exact = `--${name}`;
  const prefixed = `${exact}=`;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith(prefixed)) return token.slice(prefixed.length);
    if (token === exact && argv[i + 1] != null && !argv[i + 1].startsWith('--')) return argv[i + 1];
  }
  return fallback;
};
const hasFlag = name => argv.includes(`--${name}`) || argv.some(token => token === `--${name}=true`);

const host = valueFor('host', '127.0.0.1');
const acceptanceOnly = hasFlag('acceptance-only');
const adminPassword = String(process.env.STUDIO_ADMIN_PASSWORD || '');

let exposure;
try {
  exposure = assertStudioExposureSafe({ host, acceptanceOnly, adminPassword });
} catch (error) {
  console.error(`[studio security] ${error.message}`);
  process.exit(2);
}

if (exposure.mode === 'acceptance-readonly' && !exposure.passwordConfigured) {
  console.warn(`[studio security] ${host} 仅以 acceptance-only 只读模式对外开放；请勿用于正式管理端。`);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [path.join(here, 'studio-v3.mjs'), ...argv], {
  stdio: 'inherit',
  env: process.env
});
child.on('error', error => {
  console.error(`[studio launch] ${error.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
