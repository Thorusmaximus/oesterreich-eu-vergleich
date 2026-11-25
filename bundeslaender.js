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
  AT11: { chef: "Hans Peter Doskozil", partei: "SPÖ", koalition: ["SPÖ", "Grüne"], wahl: 2025, naechsteWahl: 2030, seit: "Februar 2025", vorher: { koalition: ["SPÖ"], zeit: "2020–2025", hinweis: "SPÖ allein" } },
  AT12: { chef: "Johanna Mikl-Leitner", partei: "ÖVP", koalition: ["ÖVP", "FPÖ"], wahl: 2023, naechsteWahl: 2028, seit: "März 2023", vorher: { koalition: ["ÖVP"], zeit: "2018–2023", hinweis: "ÖVP, Proporzregierung mit SPÖ und FPÖ" } },
  AT13: { chef: "Michael Ludwig", partei: "SPÖ", koalition: ["SPÖ", "NEOS"], wahl: 2025, naechsteWahl: 2030, seit: "Juni 2025", vorher: { koalition: ["SPÖ","NEOS"], zeit: "2020–2025" } },
  AT21: { chef: "Daniel Fellner", partei: "SPÖ", koalition: ["SPÖ", "ÖVP"], wahl: 2023, naechsteWahl: 2028, seit: "April 2026 (Landeshauptmann; Koalition seit 2023)", vorher: { koalition: ["SPÖ","ÖVP"], zeit: "2018–2023" } },
  AT22: { chef: "Mario Kunasek", partei: "FPÖ", koalition: ["FPÖ", "ÖVP"], wahl: 2024, naechsteWahl: 2029, seit: "Dezember 2024", vorher: { koalition: ["ÖVP","SPÖ"], zeit: "2019–2024" } },
  AT31: { chef: "Thomas Stelzer", partei: "ÖVP", koalition: ["ÖVP", "FPÖ"], wahl: 2021, naechsteWahl: 2027, seit: "Oktober 2021", vorher: { koalition: ["ÖVP","FPÖ"], zeit: "2015–2021" } },
  AT32: { chef: "Karoline Edtstadler", partei: "ÖVP", koalition: ["ÖVP", "FPÖ"], wahl: 2023, naechsteWahl: 2028, seit: "Juli 2025 (Landeshauptfrau; Koalition seit 2023)", vorher: { koalition: ["ÖVP","Grüne","NEOS"], zeit: "2018–2023" } },
  AT33: { chef: "Anton Mattle", partei: "ÖVP", koalition: ["ÖVP", "SPÖ"], wahl: 2022, naechsteWahl: 2027, seit: "November 2022", vorher: { koalition: ["ÖVP","Grüne"], zeit: "2018–2022" } },
  AT34: { chef: "Markus Wallner", partei: "ÖVP", koalition: ["ÖVP", "FPÖ"], wahl: 2024, naechsteWahl: 2029, seit: "Dezember 2024", vorher: { koalition: ["ÖVP","Grüne"], zeit: "2019–2024" } }
};
const GRUPPEN = ["Wirtschaft und Arbeit", "Wohnen und Kosten", "Bevölkerung und Gesellschaft", "Bildung und Forschung", "Gesundheit", "Sicherheit"];
const MIN_JAHR = 2024; // ältere Werte werden ausgeblendet (wie auf der Österreich-Seite)
// Vergleichsstädte (NUTS 3), nicht im Ranking, nur darunter aufgelistet
const STAEDTE = [
  { code: "AT221", name: "Graz", hinweis: "zweitgrößte Stadt" },
  { code: "AT323", name: "Salzburg und Umgebung", hinweis: "Zentralösterreich, Stadt und Umland (kleinste Eurostat-Einheit)" },
  { code: "AT332", name: "Innsbruck", hinweis: "Westösterreich" }
];
const STADT_DATEN = {
  bip: [{ dataset: "nama_10r_3gdp", filter: "unit=EUR_HAB" }],
  bevoelkerung: [{ dataset: "demo_r_pjanaggr3", filter: "sex=T&age=TOTAL&unit=NR" }, { dataset: "demo_r_pjanaggr3", filter: "sex=T&age=TOTAL" }],
  bevoelkerungsdichte: [{ dataset: "demo_r_d3dens", filter: "unit=PER_KM2" }]
};
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
  { id: "armut", name: "Armut oder soziale Ausgrenzung", gruppe: 2, dataset: "ilc_peps11n", filter: "unit=PC", alternativen: [{ dataset: "ilc_peps11n", filter: "unit=PC&age=TOTAL" }], dez: 1, suffix: " %", typ: "niedrig", diffEinheit: "Prozentpunkte",
    einheit: "Anteil der Menschen, die armutsgefährdet, erheblich materiell benachteiligt oder in einem Haushalt mit sehr geringer Erwerbstätigkeit sind", rangText: "Rang 1 = geringster Anteil",
    erklaerung: "Der Anteil der Bevölkerung, der von Armut oder sozialer Ausgrenzung bedroht ist (AROPE-Indikator). Er stammt aus einer Haushaltsbefragung, die Werte pro Bundesland sind daher ungenau.", mock: { base: 17, step: 1.2 } },
  { id: "lebenserwartung", name: "Lebenserwartung bei Geburt", gruppe: 4, dataset: "demo_r_mlifexp", filter: "sex=T&age=Y_LT1&unit=YR", alternativen: [{ dataset: "demo_r_mlifexp", filter: "sex=T&age=Y_LT1" }], dez: 1, suffix: " Jahre", typ: "hoch", diffEinheit: "Jahre",
    einheit: "Durchschnittliche Lebenserwartung bei der Geburt in Jahren", rangText: "Rang 1 = höchste Lebenserwartung",
    erklaerung: "Wie alt ein neugeborenes Kind im Schnitt würde, wenn die heutigen Sterberaten dauerhaft gelten.", mock: { base: 80.5, step: 0.4 } },
  { id: "lebenserwartung65", name: "Lebenserwartung mit 65", gruppe: 4, dataset: "demo_r_mlifexp", filter: "sex=T&age=Y65&unit=YR", alternativen: [{ dataset: "demo_r_mlifexp", filter: "sex=T&age=Y65" }], dez: 1, suffix: " Jahre", typ: "hoch", diffEinheit: "Jahre",
    einheit: "Weitere durchschnittliche Lebenserwartung eines 65-Jährigen in Jahren", rangText: "Rang 1 = höchste Lebenserwartung mit 65",
    erklaerung: "Wie viele Jahre ein 65-jähriger Mensch im Schnitt noch leben würde, wenn die heutigen Sterberaten gelten. Sie zeigt, wie es um die Gesundheit im Alter steht, und ist weniger von früher Sterblichkeit abhängig.", mock: { base: 20, step: 0.3 } },
  { id: "bevoelkerung", name: "Bevölkerungswachstum", gruppe: 2, dataset: "demo_r_d2jan", filter: "sex=T&age=TOTAL", dez: 1, suffix: " %", typ: "neutral", diffEinheit: "Prozent", relativ: true, wachstumProzent: true,
    einheit: "Veränderung der Einwohnerzahl in den letzten fünf Jahren in %, darunter die Einwohner am 1. Jänner", rangText: "Rang 1 = stärkstes Wachstum",
    erklaerung: "Um wie viel Prozent die Einwohnerzahl in fünf Jahren gewachsen oder gesunken ist. Darunter steht die aktuelle Einwohnerzahl. Ohne Wertung.", mock: { base: 300000, step: 150000 } },
  { id: "bevoelkerungsdichte", name: "Bevölkerungsdichte", gruppe: 2, dataset: "demo_r_d3dens", filter: "unit=PER_KM2", dez: 0, suffix: "", typ: "neutral", diffEinheit: "Einwohner pro km²",
    einheit: "Einwohner pro Quadratkilometer", rangText: "Rang 1 = am dichtesten besiedelt",
    erklaerung: "Wie dicht ein Bundesland besiedelt ist. Wien ist als Großstadt weit vorne, die Alpenländer liegen niedrig, weil viel Fläche unbewohnbar ist.", mock: { base: 70, step: 30 } },
  { id: "geburtenrate", name: "Geburtenrate", gruppe: 2, dataset: "demo_r_find2", filter: "indic_de=TOTFERRT&unit=NR", alternativen: [{ dataset: "demo_r_find2", filter: "indic_de=TOTFERRT&unit=YR" }], dez: 2, suffix: "", typ: "neutral", diffEinheit: "Kinder pro Frau",
    einheit: "Durchschnittliche Kinderzahl pro Frau (Gesamtfertilitätsrate)", rangText: "Rang 1 = höchste Geburtenrate",
    erklaerung: "Wie viele Kinder eine Frau im Schnitt bekommen würde, wenn die heutigen Geburtenraten ihr Leben lang gelten. Etwa 2,1 wären nötig, um die Bevölkerung ohne Zuwanderung stabil zu halten.", mock: { base: 1.4, step: 0.03 } },
  { id: "tertiaer", name: "Hochschulabschluss", gruppe: 3, dataset: "edat_lfse_04", filter: "sex=T&age=Y25-64&isced11=ED5-8&unit=PC",
    alternativen: [{ dataset: "edat_lfse_04", filter: "sex=T&age=Y25-64&isced11=ED5-8" }, { dataset: "edat_lfse_04", filter: "sex=T&age=Y25-64&isced11=ED58&unit=PC" }], dez: 1, suffix: " %", typ: "neutral", diffEinheit: "Prozentpunkte",
    einheit: "Anteil der 25- bis 64-Jährigen mit Hochschul- oder höherem Abschluss (inklusive Kollegs und Meisterprüfungen laut Eurostat-Einstufung)", rangText: "Rang 1 = höchster Anteil",
    erklaerung: "Wie viele Erwachsene einen Abschluss auf Hochschulniveau haben. In Städten ist der Anteil höher, weil Studierte dorthin ziehen. Ob ein hoher Anteil besser ist, ist umstritten, etwa weil Lehre und Meisterprüfungen nicht mitzählen. Deshalb ohne Wertung.", mock: { base: 30, step: 2 } },
  { id: "schulabbruch", name: "Frühe Schulabgänger", gruppe: 3, dataset: "edat_lfse_16", filter: "sex=T&unit=PC", alternativen: [{ dataset: "edat_lfse_16", filter: "sex=T" }], dez: 1, suffix: " %", typ: "niedrig", diffEinheit: "Prozentpunkte", minLaender: 6,
    einheit: "Anteil der 18- bis 24-Jährigen ohne weiterführende Ausbildung, die nicht in Bildung oder Weiterbildung sind", rangText: "Rang 1 = geringster Anteil",
    erklaerung: "Wie viele junge Menschen nach der Pflichtschule keine Ausbildung mehr machen. Die Stichprobe ist klein, die Werte schwanken deshalb von Jahr zu Jahr.", mock: { base: 7, step: 0.6 } },
  { id: "forschung", name: "Forschungsausgaben", gruppe: 3, dataset: "rd_e_gerdreg", filter: "sectperf=TOTAL&unit=PC_GDP", alternativen: [{ dataset: "rd_e_gerdreg", filter: "sectperf=TOTAL&unit=PC_GDP&unit=PC_GDP" }], dez: 2, suffix: " %", typ: "hoch", diffEinheit: "Prozentpunkte", takt: "zwei",
    einheit: "Ausgaben für Forschung und Entwicklung in % der Wirtschaftsleistung des Bundeslandes", rangText: "Rang 1 = höchste Forschungsausgaben",
    erklaerung: "Wie viel öffentliche Stellen und Unternehmen im Land für Forschung ausgeben, gemessen an seiner Wirtschaftsleistung. Die Erhebung findet nur alle zwei Jahre statt.", mock: { base: 2.5, step: 0.3 } },
  { id: "verkehrstote", name: "Verkehrstote", gruppe: 5, dataset: "tran_r_acci", filter: "unit=P_MHAB&victim=KIL", dez: 0, suffix: "", typ: "niedrig", diffEinheit: "pro Million Einwohner",
    einheit: "Verkehrstote pro Million Einwohner und Jahr", rangText: "Rang 1 = wenigste Verkehrstote pro Einwohner",
    erklaerung: "Wie viele Menschen bei Verkehrsunfällen sterben, bezogen auf die Einwohnerzahl. Die Zahlen sind klein und schwanken von Jahr zu Jahr stark.", mock: { base: 40, step: 6 } },
  { id: "nettozuwanderung", name: "Nettozuwanderung", gruppe: 2, dataset: "demo_r_gind3", filter: "indic_de=CNMIGRATRT", alternativen: [{ dataset: "demo_r_gind3", filter: "indic_de=CNMIGRATRT&unit=RT" }, { dataset: "demo_r_gind3", filter: "indic_de=CNMIGRATRT&unit=PER_THOUS" }], dez: 1, suffix: "", typ: "neutral", diffEinheit: "pro 1.000 Einwohner", rangAufsteigend: true,
    einheit: "Zuzüge minus Wegzüge (inklusive Zuwanderung aus dem Ausland und aus anderen Bundesländern) pro 1.000 Einwohner und Jahr", rangText: "Rang 1 = niedrigste Nettozuwanderung",
    erklaerung: "Wie viele Menschen mehr zu- als wegziehen, pro 1.000 Einwohner. Zählt Zuzug aus dem Ausland und aus anderen Bundesländern. Ein negativer Wert heißt mehr Wegzug als Zuzug. Ohne Wertung.", mock: { base: 5, step: 2 } },
  { id: "saeuglingssterblichkeit", name: "Säuglingssterblichkeit", gruppe: 4, dataset: "demo_r_minfind", filter: "unit=RT", dez: 1, suffix: "", typ: "niedrig", diffEinheit: "pro 1.000 Lebendgeburten", minLaender: 8,
    einheit: "Im ersten Lebensjahr gestorbene Kinder pro 1.000 Lebendgeburten", rangText: "Rang 1 = niedrigste Säuglingssterblichkeit",
    erklaerung: "Wie viele von 1.000 lebend geborenen Kindern das erste Lebensjahr nicht überleben. Die Zahlen sind klein und schwanken von Jahr zu Jahr stark, in kleinen Bundesländern besonders. Gewertet wird: niedriger ist besser.", mock: { base: 3, step: 0.3 } },
  { id: "krankenhausbetten", name: "Krankenhausbetten", gruppe: 4, dataset: "hlth_rs_bdsrg2", filter: "unit=P_HTHAB", dez: 0, suffix: "", typ: "neutral", diffEinheit: "pro 100.000 Einwohner",
    einheit: "Krankenhausbetten pro 100.000 Einwohner", rangText: "Rang 1 = meiste Betten pro Einwohner",
    erklaerung: "Wie viele Krankenhausbetten auf 100.000 Einwohner kommen. Ohne Wertung: Viele Betten können gute Versorgung heißen, aber auch viele stationäre Aufnahmen statt ambulanter Behandlung.", mock: { base: 560, step: 20 } }
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
  for (let k = ind.trendMax || JAHRE_TREND; k >= (ind.trendMin || 3) && !vor; k--) { const y = String(ly - k); if (LAENDER.filter(l => daten[l.code]?.[y] != null).length >= minL) vor = y; }
  const wert = (code, y) => { const v = daten[code]?.[y]; return v == null ? null : v; };
  const at = daten.AT ? wert("AT", letzt) : null, atVor = vor && daten.AT ? wert("AT", vor) : null;
  const ref = at != null ? Math.abs(at) : Math.abs(LAENDER.reduce((s, l) => s + (wert(l.code, letzt) || 0), 0) / LAENDER.length);
  const schwelle = Number(Math.max(Math.pow(10, -dez), SCHWELLE_ANTEIL * ref).toPrecision(2));
  const rangieren = (y) => {
    const liste = LAENDER.map(l => ({ c: l.code, v: wert(l.code, y) })).filter(x => x.v != null);
    const auf = typ === "niedrig" || ind.rangAufsteigend;
    const r = {}; liste.forEach(x => { r[x.c] = 1 + liste.filter(z => (auf ? z.v < x.v : z.v > x.v)).length; }); return r;
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
  if (ind.wachstumProzent) { // Anzeige: Wachstum in %, darunter die Einwohnerzahl
    laender.forEach(x => { x.zus = x.wert.toLocaleString("de-AT") + " Einwohner"; x.wert = x.prozent; x.wertVor = null; x.diff = null; x.richtung = null; x.urteil = null; });
    const ok = laender.filter(x => x.wert != null); laender.length = 0; ok.forEach(x => laender.push(x));
    laender.forEach(x => { x.rang = 1 + laender.filter(z => z.wert > x.wert).length; x.rangVor = null; });
  } else if (ind.zus) laender.forEach(x => { x.zus = ind.zus(x.code, letzt); });
  const auf = typ === "niedrig" || ind.rangAufsteigend;
  laender.sort((a, b) => (auf ? a.wert - b.wert : b.wert - a.wert));
  // Zeitreihe für die Detailansicht (nur wenn mehrere Jahre vorliegen)
  const ry = jahre.filter(y => +y <= ly && +y >= ly - 10 && LAENDER.filter(l => daten[l.code]?.[y] != null).length >= minL);
  const reihe = ry.length >= 3 ? { jahre: ry, einheitText: ind.wachstumProzent ? "Einwohner" : null, laender: Object.fromEntries(LAENDER.map(l => [l.code, ry.map(y => daten[l.code]?.[y] ?? null)])) } : null;
  return { id: ind.id, name: ind.name, gruppe: GRUPPEN[ind.gruppe], typ, dez, suffix: ind.suffix, diffEinheit: ind.diffEinheit, einheit: ind.einheit, rangText: ind.rangText,
    erklaerung: ind.erklaerung, relativ: !!ind.relativ && !ind.wachstumProzent, ohneTrend: false, trendInfo: ind.wachstumProzent ? "Die Zahl selbst ist die Veränderung über fünf Jahre (" + vor + " bis " + letzt + "), deshalb gibt es keinen Pfeil." : null, periode: letzt, vorPeriode: vor, schwelle: ind.relativ ? 3 : schwelle, schwelleArt: ind.relativ ? "Prozent" : "absolut", dataset: ind.dataset,
    oesterreich: at != null ? { wert: at, wertVor: atVor } : null, anzahl: laender.length, laender, reihe };
}


