// Runs before first paint: applies the saved theme and motion preference so nothing flashes.
// An external file, not inline, so the Content-Security-Policy can stay script-src 'self'.
(function () {
  var d = document.documentElement;
  try {
    var prefs = JSON.parse(localStorage.getItem('nuance.prefs') || '{}');
    if (prefs.theme === 'day' || prefs.theme === 'night') d.setAttribute('data-theme', prefs.theme);
    if (prefs.reduceMotion) d.setAttribute('data-motion', 'reduce');
  } catch (e) {}
  var day = d.getAttribute('data-theme') === 'day';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', day ? '#fbfbfa' : '#08090a');
  // iOS home-screen apps: white status-bar text is unreadable on the Day background.
  var bar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (bar && day) bar.setAttribute('content', 'default');
})();
