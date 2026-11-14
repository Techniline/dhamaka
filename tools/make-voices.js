#!/usr/bin/env node
/* Dhamaka: records the announcer's lines with Microsoft's natural neural voices, so the
 * draw screen sounds natural in every browser (not only in Edge).
 *
 *   pip install edge-tts          (once)
 *   node tools/make-voices.js     (again whenever people, guests or prizes change)
 *
 * It reads the prizes and everyone on the list (employees and checked-in guests) from
 * the live Apps Script, records only what is new into assets/voice/, deletes recordings
 * nobody needs any more, and writes assets/voice/voices.json for the draw screen.
 * Then publish (git push) so the site has the new recordings.
 *
 * Every recording is trimmed of the silence the voice service adds (needs ffmpeg), so lines
 * follow each other at a natural pace.
 *
 * Options: --offline     use config.js prizes only, skip names (no Apps Script call)
 *          --numbers=N   record "Lucky number" 1 to N (default: highest draw number + 150, at least 250)
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto");
const { execFile } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "assets", "voice");
const OFFLINE = process.argv.includes("--offline");

// config.js expects a browser; give it just enough of one
const win = { location: { hostname: "tools", search: "" } };
const sandbox = { window: win, document: { documentElement: { style: { setProperty() {} } } }, location: win.location };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "config.js"), "utf8"), sandbox);
const CFG = win.DHAMAKA;
const Voice = require(path.join(ROOT, "assets", "announcer.js"));
const A = Voice.make(CFG.draw);
const NAT = Object.assign({ english: "en-IN-NeerjaNeural", hindi: "hi-IN-SwaraNeural", rate: "+0%" }, (CFG.draw.voice || {}).natural);
const VOICES = { en: NAT.english, hi: NAT.hindi };
const TRIM = "trim2"; // change to re-make every recording
const arg = (name) => { const a = process.argv.find(x => x.startsWith("--" + name + "=")); return a ? a.split("=")[1] : null; };
let HAVE_FFMPEG = true;

async function liveData() {
  if (OFFLINE) return { prizes: CFG.draw.prizes, names: [], maxN: 0 };
  const res = await fetch(CFG.appsScriptUrl + "?action=people", { redirect: "follow" });
  const d = await res.json();
  if (!d.ok) throw new Error("Apps Script said: " + JSON.stringify(d).slice(0, 200));
  const names = []; let maxN = 0;
  (d.people || []).forEach(p => {
    names.push(p.name); maxN = Math.max(maxN, p.n || 0);
    (p.g || []).forEach(g => { names.push(g.name); maxN = Math.max(maxN, g.n || 0); });
  });
  return { prizes: d.prizes && d.prizes.length ? d.prizes : CFG.draw.prizes, names, maxN: Math.max(maxN, (d.next || 1) - 1) };
}

function fileFor(lang, text) {
  const h = crypto.createHash("sha1").update([VOICES[lang], NAT.rate, TRIM, Voice.key(lang, text)].join("\n")).digest("hex");
  return lang + "-" + h.slice(0, 14) + ".mp3";
}

function run(cmd, args) {
  return new Promise((ok, fail) => execFile(cmd, args, { windowsHide: true }, err => err ? fail(err) : ok()));
}
// Silence trimmed from the start (all) and the end (all but 0.1 s), re-encoded small
const TRIM_FILTER = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03," +
  "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1,areverse";
async function record(lang, text, file) {
  const final = path.join(OUT, file), raw = final + ".raw.mp3";
  await run("python", ["-m", "edge_tts", "--voice", VOICES[lang], "--rate", NAT.rate, "--text", text, "--write-media", raw]);
  if (HAVE_FFMPEG) {
    try {
      await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-af", TRIM_FILTER, "-ac", "1", "-b:a", "48k", final]);
      fs.unlinkSync(raw); return;
    } catch (e) { HAVE_FFMPEG = false; console.warn("  ffmpeg not available: recordings are not trimmed"); }
  }
  fs.renameSync(raw, final);
}

(async () => {
  const { prizes, names, maxN } = await liveData();
  const numbers = Number(arg("numbers")) || Math.max(250, maxN + 150);
  const fixed = A.allFixed(prizes, numbers);
  const lines = [];
  ["en", "hi"].forEach(lang => {
    fixed[lang].forEach(t => lines.push([lang, t]));
    names.forEach(n => { if (String(n || "").trim()) lines.push([lang, String(n).trim()]); });
  });

  fs.mkdirSync(OUT, { recursive: true });
  const clips = {}, todo = [];
  lines.forEach(([lang, text]) => {
    const k = Voice.key(lang, text), file = fileFor(lang, text);
    if (clips[k]) return;
    clips[k] = file;
    if (!fs.existsSync(path.join(OUT, file))) todo.push([lang, text, file]);
  });

  console.log(`${Object.keys(clips).length} lines (${prizes.length} prizes, ${names.length} names, lucky numbers 1-${numbers}); ${todo.length} to record`);
  let done = 0, failed = 0;
  async function worker() {
    while (todo.length) {
      const [lang, text, file] = todo.shift();
      for (let attempt = 1; ; attempt++) {
        try { await record(lang, text, file); break; } catch (e) {
          if (attempt >= 3) { failed++; delete clips[Voice.key(lang, text)]; console.error("  could not record:", lang, text); break; }
        }
      }
      if (++done % 20 === 0) console.log(`  ${done} recorded`);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));

  // tidy: remove recordings no line uses any more
  const keep = new Set(Object.values(clips));
  fs.readdirSync(OUT).filter(f => f.endsWith(".mp3") && !keep.has(f) || f.endsWith(".raw.mp3")).forEach(f => fs.unlinkSync(path.join(OUT, f)));

  const manifest = { made: new Date().toISOString(), voices: VOICES, rate: NAT.rate, clips };
  fs.writeFileSync(path.join(OUT, "voices.json"), JSON.stringify(manifest, null, 1) + "\n");
  const bytes = [...keep].reduce((s, f) => s + (fs.existsSync(path.join(OUT, f)) ? fs.statSync(path.join(OUT, f)).size : 0), 0);
  console.log(`Done: ${keep.size} recordings, ${(bytes / 1048576).toFixed(1)} MB${failed ? `, ${failed} failed` : ""}. Now publish (git push).`);
  if (failed) process.exitCode = 1;
})().catch(e => { console.error(e.message || e); process.exit(1); });
