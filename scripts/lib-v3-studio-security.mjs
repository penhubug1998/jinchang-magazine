const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '0:0:0:0:0:0:0:1']);

export function isLoopbackHost(host = '') {
  return LOOPBACK_HOSTS.has(String(host || '').trim().toLowerCase());
}

export function evaluateStudioExposure({ host = '127.0.0.1', acceptanceOnly = false, adminPassword = '' } = {}) {
  const normalizedHost = String(host || '127.0.0.1').trim() || '127.0.0.1';
  const passwordConfigured = String(adminPassword || '').length > 0;
  if (isLoopbackHost(normalizedHost)) {
    return { ok: true, mode: 'loopback', host: normalizedHost, passwordConfigured };
  }
  if (acceptanceOnly) {
    return { ok: true, mode: 'acceptance-readonly', host: normalizedHost, passwordConfigured };
  }
  if (!passwordConfigured) {
    return {
      ok: false,
      mode: 'blocked-unprotected-remote',
      host: normalizedHost,
      passwordConfigured,
      error: `拒绝在 ${normalizedHost} 暴露未鉴权制作中心。请设置 STUDIO_ADMIN_PASSWORD，或仅绑定 127.0.0.1。`
    };
  }
  return { ok: true, mode: 'authenticated-remote', host: normalizedHost, passwordConfigured };
}

export function assertStudioExposureSafe(options = {}) {
  const result = evaluateStudioExposure(options);
  if (!result.ok) {
    const error = new Error(result.error);
    error.code = 'STUDIO_REMOTE_AUTH_REQUIRED';
    error.exposure = result;
    throw error;
  }
  return result;
}
