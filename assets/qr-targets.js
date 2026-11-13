/* Roshni: what each QR screen and poster points to (?for=photos or ?for=checkin). */
function qrTarget() {
  var CFG = window.ROSHNI, base = CFG.siteUrl.replace(/\/?$/, "/");
  var which = (/[?&]for=([a-z]+)/.exec(location.search) || [])[1] || "photos";
  if (which === "checkin") return {
    which: "checkin", url: base + "checkin.html",
    headline: "Door team: <em>check-in</em>",
    lines: "<b>Find the employee, tap to check them in</b>, and add their guests.<br>Every checked-in employee and guest is in the raffle."
  };
  return {
    which: "photos", url: base,
    headline: "Capture the <em>moment</em>",
    lines: "<b>Take a photo, get the Diwali frame</b>, and see it on the big screen.<br>No app, no sign-in."
  };
}
