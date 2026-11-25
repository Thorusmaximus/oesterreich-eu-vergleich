// Bundesländer-Vergleich (nur Österreich): Eurostat-Regionaldaten (NUTS 2 = die 9 Bundesländer),
// Rang unter den 9 Ländern und Entwicklung über 5 Jahre. Wird von update.js aufgerufen.
const LAENDER = [
  { code: "AT11", name: "Burgenland", kurz: "Bgld." }, { code: "AT12", name: "Niederösterreich", kurz: "NÖ" }, { code: "AT13", name: "Wien", kurz: "Wien" },
  { code: "AT21", name: "Kärnten", kurz: "Ktn." }, { code: "AT22", name: "Steiermark", kurz: "Stmk." }, { code: "AT31", name: "Oberösterreich", kurz: "OÖ" },
  { code: "AT32", name: "Salzburg", kurz: "Sbg." }, { code: "AT33", name: "Tirol", kurz: "Tirol" }, { code: "AT34", name: "Vorarlberg", kurz: "Vbg." }
];
// Landesregierungen, von Hand gepflegt (Stand siehe REGIERUNGEN_STAND). Quellen: ORF, Der Standard, Landesmedien.
const REGIERUNGEN_STAND = "2026-11-25";
const REGIERUNGEN = {
  AT11: { chef: "Hans Peter Doskozil", partei: "SPÖ", koalition: ["SPÖ", "Grüne"], wahl: 2025, naechsteWahl: 2030, seit: "Februar 2025" },
  AT12: { chef: "Johanna Mikl-Leitner", partei: "ÖVP", koalition: ["ÖVP", "FPÖ"], wahl: 2023, naechsteWahl: 2028, seit: "März 2023" },
  AT13: { chef: "Michael Ludwig", partei: "SPÖ", koalition: ["SPÖ", "NEOS"], wahl: 2025, naechsteWahl: 2030, seit: "Juni 2025" },
  AT21: { chef: "Daniel Fellner", partei: "SPÖ", koalition: ["SPÖ", "ÖVP"], wahl: 2023, naechsteWahl: 2028, seit: "April 2026 (Landeshauptmann; Koalition seit 2023)" },
  AT22: { chef: "Mario Kunasek", partei: "FPÖ", koalition: ["FPÖ", "ÖVP"], wahl: 2024, naechsteWahl: 2029, seit: "Dezember 2024" },
  AT31: { chef: "Thomas Stelzer", partei: "ÖVP", koalition: ["ÖVP", "FPÖ"], wahl: 2021, naechsteWahl: 2027, seit: "Oktober 2021" },
  AT32: { chef: "Karoline Edtstadler", partei: "ÖVP", koalition: ["ÖVP", "FPÖ"], wahl: 2023, naechsteWahl: 2028, seit: "Juli 2025 (Landeshauptfrau; Koalition seit 2023)" },
  AT33: { chef: "Anton Mattle", partei: "ÖVP", koalition: ["ÖVP", "SPÖ"], wahl: 2022, naechsteWahl: 2027, seit: "November 2022" },
  AT34: { chef: "Markus Wallner", partei: "ÖVP", koalition: ["ÖVP", "FPÖ"], wahl: 2024, naechsteWahl: 2029, seit: "Dezember 2024" }
};
const GRUPPEN = ["Wirtschaft und Arbeit", "Bevölkerung und Gesellschaft", "Bildung und Forschung", "Gesundheit"];
const SEIT = 2014, SCHWELLE_ANTEIL = 0.03, JAHRE_TREND = 5, MIN_LAENDER = 8;

