export const ZOOM_STEPS = [25, 33, 50, 67, 75, 100, 125, 150, 200];

export function clampZoom(value, min = 25, max = 200) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function nearestZoomStep(value, direction = 0, steps = ZOOM_STEPS) {
  const z = clampZoom(value);
  if (direction > 0) return steps.find(step => step > z) ?? steps.at(-1);
  if (direction < 0) return [...steps].reverse().find(step => step < z) ?? steps[0];
  return steps.reduce((best, step) => Math.abs(step - z) < Math.abs(best - z) ? step : best, steps[0]);
}

export function resolveViewportScale({
  mode = 'fit-page',
  zoomPercent = 100,
  areaWidth = 0,
  areaHeight = 0,
  deviceWidth = 1366,
  deviceHeight = 768,
  padding = 24,
} = {}) {
  const aw = Math.max(1, Number(areaWidth) || 1);
  const ah = Math.max(1, Number(areaHeight) || 1);
  const dw = Math.max(1, Number(deviceWidth) || 1);
  const dh = Math.max(1, Number(deviceHeight) || 1);
  const usableW = Math.max(1, aw - padding);
  const usableH = Math.max(1, ah - padding);
  const widthScale = usableW / dw;
  const pageScale = Math.min(widthScale, usableH / dh);
  if (mode === 'fit-width') return Math.max(.08, Math.min(2, widthScale));
  if (mode === 'manual') return clampZoom(zoomPercent) / 100;
  return Math.max(.08, Math.min(2, pageScale));
}

export function zoomLabel(mode, zoomPercent, actualScale) {
  if (mode === 'fit-width') return `适合宽度 · ${Math.round(actualScale * 100)}%`;
  if (mode === 'manual') return `${clampZoom(zoomPercent)}%`;
  return `适合页面 · ${Math.round(actualScale * 100)}%`;
}
