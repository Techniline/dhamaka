/* =====================================================================
 * Diwali Dhamaka · Techniline Electronics
 * EVERY event setting lives in this file. Change the values below and
 * replace the logos in /assets if you need to; nothing else needs editing.
 *
 * Security note: this file is public. Never put a PIN, a staff key or an API
 * secret here. Those go in the Apps Script's Script Properties only.
 * ===================================================================== */
window.DHAMAKA = {

  // ---- Event --------------------------------------------------------------
  eventName: "Diwali Dhamaka",            // the event's name
  tagline: "Festival of Lights 2026",    // shown under the name
  company: "Techniline Electronics",      // host
  dateText: "",                           // e.g. "Friday 20 November · 7 pm" ("" to hide)
  venue: "",                              // e.g. "Techniline HQ, Dubai" ("" to hide)
  timeZone: "Asia/Dubai",                 // used for the time stamped on photos and in the draw log
  hashtags: ["#DiwaliDhamaka", "#Techniline", "#HappyDiwali"],

  // ---- Photo frame (drawn on every guest photo) ----------------------------
  frame: {
    title: "Diwali Dhamaka",              // big words on the frame bar (shrinks to fit)
    tag: "FESTIVAL OF LIGHTS",            // small bold text under the title
    line: "2026",                         // small text after the tag
    hostLabel: "HOSTED BY"                // label above the company logo ("" to hide)
  },

  // ---- Colours (hex) ---------------------------------------------------------
  colors: {
    background: "#2a0a1e",                // deep aubergine-maroon
    surface: "#3a1029",                   // cards and panels
    marigold: "#f7a325",                  // main accent (buttons)
    saffron: "#ff7a1a",                   // second accent (gradient end)
    gold: "#f2c45a",                      // highlights, ticks, numbers
    rose: "#d6336c",                      // rangoli pink
    cream: "#fbeedd"                      // text
  },

  // ---- Logos and art (files in /assets) --------------------------------------
  logos: {
    event: "assets/diya.svg",             // event mark (the diya)
    company: "assets/techniline.png",     // company logo, works on a dark background
    art: "assets/mandala.svg"             // rangoli key art
  },

  // ---- Raffle draw -------------------------------------------------------------
  draw: {
    prefix: "DW-",                        // draw numbers look like DW-001
    // Default prizes, in the order they are drawn (first line is drawn first).
    // You can change them on the night in admin.html without touching this file.
    prizes: ["3rd prize", "2nd prize", "1st prize"],
    // Timing of one draw in milliseconds (about 21 seconds from Draw to the name)
    pace: { shuffle: 4000, gap: 900, digit: 3000, digitTurns: 2, last: 9000, lastTurns: 9 }
  },

  // ---- Big screens ---------------------------------------------------------------
  screen: { width: 1920, height: 1080 },  // 16:9 TV. For a 2:1 LED wall use 1920 x 960.
  slideSeconds: 9,                        // live album: seconds per photo

  // ---- Connections (README steps 1 and 2) ---------------------------------------
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbwfUKDXqBVH0kZfopdttI00ebJQpOvDwKcoYzqwLtTcGnVcjeARBlcu-8hbyRgJAI6PJw/exec",   // ends with /exec
  cloudinaryCloudName: "xccqslt2",
  cloudinaryUploadPreset: "dhamaka",      // unsigned preset, folder "dhamaka"
  // Where the site lives: used for the QR codes on screens and posters.
  siteUrl: "https://techniline.github.io/diwali/",
  // Only used when a page is opened from this computer's test server (localhost)
  localTestApi: "/exec"
};

/* ---------------------------------------------------------------------
 * Below: applies the colours to every page. No need to edit.
 * ------------------------------------------------------------------- */
(function () {
  var c = window.DHAMAKA.colors, s = document.documentElement.style;
  function rgb(hex) { var n = parseInt(hex.replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(","); }
  Object.keys(c).forEach(function (k) { s.setProperty("--" + k, c[k]); s.setProperty("--" + k + "-rgb", rgb(c[k])); });
  s.setProperty("--screen-w", window.DHAMAKA.screen.width + "px");
  s.setProperty("--screen-h", window.DHAMAKA.screen.height + "px");
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  window.DHAMAKA.api = local && !/[?&]liveapi\b/.test(location.search) ? window.DHAMAKA.localTestApi : window.DHAMAKA.appsScriptUrl;
})();
