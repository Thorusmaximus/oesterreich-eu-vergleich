// Holt Indikatoren von Eurostat, berechnet EU-Ranking und Trend
// und schreibt docs/daten.js + docs/daten.json.
// Aufruf: node update.js          (echte Daten, braucht Internet)
//         node update.js --test   (Beispieldaten, ohne Internet)
const fs = require("fs");
const TEST = process.argv.includes("--test");
const BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/";

// Eurostat liefert gelegentlich kurzzeitig eine HTML-Fehlerseite statt JSON: bis zu 4 Versuche mit Wartezeit
const _fetch = globalThis.fetch;
globalThis.fetch = async (url, opt) => {
  const eurostat = String(url).includes("ec.europa.eu/eurostat");
  for (let n = 1; ; n++) {
    try {
      if (eurostat) await new Promise(r => setTimeout(r, 350)); // Eurostat nicht mit Anfragen überfluten
      const res = await _fetch(url, opt);
      const ct = res.headers.get("content-type") || "";
      if (!eurostat || n >= 4 || (res.status < 500 && !/text\/html/i.test(ct))) return res;
      console.error(`   (Eurostat antwortet mit ${res.status} ${ct.split(";")[0]}, Versuch ${n}/4, warte ...)`);
    } catch (e) { if (!eurostat || n >= 4) throw e; console.error(`   (Netzwerkfehler: ${e.message}, Versuch ${n}/4, warte ...)`); }
    await new Promise(r => setTimeout(r, 4000 * n));
  }
};
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
// Themengruppen der Startseite (Reihenfolge = Reihenfolge auf der Seite)
const GRUPPEN = ["Wirtschaft und Arbeit", "Staatsfinanzen", "Preise und Kosten", "Gesellschaft"];
const GRUPPE_VON = {
  wachstum: 0, "wachstum-pro-kopf": 0, "wachstum-privat": 0, arbeitslosigkeit: 0, beschaeftigung: 0, insolvenzen: 0, einkommen: 0,
  schulden: 1, defizit: 1, staatsquote: 1, abgabenquote: 1, rating: 1,
  inflation: 2, benzin: 2, diesel: 2, lebenshaltung: 2, immobilien: 2, strompreis: 2, "strompreis-industrie": 2,
  bevoelkerung: 3, geburtenrate: 3 };
