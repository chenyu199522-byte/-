// Electron reports client size in Windows logical pixels, already adjusted for display DPI.
function windowScale(width, height, enabled, overallScale = 100) {
  const manual = typeof overallScale === 'number' && Number.isFinite(overallScale) ? Math.min(125,Math.max(50,overallScale))/100 : 1;
  const automatic = enabled ? Math.min(1.6, Math.max(0.85, Math.min(width / 1440, height / 900))) : 1;
  return automatic * manual;
}
module.exports = {windowScale};