// Indikatoren. filter + alternativen wie bei den EU-Indikatoren; typ: niedrig = niedriger ist besser, hoch = höher ist besser, neutral = ohne Wertung
const IND = [
  { id: "bip", name: "Wirtschaftsleistung pro Kopf", gruppe: 0, dataset: "nama_10r_2gdp", filter: "unit=EUR_HAB", dez: 0, suffix: " €", typ: "hoch", diffEinheit: "Euro",
    einheit: "Bruttoinlandsprodukt (BRP) in Euro pro Einwohner und Jahr", rangText: "Rang 1 = höchste Wirtschaftsleistung pro Kopf",
    erklaerung: "Wie viel Wirtschaftsleistung pro Einwohner im Bundesland erbracht wird. In Wien ist der Wert hoch, weil viele Menschen aus den Nachbarländern dort arbeiten. Er sagt deshalb nicht direkt etwas über das Einkommen der Wiener aus.", mock: { base: 32000, step: 2800 } },
  { id: "arbeitslosigkeit", name: "Arbeitslosenquote", gruppe: 0, dataset: "lfst_r_lfu3rt", filter: "sex=T&age=Y15-74&isced11=TOTAL&unit=PC",
    alternativen: [{ dataset: "lfst_r_lfu3rt", filter: "sex=T&age=Y15-74&isced11=TOTAL" }], dez: 1, suffix: " %", typ: "niedrig", diffEinheit: "Prozentpunkte",
    einheit: "Arbeitslose in % der Erwerbspersonen (15 bis 74 Jahre), international vergleichbare Definition (nicht die AMS-Quote)", rangText: "Rang 1 = niedrigste Arbeitslosigkeit",
    erklaerung: "Der Anteil der Menschen ohne Arbeit, die aktiv eine suchen, nach der Erhebung der Statistik Austria für Eurostat. Die Zahl liegt tiefer als die AMS-Quote, weil sie anders gezählt wird.", mock: { base: 4, step: 0.5 } },
  { id: "beschaeftigung", name: "Beschäftigungsquote", gruppe: 0, dataset: "lfst_r_lfe2emprt", filter: "sex=T&age=Y20-64&unit=PC",
    alternativen: [{ dataset: "lfst_r_lfe2emprt", filter: "sex=T&age=Y20-64" }], dez: 1, suffix: " %", typ: "hoch", diffEinheit: "Prozentpunkte",
    einheit: "Erwerbstätige in % der Bevölkerung von 20 bis 64 Jahren", rangText: "Rang 1 = höchste Beschäftigungsquote",
    erklaerung: "Wie viele Menschen zwischen 20 und 64 Jahren erwerbstätig sind. Teilzeit zählt voll mit.", mock: { base: 76, step: 0.9 } },
  { id: "einkommen", name: "Haushaltseinkommen pro Kopf", gruppe: 0, dataset: "nama_10r_2hhinc", filter: "direct=BAL&na_item=B6N&unit=EUR_HAB",
    alternativen: [{ dataset: "nama_10r_2hhinc", filter: "direct=BAL&na_item=B6N&unit=EUR_HAB&sector=S14_S15" }, { dataset: "nama_10r_2hhinc", filter: "na_item=B6N&unit=EUR_HAB" }], dez: 0, suffix: " €", typ: "hoch", diffEinheit: "Euro",
    einheit: "Verfügbares Einkommen der privaten Haushalte in Euro pro Einwohner und Jahr", rangText: "Rang 1 = höchstes Einkommen pro Kopf",
    erklaerung: "Wie viel Geld den Haushalten nach Steuern und Sozialleistungen pro Kopf zur Verfügung steht, nach dem Wohnort der Haushalte (nicht dem Arbeitsort).", mock: { base: 21000, step: 900 } },
  { id: "armut", name: "Armut oder soziale Ausgrenzung", gruppe: 1, dataset: "ilc_peps11n", filter: "unit=PC", alternativen: [{ dataset: "ilc_peps11n", filter: "unit=PC&age=TOTAL" }], dez: 1, suffix: " %", typ: "niedrig", diffEinheit: "Prozentpunkte",
    einheit: "Anteil der Menschen, die armutsgefährdet, erheblich materiell benachteiligt oder in einem Haushalt mit sehr geringer Erwerbstätigkeit sind", rangText: "Rang 1 = geringster Anteil",
    erklaerung: "Der Anteil der Bevölkerung, der von Armut oder sozialer Ausgrenzung bedroht ist (AROPE-Indikator). Er stammt aus einer Haushaltsbefragung, die Werte pro Bundesland sind daher ungenau.", mock: { base: 17, step: 1.2 } },
  { id: "lebenserwartung", name: "Lebenserwartung", gruppe: 1, dataset: "demo_r_mlifexp", filter: "sex=T&age=Y_LT1&unit=YR", alternativen: [{ dataset: "demo_r_mlifexp", filter: "sex=T&age=Y_LT1" }], dez: 1, suffix: " Jahre", typ: "hoch", diffEinheit: "Jahre",
    einheit: "Durchschnittliche Lebenserwartung bei der Geburt in Jahren", rangText: "Rang 1 = höchste Lebenserwartung",
    erklaerung: "Wie alt ein neugeborenes Kind im Schnitt würde, wenn die heutigen Sterberaten dauerhaft gelten.", mock: { base: 80.5, step: 0.4 } },
  { id: "bevoelkerung", name: "Bevölkerung", gruppe: 1, dataset: "demo_r_d2jan", filter: "sex=T&age=TOTAL", dez: 0, suffix: "", typ: "neutral", diffEinheit: "Personen", relativ: true,
    einheit: "Einwohner am 1. Jänner", rangText: "Rang 1 = meiste Einwohner",
    erklaerung: "Wie viele Menschen am 1. Jänner im Bundesland wohnen. Die Veränderung zeigt, ob das Land wächst oder schrumpft, ohne Wertung.", mock: { base: 300000, step: 150000 } },
  { id: "bevoelkerungsdichte", name: "Bevölkerungsdichte", gruppe: 1, dataset: "demo_r_d3dens", filter: "unit=PER_KM2", dez: 0, suffix: "", typ: "neutral", diffEinheit: "Einwohner pro km²",
    einheit: "Einwohner pro Quadratkilometer", rangText: "Rang 1 = am dichtesten besiedelt",
    erklaerung: "Wie dicht ein Bundesland besiedelt ist. Wien ist als Großstadt weit vorne, die Alpenländer liegen niedrig, weil viel Fläche unbewohnbar ist.", mock: { base: 70, step: 30 } },
  { id: "geburtenrate", name: "Geburtenrate", gruppe: 1, dataset: "demo_r_find2", filter: "indic_de=TOTFERRT&unit=NR", alternativen: [{ dataset: "demo_r_find2", filter: "indic_de=TOTFERRT&unit=YR" }], dez: 2, suffix: "", typ: "neutral", diffEinheit: "Kinder pro Frau",
    einheit: "Durchschnittliche Kinderzahl pro Frau (Gesamtfertilitätsrate)", rangText: "Rang 1 = höchste Geburtenrate",
    erklaerung: "Wie viele Kinder eine Frau im Schnitt bekommen würde, wenn die heutigen Geburtenraten ihr Leben lang gelten. Etwa 2,1 wären nötig, um die Bevölkerung ohne Zuwanderung stabil zu halten.", mock: { base: 1.4, step: 0.03 } },
  { id: "tertiaer", name: "Hochschulabschluss", gruppe: 2, dataset: "edat_lfse_04", filter: "sex=T&age=Y25-64&isced11=ED5-8&unit=PC",
    alternativen: [{ dataset: "edat_lfse_04", filter: "sex=T&age=Y25-64&isced11=ED5-8" }, { dataset: "edat_lfse_04", filter: "sex=T&age=Y25-64&isced11=ED58&unit=PC" }], dez: 1, suffix: " %", typ: "hoch", diffEinheit: "Prozentpunkte",
    einheit: "Anteil der 25- bis 64-Jährigen mit Hochschul- oder höherem Abschluss (inklusive Kollegs und Meisterprüfungen laut Eurostat-Einstufung)", rangText: "Rang 1 = höchster Anteil",
    erklaerung: "Wie viele Erwachsene einen Abschluss auf Hochschulniveau haben. In Städten ist der Anteil höher, weil Studierte dorthin ziehen.", mock: { base: 30, step: 2 } },
  { id: "schulabbruch", name: "Frühe Schulabgänger", gruppe: 2, dataset: "edat_lfse_16", filter: "sex=T&unit=PC", alternativen: [{ dataset: "edat_lfse_16", filter: "sex=T" }], dez: 1, suffix: " %", typ: "niedrig", diffEinheit: "Prozentpunkte", minLaender: 6,
    einheit: "Anteil der 18- bis 24-Jährigen ohne weiterführende Ausbildung, die nicht in Bildung oder Weiterbildung sind", rangText: "Rang 1 = geringster Anteil",
    erklaerung: "Wie viele junge Menschen nach der Pflichtschule keine Ausbildung mehr machen. Die Stichprobe ist klein, die Werte schwanken deshalb von Jahr zu Jahr.", mock: { base: 7, step: 0.6 } },
  { id: "forschung", name: "Forschungsausgaben", gruppe: 2, dataset: "rd_e_gerdreg", filter: "sectperf=TOTAL&unit=PC_GDP", alternativen: [{ dataset: "rd_e_gerdreg", filter: "sectperf=TOTAL&unit=PC_GDP&unit=PC_GDP" }], dez: 2, suffix: " %", typ: "hoch", diffEinheit: "Prozentpunkte", takt: "zwei",
    einheit: "Ausgaben für Forschung und Entwicklung in % der Wirtschaftsleistung des Bundeslandes", rangText: "Rang 1 = höchste Forschungsausgaben",
    erklaerung: "Wie viel öffentliche Stellen und Unternehmen im Land für Forschung ausgeben, gemessen an seiner Wirtschaftsleistung. Die Erhebung findet nur alle zwei Jahre statt.", mock: { base: 2.5, step: 0.3 } },
  { id: "verkehrstote", name: "Verkehrstote", gruppe: 3, dataset: "tran_r_acci", filter: "unit=P_MHAB&victim=KIL", dez: 0, suffix: "", typ: "niedrig", diffEinheit: "pro Million Einwohner",
    einheit: "Verkehrstote pro Million Einwohner und Jahr", rangText: "Rang 1 = wenigste Verkehrstote pro Einwohner",
    erklaerung: "Wie viele Menschen bei Verkehrsunfällen sterben, bezogen auf die Einwohnerzahl. Die Zahlen sind klein und schwanken von Jahr zu Jahr stark.", mock: { base: 40, step: 6 } }
];

