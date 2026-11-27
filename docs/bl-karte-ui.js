// Interaktive Bundesländer-Karte (benötigt bl-karte.js, bl-common.js, common.js und die globalen Variablen B und hl)
var KM = { ind: "gesamt", modus: "staerke", sel: "" };
function kmHsl(f, neutral) { // f: 0 = Spitze, 1 = Schlusslicht
  if (neutral) return "hsl(214,58%," + Math.round(78 - 42 * (1 - f)) + "%)";
  return "hsl(" + Math.round(140 * (1 - f)) + ",52%," + Math.round(40 + 6 * Math.sin(f * Math.PI)) + "%)";
}
// Hauptstädte (x, y in Kartenkoordinaten, Beschriftung rechts/links/oben/unten); Wien ist selbst Bundesland
var KM_STADT = [["Eisenstadt",471.3,118.5,"r"],["St. Pölten",410.9,82.6,"l"],["Linz",320.7,72.3,"o"],["Salzburg",237.9,122.1,"o"],["Innsbruck",126.8,176.1,"o"],["Bregenz",15.3,152.7,"r"],["Klagenfurt",322.0,240.6,"u"],["Graz",398.4,196.0,"u"],["Wien",461.2,82.2,""]];
var KM_LABEL = { AT33: [100, 179], AT12: [432, 108] };
var KM_GRAU = "#9aa3b5";
function kmInd() { return B.indikatoren.filter(function (i) { return i.id === KM.ind; })[0]; }
function kmHolen(code) { // Farbe + Kurztext je Land für die aktuelle Auswahl
  var bi = B.bilanz.filter(function (b) { return b.code === code; })[0];
  if (KM.ind === "gesamt") {
    if (!bi) return { c: KM_GRAU, t: "keine Daten" };
    if (KM.modus === "staerke") return { c: kmHsl((bi.platz - 1) / 8), t: "Gesamtbild Platz " + bi.platz + " von " + B.bilanz.length };
    var s = bi.besser - bi.schlechter;
    return { c: s === 0 ? KM_GRAU : s > 0 ? kmHsl(0) : kmHsl(1), t: bi.besser + " besser, " + bi.schlechter + " schlechter" };
  }
  var i = kmInd(), x = i && i.laender.filter(function (z) { return z.code === code; })[0];
  if (!x) return { c: KM_GRAU, t: "keine Daten" };
  var neutral = i.typ === "neutral";
  if (KM.modus === "staerke") return { c: kmHsl(i.anzahl > 1 ? (x.rang - 1) / (i.anzahl - 1) : 0, neutral), t: "Platz " + x.rang + " von " + i.anzahl + ": " + fw(i, x.wert) };
  if (x.urteil) return { c: x.urteil === "besser" ? kmHsl(0) : x.urteil === "schlechter" ? kmHsl(1) : KM_GRAU, t: trendWort(x.urteil) };
  if (x.richtung) return { c: x.richtung === "steigend" ? "hsl(214,58%,36%)" : x.richtung === "sinkend" ? "hsl(214,58%,72%)" : KM_GRAU, t: x.richtung };
  return { c: KM_GRAU, t: "keine Entwicklung verfügbar" };
}
function kmWechsel(x) { // Platzveränderung als Text
  if (x.rangVor == null) return "";
  var d = x.rangVor - x.rang; return d === 0 ? "Platz unverändert" : (d > 0 ? "▲ " : "▼ ") + Math.abs(d) + (Math.abs(d) === 1 ? " Platz " : " Plätze ") + (d > 0 ? "besser" : "schlechter");
}
function kmLink(i, ton) { return '<a href="#' + i.id + '" class="kmgo" data-go="' + i.id + '" data-ton="' + ton + '">' + i.name + '</a>'; }
function kmPanel() {
  var code = KM.sel; if (!code) return '<p class="note">Tippe auf ein Bundesland, um Details, Stärken und Schwächen zu sehen.</p>';
  var l = B.laender.filter(function (z) { return z.code === code; })[0], r = l.regierung, bi = B.bilanz.filter(function (b) { return b.code === code; })[0];
  var h = '<h3>' + l.name + '</h3><p class="note">' + r.chef + ' (' + r.partei + '), Koalition: ' + r.koalition.join(", ") + (r.seit ? '. Regierung seit ' + r.seit : '') + '</p>';
  if (KM.ind !== "gesamt") {
    var i = kmInd(), x = i && i.laender.filter(function (z) { return z.code === code; })[0];
    if (x) {
      h += '<p><b>' + i.name + ':</b> Platz ' + x.rang + ' von ' + i.anzahl + ' (' + fw(i, x.wert) + ')';
      if (x.wertVor != null) h += '<br>' + (i.vorPeriode || "früher") + ': ' + fw(i, x.wertVor) + (x.rangVor != null ? ' (Platz ' + x.rangVor + ')' : '');
      if (x.rangVor != null) h += '<br>' + kmWechsel(x);
      if (x.urteil) h += '<br>Trend: <span class="' + urteilCls(x.urteil) + '">' + pfeil(x.richtung) + ' ' + trendWort(x.urteil) + '</span>';
      if (x.zus) h += '<br><span class="note">' + x.zus + '</span>';
      h += '</p>';
    } else h += '<p class="note">Für diese Kennzahl liegen keine Daten für ' + l.name + ' vor.</p>';
  }
  if (bi) h += '<p><b>Gesamtbild:</b> Platz ' + bi.platz + ' (Ø ' + bi.durchschnittsrang.toLocaleString("de-AT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ')' + (bi.platzVor != null ? ', früher Platz ' + bi.platzVor : '') + ', bei ' + bi.besser + ' Kennzahlen besser und bei ' + bi.schlechter + ' schlechter als früher.</p>';
  var gew = []; B.indikatoren.forEach(function (i) { if (i.ausgeblendet || i.typ === "neutral") return; var x = i.laender.filter(function (z) { return z.code === code; })[0]; if (x && x.rang != null) gew.push({ i: i, x: x }); });
  var st = gew.filter(function (g) { return g.x.rang <= 3; }).sort(function (a, b) { return a.x.rang - b.x.rang; });
  var sc = gew.filter(function (g) { return g.x.rang >= g.i.anzahl - 2; }).sort(function (a, b) { return (b.x.rang - b.i.anzahl) - (a.x.rang - a.i.anzahl); });
  var li = function (a, ton) { return a.length ? '<ul>' + a.map(function (g) { return '<li>' + kmLink(g.i, ton) + ' (Platz ' + g.x.rang + ')</li>'; }).join("") + '</ul>' : '<p class="note">keine</p>'; };
  h += '<div class="kmsw"><div><h4 class="good">Stärken (Platz 1 bis 3)</h4>' + li(st, 'gut') + '</div><div><h4 class="bad">Schwächen (Platz 7 bis 9)</h4>' + li(sc, 'schlecht') + '</div></div>';
  var bes = gew.filter(function (g) { return g.x.urteil === "besser"; }), sch = gew.filter(function (g) { return g.x.urteil === "schlechter"; });
  var lj = function (a, ton) { return a.length ? a.map(function (g) { return kmLink(g.i, ton); }).join(", ") : "keine"; };
  h += '<p class="note"><b>Verbessert:</b> ' + lj(bes, 'gut') + '<br><b>Verschlechtert:</b> ' + lj(sch, 'schlecht') + '</p>';
  return h;
}
function kmLegende() {
  if (KM.modus === "staerke") { var neutral = KM.ind !== "gesamt" && kmInd() && kmInd().typ === "neutral";
    return '<div class="kmleg"><span>' + (neutral ? 'niedrigster Wert' : 'Stärke (Platz 1)') + '</span><i class="kmverl" style="background:linear-gradient(90deg,' + kmHsl(0, neutral) + ',' + kmHsl(0.5, neutral) + ',' + kmHsl(1, neutral) + ')"></i><span>' + (neutral ? 'höchster Wert' : 'Schwäche (letzter Platz)') + '</span></div>'; }
  var i = KM.ind === "gesamt" ? null : kmInd();
  if (i && i.typ === "neutral") return '<div class="kmleg"><span><i style="background:hsl(214,58%,72%)"></i>sinkend</span><span><i style="background:' + KM_GRAU + '"></i>stabil</span><span><i style="background:hsl(214,58%,36%)"></i>steigend</span></div>';
  return '<div class="kmleg"><span><i style="background:' + kmHsl(0) + '"></i>besser</span><span><i style="background:' + KM_GRAU + '"></i>unverändert</span><span><i style="background:' + kmHsl(1) + '"></i>schlechter</span></div>';
}
function kmSvg() {
  var K = window.BLKARTE, s = '<svg class="kmsvg" viewBox="' + K.viewBox + '" role="group" aria-label="Karte der Bundesländer">';
  B.laender.forEach(function (l) { var f = kmHolen(l.code);
    s += '<path d="' + K.pfade[l.code] + '" data-c="' + l.code + '" class="kmp' + (KM.sel === l.code ? ' sel' : '') + '" fill="' + f.c + '" tabindex="0" role="button" aria-label="' + l.name + ': ' + f.t + '"><title>' + l.name + ': ' + f.t + '</title></path>'; });
  B.laender.forEach(function (l) { var m = (KM_LABEL[l.code] || K.mitte[l.code]); s += '<text x="' + m[0] + '" y="' + (m[1] + 4) + '" class="kmt" text-anchor="middle">' + l.kurz + '</text>'; });
  s += '<text x="199" y="213" text-anchor="middle" class="kmsn">Osttirol</text>';
  KM_STADT.forEach(function (c) { var a = c[3] === "r" ? ["start", 4, 3] : c[3] === "l" ? ["end", -4, 3] : c[3] === "o" ? ["middle", 0, -5] : ["middle", 0, 10];
    s += '<circle cx="' + c[1] + '" cy="' + c[2] + '" r="2.6" class="kmst"/>' + (c[3] ? '<text x="' + (c[1] + a[1]) + '" y="' + (c[2] + a[2]) + '" text-anchor="' + a[0] + '" class="kmsn">' + c[0] + '</text>' : ''); });
  return s + '</svg>';
}
function kmHtml() {
  if (!window.BLKARTE) return "";
  var opts = '<option value="gesamt"' + (KM.ind === "gesamt" ? " selected" : "") + '>Gesamtbild (alle gewerteten Kennzahlen)</option>';
  B.gruppen.forEach(function (g) { var l = B.indikatoren.filter(function (i) { return i.gruppe === g && !i.ausgeblendet; }); if (!l.length) return;
    opts += '<optgroup label="' + g + '">' + l.map(function (i) { return '<option value="' + i.id + '"' + (KM.ind === i.id ? " selected" : "") + '>' + i.name + '</option>'; }).join("") + '</optgroup>'; });
  var h = '<div class="card" id="kmkarte"><h2>Karte' + infoIcon("Wähle eine Kennzahl und eine Ansicht. Stärke und Schwäche färben die Länder nach ihrem Platz (grün = Spitze, rot = Schlusslicht, bei Kennzahlen ohne Wertung nur nach der Höhe des Werts in Blau). Entwicklung zeigt, ob sich ein Land gegenüber früher verbessert oder verschlechtert hat. Tippe auf ein Land für Details. Das Gesamtbild nutzt alle Kennzahlen mit Wertung. Karte: Statistik Austria (data.statistik.gv.at), CC BY 4.0, vereinfacht von Flooh Perlot. Salzburg, Tirol und Vorarlberg liegen im Westen.") + '</h2>';
  h += '<div class="kmctl"><select id="kmind" aria-label="Kennzahl">' + opts + '</select><div class="umsch"><button type="button" data-km="staerke" class="' + (KM.modus === "staerke" ? "on" : "") + '">Stärke und Schwäche</button><button type="button" data-km="entwicklung" class="' + (KM.modus === "entwicklung" ? "on" : "") + '">Entwicklung</button></div></div>';
  h += '<div class="kmwrap"><div id="kmkarteSvg">' + kmSvg() + kmLegende() + '</div><div id="kmpanel" class="kmpanel">' + kmPanel() + '</div></div></div>';
  return h;
}
function kmAktualisieren() {
  var a = document.getElementById("kmkarteSvg"), p = document.getElementById("kmpanel"); if (!a) return;
  a.innerHTML = kmSvg() + kmLegende(); p.innerHTML = kmPanel();
  Array.prototype.forEach.call(document.querySelectorAll("#kmkarte .umsch button"), function (b) { b.className = b.getAttribute("data-km") === KM.modus ? "on" : ""; });
}
function kmInit() {
  var k = document.getElementById("kmkarte"); if (!k) return;
  k.onclick = function (e) {
    var go = e.target.closest && e.target.closest("[data-go]"); if (go) { e.preventDefault(); if (window.kmSpringe) kmSpringe(go.getAttribute("data-go"), go.getAttribute("data-ton")); return; }
    var b = e.target.closest && e.target.closest("[data-km]"); if (b) { KM.modus = b.getAttribute("data-km"); kmAktualisieren(); return; }
    var p = e.target.closest && e.target.closest(".kmp"); if (p) { KM.sel = p.getAttribute("data-c"); kmAktualisieren(); }
  };
  k.onkeydown = function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("kmp")) { e.preventDefault(); KM.sel = e.target.getAttribute("data-c"); kmAktualisieren(); var q = document.querySelector('#kmkarte .kmp[data-c="' + KM.sel + '"]'); if (q) q.focus(); } };
  document.getElementById("kmind").onchange = function () { KM.ind = this.value; kmAktualisieren(); };
}
