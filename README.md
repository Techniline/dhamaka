# Diwali Dhamaka · Techniline Electronics

One small website for the office Diwali party:

| Page | Who uses it | What it does |
|---|---|---|
| `index.html` | Everyone | Take or upload a photo. It gets the Diwali frame on the phone and goes to the album. Shows the album. |
| `checkin.html` | Door team (phones or tablet) | Employee cards with search and filters. Tap to check in, add guests, see totals. Export CSV. |
| `admin.html` | You | Import, edit and clear the employee list. Prizes. Photo approval with Auto-approve. Links to every screen. |
| `draw.html` | Big screen | The raffle draw. `draw.html?demo=1` rehearses with about 150 sample entries and saves nothing. |
| `live.html` | Big screen | Live photo slideshow with an "Add your photo" QR code. |
| `qr-screen.html?for=photos` / `?for=checkin` | Big screen | A large QR code. |
| `qr.html?for=photos` / `?for=checkin` | Print | A4 poster: press *Print or save as PDF*. |
| `config.js` | You | **Every event setting**: name, date, colours, logos, prizes, draw timing, screen size, connections. |
| `apps-script/Code.gs` | Google Apps Script | The backend: album, check-in, draw numbers, winners, draw log. |

There's no PIN: every page opens straight away. If you want to lock the staff pages later, see *Optional: staff link* below.

---

## How the draw works
- Every **checked-in** employee is one entry, and each of their guests is one entry. Employees who haven't checked in aren't in the draw.
- Draw numbers (`DW-001`, `DW-002`, …) are given in check-in order. A number is **never reused**, even after an undo.
- The winner is picked **before** the reels move, with the browser's cryptographic random generator and rejection sampling (`assets/fair.js`), so every entry has exactly the same chance. The reels then land on that number.
- Past winners, and anyone skipped with **Not here? Redraw**, can't be drawn again. **Reset** (with a confirmation) clears the winners and skipped entries and puts the reels back to `DW-000`.
- Every pick is written to the **draw log** (press **L**): time, prize, pool size, the pick's position, the random value and a SHA-256 fingerprint of the entry list. Winners and the log are saved in the Apps Script, so a refresh or a different laptop keeps them.
- Keys on the draw screen: **Space** draws, **M** mutes, **L** shows the log, **F** is full screen. The cursor and the buttons hide after 2 seconds without mouse movement.
- Timing is in `config.js` → `draw.pace` (about 21 seconds per draw: 4 s shuffle, 3 s per digit, 9 s for the last digit).
- Prizes are drawn in list order. Change them in **admin → Prizes** on the night. The first line is drawn first, so put the top prize last.

---

## Setup (about 20 minutes)

### 1. Cloudinary (fast photo uploads)
This uses the same free Cloudinary account as Soundcheck (cloud name `xccqslt2`).
1. Cloudinary → Settings → Upload → **Add upload preset**. Name: `roshni`. Signing mode: **Unsigned**. Folder: `roshni`. Save.
2. Settings → API Keys: note the **API Key** and **API Secret**. They're only needed for deleting photos, and they go in step 2.3, never in a file.

