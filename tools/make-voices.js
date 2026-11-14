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
 * Options: --offline  use config.js prizes only, skip names (no Apps Script call)
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

async function liveData() {
  if (OFFLINE) return { prizes: CFG.draw.prizes, names: [] };
  const res = await fetch(CFG.appsScriptUrl + "?action=people", { redirect: "follow" });
  const d = await res.json();
  if (!d.ok) throw new Error("Apps Script said: " + JSON.stringify(d).slice(0, 200));
  const names = [];
  (d.people || []).forEach(p => { names.push(p.name); (p.g || []).forEach(g => names.push(g.name)); });
  return { prizes: d.prizes && d.prizes.length ? d.prizes : CFG.draw.prizes, names };
}

function fileFor(lang, text) {
  const h = crypto.createHash("sha1").update([VOICES[lang], NAT.rate, Voice.key(lang, text)].join("\n")).digest("hex");
  return lang + "-" + h.slice(0, 14) + ".mp3";
}

function record(lang, text, file) {
  return new Promise((ok, fail) => {
    execFile("python", ["-m", "edge_tts", "--voice", VOICES[lang], "--rate", NAT.rate, "--text", text,
      "--write-media", path.join(OUT, file)], { windowsHide: true }, err => err ? fail(err) : ok());
  });
}

(async () => {
  const { prizes, names } = await liveData();
  const fixed = A.allFixed(prizes);
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

  console.log(`${Object.keys(clips).length} lines (${prizes.length} prizes, ${names.length} names); ${todo.length} to record`);
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
  await Promise.all(Array.from({ length: 6 }, worker));

  // tidy: remove recordings no line uses any more
  const keep = new Set(Object.values(clips));
  fs.readdirSync(OUT).filter(f => f.endsWith(".mp3") && !keep.has(f)).forEach(f => fs.unlinkSync(path.join(OUT, f)));

  const manifest = { made: new Date().toISOString(), voices: VOICES, rate: NAT.rate, clips };
  fs.writeFileSync(path.join(OUT, "voices.json"), JSON.stringify(manifest, null, 1) + "\n");
  const bytes = [...keep].reduce((s, f) => s + (fs.existsSync(path.join(OUT, f)) ? fs.statSync(path.join(OUT, f)).size : 0), 0);
  console.log(`Done: ${keep.size} recordings, ${(bytes / 1048576).toFixed(1)} MB${failed ? `, ${failed} failed` : ""}. Now publish (git push).`);
  if (failed) process.exitCode = 1;
})().catch(e => { console.error(e.message || e); process.exit(1); });