// Kurze Erklärung je Indikator (wird auf der Detailseite gezeigt)
const ERKLAERUNG = {
  arbeitslosigkeit: "Anteil der Menschen ohne Arbeit, die aktiv eine suchen, an allen Erwerbspersonen (Beschäftigte plus Arbeitssuchende). Gemessen nach der internationalen ILO-Definition, deshalb weicht der Wert von der AMS-Quote ab.",
  inflation: "Wie stark die Verbraucherpreise gegenüber dem gleichen Monat des Vorjahres gestiegen sind (harmonisierter Verbraucherpreisindex HVPI). Zeigt, wie schnell Einkäufe und Dienstleistungen im Schnitt teurer werden.",
  wachstum: "Um wie viel Prozent die gesamte Wirtschaftsleistung (BIP) gegenüber dem gleichen Quartal des Vorjahres gewachsen ist, bereinigt um Preissteigerungen. Ein Minus bedeutet, dass die Wirtschaft schrumpft.",
  schulden: "Wie hoch die Schulden des Staates (Bund, Länder, Gemeinden, Sozialversicherung) im Verhältnis zur Jahreswirtschaftsleistung sind. 60 % des BIP ist der Referenzwert aus den EU-Verträgen.",
  defizit: "Einnahmen minus Ausgaben des Staates in % des BIP. Ein Minus ist ein Defizit, das neue Schulden bedeutet. Die EU-Regeln sehen als Obergrenze 3 % des BIP vor.",
  geburtenrate: "Gesamtfertilitätsrate: Wie viele Kinder eine Frau im Schnitt bekäme, wenn die Geburtenhäufigkeit des Jahres ein Leben lang gleich bliebe. Rund 2,1 wären nötig, damit die Bevölkerung ohne Zuwanderung stabil bleibt.",
  staatsquote: "Anteil der gesamten Staatsausgaben (Verwaltung, Pensionen, Gesundheit, Bildung, Soziales, Zinsen) an der Wirtschaftsleistung. Zeigt, wie groß der Staatsanteil an der Wirtschaft ist.",
  abgabenquote: "Anteil der Steuern und Sozialversicherungsbeiträge am BIP. Zeigt, wie viel der Wirtschaftsleistung als Abgaben an den Staat geht (ohne Gebühren und Entgelte für Leistungen).",
  beschaeftigung: "Anteil der 20- bis 64-Jährigen, die erwerbstätig sind, an der gleichaltrigen Bevölkerung. Teilzeit zählt wie Vollzeit, die Quote sagt also nichts über die geleisteten Arbeitsstunden.",
  bevoelkerung: "Wie stark die Einwohnerzahl gegenüber dem Vorjahr (jeweils 1. Jänner) gewachsen oder geschrumpft ist. Das Wachstum entsteht aus Geburten, Sterbefällen und Zu- beziehungsweise Abwanderung. Die Einwohnerzahl selbst steht daneben.",
  "wachstum-pro-kopf": "Wie stark die preisbereinigte Wirtschaftsleistung je Einwohner gewachsen ist. Das zeigt, ob der Wohlstand im Schnitt wächst, auch wenn die Bevölkerung wächst oder schrumpft.",
  lebenshaltung: "Preisniveau-Index: Wie viel ein typischer Warenkorb im Land im Vergleich zum EU-Durchschnitt (= 100) kostet. 120 heißt, die Preise sind 20 % höher als im EU-Schnitt. Zeigt keine Teuerung über die Zeit.",
  strompreis: "Was ein Haushalt mit mittlerem Verbrauch (2.500 bis 5.000 kWh pro Jahr) inklusive Steuern und Abgaben pro kWh bezahlt, in Cent. Halbjahreswerte, verglichen mit dem gleichen Halbjahr des Vorjahres.",
  "strompreis-industrie": "Was ein mittelgroßer Industriekunde (2 bis 20 GWh pro Jahr) ohne Mehrwertsteuer pro kWh bezahlt, in Cent. Halbjahreswerte, verglichen mit dem gleichen Halbjahr des Vorjahres.",
  immobilien: "Wie stark sich die Preise für Wohnimmobilien (gekaufte Wohnungen und Häuser, neu und gebraucht) seit dem Amtsantritt der Regierung verändert haben, laut Eurostat-Preisindex. Der Index zeigt die Veränderung, nicht den Preis pro Quadratmeter.",
  einkommen: "Die Hälfte der Menschen im Land hat weniger, die andere Hälfte mehr als diesen Betrag. Gemeint ist das Nettoeinkommen nach Steuern und Abgaben, einschließlich Sozialleistungen, je Person (bei Haushalten nach Größe gewichtet). Es ist kein reiner Lohn: Pensionen und Sozialleistungen sind enthalten. Die Erhebung (EU-SILC) fragt nach dem Einkommen des Vorjahres.",
  "wachstum-privat": "Wie stark die Wirtschaft ohne den Beitrag des Staates gewachsen wäre: Vom BIP-Wachstum wird abgezogen, was der Staat selbst beigetragen hat (Anteil des Staatskonsums am BIP mal dessen Wachstum). Spart der Staat, gibt es einen Bonus.",
  benzin: "Was ein Liter Euro-super 95 im Schnitt an der Tankstelle kostet, inklusive Mineralölsteuer, CO2-Abgaben und Mehrwertsteuer, in Cent. Grundlage sind die Wochenpreise des EU-Ölbulletins, hier als Monatsdurchschnitt.",
  diesel: "Was ein Liter Diesel im Schnitt an der Tankstelle kostet, inklusive Mineralölsteuer, CO2-Abgaben und Mehrwertsteuer, in Cent. Grundlage sind die Wochenpreise des EU-Ölbulletins, hier als Monatsdurchschnitt.",
  rating: "Bewertungen der Kreditwürdigkeit eines Staates durch die Agenturen S&P, Moody's und Fitch. Je besser die Note (AAA ist die beste), desto niedriger gelten die Zinsen, die ein Land für seine Schulden zahlen muss. Der Rang beruht auf dem Durchschnitt der drei Agenturen.",
  insolvenzen: "Anzahl der Unternehmensinsolvenzen pro Jahr in Österreich (eröffnete Verfahren und mangels Vermögen abgewiesene Anträge), laut KSV1870. Nur für Österreich, ein Vergleich mit anderen Ländern ist hier nicht möglich."
};

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
  { id: "staatsquote", name: "Staatsquote", takt: "jahr", dataset: "gov_10a_main",
    alternativen: [ { dataset: "gov_10a_exp", filter: "unit=PC_GDP&sector=S13&cofog99=TOTAL&na_item=TE" } ],
    filter: "unit=PC_GDP&sector=S13&na_item=TE", // Gesamtausgaben des Staates in % des BIP (gov_10a_main ist aktueller als gov_10a_exp)
    einheit: "% des BIP: gesamte Staatsausgaben", diffEinheit: "Prozentpunkte",
    rangText: "Rang 1 = niedrigste Staatsquote",
    trendNeutral: true, // Trend wird ohne Wertung als höher/niedriger gezeigt, das Ranking bleibt gewertet
    umstritten: true, // Wertung ist politisch umstritten: Hinweis wird angezeigt. typ "neutral" statt "niedrig" schaltet die Wertung ab.
    hinweis: "Die Wertung ist umstritten: Im Ranking gilt eine niedrigere Staatsquote als besser (weniger Staatsanteil an der Wirtschaft). Der Trend wird dagegen neutral als höher oder niedriger angezeigt. Andere sehen einen hohen Staatsanteil als Vorteil, etwa für soziale Absicherung, Gesundheit und Bildung. Die Staatsquote zeigt, welcher Anteil der Wirtschaftsleistung (BIP) über den Staat ausgegeben wird.",
    maxAlter: 26, typ: "niedrig", schwelle: 0.5, mock: { base: 42, step: 1.6 } }
  ,{ id: "abgabenquote", name: "Steuer- und Abgabenquote", takt: "jahr", dataset: "gov_10a_taxag",
    filter: "unit=PC_GDP&sector=S13_S212&na_item=D2_D5_D91_D61_M_D995", // Steuern und Sozialbeiträge in % des BIP (Staat inklusive EU-Institutionen)
    alternativen: [ // falls Eurostat die Codes anders benennt, werden diese der Reihe nach probiert
      { dataset: "gov_10a_taxag", filter: "unit=PC_GDP&sector=S13&na_item=D2_D5_D61_D91_D995" },
      { dataset: "gov_10a_taxag", filter: "unit=PC_GDP&sector=S13_S212&na_item=D2_D5_D61_D91_D995_XD995" } ],
    quote: { dataset: "gov_10q_ggnfa", filter: "sector=S13&unit=MIO_EUR&s_adj=NSA", items: ["D2REC", "D5REC", "D61REC", "D91REC"], pflicht: ["D2REC", "D5REC", "D61REC"], // Summe: Steuern auf Produktion/Import, Einkommen/Vermögen, Sozialbeiträge, Vermögensteuern
      bipDataset: "namq_10_gdp", bipFilter: "unit=CP_MEUR&s_adj=NSA&na_item=B1GQ" },
    vorab: { dataset: "gov_10q_ggnfa", takt: "quartal", rueckblick: 4, maxAlter: 8, plausibel: [25, 60], basis: "unit=PC_GDP&s_adj=NSA", sektoren: ["S13"], // Quartalsdaten (Vorjahresquartal als Vergleich, wegen Saisoneffekten)
      passt: c => /D2/.test(c) && /D5/.test(c) && /D61/.test(c) },
    entdecke: { basis: "unit=PC_GDP", sektoren: ["S13_S212", "S13"], // Notlösung: Codes bei Eurostat nachschlagen (Summe aus Steuern D2, D5 und Sozialbeiträgen D61)
      passt: c => /D2/.test(c) && /D5/.test(c) && /D61/.test(c) } ,
    einheit: "% des BIP: Steuern und Sozialbeiträge (Quartalswerte: Summe der letzten 4 Quartale, ohne EU-Steuern)",
    rangText: "Rang 1 = niedrigste Steuer- und Abgabenquote",
    trendNeutral: true, // Trend wird ohne Wertung als höher/niedriger gezeigt, das Ranking bleibt gewertet
    umstritten: true,
    hinweis: "Die Wertung ist umstritten: Im Ranking gilt eine niedrigere Quote als besser (geringere Belastung durch Steuern und Sozialbeiträge). Der Trend wird dagegen neutral als höher oder niedriger angezeigt. Andere sehen hohe Abgaben als Voraussetzung für Leistungen wie Pensionen, Gesundheit und Bildung. Die Quote zeigt, welcher Anteil der Wirtschaftsleistung (BIP) als Steuern und Sozialbeiträge an den Staat geht.",
    maxAlter: 26, typ: "niedrig", schwelle: 0.5, mock: { base: 33, step: 1.1, ohneCH: true } }
  ,{ id: "beschaeftigung", name: "Beschäftigungsquote", takt: "quartal", dataset: "lfsi_emp_q",
    filter: "indic_em=EMP_LFS&sex=T&age=Y20-64&unit=PC_POP&s_adj=SA", // Erwerbstätige 20 bis 64 Jahre in % der Bevölkerung, saisonbereinigt
    alternativen: [
      { dataset: "lfsi_emp_q", filter: "indic_em=EMP_LFS&sex=T&age=Y20-64&unit=PC_POP&s_adj=SA" },
      { dataset: "lfsi_emp_a", filter: "indic_em=EMP_LFS&sex=T&age=Y20-64&unit=PC_POP" } ],
    einheit: "% der 20- bis 64-Jährigen, saisonbereinigt", rangText: "Rang 1 = höchste Beschäftigungsquote",
    maxAlter: 12, typ: "hoch", schwelle: 0.3, mock: { base: 66, step: 1.2 } }
  ,{ id: "bevoelkerung", name: "Bevölkerungswachstum", takt: "jahr", dataset: "demo_gind",
    filter: "indic_de=JAN", // Einwohner am 1. Jänner (demo_gind ist aktueller als demo_pjan); daraus wird das Wachstum zum Vorjahr berechnet
    alternativen: [ { dataset: "demo_pjan", filter: "age=TOTAL&sex=T&unit=NR" } ],
    wachstum: true, dez: 2, suffix: " %", diffEinheit: "Prozentpunkte",
    einheit: "% Veränderung der Einwohnerzahl (1. Jänner gegenüber 1. Jänner des Vorjahres)", rangText: "Rang 1 = stärkstes Bevölkerungswachstum, ohne Wertung",
    maxAlter: 26, typ: "neutral", schwelle: 0.15, mock: { base: 5000000, step: 1900000 } }
  ,{ id: "wachstum-pro-kopf", name: "Wachstum pro Kopf", takt: "jahr", dataset: "nama_10_pc",
    filter: "unit=CLV_PCH_PRE_HAB&na_item=B1GQ", // reales BIP je Einwohner (preisbereinigt), Veränderung zum Vorjahr
    einheit: "% Veränderung des realen BIP je Einwohner zum Vorjahr (preisbereinigt)", rangText: "Rang 1 = höchstes Wachstum pro Kopf",
    maxAlter: 26, typ: "hoch", schwelle: 0.3, mock: { base: -1, step: 0.4 } }
  ,{ id: "lebenshaltung", name: "Lebenshaltungskosten", takt: "jahr", dataset: "prc_ppp_ind",
    filter: "na_item=PLI_EU27_2020&ppp_cat=A01", // Preisniveau-Index: EU-27 = 100, gesamte Wirtschaftsleistung
    alternativen: [
      { dataset: "prc_ppp_ind", filter: "na_item=PLI_EU27_2020&ppp_cat=A0101" },
      { dataset: "prc_ppp_ind", filter: "na_item=PLI_EU27_2020&ppp_cat=A0102" },
      { dataset: "prc_ppp_ind_1", filter: "na_item=PLI_EU27_2020&ppp_cat=A01" } ],
    einheit: "Preisniveau-Index, EU-27 = 100 (Preise gegenüber dem EU-Durchschnitt)", suffix: "", diffEinheit: "Indexpunkte", dez: 1,
    rangText: "Rang 1 = niedrigstes Preisniveau", maxAlter: 26,
    umstritten: true, // Wertung: höheres Preisniveau = schlechter (auch im Trend), aber mit Hinweis
    hinweis: "Die Wertung ist umstritten: Ein höheres Preisniveau gilt hier als schlechter (höhere Lebenshaltungskosten). Es geht aber oft mit hohen Einkommen einher, und ein Anstieg gegenüber dem EU-Schnitt kann auch Aufholen bedeuten. Der Index vergleicht die Preise zwischen den Ländern, nicht die Teuerung über die Zeit (dafür siehe Inflation).",
    typ: "niedrig", schwelle: 1, mock: { base: 70, step: 3.5 } }
  ,{ id: "immobilien", name: "Immobilienpreise", takt: "quartal", dataset: "prc_hpi_q",
    filter: "unit=I15_Q&purchase=TOTAL", // Preisindex für Wohnimmobilien (gekaufte Wohnungen und Häuser, neu und gebraucht), 2015 = 100
    alternativen: [ { dataset: "prc_hpi_q", filter: "unit=I15_Q&purchase=DW_EXST" } ],
    seitRegierung: true, // gezeigt wird die Preisänderung seit dem Amtsantritt der Regierung (Basis: Quartal des Amtsantritts = 0 %)
    keinStart: true, // der Rang beim Amtsantritt wäre für alle gleich, deshalb kein Vergleich "seit Regierungsantritt"
    maxAlter: 8, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte",
    einheit: "% Preisänderung von Wohnimmobilien seit dem Quartal des Regierungsantritts (Preisindex, ohne Inflationsbereinigung)",
    rangText: "Rang 1 = stärkster Preisanstieg seit Regierungsantritt, ohne Wertung",
    typ: "neutral", umstritten: true,
    hinweis: "Hier gibt es keine Wertung: Steigende Immobilienpreise nützen Eigentümern und belasten Käufer, Mieter und Familien, die erst kaufen wollen. Gezeigt wird die Veränderung des Preisindex der Wohnimmobilien (Wohnungen und Häuser, neu und gebraucht) gegenüber dem Quartal des Regierungsantritts. Das ist die Preisentwicklung, nicht der Preis pro Quadratmeter, und die Preise sind nicht um die Inflation bereinigt.",
    schwelle: 0.5, mock: { base: 100, step: 3 } }
  ,{ id: "einkommen", name: "Medianeinkommen", takt: "jahr", dataset: "ilc_di03",
    filter: "statinfo=MED_EI&age=TOTAL&sex=T&unit=EUR", // mittleres (Median-)Nettoeinkommen je Person, nach Haushaltsgröße gewichtet (EU-SILC)
    alternativen: [
      { dataset: "ilc_di03", filter: "statinfo=MED_EI&age=Y_GE16&sex=T&unit=EUR" },
      { dataset: "ilc_di03", filter: "statinfo=MED_EI&age=Y_GE18&sex=T&unit=EUR" } ],
    maxAlter: 26, dez: 0, suffix: " €", diffEinheit: "Euro",
    einheit: "Euro pro Jahr: Median des verfügbaren Nettoeinkommens je Person (nach Haushaltsgröße gewichtet), EU-SILC-Erhebung",
    kaufkraft: { filter: "statinfo=MED_EI&age=TOTAL&sex=T&unit=PPS" }, // zusätzlich in Kaufkraft (PPS), damit Preisunterschiede zwischen den Ländern herausgerechnet sind
    rangText: "Rang 1 = höchstes Medianeinkommen (in Euro)", typ: "hoch", schwelle: 250, mock: { base: 8000, step: 2400 } }
  ,{ id: "wachstum-privat", name: "Wachstum ohne Staat", takt: "quartal", dataset: "namq_10_gdp",
    filter: "unit=CLV_PCH_SM&s_adj=SCA&na_item=B1GQ", // Platzhalter (im Test), echte Berechnung: berechnePrivat()
    privat: true, // BIP-Wachstum minus Beitrag des Staatskonsums (Anteil am BIP x Wachstum des Staatskonsums)
    einheit: "Prozentpunkte: BIP-Wachstum zum Vorjahresquartal minus Wachstumsbeitrag des Staatskonsums (preis- und saisonbereinigt)", suffix: " %", diffEinheit: "Prozentpunkte",
    rangText: "Rang 1 = höchstes Wachstum ohne den Beitrag des Staates", maxAlter: 8,
    umstritten: true,
    hinweis: "Die Rechnung ist eine Näherung: Der Beitrag des Staates wird über die Kosten gemessen (Gehälter und Käufe des Staates), nicht über den Nutzen von Schulen, Spitälern oder Polizei. Staatsinvestitionen sind in den Quartalsdaten nicht getrennt ausgewiesen und fehlen deshalb. Pensionen und andere Sozialleistungen zählen nicht als Staatsausgaben im BIP, sie wirken erst über den Konsum der Empfänger.",
    typ: "hoch", schwelle: 0.3, mock: { base: -0.6, step: 0.3 } }
  ,{ id: "benzin", name: "Benzinpreis", takt: "monat", dataset: "une_rt_m", filter: "x=y", // Platzhalter, echte Quelle: Ölbulletin (berechneOel)
    oel: { spalte: 1 }, // Euro-super 95
    einheit: "Cent pro Liter Euro-super 95 an der Tankstelle, inklusive Steuern, Monatsdurchschnitt", suffix: " ct", diffEinheit: "Cent pro Liter", dez: 1,
    rangText: "Rang 1 = niedrigster Benzinpreis", maxAlter: 3,
    hinweis: "Quelle ist das Weekly Oil Bulletin der EU-Kommission (Wochenpreise, hier als Monatsdurchschnitt). Ein großer Teil des Preises sind Steuern und Abgaben, die sich zwischen den Ländern stark unterscheiden. Der laufende Monat ist ein Durchschnitt der bisher gemeldeten Wochen.",
    typ: "niedrig", schwelle: 2, mock: { base: 130, step: 4 } }
  ,{ id: "diesel", name: "Dieselpreis", takt: "monat", dataset: "une_rt_m", filter: "x=y",
    oel: { spalte: 2 }, // Diesel
    einheit: "Cent pro Liter Diesel an der Tankstelle, inklusive Steuern, Monatsdurchschnitt", suffix: " ct", diffEinheit: "Cent pro Liter", dez: 1,
    rangText: "Rang 1 = niedrigster Dieselpreis", maxAlter: 3,
    hinweis: "Quelle ist das Weekly Oil Bulletin der EU-Kommission (Wochenpreise, hier als Monatsdurchschnitt). Ein großer Teil des Preises sind Steuern und Abgaben, die sich zwischen den Ländern stark unterscheiden. Der laufende Monat ist ein Durchschnitt der bisher gemeldeten Wochen.",
    typ: "niedrig", schwelle: 2, mock: { base: 135, step: 4 } }
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
    if (c === "CH" && ind.mock.ohneCH) return; // Test: Schweiz ohne Daten
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
  const vorher = shift(latest, -(ind.rueckblick || cfg.rueckblick), takt), ranks = rankAt(data, latest, sc), ranksV = rankAt(data, vorher, sc);
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
    const t = shift(latest, -i, takt), rk = rankAt(data, t, sc), m = rk.length >= MIN_LAENDER && rk.some(x => x.value !== rk[0].value) ? rk.find(x => x.code === "AT") : null; // ohne Unterschiede (alle gleich) kein Rang
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
  if (!ind.keinStart && meS && a0 != null && toIdx(startP, takt) < toIdx(latest, takt)) {
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
    rangVerlauf, rangVergleich, seitStart, rueckblick: ind.rueckblick || null,
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

// Preisindex -> Änderung in % seit dem Quartal des Regierungsantritts (Basis = 0 %)
function seitStartJs(js, ind) {
  const A = parse(js), sy = +REGIERUNG.start.slice(0, 4), sm = +REGIERUNG.start.slice(5, 7), base = `${sy}-Q${Math.ceil(sm / 3)}`, geos = Object.keys(A), times = new Set(), val = {};
  for (const g of geos) { val[g] = {}; const b = A[g][base]; if (!b) continue; for (const t of Object.keys(A[g])) if (toIdx(t, "quartal") >= toIdx(base, "quartal")) { val[g][t] = (A[g][t] / b - 1) * 100; times.add(t); } }
  const T = [...times].sort((x, y) => toIdx(x, "quartal") - toIdx(y, "quartal")), idx = arr => Object.fromEntries(arr.map((x, i) => [x, i]));
  return { id: ["geo", "time"], size: [geos.length, T.length], dimension: { geo: { category: { index: idx(geos) } }, time: { category: { index: idx(T) } } }, value: geos.flatMap(g => T.map(t => val[g][t] ?? null)) };
}

// ===== Spritpreise: Weekly Oil Bulletin der EU-Kommission (Excel-Datei, kein Eurostat) =====
const zlib = require("zlib");
function entzippe(buf) { // minimaler ZIP-Leser (Excel-Dateien sind ZIP-Archive)
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error("kein ZIP");
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = {};
  for (let i = 0; i < n; i++) {
    const meth = buf.readUInt16LE(p + 10), cs = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nl);
    const ds = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28), raw = buf.subarray(ds, ds + cs);
    out[name] = () => meth === 0 ? raw : zlib.inflateRawSync(raw);
    p += 46 + nl + el + cl;
  }
  return out;
}
const xmlText = t => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
function leseExcel(buf) { // gibt { blattname: [ [zellen der Zeile 1], ... ] } zurück (Spalte A = Index 0)
  const z = entzippe(buf), txt = n => z[n] ? z[n]().toString("utf8") : "";
  const ss = [...txt("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => xmlText([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join("")));
  const wb = txt("xl/workbook.xml"), rels = txt("xl/_rels/workbook.xml.rels"), blaetter = {};
  for (const m of wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g)) {
    const rel = rels.match(new RegExp(`<Relationship [^>]*Id="${m[2]}"[^>]*Target="([^"]*)"|<Relationship [^>]*Target="([^"]*)"[^>]*Id="${m[2]}"`));
    const ziel = rel && (rel[1] || rel[2]); if (!ziel) continue;
    const xml = txt("xl/" + ziel.replace(/^\/?(xl\/)?/, "")), rows = [];
    for (const r of xml.matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const col = [...c[1]].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1, t = /t="(\w+)"/.exec(c[2])?.[1], v = /<v>([\s\S]*?)<\/v>/.exec(c[3] || "")?.[1];
        cells[col] = v === undefined ? (/<t[^>]*>([\s\S]*?)<\/t>/.exec(c[3] || "")?.[1] ?? null) : t === "s" ? ss[+v] : t === "str" ? xmlText(v) : isNaN(+v) ? v : +v;
      }
      rows[+r[1] - 1] = cells;
    }
    blaetter[xmlText(m[1])] = rows;
  }
  return blaetter;
}
async function oelBulletin() {
  const seite = await (await fetch("https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en")).text();
  const links = [...seite.matchAll(/href="([^"]*document\/download[^"]*)"/g)].map(m => xmlText(m[1]));
  console.error(`   Ölbulletin-Seite: ${links.length} Download-Links: ` + links.map(l => decodeURIComponent((/filename=([^&]*)/.exec(l) || [])[1] || l)).join(" | ").slice(0, 600));
  const ziel = links.find(l => /History/i.test(decodeURIComponent(l))) || "https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx";
  const url = ziel.startsWith("http") ? ziel : "https://energy.ec.europa.eu" + ziel;
  const res = await fetch(url); if (!res.ok) throw new Error("Ölbulletin HTTP " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  console.error(`   Ölbulletin-Datei: ${buf.length} Bytes`);
  return leseExcel(buf);
}
let _oel = null;
const oelDatum = n => new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 7); // Excel-Datum -> "JJJJ-MM"
// Spritpreise aus dem Ölbulletin: Wochenpreise (EUR pro 1000 Liter, inkl. Steuern) -> Monatsdurchschnitt in Cent pro Liter
async function berechneOel(ind) {
  _oel ??= oelBulletin();
  const rows = (await _oel)["Prices with taxes"]; if (!rows) throw new Error("Blatt 'Prices with taxes' fehlt");
  const kopf = rows[3] || [], bloecke = {};
  kopf.forEach((v, i) => { if (typeof v === "string" && /^[A-Z]{2,3}_$/.test(v)) bloecke[v.slice(0, -1) === "GR" ? "EL" : v.slice(0, -1) === "EU" ? "EU27_2020" : v.slice(0, -1)] = i; });
  if (!ind.oel.geloggt) { ind.oel.geloggt = true; for (const g of ["DK", "PL", "AT"]) { const c = bloecke[g]; console.error(`   OEL ${g}: Kopf ${JSON.stringify((rows[0] || []).slice(c, c + 4))} letzte Wochen ${JSON.stringify(rows.slice(3, 7).map(r => r && r.slice(c, c + 4)))}`); } }
  const sum = {}, anz = {};
  for (const r of rows.slice(3)) {
    if (!r || typeof r[0] !== "number") continue;
    const m = oelDatum(r[0]); if (m < TAKT.monat.seit) continue;
    for (const [g, c] of Object.entries(bloecke)) {
      const v = r[c + ind.oel.spalte]; if (typeof v !== "number" || v < 300 || v > 4000) continue; // Plausibilität: 0,30 bis 4 Euro je Liter
      (sum[g] ??= {})[m] = (sum[g][m] ?? 0) + v / 10; (anz[g] ??= {})[m] = (anz[g][m] ?? 0) + 1; // v/10: EUR je 1000 l = Cent je Liter x 10
    }
  }
  const geos = Object.keys(sum), times = [...new Set(geos.flatMap(g => Object.keys(sum[g])))].sort(), idx = arr => Object.fromEntries(arr.map((x, i) => [x, i]));
  const js = { id: ["geo", "time"], size: [geos.length, times.length], dimension: { geo: { category: { index: idx(geos) } }, time: { category: { index: idx(times) } } },
    value: geos.flatMap(g => times.map(t => sum[g][t] != null ? Math.round(sum[g][t] / anz[g][t] * 10) / 10 : null)) };
  return berechne(ind, js);
}