// Schulden pro Einwohner: von Hand gepflegt (schulden-laender.json), Einwohner von Eurostat; nur ein Jahr, ohne Trend
async function schuldenProKopf({ TEST, BASE, parse }) {
  const fs = require("fs"), raw = JSON.parse(fs.readFileSync(__dirname + "/schulden-laender.json", "utf8"));
  let pop;
  if (TEST) pop = Object.fromEntries(LAENDER.map((l, i) => [l.code, 300000 + i * 150000]));
  else {
    const res = await fetch(`${BASE}demo_r_d2jan?format=JSON&lang=EN&sex=T&age=TOTAL&time=${raw.jahr}&${LAENDER.map(l => "geo=" + l.code).join("&")}`);
    if (!res.ok) throw new Error("Einwohner: HTTP " + res.status);
    const d = parse(await res.json()); pop = Object.fromEntries(LAENDER.map(l => [l.code, d[l.code]?.[raw.jahr]]));
  }
  let laender = LAENDER.filter(l => raw.mio[l.code] != null && pop[l.code]).map(l => ({ code: l.code, name: l.name, kurz: l.kurz, wert: Math.round(raw.mio[l.code] * 1e6 / pop[l.code]), wertVor: null, diff: null, richtung: null, urteil: null, prozent: null }));
  if (laender.length < 8) throw new Error("Zu wenige Länder");
  laender.sort((a, b) => a.wert - b.wert); laender.forEach(x => { x.rang = 1 + laender.filter(z => z.wert < x.wert).length; x.rangVor = null; });
  return { id: "schulden", name: "Schulden pro Einwohner", gruppe: GRUPPEN[1], typ: "niedrig", dez: 0, suffix: " €", diffEinheit: "Euro", einheit: "Schulden des Landes in Euro pro Einwohner (ohne Gemeinden)",
    rangText: "Rang 1 = niedrigste Schulden pro Einwohner", erklaerung: raw.hinweis + " Gewertet wird: niedriger ist besser, aber nur im Rang, es gibt keinen Trend. Quelle: " + raw.quelle + ".", relativ: false, periode: raw.jahr, vorPeriode: null, schwelle: 0, schwelleArt: "absolut", dataset: "Statistik Austria",
    oesterreich: null, anzahl: laender.length, laender, ohneTrend: true, quelleUrl: raw.url };
}

