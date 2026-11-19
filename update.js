// Holt Indikatoren von Eurostat, berechnet EU-Ranking und Trend
// und schreibt docs/daten.js + docs/daten.json.
// Aufruf: node update.js          (echte Daten, braucht Internet)
//         node update.js --test   (Beispieldaten, ohne Internet)
const fs = require("fs");
const TEST = process.argv.includes("--test");
const BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/";
const NAMES = {AT:"Österreich",BE:"Belgien",BG:"Bulgarien",CY:"Zypern",CZ:"Tschechien",DE:"Deutschland",
  DK:"Dänemark",EE:"Estland",EL:"Griechenland",ES:"Spanien",FI:"Finnland",FR:"Frankreich",HR:"Kroatien",
  HU:"Ungarn",IE:"Irland",IT:"Italien",LT:"Litauen",LU:"Luxemburg",LV:"Lettland",MT:"Malta",NL:"Niederlande",
  PL:"Polen",PT:"Portugal",RO:"Rumänien",SE:"Schweden",SI:"Slowenien",SK:"Slowakei"};
const MIN_LAENDER = 24; // Berichtsperiode: neueste Periode mit mindestens so vielen Ländern

// Zeitraster: monatlich ("2026-08"), quartalsweise ("2026-Q3"), halbjährlich ("2026-S1") oder jährlich ("2025")
//  seit: ab wann Daten geholt werden, glaettung: Zahl der Perioden für den Trend-Durchschnitt,
//  rueckblick: wie viele Perioden zurück verglichen wird, verlaufN: Länge des Diagramms (5 Jahre),
//  maxAlter: ab wie vielen Monaten Verzögerung eine Warnung erscheint
const TAKT = {
  monat:   { seit: "2021-01", glaettung: 3, rueckblick: 3, verlaufN: 60, maxAlter: 4 },
  quartal: { seit: "2020-Q1", glaettung: 1, rueckblick: 1, verlaufN: 20, maxAlter: 8 },
  halbjahr:{ seit: "2019-S1", glaettung: 1, rueckblick: 2, verlaufN: 10, maxAlter: 12 },
  jahr:    { seit: "2019",    glaettung: 1, rueckblick: 1, verlaufN: 5,  maxAlter: 18 }
};