function parseJS(js, parse) { return parse(js); }
function runden(x, dez) { const f = Math.pow(10, dez); return Math.round(x * f) / f; }

function mockDaten(ind) {
  const jahre = []; for (let y = SEIT; y <= 2025; y++) jahre.push(String(y));
  const geo = ["AT", ...LAENDER.map(l => l.code)];
  const idx = a => Object.fromEntries(a.map((x, i) => [x, i]));
  return { id: ["geo", "time"], size: [geo.length, jahre.length], dimension: { geo: { category: { index: idx(geo) } }, time: { category: { index: idx(jahre) } } },
    value: geo.flatMap((g, gi) => jahre.map((y, ti) => runden(ind.mock.base + ind.mock.step * ((gi * 5) % 9 - 4) + ind.mock.step * 0.3 * (ti - 6) * (((gi + ind.id.length) % 3) - 1), ind.dez + 1))) };
}

function auswerten(ind, daten) {
  const dez = ind.dez, typ = ind.typ, minL = ind.minLaender || MIN_LAENDER;
  const jahre = [...new Set(LAENDER.flatMap(l => Object.keys(daten[l.code] || {})))].sort();
  const letzt = jahre.filter(y => LAENDER.filter(l => daten[l.code]?.[y] != null).length >= minL).pop();
  if (!letzt) throw new Error("Keine Periode mit genügend Bundesländern");
  const ly = +letzt, aktuellJahr = new Date().getFullYear();
  if (!TESTMODE && ly < aktuellJahr - 4) throw new Error("Daten zu alt (" + letzt + ")");
  // Vergleichsjahr: 5 Jahre früher; sonst das älteste Jahr, das mindestens 3 Jahre zurückliegt
  let vor = null;
  for (let k = JAHRE_TREND; k >= 3 && !vor; k--) { const y = String(ly - k); if (LAENDER.filter(l => daten[l.code]?.[y] != null).length >= minL) vor = y; }
  const wert = (code, y) => { const v = daten[code]?.[y]; return v == null ? null : v; };
  const at = daten.AT ? wert("AT", letzt) : null, atVor = vor && daten.AT ? wert("AT", vor) : null;
  const ref = at != null ? Math.abs(at) : Math.abs(LAENDER.reduce((s, l) => s + (wert(l.code, letzt) || 0), 0) / LAENDER.length);
  const schwelle = Number(Math.max(Math.pow(10, -dez), SCHWELLE_ANTEIL * ref).toPrecision(2));
  const rangieren = (y) => {
    const liste = LAENDER.map(l => ({ c: l.code, v: wert(l.code, y) })).filter(x => x.v != null);
    liste.sort((a, b) => typ === "niedrig" ? a.v - b.v : b.v - a.v);
    const r = {}; liste.forEach((x, i) => { r[x.c] = 1 + liste.filter(z => (typ === "niedrig" ? z.v < x.v : z.v > x.v)).length; }); return r;
  };
  const rang = rangieren(letzt), rangVor = vor ? rangieren(vor) : {};
  const laender = LAENDER.map(l => {
    const w = wert(l.code, letzt), wv = vor ? wert(l.code, vor) : null;
    let diff = w != null && wv != null ? runden(w - wv, dez + 2) : null, urteil = null, richtung = null;
    if (diff != null) {
      const sw = ind.relativ ? 0 : schwelle;
      richtung = ind.relativ ? (w - wv) / wv * 100 > 3 ? "steigend" : (w - wv) / wv * 100 < -3 ? "sinkend" : "stabil" : diff > sw ? "steigend" : diff < -sw ? "sinkend" : "stabil";
      if (typ !== "neutral") urteil = richtung === "stabil" ? "unverändert" : ((richtung === "steigend") === (typ === "hoch") ? "besser" : "schlechter");
    }
    return { code: l.code, name: l.name, kurz: l.kurz, wert: w, wertVor: wv, diff, richtung, urteil, rang: rang[l.code] ?? null, rangVor: rangVor[l.code] ?? null,
      prozent: w != null && wv ? runden((w - wv) / Math.abs(wv) * 100, 1) : null };
  }).filter(x => x.wert != null);
  laender.sort((a, b) => (typ === "niedrig" ? a.wert - b.wert : b.wert - a.wert));
  return { id: ind.id, name: ind.name, gruppe: GRUPPEN[ind.gruppe], typ, dez, suffix: ind.suffix, diffEinheit: ind.diffEinheit, einheit: ind.einheit, rangText: ind.rangText,
    erklaerung: ind.erklaerung, relativ: !!ind.relativ, periode: letzt, vorPeriode: vor, schwelle: ind.relativ ? 3 : schwelle, schwelleArt: ind.relativ ? "Prozent" : "absolut", dataset: ind.dataset,
    oesterreich: at != null ? { wert: at, wertVor: atVor } : null, anzahl: laender.length, laender };
}

