// Hängt an style.css und common.js einen Inhalts-Hash (?v=…) in den HTML-Dateien an, damit Browser (z. B. Safari) nach Änderungen nie mit altem CSS/JS weiterarbeiten.
// Aufruf: node cachebust.js (vor jedem Commit, der style.css oder common.js ändert)
const fs = require("fs"), crypto = require("crypto");
const hash = f => crypto.createHash("md5").update(fs.readFileSync("docs/" + f)).digest("hex").slice(0, 8);
for (const h of fs.readdirSync("docs").filter(x => x.endsWith(".html"))) {
  let t = fs.readFileSync("docs/" + h, "utf8"), o = t;
  for (const f of ["style.css", "common.js", "bl-common.js"]) t = t.replace(new RegExp(`(["'])${f.replace(".", "\\.")}(\\?v=[0-9a-f]+)?\\1`, "g"), `$1${f}?v=${hash(f)}$1`);
  if (t !== o) { fs.writeFileSync("docs/" + h, t); console.log("aktualisiert:", h); }
}