// ===== Neuer Indikator = neuer Eintrag in dieser Liste =====
// takt: "monat", "quartal", "halbjahr" oder "jahr".  typ "niedrig": niedriger Wert ist besser.  typ "hoch": höherer Wert ist besser.
// schwelle: ab welcher Änderung (in Prozentpunkten) der Trend als besser/schlechter gilt.
const INDICATORS = [
  { id: "arbeitslosigkeit", name: "Arbeitslosenquote", pfeilModus: "wert", takt: "monat", dataset: "une_rt_m",
    filter: "s_adj=SA&age=TOTAL&unit=PC_ACT&sex=T",
    einheit: "% der Erwerbspersonen, saisonbereinigt", rangText: "Rang 1 = niedrigste Arbeitslosenquote",
    typ: "niedrig", schwelle: 0.1, mock: { base: 3, step: 0.7 } },
  { id: "inflation", name: "Inflation", takt: "monat",
    dataset: "prc_hicp_minr", // ab Jan 2026 ECOICOP 2 (Dimension coicop18); der alte Datensatz prc_hicp_manr endet im Dez 2025
    filter: "unit=RCH_A&coicop18=TOTAL",
    einheit: "% Veränderung zum Vorjahresmonat", rangText: "Rang 1 = niedrigste Inflation",
    typ: "niedrig", schwelle: 0.2, mock: { base: 0.2, step: 0.35 } },
  { id: "wachstum", name: "Wirtschaftswachstum", takt: "quartal", dataset: "namq_10_gdp",
    filter: "unit=CLV_PCH_SM&s_adj=SCA&na_item=B1GQ", // BIP, preisbereinigt, saison- und kalenderbereinigt, Veränderung zum Vorjahresquartal
    einheit: "% Veränderung des BIP zum Vorjahresquartal (preis-, saison- und kalenderbereinigt)",
    rangText: "Rang 1 = höchstes Wirtschaftswachstum",
    typ: "hoch", schwelle: 0.2, mock: { base: -0.4, step: 0.35 } },
  { id: "schulden", name: "Schuldenstand", takt: "quartal", dataset: "gov_10q_ggdebt", // Quartalsdaten sind aktueller als die Jahresdaten (gov_10dd_edpt1)
    filter: "unit=PC_GDP&sector=S13&na_item=GD", // Maastricht-Schuldenstand des Staates
    einheit: "% des BIP, Staat insgesamt, Stand am Quartalsende", rangText: "Rang 1 = niedrigster Schuldenstand",
    typ: "niedrig", schwelle: 0.5, mock: { base: 40, step: 5 } },
  { id: "defizit", name: "Budgetsaldo", takt: "jahr", dataset: "gov_10dd_edpt1",
    filter: "unit=PC_GDP&sector=S13&na_item=B9", // Finanzierungssaldo des Staates, negativ = Defizit
    einheit: "% des BIP, Staat insgesamt (negativ = Defizit)",
    rangText: "Rang 1 = bester Budgetsaldo (höchster Überschuss bzw. kleinstes Defizit)",
    typ: "hoch", schwelle: 0.5, mock: { base: -6, step: 0.6 } },
  { id: "geburtenrate", name: "Geburtenrate", takt: "jahr", dataset: "demo_find",
    filter: "indic_de=TOTFERRATE", // Gesamtfertilitätsrate: durchschnittliche Kinderzahl pro Frau
    alternativen: [ // falls Eurostat Datensatz oder Code anders benennt, werden diese der Reihe nach probiert
      { dataset: "demo_find", filter: "indic_de=TOTFERRT" },
      { dataset: "tps00199", filter: "indic_de=TOTFERRATE" },
      { dataset: "tps00199", filter: "indic_de=TOTFERRT" } ],
    maxAlter: 26, // Jahresdaten erscheinen mit 1 bis 2 Jahren Verzögerung
    einheit: "Kinder pro Frau (Gesamtfertilitätsrate)", suffix: "", diffEinheit: "Kinder pro Frau", dez: 2,
    rangText: "Rang 1 = höchste Geburtenrate (eine höhere Geburtenrate gilt hier als besser)",
    typ: "hoch", schwelle: 0.03, zusatzDatei: "zusatz-geburten.json", mock: { base: 1.1, step: 0.05 } },
  { id: "staatsquote", name: "Staatsquote", takt: "jahr", dataset: "gov_10a_exp",
    filter: "unit=PC_GDP&sector=S13&cofog99=TOTAL&na_item=TE", // Gesamtausgaben des Staates in % des BIP
    einheit: "% des BIP: gesamte Staatsausgaben", diffEinheit: "Prozentpunkte",
    rangText: "Rang 1 = niedrigste Staatsquote",
    trendNeutral: true, // Trend wird ohne Wertung als höher/niedriger gezeigt, das Ranking bleibt gewertet
    umstritten: true, // Wertung ist politisch umstritten: Hinweis wird angezeigt. typ "neutral" statt "niedrig" schaltet die Wertung ab.
    hinweis: "Die Wertung ist umstritten: Im Ranking gilt eine niedrigere Staatsquote als besser (weniger Staatsanteil an der Wirtschaft). Der Trend wird dagegen neutral als höher oder niedriger angezeigt. Andere sehen einen hohen Staatsanteil als Vorteil, etwa für soziale Absicherung, Gesundheit und Bildung. Die Staatsquote zeigt, welcher Anteil der Wirtschaftsleistung (BIP) über den Staat ausgegeben wird.",
    maxAlter: 26, typ: "niedrig", schwelle: 0.5, mock: { base: 42, step: 1.6 } }
  ,{ id: "strompreis", name: "Strompreis für Haushalte", takt: "halbjahr", dataset: "nrg_pc_204",
    filter: "siec=E7000&nrg_cons=KWH2500-4999&unit=KWH&tax=I_TAX&currency=EUR", // Haushalte mit 2.500 bis 5.000 kWh Jahresverbrauch, inklusive aller Steuern und Abgaben
    faktor: 100, dez: 1, suffix: " ct", diffEinheit: "Cent pro kWh",
    einheit: "Cent pro kWh, Haushalte mit 2.500 bis 5.000 kWh Jahresverbrauch, inklusive Steuern und Abgaben (Halbjahreswerte)",
    rangText: "Rang 1 = niedrigster Strompreis", maxAlter: 14,
    typ: "niedrig", schwelle: 1, mock: { base: 14, step: 2.2 } }
  ,{ id: "strompreis-industrie", name: "Strompreis für Industrie", takt: "halbjahr", dataset: "nrg_pc_205",
    filter: "siec=E7000&nrg_cons=MWH2000-19999&unit=KWH&tax=X_VAT&currency=EUR", // mittlere Industrie, 2.000 bis 19.999 MWh Jahresverbrauch, ohne MwSt. und andere erstattungsfähige Steuern
    faktor: 100, dez: 1, suffix: " ct", diffEinheit: "Cent pro kWh",
    einheit: "Cent pro kWh, Unternehmen mit 2.000 bis 19.999 MWh Jahresverbrauch, ohne Mehrwertsteuer und andere erstattungsfähige Steuern (Halbjahreswerte)",
    rangText: "Rang 1 = niedrigster Strompreis", maxAlter: 14,
    typ: "niedrig", schwelle: 1, mock: { base: 9, step: 1.4 } }
];