// Von Hand gepflegte Landesdaten (handdaten-bl.json): Kaufpreise, Insolvenzen, Kriminalität. Eine Jahresveränderung, Einwohner von Eurostat.
async function einwohner({ TEST, BASE, parse }, jahre) {
  const out = {};
  if (TEST) { jahre.forEach(y => { out[y] = Object.fromEntries(LAENDER.map((l, i) => [l.code, 300000 + i * 150000])); }); return out; }
  const res = await fetch(`${BASE}demo_r_d2jan?format=JSON&lang=EN&sex=T&age=TOTAL&${jahre.map(y => "time=" + y).join("&")}&${LAENDER.map(l => "geo=" + l.code).join("&")}`);
  if (!res.ok) throw new Error("Einwohner: HTTP " + res.status);
  const d = parse(await res.json()); jahre.forEach(y => { out[y] = Object.fromEntries(LAENDER.map(l => [l.code, d[l.code]?.[y]])); }); return out;
}
function handDaten(werte, jahr, vorjahr, f) { // werte: {code: [aktuell, vorjahr]} -> Eurostat-Form {code: {jahr: wert}}
  const d = {}; LAENDER.forEach(l => { const w = werte[l.code]; if (w) d[l.code] = { [jahr]: f(l.code, jahr, w[0]), [vorjahr]: f(l.code, vorjahr, w[1]) }; }); return d;
}
async function handIndikatoren(ctx) {
  const fs = require("fs"), raw = JSON.parse(fs.readFileSync(__dirname + "/handdaten-bl.json", "utf8")), out = [];
  const pop = await einwohner(ctx, ["2024", "2025"]), pro100k = (code, y, n) => n / pop[y][code] * 1e5;
  const num = x => Math.round(x).toLocaleString("de-AT");
  const mk = (ind, werte, q, f, zus) => { const i = { ...ind, gruppe: ind.gruppe, trendMax: 1, trendMin: 1, minLaender: 9, zus };
    const r = auswerten(i, handDaten(werte, q.jahr, q.vorjahr, f)); r.dataset = "Handdaten"; r.quelle = q.quelle; r.quelleUrl = q.url; r.vorPeriode = q.vorjahr; r.schwelleArt = "relativ"; return r; };
  const k = raw.kaufpreise, ins = raw.insolvenzen, kr = raw.kriminalitaet, id = (c, y, n) => n;
  const avg = {}; LAENDER.forEach(l => { const w = k.wohnungen[l.code], h = k.haeuser[l.code]; if (w && h) avg[l.code] = [(w[0] + h[0]) / 2, (w[1] + h[1]) / 2]; });
  out.push(mk({ id: "kaufpreise", name: "Kaufpreise Immobilien", gruppe: 1, dez: 0, suffix: " €/m²", typ: "niedrig", diffEinheit: "Euro pro m²", einheit: "Mittel aus dem Medianpreis für Wohnungen und für Häuser, in Euro pro Quadratmeter Wohnfläche (Kaufverträge)", rangText: "Rang 1 = niedrigster Preis",
    erklaerung: "Der Durchschnitt aus dem mittleren Kaufpreis pro Quadratmeter bei Wohnungen und bei Häusern (ohne Grundstück), aus allen Kaufverträgen im Grundbuch. Beide Werte einzeln siehst du über die Auswahl oben. Gewertet wird: niedrigere Preise gelten als besser, aus Sicht von Menschen, die kaufen wollen. Für Eigentümer ist es umgekehrt, die Wertung ist also umstritten. Pfeil = Veränderung zum Vorjahr, Vorjahreswerte werden von Statistik Austria revidiert." }, avg, k, id));
  out.push(mk({ id: "kaufpreisWohnungen", name: "Kaufpreise Wohnungen", gruppe: 1, dez: 0, suffix: " €/m²", typ: "neutral", diffEinheit: "Euro pro m²", einheit: "Medianpreis für Wohnungen in Euro pro Quadratmeter Wohnfläche (Kaufverträge)", rangText: "Rang 1 = höchster Preis",
    erklaerung: "Der mittlere Kaufpreis pro Quadratmeter bei Wohnungen. Hier ohne Wertung, damit die Preise in der Gesamtbilanz nicht doppelt zählen: Gewertet wird der Durchschnitt aus Wohnungen und Häusern. Pfeil = Veränderung zum Vorjahr." }, k.wohnungen, k, id));
  out.push(mk({ id: "kaufpreisHaeuser", name: "Kaufpreise Häuser", gruppe: 1, dez: 0, suffix: " €/m²", typ: "neutral", diffEinheit: "Euro pro m²", einheit: "Medianpreis für Wohnhäuser in Euro pro Quadratmeter Wohnfläche (Kaufverträge)", rangText: "Rang 1 = höchster Preis",
    erklaerung: "Der mittlere Kaufpreis pro Quadratmeter bei Wohnhäusern, ohne Grundstücksfläche. Hier ohne Wertung, damit die Preise in der Gesamtbilanz nicht doppelt zählen: Gewertet wird der Durchschnitt aus Wohnungen und Häusern. Pfeil = Veränderung zum Vorjahr." }, k.haeuser, k, id));
  out.push(mk({ id: "insolvenzen", name: "Insolvenzen", gruppe: 0, dez: 0, suffix: "", typ: "niedrig", diffEinheit: "pro 100.000 Einwohner", einheit: "Unternehmensinsolvenzen pro 100.000 Einwohner und Jahr, darunter die Gesamtzahl", rangText: "Rang 1 = wenigste Insolvenzen pro Einwohner",
    erklaerung: "Wie viele Unternehmen pro 100.000 Einwohner insolvent wurden (eröffnete Verfahren und mangels Vermögen nicht eröffnete). Darunter steht die Gesamtzahl. Gewertet wird: weniger ist besser. Pfeil = Veränderung zum Vorjahr." }, ins.werte, ins, pro100k,
    (code, y) => num(ins.werte[code][y === ins.jahr ? 0 : 1]) + " Insolvenzen"));
  out.push(mk({ id: "straftaten", name: "Straftaten", gruppe: 5, dez: 0, suffix: "", typ: "niedrig", diffEinheit: "pro 100.000 Einwohner", einheit: "Von der Polizei angezeigte Straftaten pro 100.000 Einwohner und Jahr, darunter die Gesamtzahl", rangText: "Rang 1 = wenigste Anzeigen pro Einwohner",
    erklaerung: "Wie viele Straftaten pro 100.000 Einwohner angezeigt wurden, alle Delikte zusammen. Darunter steht die Gesamtzahl. Gewertet wird: weniger ist besser. Pfeil = Veränderung zum Vorjahr." }, kr.anzeigen, kr, pro100k,
    (code, y) => num(kr.anzeigen[code][y === kr.jahr ? 0 : 1]) + " Anzeigen"));
  out.push(mk({ id: "aufklaerung", name: "Aufklärungsquote", gruppe: 5, dez: 1, suffix: " %", typ: "hoch", diffEinheit: "Prozentpunkte", einheit: "Anteil der angezeigten Straftaten, die die Polizei aufgeklärt hat", rangText: "Rang 1 = höchste Aufklärungsquote",
    erklaerung: "Wie viele der angezeigten Straftaten aufgeklärt wurden. Gewertet wird: höher ist besser. Pfeil = Veränderung zum Vorjahr." }, kr.aufklaerung, kr, id));
  out.push(mk({ id: "arbeitslosigkeitAms", name: "Arbeitslosenquote (AMS)", gruppe: 0, dez: 1, suffix: " %", typ: "niedrig", diffEinheit: "Prozentpunkte", einheit: "Arbeitslose in % der unselbständigen Erwerbspersonen, Jahresdurchschnitt, nationale Definition des AMS", rangText: "Rang 1 = niedrigste Arbeitslosigkeit",
    erklaerung: "Die Arbeitslosenquote, wie sie das AMS meldet und wie sie in den Nachrichten genannt wird. Sie ist höher als die internationale Quote von Eurostat, weil sie anders gezählt wird: Es zählen nur beim AMS vorgemerkte Arbeitslose im Verhältnis zu den unselbständig Beschäftigten plus Arbeitslosen. Gewertet wird: weniger ist besser. Pfeil = Veränderung zum Vorjahr." }, raw.ams.werte, raw.ams, id));
  const sp = raw.spital;
  out.push(mk({ id: "spitalsaufenthalte", name: "Spitalsaufenthalte", gruppe: 4, dez: 0, suffix: "", typ: "neutral", diffEinheit: "pro 1.000 Einwohner", einheit: "Stationäre Spitalsaufenthalte pro 1.000 Einwohner und Jahr, darunter die Gesamtzahl", rangText: "Rang 1 = meiste Aufenthalte pro Einwohner",
    erklaerung: "Wie viele stationäre Aufenthalte in Spitälern es pro 1.000 Einwohner gab (Aufnahmen, Entlassungen und Verstorbene gemittelt, alle Krankenanstalten). Darunter steht die Gesamtzahl. Ohne Wertung: Mehr Aufenthalte können für einen schlechteren Gesundheitszustand stehen, aber auch für ein dichteres Angebot oder mehr Patienten aus anderen Bundesländern, denn gezählt wird nach dem Standort des Spitals, nicht nach dem Wohnort. Pfeil = Veränderung zum Vorjahr." }, sp.werte, sp, (c, y, n) => n / pop[y][c] * 1e3,
    (code, y) => num(sp.werte[code][y === sp.jahr ? 0 : 1]) + " Aufenthalte"));
  return out;
}

