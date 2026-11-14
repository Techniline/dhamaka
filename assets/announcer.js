/* Dhamaka: what the announcer says (used by draw.html and tools/make-voices.js).
 * Every announcement is a list of short lines per language. tools/make-voices.js records
 * each line once with Microsoft's natural neural voices into assets/voice/, so the draw
 * screen sounds the same, natural voice in every browser. A line with no recording
 * (a prize renamed on the night, a person added later) falls back as described in draw.html.
 *
 * Each line is { t: text, k: kind }. Kinds: "fixed" (a sentence), "name" (the winner's
 * name), "host" (who brought the guest), "guest" (the words around the host's name).
 */
(function (root) {
  var RANK_EN = { 1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth" };
  var RANK_HI_OBL = { 1: "पहले", 2: "दूसरे", 3: "तीसरे", 4: "चौथे", 5: "पाँचवें", 6: "छठे", 7: "सातवें", 8: "आठवें", 9: "नौवें", 10: "दसवें" };

  function make(draw) {
    var MEANINGS = (draw && draw.meanings) || [];
    function wordRe(w, flags) { return new RegExp("(^|[^A-Za-z])" + w + "(?![A-Za-z])", flags || "i"); }
    function meaningOf(prize) {
      for (var i = 0; i < MEANINGS.length; i++) if (wordRe(MEANINGS[i].word).test(prize || "")) return MEANINGS[i];
      return null;
    }
    function rankNo(prize) { var r = /(\d+)\s*(st|nd|rd|th)/i.exec(prize || ""); return r ? Number(r[1]) : 0; }
    function rankEn(prize) { var n = rankNo(prize); return n ? (RANK_EN[n] || n + "th") + " prize" : "next prize"; }
    function rankHi(prize) { var n = rankNo(prize); return RANK_HI_OBL[n] ? RANK_HI_OBL[n] + " इनाम" : "अगले इनाम"; }
    // The prize as the voice should say it: without the "3rd Prize ·" part
    function bareName(prize) { return String(prize || "").replace(/^\s*\d+\s*(st|nd|rd|th)\s*prize\s*[·:\-–]?\s*/i, "").replace(/·/g, ",").trim(); }
    function sayEn(text) { MEANINGS.forEach(function (m) { text = text.replace(wordRe(m.word, "gi"), function (all, pre) { return pre + (m.say || m.word); }); }); return text; }
    function sayHi(text) {
      MEANINGS.forEach(function (m) { if (m.hi) text = text.replace(wordRe(m.word, "gi"), function (all, pre) { return pre + m.hi; }); });
      return text.replace(/Grand Prize/i, "ग्रैंड प्राइज़").replace(/\bPrize\b/i, "इनाम");
    }
    function fixed(t) { return { t: t, k: "fixed" }; }

    // "Now drawing the third prize: Phuljhadi! Phuljhadi means ..." (one sentence per language)
    function prizeLines(prize, isLast) {
      var m = meaningOf(prize), name = bareName(prize);
      var en = (isLast ? "And now, the moment we have all been waiting for! " : "") +
        "Now drawing the " + rankEn(prize) + ": " + sayEn(name) + "!" +
        (m ? " " + (m.say || m.word) + " means " + m.means.replace(":", ",") + "." : "");
      var hi = (isLast ? "और अब, जिस पल का सबको इंतज़ार था! " : "") +
        "अब " + rankHi(prize) + " की बारी है: " + sayHi(name) + "!" +
        (m && m.hiMeans ? " " + (m.hi || m.word) + ", यानी " + m.hiMeans + "।" : "");
      return { en: [fixed(en)], hi: [fixed(hi)] };
    }

    // "The third prize goes to... Priya Nair, guest of Rahul Sharma! Congratulations!"
    function winnerLines(prize, w) {
      var en = [fixed("The " + rankEn(prize) + " goes to..."), { t: w.name, k: "name" }];
      var hi = [fixed(rankHi(prize) + " के विजेता हैं..."), { t: w.name, k: "name" }];
      if (w.host) {
        en.push({ t: "guest of", k: "guest" }, { t: w.host, k: "host" });
        hi.push({ t: w.host, k: "host" }, { t: "के मेहमान!", k: "guest" });
      }
      en.push(fixed("Congratulations!"));
      hi.push(fixed("बहुत-बहुत बधाई!"));
      return { en: en, hi: hi };
    }

    // Stand-in for a name with no recording, said as one natural phrase: "Lucky number 42!"
    function numberLines(n, lang) {
      return [{ t: (lang === "hi" ? "लकी नंबर " : "Lucky number ") + Number(n) + "!", k: "number" }];
    }

    // Every fixed line the recorder should make for this list of prizes, plus lucky numbers 1 to maxNumber
    function allFixed(prizes, maxNumber) {
      var out = { en: [], hi: [] };
      prizes.forEach(function (p, i) {
        var a = prizeLines(p, i === prizes.length - 1 && prizes.length > 1), b = winnerLines(p, { name: "", host: "x" });
        ["en", "hi"].forEach(function (l) { a[l].concat(b[l]).forEach(function (s) { if (s.k === "fixed" || s.k === "guest") out[l].push(s.t); }); });
      });
      for (var n = 1; n <= (maxNumber || 0); n++) ["en", "hi"].forEach(function (l) { out[l].push(numberLines(n, l)[0].t); });
      return out;
    }

    return { meaningOf: meaningOf, rankNo: rankNo, rankEn: rankEn, bareName: bareName, prizeLines: prizeLines,
      winnerLines: winnerLines, numberLines: numberLines, allFixed: allFixed };
  }

  // Recording file name for a line: the same text and voice always give the same file
  function key(lang, text) { return lang + "|" + String(text).trim(); }

  var api = { make: make, key: key };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DhamakaVoice = api;
})(typeof window !== "undefined" ? window : globalThis);
