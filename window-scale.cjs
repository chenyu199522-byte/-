// Electron reports client size in Windows logical pixels, already adjusted for display DPI.
function windowScale(width, height, enabled) {
  if (!enabled) return 1;
  return Math.min(1.6, Math.max(0.85, Math.min(width / 1440, height / 900)));
}
module.exports = {windowScale};