// Aus Einwohnerzahlen (1. Jänner) das Wachstum zum Vorjahr in % berechnen
function wachstumJs(js) {
  const A = parse(js), geos = Object.keys(A), times = new Set(), val = {};
  for (const g of geos) { val[g] = {}; for (const t of Object.keys(A[g])) { const p = A[g][String(+t - 1)]; if (p) { val[g][t] = (A[g][t] / p - 1) * 100; times.add(t); } } }
  const T = [...times].sort(), idx = arr => Object.fromEntries(arr.map((x, i) => [x, i]));
  return { id: ["geo", "time"], size: [geos.length, T.length], dimension: { geo: { category: { index: idx(geos) } }, time: { category: { index: idx(T) } } }, value: geos.flatMap(g => T.map(t => val[g][t] ?? null)) };
}

// Wachstum ohne Staat: BIP-Wachstum minus (Anteil des Staatskonsums am BIP x Wachstum des Staatskonsums)
async function berechnePrivat(ind) {
  const sq = TAKT.quartal.seit, hol = async f => { const rs = await fetch(`${BASE}namq_10_gdp?format=JSON&lang=EN&${f}&sinceTimePeriod=${sq}`); if (!rs.ok) throw new Error("HTTP " + rs.status); return parse(await rs.json()); };
  const gdpG = await hol("unit=CLV_PCH_SM&s_adj=SCA&na_item=B1GQ"), govG = await hol("unit=CLV_PCH_SM&s_adj=SCA&na_item=P3_S13");
  const govC = await hol("unit=CP_MEUR&s_adj=SCA&na_item=P3_S13"), gdpC = await hol("unit=CP_MEUR&s_adj=SCA&na_item=B1GQ");
  const geos = Object.keys(gdpG).filter(g => govG[g] && govC[g] && gdpC[g]), times = new Set(), val = {}, komp = {};
  for (const g of geos) { val[g] = {}; for (const t of Object.keys(gdpG[g])) {
    const gg = govG[g][t], c = govC[g][t], b = gdpC[g][t];
    if (gg == null || !c || !b) continue;
    const anteil = c / b, staat = anteil * gg, privat = gdpG[g][t] - staat;
    val[g][t] = privat; (komp[g] ??= {})[t] = { bip: gdpG[g][t], staat, anteil: anteil * 100 }; times.add(t); } }
  const T = [...times].sort((a, b) => toIdx(a, "quartal") - toIdx(b, "quartal")), idx = arr => Object.fromEntries(arr.map((x, i) => [x, i]));
  const js = { id: ["geo", "time"], size: [geos.length, T.length], dimension: { geo: { category: { index: idx(geos) } }, time: { category: { index: idx(T) } } }, value: geos.flatMap(g => T.map(t => val[g][t] ?? null)) };
  const r = berechne(ind, js), rd = x => Math.round(x * 10) / 10, k = komp.AT?.[r.periode];
  if (k) r.komponenten = { bip: rd(k.bip), staat: rd(k.staat), privat: rd(k.bip - k.staat), anteil: rd(k.anteil) };
  return r;
}

