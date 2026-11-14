// The announcer's recordings (tools/make-voices.js) cover every line the draw screen needs
const test = require("node:test"), assert = require("node:assert");
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const win = { location: { hostname: "tests", search: "" } };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "config.js"), "utf8"),
  { window: win, document: { documentElement: { style: { setProperty() {} } } }, location: win.location });
const CFG = win.DHAMAKA, V = require("../assets/announcer.js"), A = V.make(CFG.draw);
const M = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/voice/voices.json"), "utf8"));

test("every prize, winner and number line for the config prizes is recorded", () => {
  const fixed = A.allFixed(CFG.draw.prizes);
  for (const lang of ["en", "hi"]) for (const t of fixed[lang]) assert.ok(M.clips[V.key(lang, t)], "missing " + lang + ": " + t);
});
test("every recording in the list exists on disk", () => {
  for (const f of Object.values(M.clips)) assert.ok(fs.existsSync(path.join(ROOT, "assets/voice", f)), f);
});
test("winner lines: guests name their host, and the last prize gets the big intro", () => {
  const w = A.winnerLines("1st Prize · Dhamaka Grand Prize", { name: "Priya", host: "Rahul" });
  assert.deepStrictEqual(w.en.map(s => s.t), ["The first prize goes to...", "Priya", "guest of", "Rahul", "Congratulations!"]);
  assert.deepStrictEqual(w.hi.map(s => s.t), ["पहले इनाम के विजेता हैं...", "Priya", "Rahul", "के मेहमान!", "बहुत-बहुत बधाई!"]);
  assert.match(A.prizeLines("1st Prize · Dhamaka Grand Prize", true).en[0].t, /^And now, the moment/);
  assert.deepStrictEqual(A.numberLines("042", "en").map(s => s.t), ["Lucky number", "zero", "four", "two"]);
});