// ---- Perioden-Hilfen: jede Periode wird als fortlaufende Nummer gerechnet ----
function toIdx(t, takt) {
  if (takt === "jahr") { if (!/^\d{4}$/.test(t)) throw new Error("Unbekannte Periode: " + t); return +t; }
  if (takt === "halbjahr") { const m = /^(\d{4})-S([12])$/.exec(t); if (!m) throw new Error("Unbekannte Periode: " + t); return +m[1] * 2 + (+m[2] - 1); }
  if (takt === "quartal") { const m = /^(\d{4})-Q([1-4])$/.exec(t); if (!m) throw new Error("Unbekannte Periode: " + t); return +m[1] * 4 + (+m[2] - 1); }
  const m = /^(\d{4})-(\d{2})$/.exec(t); if (!m) throw new Error("Unbekannte Periode: " + t); return +m[1] * 12 + (+m[2] - 1);
}
function fromIdx(i, takt) {
  if (takt === "jahr") return String(i);
  if (takt === "halbjahr") return `${Math.floor(i / 2)}-S${(i % 2) + 1}`;
  if (takt === "quartal") return `${Math.floor(i / 4)}-Q${(i % 4) + 1}`;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}
const shift = (t, n, takt) => fromIdx(toIdx(t, takt) + n, takt);
// Monat (als Zahl Jahr*12+Monat), in dem die Periode endet
function endeMonat(t, takt) {
  if (takt === "jahr") return +t * 12 + 12;
  if (takt === "halbjahr") { const m = /^(\d{4})-S([12])$/.exec(t); return +m[1] * 12 + +m[2] * 6; }
  if (takt === "quartal") { const m = /^(\d{4})-Q([1-4])$/.exec(t); return +m[1] * 12 + +m[2] * 3; }
  const m = /^(\d{4})-(\d{2})$/.exec(t); return +m[1] * 12 + +m[2];
}

// JSON-stat von Eurostat -> {AT: {"2026-08": 5.3, ...}, ...}
function parse(js) {
  const ids = js.id, size = js.size, gi = ids.indexOf("geo"), ti = ids.indexOf("time");
  ids.forEach((d, i) => { // Sicherheitsnetz: sonst würden stillschweigend falsche Werte gelesen
    if (d !== "geo" && d !== "time" && size[i] !== 1)
      throw new Error(`Filter unvollständig: Dimension "${d}" hat ${size[i]} Werte. Filter im Skript anpassen.`);
  });
  const stride = []; let s = 1;
  for (let d = ids.length - 1; d >= 0; d--) { stride[d] = s; s *= size[d]; }
  const geo = js.dimension.geo.category.index, time = js.dimension.time.category.index, out = {};
  for (const g in geo) {
    out[g] = {};
    for (const t in time) {
      const v = js.value[geo[g] * stride[gi] + time[t] * stride[ti]];
      if (v !== undefined && v !== null) out[g][t] = v;
    }
  }
  return out;
}

// Beispieldaten im Eurostat-Format (nur zum Testen)
function mock(ind) {
  const codes = [...Object.keys(NAMES), "EU27_2020", "CH"], times = [], value = {}, tIdx = {}, gIdx = {};
  const first = toIdx(TAKT[ind.takt].seit, ind.takt);
  const last = { monat: toIdx("2026-09", "monat"), quartal: toIdx("2026-Q3", "quartal"), halbjahr: toIdx("2026-S1", "halbjahr"), jahr: toIdx("2025", "jahr") }[ind.takt];
  for (let i = first; i <= last; i++) times.push(fromIdx(i, ind.takt));
  times.forEach((t, i) => tIdx[t] = i); codes.forEach((c, i) => gIdx[c] = i);
  codes.forEach((c, gi) => times.forEach((t, i) => {
    if (ind.takt !== "jahr" && i === times.length - 1 && gi % 5 === 0 && c !== "AT") return; // manche Länder melden später
    value[gi * times.length + i] = Math.round((ind.mock.base + (gi * 7 % 11) * ind.mock.step + Math.sin(i / 3 + gi) * 0.2) * 10) / 10;
  }));
  return { id: ["freq","unit","geo","time"], size: [1,1,codes.length,times.length],
    dimension: { geo: { category: { index: gIdx } }, time: { category: { index: tIdx } } }, value };
}