// Quartalsquote selbst berechnen: Summe der letzten 4 Quartale (Steuern und Sozialbeiträge) / Summe der letzten 4 Quartale BIP
function quotientJs(jsA, jsB) {
  const A = parse(jsA), B = parse(jsB), qi = t => { const m = /^(\d{4})-Q(\d)$/.exec(t); return m ? +m[1] * 4 + +m[2] - 1 : null; };
  const back = (t, k) => { const i = qi(t) - k; return `${Math.floor(i / 4)}-Q${i % 4 + 1}`; };
  const geos = Object.keys(A).filter(g => B[g]), times = new Set(), val = {};
  for (const g of geos) { val[g] = {}; for (const t of Object.keys(A[g])) {
    let a = 0, b = 0, ok = true;
    for (let k = 0; k < 4; k++) { const tt = back(t, k); if (A[g][tt] === undefined || B[g][tt] === undefined) { ok = false; break; } a += A[g][tt]; b += B[g][tt]; }
    if (ok && b) { val[g][t] = a / b * 100; times.add(t); } } }
  const T = [...times].sort(), G = geos, v = [];
  for (const g of G) for (const t of T) v.push(val[g][t] ?? null);
  const idx = arr => Object.fromEntries(arr.map((x, i) => [x, i]));
  return { id: ["geo", "time"], size: [G.length, T.length], dimension: { geo: { category: { index: idx(G) } }, time: { category: { index: idx(T) } } }, value: v };
}

