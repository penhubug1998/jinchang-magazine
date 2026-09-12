const formalMode = process.env.NODE_ENV === 'production' || process.env.V3_FORMAL_MODE === '1';
const adminPassword = String(process.env.STUDIO_ADMIN_PASSWORD || '');

if (formalMode && !adminPassword) {
  console.error('[Studio] 正式模式拒绝启动：未配置 STUDIO_ADMIN_PASSWORD。');
  process.exit(78);
}

await import('./studio-v3.mjs');