// Startpunkt des Vergleichs: Amtsantritt der aktuellen Bundesregierung (zum Ändern einfach hier anpassen)
const REGIERUNG = { name: "Regierung Stocker", kurz: "Stocker", parteien: "ÖVP, SPÖ und NEOS", start: "2025-03-03" };

let DEZ = 1; // Dezimalstellen des aktuellen Indikators (Geburtenrate: 2)
const r1 = x => Math.round(x * 10 ** DEZ) / 10 ** DEZ;
const scoreOf = ind => v => ind.typ === "niedrig" ? v : -v; // kleiner = besser; neutral: höchster Wert = Rang 1 (ohne Wertung)

// Rang 1 = bester Score; gleiche (auf eine Dezimale gerundete) Scores teilen sich den Platz
function rankAt(data, t, sc) {
  const list = Object.keys(NAMES).filter(c => data[c] && data[c][t] !== undefined)
    .map(c => ({ code: c, name: NAMES[c], value: data[c][t], score: sc(data[c][t]) }));
  list.forEach(x => x.rank = 1 + list.filter(y => r1(y.score) < r1(x.score)).length);
  return list.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "de")).map(({ score, ...rest }) => rest);
}
const avg = (data, c, t, k, takt) => {
  const v = []; for (let i = 0; i < k; i++) { const x = data[c]?.[shift(t, -i, takt)]; if (x === undefined) return null; v.push(x); }
  return v.reduce((a, b) => a + b, 0) / k;
};

// Zusatzdaten nur für Österreich (von Hand gepflegte Datei, z. B. Geburtenrate nach Staatsangehörigkeit)
function ladeZusatz(ind) {
  if (!ind.zusatzDatei) return null;
  try { return JSON.parse(fs.readFileSync(ind.zusatzDatei, "utf8")); } catch (e) { console.error("Hinweis: Zusatzdatei " + ind.zusatzDatei + " nicht lesbar: " + e.message); return null; }
}

