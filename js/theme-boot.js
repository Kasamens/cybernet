// Runs synchronously in <head> before first paint, so the page never flashes the wrong theme.
// Stored mode: "auto" | "light" (Daylight) | "dark". Auto follows the OS; dark is the fallback.
(function () {
  var mode = 'auto';
  try { mode = localStorage.getItem('cn-theme') || 'auto'; } catch (e) {}
  var light = mode === 'light' || (mode === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  document.documentElement.dataset.mode = mode;
})();
