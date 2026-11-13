/* Full-screen button for every page: hides the browser's address bar, tabs and menus
 * so only the app shows.
 *  - Computers, Android and iPad: the browser's full-screen mode (Esc or the button again to leave).
 *  - iPhone: Safari has no full-screen mode for web pages, so the button explains how to
 *    add the page to the Home Screen; opened from there it runs without any browser bars.
 *  - Already running from the Home Screen: the button is hidden.
 * Big screens also keep the F key (screen.js). The button fades with the mouse cursor there.
 */
(function () {
  var d = document, de = d.documentElement;
  var standalone = (window.matchMedia && (matchMedia("(display-mode: fullscreen)").matches || matchMedia("(display-mode: standalone)").matches)) || navigator.standalone === true;
  if (standalone) { de.classList.add("is-app"); return; }
  var canFs = !!(de.requestFullscreen || de.webkitRequestFullscreen);
  var isIOS = /iP(hone|od|ad)/.test(navigator.platform) || (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1);
  if (!canFs && !isIOS) return;

  var css = d.createElement("style");
  css.textContent =
    ".fs-btn{position:fixed;right:calc(14px + env(safe-area-inset-right));bottom:calc(14px + env(safe-area-inset-bottom));z-index:300;width:48px;height:48px;border-radius:50%;border:1px solid rgba(242,196,90,.55);background:rgba(32,7,22,.88);color:#f2c45a;display:grid;place-items:center;cursor:pointer;box-shadow:0 8px 24px -8px rgba(0,0,0,.8);transition:opacity .5s,transform .15s;-webkit-tap-highlight-color:transparent}" +
    ".fs-btn:active{transform:scale(.94)}" +
    "html.cursor-off .fs-btn{opacity:0;pointer-events:none}" +
    "html.has-screen .fs-btn{top:18px;bottom:auto;right:18px}" +
    "body:has(.scrim:not([hidden])) .fs-btn,body:has(.lightbox:not([hidden])) .fs-btn,body:has(.thanks:not([hidden])) .fs-btn,body:has(.viewer:not([hidden])) .fs-btn{display:none}" +
    ".fs-tip{position:fixed;inset:0;z-index:310;background:rgba(15,3,10,.8);display:flex;align-items:flex-end;justify-content:center;padding:16px}" +
    ".fs-tip>div{max-width:420px;width:100%;padding:22px 20px calc(20px + env(safe-area-inset-bottom));border-radius:22px;background:#3a1029;border:1px solid rgba(242,196,90,.4);color:#fbeedd;font:500 15px/1.5 Manrope,system-ui,sans-serif}" +
    ".fs-tip b{color:#f2c45a}.fs-tip h3{margin:0 0 8px;font:800 19px Poppins,sans-serif}.fs-tip ol{margin:8px 0 14px;padding-left:20px}.fs-tip li{margin:6px 0}" +
    ".fs-tip button{width:100%;min-height:46px;border:0;border-radius:999px;background:linear-gradient(135deg,#f2c45a,#f7a325 45%,#ff7a1a);color:#3a1206;font:800 15px Manrope,sans-serif;cursor:pointer}" +
    ".fs-share{display:inline-block;vertical-align:-3px}";
  d.head.appendChild(css);

  var ICON_IN = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  var ICON_OUT = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
  var btn = d.createElement("button");
  btn.type = "button"; btn.className = "fs-btn";

  function isFs() { return !!(d.fullscreenElement || d.webkitFullscreenElement); }
  function paint() {
    var on = isFs();
    btn.innerHTML = on ? ICON_OUT : ICON_IN;
    btn.title = on ? "Exit full screen (Esc)" : "Full screen";
    btn.setAttribute("aria-label", btn.title);
  }
  function enter() {
    var p = de.requestFullscreen ? de.requestFullscreen({ navigationUI: "hide" }) : de.webkitRequestFullscreen();
    if (p && p.catch) p.catch(function () { if (isIOS) tip(); });
    if (screen.orientation && screen.orientation.lock && d.querySelector(".screen")) screen.orientation.lock("landscape").catch(function () {});
  }
  function leave() { if (d.exitFullscreen) d.exitFullscreen(); else if (d.webkitExitFullscreen) d.webkitExitFullscreen(); }
  function tip() {
    var t = d.createElement("div"); t.className = "fs-tip"; t.setAttribute("role", "dialog");
    var share = '<svg class="fs-share" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f2c45a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1"/></svg>';
    t.innerHTML = "<div><h3>Full screen on iPhone</h3>Safari can't hide its bars on a web page, but this works:" +
      "<ol><li>Tap <b>Share</b> " + share + " at the bottom of Safari.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>" +
      "<li>Open it from your Home Screen. It runs full screen, with no address bar.</li></ol><button type='button'>Got it</button></div>";
    t.addEventListener("click", function (e) { if (e.target === t || e.target.tagName === "BUTTON") t.remove(); });
    d.body.appendChild(t);
  }
  btn.addEventListener("click", function () {
    btn.blur(); // so Space on the draw screen draws, not presses this button again
    if (isFs()) leave();
    else if (canFs) enter();
    else tip();
  });
  d.addEventListener("fullscreenchange", paint);
  d.addEventListener("webkitfullscreenchange", paint);
  function mount() {
    if (d.querySelector(".screen")) de.classList.add("has-screen");
    paint(); d.body.appendChild(btn);
  }
  if (d.body) mount(); else d.addEventListener("DOMContentLoaded", mount);
  window.toggleFullscreen = function () { if (isFs()) leave(); else if (canFs) enter(); else tip(); };
})();