function berechne(ind, js) {
  DEZ = ind.dez || 1;
  const takt = ind.takt, cfg = TAKT[takt], data = parse(js), sc = scoreOf(ind);
  if (ind.faktor) for (const c in data) for (const t in data[c]) data[c][t] = data[c][t] * ind.faktor; // z. B. EUR/kWh in Cent/kWh
  const urt = (ds, dv) => (ind.typ === "neutral" || ind.trendNeutral)
    ? (dv > ind.schwelle ? "höher" : dv < -ind.schwelle ? "niedriger" : "unverändert")
    : (ds < -ind.schwelle ? "besser" : ds > ind.schwelle ? "schlechter" : "unverändert");
  const periods = [...new Set(Object.values(data).flatMap(o => Object.keys(o)))].sort((a, b) => toIdx(a, takt) - toIdx(b, takt));
  const count = t => Object.keys(NAMES).filter(c => data[c]?.[t] !== undefined).length;
  const latest = [...periods].reverse().find(t => count(t) >= MIN_LAENDER);
  if (!latest) throw new Error("Keine ausreichenden Daten gefunden");
  const vorher = shift(latest, -cfg.rueckblick, takt), ranks = rankAt(data, latest, sc), ranksV = rankAt(data, vorher, sc);
  const me = ranks.find(x => x.code === "AT"), meV = ranksV.find(x => x.code === "AT");
  if (!me) throw new Error("Österreich fehlt in der Berichtsperiode");
  const avgNow = avg(data, "AT", latest, cfg.glaettung, takt), avgPrev = avg(data, "AT", vorher, cfg.glaettung, takt);
  if (avgNow == null || avgPrev == null) throw new Error("Für Österreich fehlen Werte für den Vergleich mit der Vorperiode");
  const delta = avgNow - avgPrev, dScore = sc(avgNow) - sc(avgPrev);
  // Schweiz: kein EU-Mitglied, zählt nicht zum Ranking, wird nur zum Vergleich mitgeführt
  let schweiz = null;
  if (data.CH) { const ts = Object.keys(data.CH).sort((a, b) => toIdx(a, takt) - toIdx(b, takt)), last = ts[ts.length - 1]; if (last) schweiz = { wert: data.CH[last], periode: last }; }
  const now = new Date().toISOString().slice(0, 7);
  const alter = (+now.slice(0, 4)) * 12 + (+now.slice(5)) - endeMonat(latest, takt);
  // Trend pro Land: gleiche Logik wie bei Österreich (geglättete Werte, Schwelle), Urteil nach "besser/schlechter"
  ranks.forEach(x => {
    const a = avg(data, x.code, latest, cfg.glaettung, takt), b = avg(data, x.code, vorher, cfg.glaettung, takt);
    if (a == null || b == null) { x.urteil = null; return; }
    const d = sc(a) - sc(b);
    const dv = a - b; x.richtung = dv > ind.schwelle ? "steigend" : dv < -ind.schwelle ? "sinkend" : "stabil";
    x.urteil = urt(d, dv);
  });
  // Rang-Entwicklung von Österreich über den ganzen Verlauf (nur Perioden mit genug Ländern)
  const rangVerlauf = [];
  for (let i = cfg.verlaufN - 1; i >= 0; i--) {
    const t = shift(latest, -i, takt), rk = rankAt(data, t, sc), m = rk.length >= MIN_LAENDER ? rk.find(x => x.code === "AT") : null;
    rangVerlauf.push({ t, rang: m ? m.rank : null, n: rk.length });
  }
  // Vergleichspunkte für den Rang: ein halbes Jahr und 3 Jahre zurück (bei Jahresdaten: 1 Jahr und 3 Jahre)
  const sch = { monat: [6, 36], quartal: [2, 12], halbjahr: [1, 6], jahr: [1, 3] }[takt];
  const lbl = ["vor einem halben Jahr", "vor 3 Jahren"]; if (takt === "jahr") lbl[0] = "vor einem Jahr";
  const vgl = sch.map((k, n) => {
    const t = shift(latest, -k, takt), v = rangVerlauf.find(x => x.t === t);
    return v && v.rang != null ? { label: lbl[n], t, rang: v.rang, n: v.n } : null;
  });
  // Seit Amtsantritt der Regierung: Periode des Amtsantritts (bei Jahresdaten das letzte volle Jahr davor)
  const sy = +REGIERUNG.start.slice(0, 4), sm = +REGIERUNG.start.slice(5, 7);
  const startP = { monat: REGIERUNG.start.slice(0, 7), quartal: `${sy}-Q${Math.ceil(sm / 3)}`, halbjahr: `${sy}-S${sm <= 6 ? 1 : 2}`, jahr: String(sy - 1) }[takt];
  let seitStart = null;
  const rkS = rankAt(data, startP, sc), meS = rkS.length >= MIN_LAENDER ? rkS.find(x => x.code === "AT") : null;
  const a0 = avg(data, "AT", startP, cfg.glaettung, takt);
  if (meS && a0 != null && toIdx(startP, takt) < toIdx(latest, takt)) {
    const dd = avgNow - a0, ds = sc(avgNow) - sc(a0);
    seitStart = { t: startP, wert: meS.value, rang: meS.rank, n: rkS.length, schnitt: r1(a0), veraenderung: r1(dd),
      richtung: dd > ind.schwelle ? "steigend" : dd < -ind.schwelle ? "sinkend" : "stabil",
      urteil: urt(ds, dd) };
  }
  const rangVergleich = seitStart && ind.typ !== "neutral" ? [{ label: "seit Regierungsantritt", t: startP, rang: seitStart.rang, n: seitStart.n, regierung: true }] : [];
  const verlauf = [];
  for (let i = cfg.verlaufN - 1; i >= 0; i--) { const t = shift(latest, -i, takt); verlauf.push({ t, at: data.AT?.[t] ?? null, eu: data.EU27_2020?.[t] ?? null }); }
  return {
    id: ind.id, name: ind.name, pfeilModus: "wert", typ: ind.typ, dez: DEZ, suffix: ind.suffix ?? " %", diffEinheit: ind.diffEinheit || "Prozentpunkte", hinweis: ind.hinweis || null, umstritten: !!ind.umstritten, trendNeutral: !!(ind.trendNeutral || ind.typ === "neutral"), zusatz: ladeZusatz(ind), takt, einheit: ind.einheit, rangText: ind.rangText,
    periode: latest, vorherPeriode: vorher, anzahlLaender: ranks.length, alter,
    warnung: alter > (ind.maxAlter ?? cfg.maxAlter) ? `Der letzte verfügbare Wert ist ${alter} Monate alt. Möglicherweise hat Eurostat den Datensatz umgestellt.` : null,
    oesterreich: { wert: me.value, rang: me.rank, wertVorher: meV?.value ?? null, rangVorher: meV?.rank ?? null,
      schnitt: r1(avgNow), schnittVorher: r1(avgPrev), veraenderung: r1(delta),
      richtung: delta > ind.schwelle ? "steigend" : delta < -ind.schwelle ? "sinkend" : "stabil",
      urteil: urt(dScore, delta) },
    eu: data.EU27_2020?.[latest] ?? null, beste: ranks[0], schlechteste: ranks[ranks.length - 1],
    rangVerlauf, rangVergleich, seitStart,
    laender: ranks, schweiz, verlauf
  };
}