// Notlösung, wenn feste Filter nicht passen: fragt Eurostat, welche Codes es wirklich gibt, und baut daraus Kandidaten
async function entdecke(ind, e) {
  if (TEST || !e) return [];
  const ds = e.dataset || ind.dataset, tk = e.takt || ind.takt;
  const res = await fetch(`${BASE}${ds}?format=JSON&lang=EN&geo=AT&${e.basis}&sinceTimePeriod=${TAKT[tk].seit}`);
  if (!res.ok) throw new Error("Eurostat: HTTP " + res.status);
  const js = await res.json(), cat = d => js.dimension[d] ? Object.keys(js.dimension[d].category.index) : [];
  const items = cat("na_item"), sektoren = cat("sector");
  console.error(`   Entdeckt in ${ds}: na_item = ${items.join(", ")}; sector = ${sektoren.join(", ")}`);
  const passend = items.filter(e.passt).sort((a, b) => (/D995/.test(b) ? 1 : 0) - (/D995/.test(a) ? 1 : 0) || a.length - b.length);
  const sek = e.sektoren.filter(x => sektoren.includes(x));
  const out = [];
  for (const n of passend) for (const x of (sek.length ? sek : [null])) out.push({ dataset: ds, takt: tk, filter: `${e.basis}${x ? "&sector=" + x : ""}&na_item=${n}` });
  return out;
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
      let r = null, letzterFehler = null, pop = null;
      const kandidaten = [{ dataset: ind.dataset, filter: ind.filter }, ...(ind.alternativen || [])];
      if (ind.oel && !TEST) { try { r = await berechneOel(ind); } catch (e) { letzterFehler = e; console.error(`   (Ölbulletin hat nicht funktioniert: ${e.message})`); } }
      if (ind.privat && !TEST) { try { r = await berechnePrivat(ind); } catch (e) { letzterFehler = e; console.error(`   (Wachstum ohne Staat hat nicht funktioniert: ${e.message})`); } }
      for (const k of (r ? [] : kandidaten)) {
        try {
          let js;
          if (TEST) js = mock(ind);
          else {
            const res = await fetch(`${BASE}${k.dataset}?format=JSON&lang=EN&${k.filter}&sinceTimePeriod=${TAKT[ind.takt].seit}`);
            if (!res.ok) { const txt = (await res.text()).slice(0, 300); throw new Error("Eurostat: HTTP " + res.status + " " + txt); }
            js = await res.json();
          }
          if (ind.wachstum) { pop = parse(js); js = wachstumJs(js); }
          if (ind.seitRegierung) js = seitStartJs(js, ind);
          r = berechne(ind, js); break;
        } catch (e) { letzterFehler = e; if (kandidaten.length > 1) console.error(`   (${k.dataset} mit ${k.filter} hat nicht funktioniert: ${e.message})`); }
      }
      if (ind.quote && !TEST) { // Quartalsquote aus Steuern (ggnfa, Summe der Einzelposten) und BIP (namq) selbst berechnen
        try {
          const q = ind.quote, seit = TAKT.quartal.seit;
          const holen = async url => { const rs = await fetch(url); if (!rs.ok) throw new Error("HTTP " + rs.status); return rs.json(); };
          const teile = {};
          for (const it of q.items) { try { teile[it] = parse(await holen(`${BASE}${q.dataset}?format=JSON&lang=EN&${q.filter}&na_item=${it}&sinceTimePeriod=${seit}`)); } catch (e) { console.error(`   (Posten ${it}: ${e.message})`); } }
          const summe = {};
          for (const it in teile) for (const g in teile[it]) for (const t in teile[it][g]) { (summe[g] ??= {}); summe[g][t] = (summe[g][t] ?? 0) + teile[it][g][t]; }
          for (const g in summe) for (const t in summe[g]) if (q.pflicht.some(it => teile[it]?.[g]?.[t] === undefined)) delete summe[g][t]; // Pflichtposten müssen vorhanden sein
          const geos = Object.keys(summe), ts0 = [...new Set(Object.values(summe).flatMap(o => Object.keys(o)))].sort();
          const idx = arr => Object.fromEntries(arr.map((x, i) => [x, i]));
          const jsA = { id: ["geo", "time"], size: [geos.length, ts0.length], dimension: { geo: { category: { index: idx(geos) } }, time: { category: { index: idx(ts0) } } }, value: geos.flatMap(g => ts0.map(t => summe[g][t] ?? null)) };
          const jsB = await holen(`${BASE}${q.bipDataset}?format=JSON&lang=EN&${q.bipFilter}&sinceTimePeriod=${seit}`);
          const jq = quotientJs(jsA, jsB), dd = parse(jq), ts = [...new Set(Object.values(dd).flatMap(o => Object.keys(o)))].sort();
          console.error(`   Quartalsquote: ${Object.keys(dd).length} Länder, Perioden ${ts[0]}..${ts[ts.length - 1]}, AT: ${JSON.stringify(dd.AT || {}).slice(-120)}`);
          const r3 = berechne({ ...ind, takt: "quartal", rueckblick: 4, maxAlter: 8 }, jq);
          const w = r3.oesterreich && r3.oesterreich.wert;
          if (!(r3.anzahlLaender >= 20 && w >= 25 && w <= 60)) throw new Error(`unplausibel (AT ${w}, ${r3.anzahlLaender} Länder)`);
          r = r3; console.error("   (Quartalsquote berechnet)");
        } catch (e) { console.error(`   (Quartalsquote hat nicht funktioniert: ${e.message})`); }
      }
      if (ind.vorab && !TEST && !r) { // zuerst die häufigere Quartalsreihe versuchen
        try {
          for (const k of await entdecke(ind, ind.vorab)) {
            try {
              const res = await fetch(`${BASE}${k.dataset}?format=JSON&lang=EN&${k.filter}&sinceTimePeriod=${TAKT[k.takt].seit}`);
              if (!res.ok) throw new Error("HTTP " + res.status);
              const ind2 = { ...ind, takt: k.takt, rueckblick: ind.vorab.rueckblick, maxAlter: ind.vorab.maxAlter || ind.maxAlter };
              const js2 = await res.json();
              try { const dd = parse(js2), ts = [...new Set(Object.values(dd).flatMap(o => Object.keys(o)))].sort(); console.error(`   Quartalsdaten: ${Object.keys(dd).filter(c => Object.keys(dd[c]).length).length} Länder mit Werten, Perioden ${ts[0]}..${ts[ts.length - 1]}, je Periode (letzte 4): ` + ts.slice(-4).map(t => t + "=" + Object.keys(dd).filter(c => dd[c][t] !== undefined).length).join(", ") + `, AT: ` + JSON.stringify(dd.AT || {}).slice(0, 200)); } catch (e2) { console.error("   Quartalsdiagnose: " + e2.message); }
              const r2 = berechne(ind2, js2);
              const pl = ind.vorab.plausibel, w = r2.oesterreich && r2.oesterreich.wert;
              if (!(r2.anzahlLaender >= 20 && (!pl || (w >= pl[0] && w <= pl[1])))) throw new Error(`unplausibel (AT ${w}, ${r2.anzahlLaender} Länder)`);
              { r = r2; console.error(`   (Quartalsdaten gefunden: ${k.dataset} ${k.filter})`); break; }
            } catch (e) { console.error(`   (Quartal ${k.filter} hat nicht funktioniert: ${e.message})`); }
          }
        } catch (e) { console.error("   Quartalssuche fehlgeschlagen: " + e.message); }
      }
      if (!r) { // sonst die bisherigen Jahreswerte
        try { const kk = kandidaten; for (const k of kk) { try { const res = await fetch(`${BASE}${k.dataset}?format=JSON&lang=EN&${k.filter}&sinceTimePeriod=${TAKT[ind.takt].seit}`); if (!res.ok) throw new Error("HTTP " + res.status); r = berechne(ind, await res.json()); break; } catch (e) {} } } catch (e) {}
      }
      if (!r && ind.entdecke) {
        try {
          for (const k of await entdecke(ind, ind.entdecke)) {
            try {
              const res = await fetch(`${BASE}${k.dataset}?format=JSON&lang=EN&${k.filter}&sinceTimePeriod=${TAKT[ind.takt].seit}`);
              if (!res.ok) throw new Error("HTTP " + res.status);
              r = berechne(ind, await res.json()); console.error(`   (gefunden: ${k.filter})`); break;
            } catch (e) { console.error(`   (${k.filter} hat nicht funktioniert: ${e.message})`); }
          }
        } catch (e) { console.error("   Entdeckung fehlgeschlagen: " + e.message); }
      }
      if (!r) { await diagnose(ind); throw letzterFehler; }
      if (ind.wachstum && pop) { // Einwohnerzahl zusätzlich zeigen (in Millionen)
        const mio = (c, t) => pop[c]?.[t] != null ? Math.round(pop[c][t] * (TEST ? 1 : 1e-6) * 1000) / 1000 : null;
        r.laender.forEach(x => x.bestand = mio(x.code, r.periode));
        if (r.schweiz) r.schweiz.bestand = mio("CH", r.periode);
        r.oesterreich.bestand = mio("AT", r.periode); r.oesterreich.bestandVorher = mio("AT", String(+r.periode - 1));
        r.bestandVerlauf = Object.keys(pop.AT || {}).sort().slice(-6).map(t => ({ t, wert: mio("AT", t) }));
        r.bestandEU = mio("EU27_2020", r.periode);
      }
      if (ind.kaufkraft && !TEST) { // Kaufkraft-Rang (PPS) zusätzlich holen
        try {
          const rs = await fetch(`${BASE}${ind.dataset}?format=JSON&lang=EN&${ind.kaufkraft.filter}&sinceTimePeriod=${TAKT[ind.takt].seit}`);
          if (!rs.ok) throw new Error("HTTP " + rs.status);
          const kk = parse(await rs.json()), t = r.periode;
          const liste = r.laender.map(x => ({ code: x.code, v: kk[x.code]?.[t] })).filter(x => x.v != null);
          liste.forEach(x => { x.rang = 1 + liste.filter(y => y.v > x.v).length; });
          r.laender.forEach(x => { const m = liste.find(y => y.code === x.code); if (m) { x.pps = m.v; x.ppsRang = m.rang; } });
          const at = liste.find(x => x.code === "AT"), vor = kk.AT?.[String(+t - 1)];
          if (at) r.kaufkraft = { wert: at.v, rang: at.rang, n: liste.length, vorher: vor ?? null, eu: kk.EU27_2020?.[t] ?? null };
          if (r.schweiz && kk.CH?.[t] != null) r.schweiz.pps = kk.CH[t];
        } catch (e) { console.error("   Kaufkraft (PPS) nicht verfügbar: " + e.message); }
      }
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
  // Wann bekam ein Indikator zuletzt eine neue Zahl? (neue Periode oder geänderter Wert; sonst bleibt das alte Datum)
  const heute = new Date().toISOString().slice(0, 10);
  let prevDatum = heute; try { prevDatum = JSON.parse(fs.readFileSync("docs/daten.json", "utf8")).aktualisiert || heute; } catch (e) {}
  const fingerabdruck = i => JSON.stringify([i.periode ?? i.stand ?? null, i.oesterreich?.wert ?? null, i.oesterreich?.schnitt ?? null]);
  for (const r of result) {
    const p = !TEST && prev[r.id];
    if (r.veraltet && p) { r.geaendert = p.geaendert || prevDatum; continue; } // Abruf fehlgeschlagen: nichts Neues
    r.geaendert = p && fingerabdruck(p) === fingerabdruck(r) ? (p.geaendert || prevDatum) : heute;
  }
  for (const r of result) { if (ERKLAERUNG[r.id]) r.erklaerung = ERKLAERUNG[r.id]; if (GRUPPE_VON[r.id] !== undefined) r.gruppe = GRUPPEN[GRUPPE_VON[r.id]]; }
  if (!TEST && fehler >= INDICATORS.length) { console.error("Eurostat nicht erreichbar: Die bestehenden Daten bleiben unverändert."); process.exit(1); }
  const out = { beispiel: TEST, aktualisiert: new Date().toISOString().slice(0, 10), quelle: "Eurostat", regierung: REGIERUNG, gruppen: GRUPPEN, indikatoren: result };
  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync("docs/daten.json", JSON.stringify(out, null, 1));
  fs.writeFileSync("docs/daten.js", "window.DATEN = " + JSON.stringify(out) + ";\n");
  if (fehler === INDICATORS.length + 2) process.exit(1);
})();
