/* Roshni: the branded Diwali photo frame, drawn on the guest's phone.
 * (Adapted from the Capture the Moment kit.) The photo keeps its own shape,
 * with a rangoli in each top corner and the event bar underneath: diya mark,
 * ROSHNI, the date and time, and the company logo. Text, colours and logos come
 * from config.js. Browsers apply EXIF rotation when decoding, so photos come out upright.
 *
 *   makeCaptureFrame(img [, whenMs])  ->  Promise<{ dataUrl, w, h }>
 */
(function () {
  var CFG = window.ROSHNI, F = CFG.frame || {}, C = CFG.colors;
  var assets = null;

  function loadImg(src) {
    return new Promise(function (res) {
      if (!src) return res(null);
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = function () { res(null); }; // a missing logo never blocks a photo
      i.src = src;
    });
  }
  function loadAssets() {
    if (!assets) {
      assets = Promise.all([
        loadImg(CFG.logos.event), loadImg(CFG.logos.company), loadImg(CFG.logos.art), loadImg('assets/rangoli-tile.svg'),
        document.fonts ? Promise.all([
          document.fonts.load('400 40px "Yatra One"'),
          document.fonts.load('800 40px Poppins'),
          document.fonts.load('800 20px Manrope')
        ]).catch(function () {}) : null
      ]);
    }
    return assets;
  }
  // Letter-spaced text without ctx.letterSpacing (missing on older iPhones)
  function spacedWidth(ctx, text, sp) { var w = 0; for (var i = 0; i < text.length; i++) w += ctx.measureText(text[i]).width + (i < text.length - 1 ? sp : 0); return w; }
  function drawSpaced(ctx, text, x, y, sp) { for (var i = 0; i < text.length; i++) { ctx.fillText(text[i], x, y); x += ctx.measureText(text[i]).width + sp; } }
  // "14 NOV 2026 · 8:43 PM" in the event's time zone, whatever the phone's own zone
  function stamp(d, sep) {
    try {
      var day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: CFG.timeZone }).format(d);
      var time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: CFG.timeZone }).format(d);
      return (day + sep + time).toUpperCase();
    } catch (e) { return d.toDateString().toUpperCase(); }
  }
  // A quarter of the rangoli tucked into a corner of the photo
  function cornerRangoli(ctx, art, cx, cy, r, startAngle) {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, startAngle, startAngle + Math.PI / 2); ctx.closePath(); ctx.clip();
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = r * 0.06;
    ctx.drawImage(art, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }

  window.makeCaptureFrame = function (photo, when) {
    return loadAssets().then(function (a) {
      var mark = a[0], company = a[1], art = a[2], tile = a[3];
      var nw = photo.naturalWidth, nh = photo.naturalHeight, portrait = nh > nw;
      var W = portrait ? 1080 : 1440, ph = Math.round(W * nh / nw);
      var bar = Math.round(W * (portrait ? 0.2 : 0.125)), H = ph + bar;
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      var ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(photo, 0, 0, W, ph); // the photo, full and uncropped

      // soft warm vignette at the bottom of the photo, so the bar sits well
      var fade = ctx.createLinearGradient(0, ph - bar * 0.7, 0, ph);
      fade.addColorStop(0, 'rgba(42,10,30,0)'); fade.addColorStop(1, 'rgba(42,10,30,0.55)');
      ctx.fillStyle = fade; ctx.fillRect(0, ph - bar * 0.7, W, bar * 0.7);

      // rangoli in the two top corners
      if (art) {
        var rr = W * (portrait ? 0.2 : 0.14);
        cornerRangoli(ctx, art, 0, 0, rr, 0);
        cornerRangoli(ctx, art, W, 0, rr, Math.PI / 2);
      }

      // ---- the bar: maroon with a faint rangoli pattern and a warm glow
      var bg = ctx.createLinearGradient(0, ph, 0, H); bg.addColorStop(0, '#3d0f2a'); bg.addColorStop(1, '#1d0614');
      ctx.fillStyle = bg; ctx.fillRect(0, ph, W, bar);
      if (tile) {
        ctx.save(); ctx.globalAlpha = 0.9; ctx.translate(0, ph);
        var ts = W / 1080 * 72, pc = document.createElement('canvas'); pc.width = pc.height = Math.round(ts);
        pc.getContext('2d').drawImage(tile, 0, 0, pc.width, pc.height);
        ctx.fillStyle = ctx.createPattern(pc, 'repeat'); ctx.fillRect(0, 0, W, bar); ctx.restore();
      }
      var glow = ctx.createRadialGradient(W * 0.12, ph + bar / 2, 0, W * 0.12, ph + bar / 2, W * 0.4);
      glow.addColorStop(0, 'rgba(' + hexRgb(C.gold) + ',0.20)'); glow.addColorStop(1, 'rgba(' + hexRgb(C.gold) + ',0)');
      ctx.fillStyle = glow; ctx.fillRect(0, ph, W, bar);

      // gold line with beads along the top of the bar
      var lw = Math.max(3, Math.round(W * 0.004));
      var ln = ctx.createLinearGradient(0, 0, W, 0); ln.addColorStop(0, C.saffron); ln.addColorStop(0.5, C.gold); ln.addColorStop(1, C.saffron);
      ctx.fillStyle = ln; ctx.fillRect(0, ph, W, lw);
      ctx.fillStyle = C.gold;
      for (var bx = W * 0.025; bx < W; bx += W * 0.05) { ctx.beginPath(); ctx.arc(bx, ph + lw * 2.6, lw * 0.75, 0, Math.PI * 2); ctx.fill(); }

      var pad = W * 0.045, mid = ph + bar / 2 + lw, x = pad;

      // ---- diya mark on the left, rising a little above the bar like a lamp on a ledge
      if (mark) {
        var mh = bar * 1.0, mw = mh * (mark.naturalWidth || 1) / (mark.naturalHeight || 1);
        ctx.drawImage(mark, pad - mw * 0.08, H - bar * 0.06 - mh, mw, mh);
        x = pad + mw * 0.92 + W * 0.012;
      }

      // ---- right block: date and time, HOSTED BY, company logo
      var dot = String.fromCharCode(183);
      var meta = stamp(when ? new Date(when) : new Date(), '  ' + dot + '  ');
      var hSize = W * (portrait ? 0.016 : 0.0115), mSize = hSize * 1.05;
      var right = W - pad, gap = W * 0.008, label = F.hostLabel || '', spacing = hSize * 0.25;
      var tlh = company ? W * (portrait ? 0.034 : 0.025) : 0, tlw = company ? tlh * company.naturalWidth / company.naturalHeight : 0;
      ctx.font = '800 ' + hSize + 'px Manrope, Arial, sans-serif'; var labelW = label ? spacedWidth(ctx, label, spacing) : 0;
      ctx.font = '700 ' + mSize + 'px Manrope, Arial, sans-serif'; var metaW = spacedWidth(ctx, meta, mSize * 0.16);
      var hostW = Math.max(tlw, labelW, metaW);

      // ---- title (Yatra One) then "TAG  LINE", shrunk if it would reach the right block
      var title = F.title || CFG.eventName, tag = (F.tag || '').toUpperCase(), line = (F.line || '').toUpperCase();
      var tSize = W * (portrait ? 0.074 : 0.05), ySize = tSize * 0.3, ySp = ySize * 0.22;
      ctx.font = '400 ' + tSize + 'px "Yatra One", Poppins, serif'; var titleW = ctx.measureText(title).width;
      ctx.font = '800 ' + ySize + 'px Manrope, Arial, sans-serif';
      var sub = tag + (tag && line ? '  ' : '') + line, subW = sub ? spacedWidth(ctx, sub, ySp) : 0;
      var room = (right - hostW - W * 0.03) - x;
      var fit = Math.min(1, room / Math.max(titleW, subW, 1));
      tSize *= fit; ySize *= fit; ySp *= fit;
      var blockH = tSize * 0.82 + (sub ? tSize * 0.2 + ySize * 0.8 : 0), top = mid - blockH / 2;
      ctx.textBaseline = 'alphabetic';
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = W * 0.006;
      var tg = ctx.createLinearGradient(0, top, 0, top + tSize);
      tg.addColorStop(0, '#ffe7a3'); tg.addColorStop(0.55, C.gold); tg.addColorStop(1, C.marigold);
      ctx.fillStyle = tg; ctx.font = '400 ' + tSize + 'px "Yatra One", Poppins, serif';
      ctx.fillText(title, x, top + tSize * 0.82);
      if (sub) {
        ctx.fillStyle = C.cream; ctx.font = '800 ' + ySize + 'px Manrope, Arial, sans-serif';
        drawSpaced(ctx, sub, x + tSize * 0.03, top + tSize * 0.82 + tSize * 0.2 + ySize * 0.8, ySp);
      }
      ctx.restore();

      var blockR = mSize + (label ? gap * 1.6 + hSize : 0) + (company ? gap + tlh : 0), y0 = mid - blockR / 2;
      ctx.font = '700 ' + mSize + 'px Manrope, Arial, sans-serif'; ctx.fillStyle = C.gold;
      drawSpaced(ctx, meta, right - metaW, y0 + mSize * 0.8, mSize * 0.16);
      y0 += mSize;
      if (label) {
        y0 += gap * 1.6;
        ctx.font = '800 ' + hSize + 'px Manrope, Arial, sans-serif'; ctx.fillStyle = '#c9ad9f';
        drawSpaced(ctx, label, right - labelW, y0 + hSize * 0.8, spacing);
        y0 += hSize;
      }
      if (company) ctx.drawImage(company, right - tlw, y0 + gap, tlw, tlh);

      return { dataUrl: c.toDataURL('image/jpeg', 0.82), w: W, h: H };
    });
  };
  function hexRgb(hex) { var n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(','); }
})();