// ===== Kreditratings: von Hand gepflegt (ratings.json), kein Eurostat-Abruf =====
// Jede Note wird in eine Stufe umgerechnet (AAA/Aaa = 1, AA+/Aa1 = 2 ...), über die drei Agenturen gemittelt
// und nach diesem Durchschnitt gerankt. Gleichstand teilt den Platz. Moody's-Stufen jenseits Baa3 sind genähert.
const SKALA_SP = ["AAA","AA+","AA","AA-","A+","A","A-","BBB+","BBB","BBB-","BB+","BB","BB-","B+","B","B-","CCC+","CCC","CCC-","CC","C","D"]; // gilt auch für Fitch
const SKALA_MOODYS = ["Aaa","Aa1","Aa2","Aa3","A1","A2","A3","Baa1","Baa2","Baa3","Ba1","Ba2","Ba3","B1","B2","B3","Caa1","Caa2","Caa3","Ca","C"];
function stufe(agentur, r, land) {
  const i = (agentur === "moodys" ? SKALA_MOODYS : SKALA_SP).indexOf(r);
  if (i < 0) throw new Error(`ratings.json: Ungültiges Rating "${r}" bei ${land} (${agentur})`);
  return i + 1;
}
function zeile(code, name, r) {
  const stufen = [stufe("sp", r.sp, code), stufe("moodys", r.moodys, code), stufe("fitch", r.fitch, code)];
  const schnitt = Math.round(stufen.reduce((a, b) => a + b, 0) / 3 * 100) / 100;
  const text = SKALA_SP[Math.min(SKALA_SP.length, Math.max(1, Math.round(schnitt))) - 1];
  return { code, name, sp: r.sp, moodys: r.moodys, fitch: r.fitch, stufen, schnitt, schnittText: text, unsicher: r.unsicher || [] };
}
function berechneRating() {
  const raw = JSON.parse(fs.readFileSync("ratings.json", "utf8"));
  const rows = Object.keys(NAMES).map(code => {
    if (!raw.laender?.[code]) throw new Error("ratings.json: Land fehlt: " + code);
    return zeile(code, NAMES[code], raw.laender[code]);
  });
  rows.forEach(x => x.rank = 1 + rows.filter(y => y.schnitt < x.schnitt).length);
  rows.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "de"));
  const me = rows.find(x => x.code === "AT");
  // Trend pro Land nur dort, wo in ratings.json ein Vorjahresstand ("vorher") hinterlegt ist
  rows.forEach(x => {
    const vv = raw.vorher?.[x.code]; if (!vv) { x.urteil = null; return; }
    const v = zeile(x.code, x.name, { ...raw.laender[x.code], ...vv }), d = Math.round((x.schnitt - v.schnitt) * 100) / 100;
    x.schnittVorher = v.schnitt; x.urteil = d < -0.1 ? "besser" : d > 0.1 ? "schlechter" : "unverändert";
  });
  const tage = Math.round((Date.now() - new Date(raw.stand + "T12:00:00Z").getTime()) / 86400000);
  let warnung = null;
  if (tage > 100) warnung = `Die Ratings wurden zuletzt vor ${tage} Tagen eingetragen. Bitte aktuelle Ratings prüfen und ratings.json aktualisieren.`;
  // Trend: Vergleich mit dem Stand vor einem Jahr (nur Österreich, falls in ratings.json hinterlegt)
  if (raw.vorher?.AT) {
    const v = zeile("AT", "Österreich", raw.vorher.AT), d = Math.round((me.schnitt - v.schnitt) * 100) / 100;
    me.schnittVorher = v.schnitt; me.schnittTextVorher = v.schnittText; me.veraenderung = d;
    me.urteil = d < -0.1 ? "besser" : d > 0.1 ? "schlechter" : "unverändert";
    me.vorherStand = raw.vorher.stand;
  }
  return {
    id: "rating", name: "Kreditrating", art: "rating", stand: raw.stand, quelle: raw.quelle, warnung, anzahlUnsicher: rows.reduce((n, x) => n + x.unsicher.length, 0),
    einheit: "Durchschnitt der Ratings von S&P, Moody's und Fitch",
    rangText: "Rang 1 = beste durchschnittliche Bonitätsnote. Gleichstand teilt den Platz",
    anzahlLaender: rows.length, oesterreich: { ...me, rang: me.rank }, beste: rows[0], schlechteste: rows[rows.length - 1],
    laender: rows, schweiz: raw.schweiz ? zeile("CH", "Schweiz", raw.schweiz) : null
  };
}

