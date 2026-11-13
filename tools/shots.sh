#!/usr/bin/env bash
# Screenshots of the big screens (1920x1080), check-in at tablet size, and the two
# A4 poster PDFs, using headless Chrome against the local test server.
#   node tools/dev-server.js &   then   bash tools/shots.sh
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
BASE="${BASE:-http://localhost:8765}"
OUT=shots; mkdir -p "$OUT"
PROFILE="$(mktemp -d)"
shot() { # name url width height [wait-ms]
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" --window-size="$3,$4" \
    --virtual-time-budget="${5:-4000}" --screenshot="$PWD/$OUT/$1.png" "$BASE/$2" >/dev/null 2>&1
  echo "  $OUT/$1.png"
}
echo "Big screens (1920x1080):"
shot screen-draw-demo "draw.html?demo=1" 1920 1080
shot screen-draw "draw.html" 1920 1080
shot screen-live "live.html" 1920 1080
shot screen-qr-photos "qr-screen.html?for=photos" 1920 1080
shot screen-qr-checkin "qr-screen.html?for=checkin" 1920 1080
# (Phone sizes: headless Chrome on Windows can't go narrower than ~500 px, so
#  check phones in Chrome DevTools device mode or the Claude browser pane instead.)
echo "Tablet (820x1180):"
shot tablet-checkin "checkin.html" 820 1180
echo "A4 posters (PDF):"
for w in photos checkin; do
  "$CHROME" --headless=new --disable-gpu --user-data-dir="$PROFILE" --no-pdf-header-footer --virtual-time-budget=4000 \
    --print-to-pdf="$PWD/$OUT/poster-$w.pdf" "$BASE/qr.html?for=$w" >/dev/null 2>&1
  echo "  $OUT/poster-$w.pdf"
done
rm -rf "$PROFILE"
