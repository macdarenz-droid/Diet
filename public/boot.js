// Runs before first paint: applies the saved theme and motion preference so nothing flashes.
// An external file, not inline, so the Content-Security-Policy can stay script-src 'self'.
(function () {
  var d = document.documentElement;
  try {
    var prefs = JSON.parse(localStorage.getItem('diet.prefs') || '{}');
    if (prefs.theme === 'day' || prefs.theme === 'night') d.setAttribute('data-theme', prefs.theme);
    if (prefs.reduceMotion) d.setAttribute('data-motion', 'reduce');
  } catch (e) {}
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', d.getAttribute('data-theme') === 'day' ? '#fbfbfa' : '#08090a');
})();