// Bei einem Fehler: zeigt, welche Werte die Dimensionen im Datensatz wirklich haben (nur für die Fehlersuche)
async function diagnose(ind) {
  if (TEST) return;
  try {
    const res = await fetch(`${BASE}${ind.dataset}?format=JSON&lang=EN&geo=AT&sinceTimePeriod=${TAKT[ind.takt].seit}`);
    const js = await res.json();
    console.error(`   Fehlersuche ${ind.dataset}: Dimensionen und Werte (Auszug)`);
    js.id.forEach(d => {
      const cat = js.dimension[d].category, labels = cat.label || {};
      console.error(`   ${d}: ` + Object.keys(cat.index).slice(0, 25).map(c => c + (labels[c] ? " (" + labels[c].slice(0, 40) + ")" : "")).join("; "));
    });
  } catch (e) { console.error("   Fehlersuche nicht möglich: " + e.message); }
}

// ===== Insolvenzen: nur Österreich, von Hand gepflegt (insolvenzen.json, Quelle KSV1870) =====
function berechneInsolvenzen() {
  const raw = JSON.parse(fs.readFileSync("insolvenzen.json", "utf8")), ys = Object.keys(raw.jahre).sort();
  const last = ys[ys.length - 1], prevY = String(+last - 1), g = y => raw.jahre[y].gesamt;
  const proz = (a, b) => Math.round((a - b) / b * 1000) / 10, SCHW = 3; // Veränderung in %, ab ±3 % gilt der Trend als besser/schlechter
  const urt = p => p > SCHW ? "schlechter" : p < -SCHW ? "besser" : "unverändert", ric = p => p > SCHW ? "steigend" : p < -SCHW ? "sinkend" : "stabil";
  const pj = proz(g(last), g(prevY));
  const sortiert = ys.slice().sort((a, b) => g(b) - g(a)), platz = sortiert.indexOf(last) + 1;
  const schnitt = Math.round(ys.reduce((n, y) => n + g(y), 0) / ys.length);
  const hj = raw.halbjahr, hy = Object.keys(hj || {}).sort(), hNow = hy[hy.length - 1], hPrev = hy[hy.length - 2];
  const hp = hj && hPrev ? proz(hj[hNow].gesamt, hj[hPrev].gesamt) : null;
  const tage = Math.round((Date.now() - new Date(raw.stand + "T12:00:00Z").getTime()) / 86400000);
  return {
    id: "insolvenzen", name: "Insolvenzen", art: "nurAT", takt: "jahr", pfeilModus: "wert", stand: raw.stand, quelle: raw.quelle, hinweis: raw.hinweis,
    einheit: "Unternehmensinsolvenzen pro Jahr in Österreich (eröffnete und mangels Vermögen nicht eröffnete Verfahren)",
    periode: last, vorherPeriode: prevY, anzahlJahre: ys.length, ersteJahr: ys[0], krisen: raw.krisen || {},
    warnung: tage > 200 ? `Die Insolvenzzahlen wurden zuletzt vor ${tage} Tagen eingetragen. Bitte insolvenzen.json aktualisieren.` : null,
    oesterreich: { wert: g(last), wertVorher: g(prevY), veraenderungProzent: pj, richtung: ric(pj), urteil: urt(pj), platzHoechste: platz, schnitt,
      hoechstes: { jahr: sortiert[0], wert: g(sortiert[0]) }, niedrigstes: { jahr: sortiert[ys.length - 1], wert: g(sortiert[ys.length - 1]) } },
    halbjahr: hj && hPrev ? { jahr: hNow, vorjahr: hPrev, wert: hj[hNow].gesamt, wertVorher: hj[hPrev].gesamt, eroeffnet: hj[hNow].eroeffnet, nichtEroeffnet: hj[hNow].nichtEroeffnet,
      veraenderungProzent: hp, richtung: ric(hp), urteil: urt(hp) } : null,
    jahre: ys.map(y => ({ jahr: y, ...raw.jahre[y] }))
  };
}