### 2. Google Apps Script (the backend)
1. Go to [script.google.com](https://script.google.com) → **New project**. Name it *Roshni Diwali* (the project behind this site is already called that).
2. Delete the sample code, paste all of `apps-script/Code.gs`, and save.
3. **Project Settings** (gear icon) → **Script Properties** → add:
   - `CLOUDINARY_KEY` and `CLOUDINARY_SECRET` (from step 1.2)
   - *(optional)* `STAFF_KEY`: see *Optional: staff link* below
4. Back in the editor, choose **setup** in the function menu → **Run**, and allow the permissions.
5. *(Optional)* Run **startDriveBackup** once: every 5 minutes, new photos are also copied to Google Drive.
6. **Deploy → New deployment** → type **Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy, and copy the **Web app URL** (it ends in `/exec`).

> Changed the script later? **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy.** The URL stays the same.

### 3. config.js
- Paste the Web app URL into `appsScriptUrl`.
- Set `siteUrl` to where the site lives (step 5). The QR codes use it, so **set it before printing posters**.
- Optional: `dateText` and `venue` (shown on the photo page and posters), and the default `prizes`.

### 4. The employee list
Open **admin.html → Employees**. Paste from Excel (Name, Department, Employee ID columns), type one person per line, or choose a CSV file. A header row is fine. Use **Add to the list** or **Replace the list**. People already on the list (same employee ID, or same name and department) are skipped.

### 5. Put it online (GitHub Pages)
1. Create the repository `diwali` under the Techniline GitHub account and push this folder (Git Credential Manager handles the sign-in, as with Soundcheck).
2. Repository → Settings → Pages → Deploy from branch → `main` / root.
3. The site is then at `https://techniline.github.io/diwali/`.
4. Custom subdomain (optional), e.g. `diwali.techniline.org`: add a `CNAME` file containing that name, add a DNS CNAME record pointing to `techniline.github.io`, tick **Enforce HTTPS** once it's available, and update `siteUrl` in `config.js`.

---

## On the night
- **Door team:** open `checkin.html` on each phone or tablet. Search, tap the employee card, tap **Check in**, then type each guest's name and tap **Add**. Totals at the top update straight away. Every phone refreshes every 15 seconds. Several phones can work at once: each change is applied one at a time on the server, and a retried change is never counted twice.
- **Photos:** in admin → Photos, approve new photos, or switch on **Auto-approve**.
- **Big screen:** open `draw.html` (or `live.html`, `qr-screen.html`) in Chrome on the TV laptop and press **F**. Rehearse first with `draw.html?demo=1`.
- **After the event:** admin → Employees → **Export CSV** gives every check-in and guest with their draw numbers.

## Full screen (no browser bars)
Every screen has a round **full-screen button** (bottom right on phones, top right on big screens; it fades when the mouse is still). It hides the address bar, tabs and menus so only the app shows. **Esc** or the button again leaves full screen. Big screens also take **F**.
- **Computers, Android, iPad:** the button switches straight to full screen.
- **iPhone:** Safari can't hide its bars on a web page, so the button explains: **Share → Add to Home Screen**, then open it from the Home Screen. It then runs full screen like an app. This also works on Android (Chrome menu → **Add to Home screen**).
- Browsers leave full screen when you open another page, so press the button again after moving between pages.

## Screen size
`config.js` → `screen` is `1920 × 1080` for a 16:9 TV. For a 2:1 LED wall, use `1920 × 960`. Add `?anchor=top` to a big-screen link if the LED processor uses the top part of a 16:9 signal.

## Optional: staff link
Everything is open by default. Anyone who has the check-in or admin address can use it. To lock the staff pages:
1. In Script Properties, add `STAFF_KEY` with a long random value, e.g. `diwali-7Qx2-mP9k`.
2. Give the door team and admins the link once with the key at the end: `https://…/checkin.html#key=diwali-7Qx2-mP9k`. Each device remembers it.

The guest photo page and the album stay open to everyone. The key never goes in this repository.

---

## Testing (no Google account needed)
```bash
npm test          # backend tests (fake Apps Script services) + fairness test of the random pick
npm run serve     # local test server on http://localhost:8765, with the backend running in memory
npm run shots     # big-screen (1920x1080) and tablet screenshots, and the poster PDFs (in shots/)
npm run art       # regenerate the artwork in assets/
```
On `localhost`, pages talk to the in-memory backend automatically. Add `?liveapi` to a link to use the real Apps Script instead.

## Files
- `assets/diya.svg`, `mandala.svg`, `rangoli-tile.svg`, `toran.svg`, `favicon.svg`: the artwork, generated by `tools/make-art.js`
- `assets/techniline.png`: company logo
- `assets/frame.js`: the photo frame · `assets/fair.js`: the fair pick · `assets/screen.js`: big-screen scaling · `assets/api.js`: shared helpers · `assets/roshni.css`: shared styles
- Built from the *Capture the Moment* kit (photos, album, admin approval) and Soundcheck's raffle draw.
