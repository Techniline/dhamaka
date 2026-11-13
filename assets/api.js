/* Dhamaka: shared helpers for every page (talking to the Apps Script, small UI bits).
 * Staff key (optional): if the Apps Script has a STAFF_KEY, staff open pages
 * once with #key=<value> in the link; the key is remembered on that device.
 */
(function () {
  var CFG = window.DHAMAKA;
  var KEY_STORE = "dhamaka-key";
  var m = /[#&]key=([^&]+)/.exec(location.hash);
  if (m) {
    try { localStorage.setItem(KEY_STORE, decodeURIComponent(m[1])); } catch (e) {}
    history.replaceState(null, "", location.pathname + location.search); // keep the key out of screenshots
  }
  function key() { try { return localStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; } }
  function opId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var a = new Uint32Array(4); crypto.getRandomValues(a); return Array.prototype.join.call(a, "-");
  }
  function parse(r) {
    return r.text().then(function (t) {
      var res; try { res = JSON.parse(t); } catch (e) { throw new Error("The server is busy. Try again."); }
      if (!res.ok) throw new Error(res.error || "Something went wrong");
      return res;
    });
  }
  // Until the Apps Script address is pasted into config.js, say so clearly
  function ready() { if (!CFG.api || /PASTE_/.test(CFG.api)) throw new Error("Not connected yet: the Apps Script address still needs to go in config.js."); }
  function get(action, params) {
    try { ready(); } catch (e) { return Promise.reject(e); }
    var q = "?action=" + encodeURIComponent(action) + "&t=" + Date.now();
    if (key()) q += "&key=" + encodeURIComponent(key());
    Object.keys(params || {}).forEach(function (k) { q += "&" + k + "=" + encodeURIComponent(params[k]); });
    return fetch(CFG.api + q).then(parse);
  }
  // Every change carries a one-off id, so a retry after a dropped connection is applied once.
  function post(body, retry) {
    try { ready(); } catch (e) { return Promise.reject(e); }
    body.key = key();
    body.op = body.op || opId();
    return fetch(CFG.api, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
      .then(parse)
      .catch(function (e) {
        if (retry === false || !/fetch|network|busy/i.test(e.message || "")) throw e;
        return new Promise(function (ok) { setTimeout(ok, 1200); }).then(function () { return post(body, false); });
      });
  }
  function drawNo(n) { var s = String(n); while (s.length < 3) s = "0" + s; return CFG.draw.prefix + s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(msg, ms) {
    var t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, ms || 3200);
  }
  // Fills elements marked data-cfg="eventName" etc. from config.js
  function brand(root) {
    (root || document).querySelectorAll("[data-cfg]").forEach(function (el) {
      var v = el.getAttribute("data-cfg").split(".").reduce(function (o, k) { return o ? o[k] : ""; }, CFG);
      if (el.tagName === "IMG") { if (v) el.src = v; else el.hidden = true; }
      else { el.textContent = v || ""; if (!v && el.hasAttribute("data-hide-empty")) el.hidden = true; }
    });
  }
  // People and entries (shared by check-in, admin and the draw)
  function entriesOf(people) {
    var out = [];
    people.forEach(function (p) {
      if (!p.n) return;
      out.push({ n: p.n, name: p.name, dept: p.dept, id: p.id });
      (p.g || []).forEach(function (g) { out.push({ n: g.n, name: g.name, host: p.name, id: p.id }); });
    });
    return out.sort(function (a, b) { return a.n - b.n; });
  }
  function totals(people) {
    var t = { people: people.length, inside: 0, guests: 0, entries: 0 };
    people.forEach(function (p) { if (p.n) { t.inside++; t.guests += (p.g || []).length; } });
    t.entries = t.inside + t.guests;
    return t;
  }
  function csv(rows) {
    return rows.map(function (r) {
      return r.map(function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",");
    }).join("\r\n");
  }
  function download(name, text) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function stamp(t) {
    if (!t) return "";
    try { return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: CFG.timeZone }).format(new Date(t)); }
    catch (e) { return new Date(t).toLocaleString(); }
  }
  // Check-ins and guests as a CSV file (one row per draw entry, plus employees not yet in)
  function exportCheckins(people) {
    var rows = [["Draw no", "Type", "Name", "Department", "Employee ID", "Guest of", "Checked in at"]];
    people.slice().sort(function (a, b) { return (a.n || 1e9) - (b.n || 1e9) || a.name.localeCompare(b.name); }).forEach(function (p) {
      rows.push([p.n ? drawNo(p.n) : "", p.n ? "Employee" : "Employee (not checked in)", p.name, p.dept, p.code, "", stamp(p.t)]);
      (p.g || []).forEach(function (g) { rows.push([drawNo(g.n), "Guest", g.name, "", "", p.name, stamp(g.t)]); });
    });
    download("dhamaka-checkins-" + new Date().toISOString().slice(0, 10) + ".csv", csv(rows));
  }
  // Works like an app: pages and artwork load even when the venue Wi-Fi drops (sw.js).
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
  window.R = { cfg: CFG, get: get, post: post, key: key, drawNo: drawNo, esc: esc, toast: toast, brand: brand, entriesOf: entriesOf, totals: totals, csv: csv, download: download, stamp: stamp, exportCheckins: exportCheckins };
})();