(async () => {
  let prev = {};
  if (!TEST) try { prev = Object.fromEntries(JSON.parse(fs.readFileSync("docs/daten.json", "utf8")).indikatoren.map(i => [i.id, i])); } catch (e) {}
  const result = []; let fehler = 0;
  for (const ind of INDICATORS) {
    try {
      let r = null, letzterFehler = null;
      const kandidaten = [{ dataset: ind.dataset, filter: ind.filter }, ...(ind.alternativen || [])];
      for (const k of kandidaten) {
        try {
          let js;
          if (TEST) js = mock(ind);
          else {
            const res = await fetch(`${BASE}${k.dataset}?format=JSON&lang=EN&${k.filter}&sinceTimePeriod=${TAKT[ind.takt].seit}`);
            if (!res.ok) { const txt = (await res.text()).slice(0, 300); throw new Error("Eurostat: HTTP " + res.status + " " + txt); }
            js = await res.json();
          }
          r = berechne(ind, js); break;
        } catch (e) { letzterFehler = e; if (kandidaten.length > 1) console.error(`   (${k.dataset} mit ${k.filter} hat nicht funktioniert: ${e.message})`); }
      }
      if (!r) { await diagnose(ind); throw letzterFehler; }
      result.push(r);
      console.log(`OK  ${ind.name}: ${r.periode}, Österreich Platz ${r.oesterreich.rang}/${r.anzahlLaender}, ${r.oesterreich.richtung}, ${r.oesterreich.urteil}${r.warnung ? "  WARNUNG: " + r.warnung : ""}`);
    } catch (e) {
      fehler++; console.error(`FEHLER ${ind.name}: ${e.message}`);
      // Letzte gute Daten behalten und als veraltet markieren
      result.push(prev[ind.id] ? { ...prev[ind.id], veraltet: true, fehler: e.message } : { id: ind.id, name: ind.name, fehler: e.message });
    }
  }
  try {
    const r = berechneRating(); result.push(r);
    console.log(`OK  Kreditrating: Österreich Platz ${r.oesterreich.rang}/${r.anzahlLaender}, Ø ${r.oesterreich.schnittText} (${r.oesterreich.schnitt})${r.warnung ? "  HINWEIS: " + r.warnung : ""}`);
  } catch (e) {
    fehler++; console.error(`FEHLER Kreditrating: ${e.message}`);
    result.push(prev.rating ? { ...prev.rating, veraltet: true, fehler: e.message } : { id: "rating", name: "Kreditrating", fehler: e.message });
  }
  try {
    const r = berechneInsolvenzen(); result.push(r);
    console.log(`OK  Insolvenzen: ${r.periode}, ${r.oesterreich.wert} (${r.oesterreich.veraenderungProzent} % zum Vorjahr), ${r.oesterreich.urteil}${r.warnung ? "  HINWEIS: " + r.warnung : ""}`);
  } catch (e) {
    fehler++; console.error(`FEHLER Insolvenzen: ${e.message}`);
    result.push(prev.insolvenzen ? { ...prev.insolvenzen, veraltet: true, fehler: e.message } : { id: "insolvenzen", name: "Insolvenzen", fehler: e.message });
  }
  const out = { beispiel: TEST, aktualisiert: new Date().toISOString().slice(0, 10), quelle: "Eurostat", regierung: REGIERUNG, indikatoren: result };
  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync("docs/daten.json", JSON.stringify(out, null, 1));
  fs.writeFileSync("docs/daten.js", "window.DATEN = " + JSON.stringify(out) + ";\n");
  if (fehler === INDICATORS.length + 2) process.exit(1);
})();