async function staedteDazu(r, { TEST, BASE, parse }) {
  const kand = STADT_DATEN[r.id]; if (!kand) return;
  let d = null, fehler = null;
  for (const k of kand) {
    try {
      if (TEST) { d = Object.fromEntries(STAEDTE.map((c, i) => [c.code, { [r.periode]: (r.id === "bevoelkerung" ? 200000 : 30000) + i * 40000, [r.vorPeriode]: (r.id === "bevoelkerung" ? 190000 : 28000) + i * 40000 }])); break; }
      const res = await fetch(`${BASE}${k.dataset}?format=JSON&lang=EN&${k.filter}&${STAEDTE.map(c => "geo=" + c.code).join("&")}&sinceTimePeriod=${SEIT}`);
      if (!res.ok) throw new Error("HTTP " + res.status + " " + (await res.text()).slice(0, 200));
      d = parse(await res.json()); break;
    } catch (e) { fehler = e; }
  }
  if (!d) { console.error(`   (Städte ${r.name}: ${fehler && fehler.message})`); return; }
  const auf = r.typ === "niedrig", dez = r.dez, out = [];
  // Städte-Daten liegen teils später vor als die Länder-Daten: dann das jüngste Jahr nehmen, für das alle Städte Werte haben
  let per = r.periode, vorP = r.vorPeriode;
  if (!STAEDTE.every(c => d[c.code]?.[per] != null)) {
    const jahre = [...new Set(STAEDTE.flatMap(c => Object.keys(d[c.code] || {})))].sort().filter(y => STAEDTE.every(c => d[c.code]?.[y] != null));
    per = jahre.pop(); vorP = null;
    for (let k = 5; k >= 3 && !vorP; k--) if (STAEDTE.every(c => d[c.code]?.[String(+per - k)] != null)) vorP = String(+per - k);
    if (!per) return;
  }
  for (const c of STAEDTE) {
    const w0 = d[c.code]?.[per], wv = vorP ? d[c.code]?.[vorP] : null;
    if (w0 == null) continue;
    let wert = w0, zus = null, diff = null, richtung = null, urteil = null;
    if (r.id === "bevoelkerung") { if (wv == null) continue; wert = runden((w0 - wv) / Math.abs(wv) * 100, 1); zus = w0.toLocaleString("de-AT") + " Einwohner"; }
    else if (wv != null) {
      diff = runden(w0 - wv, dez + 2);
      richtung = r.relativ ? ((w0 - wv) / wv * 100 > 3 ? "steigend" : (w0 - wv) / wv * 100 < -3 ? "sinkend" : "stabil") : (diff > r.schwelle ? "steigend" : diff < -r.schwelle ? "sinkend" : "stabil");
      if (r.typ !== "neutral") urteil = richtung === "stabil" ? "unverändert" : ((richtung === "steigend") === (r.typ === "hoch") ? "besser" : "schlechter");
    }
    const rang = 1 + r.laender.filter(l => (auf ? l.wert < wert : l.wert > wert)).length;
    out.push({ code: c.code, name: c.name, hinweis: c.hinweis, wert, wertVor: wv ?? null, diff, richtung, urteil, rangEinordnung: rang, zus, periode: per });
  }
  if (out.length) r.staedte = out;
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
    if (r) { ergebnis.push(r); console.log(`OK  Bundesland ${r.name}: ${r.periode}, ${r.anzahl} Länder, Platz 1 ${r.laender[0].name}`);
      try { await staedteDazu(r, { TEST, BASE, parse }); if (r.staedte) console.log(`   Städte: ${r.staedte.map(x => x.name + " " + x.wert).join(", ")}`); } catch (e) { console.error("   Städte-Fehler: " + e.message); } }
    else {
      console.error(`FEHLER Bundesland ${ind.name}: ${fehler && fehler.message}`);
      if (!TEST) try { // Fehlersuche: welche Dimensionen hat der Datensatz?
        const res = await fetch(`${BASE}${ind.dataset}?format=JSON&lang=EN&geo=AT11&sinceTimePeriod=2022`), js = await res.json();
        js.id.forEach(d => { const cat = js.dimension[d].category, lb = cat.label || {}; console.error(`   ${d}: ` + Object.keys(cat.index).slice(0, 40).map(c => c + (lb[c] ? " (" + lb[c].slice(0, 30) + ")" : "")).join("; ")); });
      } catch (e) { console.error("   Fehlersuche nicht möglich: " + e.message); }
    }
  }
  try { for (const r of await handIndikatoren({ TEST, BASE, parse })) { ergebnis.push(r); console.log(`OK  Bundesland ${r.name}: ${r.periode}, ${r.anzahl} Länder, Platz 1 ${r.laender[0].name}`); } }
  catch (e) { console.error("FEHLER Bundesland Handdaten: " + e.message); }
  try { const r = await schuldenProKopf({ TEST, BASE, parse }); ergebnis.push(r); console.log(`OK  Bundesland ${r.name}: ${r.periode}, ${r.anzahl} Länder, Platz 1 ${r.laender[0].name}`); }
  catch (e) { console.error("FEHLER Bundesland Schulden: " + e.message); }
  ergebnis.forEach(i => { i.ausgeblendet = +String(i.periode).slice(0, 4) < MIN_JAHR; if (i.ausgeblendet) console.log(`   AUSGEBLENDET Bundesland: ${i.name} (jüngste Daten: ${i.periode})`); });
  // Gesamtbild: durchschnittlicher Rang über alle gewerteten Indikatoren, und wie viele Indikatoren sich verbessert/verschlechtert haben
  const bilanz = LAENDER.map(l => {
    const mit = ergebnis.filter(i => i.typ !== "neutral" && !i.ausgeblendet).map(i => ({ i, x: i.laender.find(z => z.code === l.code) })).filter(a => a.x && a.x.rang != null);
    const n = mit.length, summe = mit.reduce((s, a) => s + a.x.rang, 0);
    const z = u => mit.filter(a => a.x.urteil === u).length;
    return { code: l.code, name: l.name, kurz: l.kurz, n, durchschnittsrang: n ? runden(summe / n, 2) : null, besser: z("besser"), schlechter: z("schlechter"), unveraendert: z("unverändert"),
      erste: mit.filter(a => a.x.rang === 1).length, letzte: mit.filter(a => a.x.rang === a.i.anzahl).length };
  }).sort((a, b) => (a.durchschnittsrang ?? 99) - (b.durchschnittsrang ?? 99));
  const staedteBilanz = STAEDTE.map(c => {
    const mit = ergebnis.filter(i => i.typ !== "neutral" && !i.ausgeblendet && i.staedte).map(i => i.staedte.find(z => z.code === c.code)).filter(Boolean);
    const z = u => mit.filter(a => a.urteil === u).length;
    return { code: c.code, name: c.name, hinweis: c.hinweis, n: mit.length, durchschnittsrang: mit.length ? runden(mit.reduce((t, a) => t + a.rangEinordnung, 0) / mit.length, 2) : null, besser: z("besser"), schlechter: z("schlechter") };
  });
  bilanz.forEach((b, i) => { b.platz = 1 + bilanz.filter(z => z.durchschnittsrang < b.durchschnittsrang).length; });
  return { aktualisiert: new Date().toISOString().slice(0, 10), beispiel: TEST, quelle: "Eurostat (Regionaldaten, NUTS 2)", jahreTrend: JAHRE_TREND, gruppen: GRUPPEN,
    laender: LAENDER.map(l => ({ ...l, regierung: REGIERUNGEN[l.code] })), staedte: STAEDTE, regierungenStand: REGIERUNGEN_STAND, indikatoren: ergebnis, bilanz, staedteBilanz };
}
module.exports = { berechneBundeslaender };