let TESTMODE = false;
async function berechneBundeslaender({ TEST, BASE, parse }) {
  TESTMODE = TEST;
  const ergebnis = [], geoQuery = ["AT", ...LAENDER.map(l => l.code)].map(c => "geo=" + c).join("&");
  for (const ind of IND) {
    const kandidaten = [{ dataset: ind.dataset, filter: ind.filter }, ...(ind.alternativen || [])];
    let r = null, fehler = null;
    for (const k of kandidaten) {
      try {
        let js;
        if (TEST) js = mockDaten(ind);
        else {
          const res = await fetch(`${BASE}${k.dataset}?format=JSON&lang=EN&${k.filter}&${geoQuery}&sinceTimePeriod=${SEIT}`);
          if (!res.ok) { const txt = (await res.text()).slice(0, 250); throw new Error("Eurostat: HTTP " + res.status + " " + txt); }
          js = await res.json();
        }
        r = auswerten(ind, parse(js)); r.dataset = k.dataset; break;
      } catch (e) { fehler = e; if (kandidaten.length > 1) console.error(`   (Bundesländer ${k.dataset} mit ${k.filter}: ${e.message})`); }
    }
    if (r) { ergebnis.push(r); console.log(`OK  Bundesland ${r.name}: ${r.periode}, ${r.anzahl} Länder, Platz 1 ${r.laender[0].name}`); }
    else {
      console.error(`FEHLER Bundesland ${ind.name}: ${fehler && fehler.message}`);
      if (!TEST) try { // Fehlersuche: welche Dimensionen hat der Datensatz?
        const res = await fetch(`${BASE}${ind.dataset}?format=JSON&lang=EN&geo=AT11&sinceTimePeriod=2022`), js = await res.json();
        js.id.forEach(d => { const cat = js.dimension[d].category, lb = cat.label || {}; console.error(`   ${d}: ` + Object.keys(cat.index).slice(0, 40).map(c => c + (lb[c] ? " (" + lb[c].slice(0, 30) + ")" : "")).join("; ")); });
      } catch (e) { console.error("   Fehlersuche nicht möglich: " + e.message); }
    }
  }
  // Gesamtbild: durchschnittlicher Rang über alle gewerteten Indikatoren, und wie viele Indikatoren sich verbessert/verschlechtert haben
  const bilanz = LAENDER.map(l => {
    const mit = ergebnis.filter(i => i.typ !== "neutral").map(i => ({ i, x: i.laender.find(z => z.code === l.code) })).filter(a => a.x && a.x.rang != null);
    const n = mit.length, summe = mit.reduce((s, a) => s + a.x.rang, 0);
    const z = u => mit.filter(a => a.x.urteil === u).length;
    return { code: l.code, name: l.name, kurz: l.kurz, n, durchschnittsrang: n ? runden(summe / n, 2) : null, besser: z("besser"), schlechter: z("schlechter"), unveraendert: z("unverändert"),
      erste: mit.filter(a => a.x.rang === 1).length, letzte: mit.filter(a => a.x.rang === a.i.anzahl).length };
  }).sort((a, b) => (a.durchschnittsrang ?? 99) - (b.durchschnittsrang ?? 99));
  bilanz.forEach((b, i) => { b.platz = 1 + bilanz.filter(z => z.durchschnittsrang < b.durchschnittsrang).length; });
  return { aktualisiert: new Date().toISOString().slice(0, 10), beispiel: TEST, quelle: "Eurostat (Regionaldaten, NUTS 2)", jahreTrend: JAHRE_TREND, gruppen: GRUPPEN,
    laender: LAENDER.map(l => ({ ...l, regierung: REGIERUNGEN[l.code] })), regierungenStand: REGIERUNGEN_STAND, indikatoren: ergebnis, bilanz };
}
module.exports = { berechneBundeslaender };
