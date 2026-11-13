/* Dhamaka: big-screen scaling. Every big-screen page is laid out on a fixed canvas
 * (.screen, size from config.js: 1920 x 1080 for a 16:9 TV) and scaled to fill
 * the display, so the layout is identical at 1080p, 4K or on a laptop.
 *   ?anchor=top   pin the canvas to the top-left instead of centring it
 *   F             full screen;  the mouse cursor hides after 2 seconds of stillness
 */
(function () {
  var S = (window.DHAMAKA && window.DHAMAKA.screen) || { width: 1920, height: 1080 };
  var W = S.width, H = S.height, top = /[?&]anchor=top\b/.test(location.search);
  function fit() {
    var el = document.querySelector('.screen');
    if (!el) return;
    var s = Math.min(innerWidth / W, innerHeight / H);
    var x = top ? 0 : (innerWidth - W * s) / 2, y = top ? 0 : (innerHeight - H * s) / 2;
    el.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
    window.SCREEN_SCALE = s;
  }
  window.fitScreen = fit;
  addEventListener('resize', fit);
  document.addEventListener('DOMContentLoaded', fit);
  fit();
  document.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'f' || e.key === 'F') {
      if (!document.fullscreenElement) { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); }
      else if (document.exitFullscreen) document.exitFullscreen();
    }
  });
  var idle;
  function wake() {
    document.documentElement.classList.remove('cursor-off');
    clearTimeout(idle);
    idle = setTimeout(function () { document.documentElement.classList.add('cursor-off'); }, 2000);
  }
  addEventListener('mousemove', wake); addEventListener('mousedown', wake); wake();
})();
