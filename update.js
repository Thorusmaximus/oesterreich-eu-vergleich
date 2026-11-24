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
let MIN_LAENDER = 24; // Berichtsperiode: neueste Periode mit mindestens so vielen Ländern

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
// schwelle: feste Rückfallschwelle (in der Einheit des Indikators). Normalerweise gilt 3 % des EU-Durchschnitts (siehe SCHWELLE_ANTEIL), schwelleFix: true erzwingt die feste Schwelle.
// Themengruppen der Startseite (Reihenfolge = Reihenfolge auf der Seite)
const GRUPPEN = ["Wirtschaft und Arbeit", "Staatsfinanzen", "Preise und Kosten", "Gesellschaft", "Sicherheit", "Pensionen und Alter"];
const GRUPPE_VON = {
  wachstum: 0, "wachstum-pro-kopf": 0, "wachstum-privat": 0, arbeitslosigkeit: 0, beschaeftigung: 0, insolvenzen: 0, insolvenzenEU: 0, einkommen: 0, durchschnittseinkommen: 0, kaufkraft: 0,
  teilzeit: 0, industrie: 0,
  schulden: 1, defizit: 1, staatsquote: 1, abgabenquote: 1, rating: 1,
  inflation: 2, benzin: 2, diesel: 2, lebenshaltung: 2, immobilien: 2, strompreis: 2, "strompreis-industrie": 2,
  bevoelkerung: 3, geburtenrate: 3, terror: 4, aktionaersquote: 0, kapitalmarkt: 0, armut: 3, ausgrenzung: 3, wohnkosten: 2, mieten: 2, jugendarbeitslosigkeit: 0, neet: 0, forschung: 0, ausgabenBildung: 1, ausgabenGesundheit: 1, ausgabenVerteidigung: 1, ausgabenSoziales: 1, genderPayGap: 3, erneuerbare: 2, energieabhaengigkeit: 2, nettozuwanderung: 3, asyl: 3, asylOffen: 3, lebenszufriedenheit: 3, kapitalNichtBoerse: 0, kapitalGesamt: 0, religion: 3, durchschnittsalter: 5, lebenserwartung: 5, gesundeJahre: 5, abhaengigkeit: 5, pensionsantrittsalter: 5, marsh: 5, erwerbsdauer: 5, pensionsausgaben: 5, ersatzquote: 5, altersarmut: 5, beschaeftigung5564: 5, sicherheitsgefuehl: 4, toetung: 4, koerperverletzung: 4, sexualdelikte: 4, raub: 4, einbruch: 4, gefaengnis: 4 };
// Kurze Erklärung je Indikator (wird auf der Detailseite gezeigt)
const ERKLAERUNG = {
  arbeitslosigkeit: "Wie viele von 100 Menschen, die arbeiten könnten und wollen, keine Arbeit haben, obwohl sie aktiv suchen. Gezählt werden Beschäftigte und Arbeitssuchende zusammen. Die Zahl folgt der internationalen ILO-Definition und ist damit in allen EU-Ländern gleich berechnet. Deshalb weicht sie von der AMS-Arbeitslosenquote ab, die auch Menschen in Schulungen und andere Gruppen anders zählt.",
  inflation: "Wie viel mehr man heute für einen typischen Einkauf bezahlt als vor einem Jahr. Gemessen wird der Preisanstieg im Vergleich zum gleichen Monat des Vorjahres, über Lebensmittel, Wohnen, Verkehr und Dienstleistungen hinweg (harmonisierter Verbraucherpreisindex). 3 % bedeutet: Was letztes Jahr 100 Euro gekostet hat, kostet jetzt im Schnitt 103 Euro.",
  wachstum: "Um wie viel Prozent die gesamte Wirtschaft (alles, was im Land an Waren und Dienstleistungen hergestellt wird, das BIP) im Vergleich zum gleichen Quartal des Vorjahres gewachsen ist. Preissteigerungen sind herausgerechnet, es zählt also die echte Mehrleistung. Ein Minus bedeutet, dass die Wirtschaft schrumpft.",
  schulden: "Wie hoch die Schulden des Staates (Bund, Länder, Gemeinden und Sozialversicherung) im Verhältnis zur Wirtschaftsleistung eines ganzen Jahres sind. 80 % heißt: Die Schulden entsprechen 80 % dessen, was das Land in einem Jahr erwirtschaftet. In den EU-Verträgen steht 60 % als Richtwert.",
  defizit: "Wie viel mehr der Staat in einem Jahr ausgibt als er einnimmt, im Verhältnis zur Wirtschaftsleistung. Ein Minus bedeutet ein Defizit, das mit neuen Schulden bezahlt wird. Ein Plus wäre ein Überschuss. Die EU-Regeln sehen höchstens 3 % Defizit vor.",
  geburtenrate: "Wie viele Kinder eine Frau im Lauf ihres Lebens im Schnitt bekäme, wenn die Geburtenhäufigkeit eines Jahres so bliebe (Gesamtfertilitätsrate). Etwa 2,1 Kinder wären nötig, damit die Bevölkerung ohne Zuwanderung gleich groß bleibt. Liegt der Wert darunter, wird sie ohne Zuwanderung kleiner.",
  staatsquote: "Wie groß der Anteil des Staates an der gesamten Wirtschaft ist: Alle Staatsausgaben (Verwaltung, Pensionen, Gesundheit, Bildung, Soziales, Zinsen) im Verhältnis zur Wirtschaftsleistung. 50 % heißt: Von jedem erwirtschafteten Euro gibt der Staat 50 Cent aus.",
  abgabenquote: "Wie viel von der Wirtschaftsleistung als Steuern und Sozialversicherungsbeiträge beim Staat landet. 43 % heißt: Von je 100 Euro, die im Land erwirtschaftet werden, gehen 43 Euro als Abgaben an Staat und Sozialversicherung. Gebühren für bestimmte Leistungen zählen nicht dazu.",
  beschaeftigung: "Wie viele von 100 Menschen zwischen 20 und 64 Jahren erwerbstätig sind. Teilzeit zählt wie Vollzeit. Die Quote sagt also nichts darüber, wie viele Stunden gearbeitet werden. Länder mit vielen Teilzeitjobs können eine hohe Quote haben, obwohl insgesamt weniger Stunden gearbeitet wird.",
  bevoelkerung: "Um wie viel Prozent die Einwohnerzahl im Vergleich zum Vorjahr (jeweils zum 1. Jänner) gewachsen oder geschrumpft ist. Das Wachstum entsteht aus Geburten, Sterbefällen und der Zuwanderung abzüglich der Abwanderung. Die Einwohnerzahl selbst steht darunter.",
  "wachstum-pro-kopf": "Wie viel die Wirtschaft pro Einwohner gewachsen ist, ohne Preissteigerungen. Das zeigt, ob jeder Einzelne im Durchschnitt mehr erwirtschaftet. Das ist ein anderes Bild als das Gesamtwachstum: Wächst die Wirtschaft um 1 %, die Bevölkerung aber um 1,5 %, ist es pro Kopf ein Rückgang.",
  lebenshaltung: "Wie teuer das Leben in einem Land im Vergleich zum EU-Durchschnitt ist. Der EU-Durchschnitt ist 100. Bei 120 sind die Preise für einen typischen Warenkorb um 20 % höher als im EU-Schnitt, bei 80 um 20 % niedriger. Der Wert zeigt das Preisniveau und nicht, wie schnell die Preise steigen. Das zeigt die Inflation.",
  strompreis: "Was ein normaler Haushalt (2.500 bis 5.000 kWh Verbrauch pro Jahr) inklusive Steuern und Abgaben für eine Kilowattstunde Strom bezahlt, in Cent. Die Werte kommen halbjährlich. Verglichen wird mit dem gleichen Halbjahr des Vorjahres, damit Jahreszeiten den Vergleich nicht verzerren.",
  "strompreis-industrie": "Was ein mittelgroßer Industriebetrieb (2 bis 20 Millionen kWh pro Jahr) ohne Mehrwertsteuer für eine Kilowattstunde Strom bezahlt, in Cent. Die Werte kommen halbjährlich. Verglichen wird mit dem gleichen Halbjahr des Vorjahres. Der Preis ist ein Kostenfaktor für die Unternehmen im Land.",
  immobilien: "Wie stark die Preise für Wohnungen und Häuser (neu und gebraucht) seit dem Amtsantritt der Regierung gestiegen oder gefallen sind. Eurostat misst das mit einem Preisindex, also der Veränderung und nicht dem Preis pro Quadratmeter. 10 % heißt: Eine Immobilie kostet im Schnitt 10 % mehr als zu Beginn.",
  einkommen: "Das mittlere Einkommen: Die eine Hälfte der Menschen im Land hat weniger, die andere mehr als diesen Betrag. Gemeint ist das Nettoeinkommen nach Steuern und Abgaben, einschließlich Pensionen und Sozialleistungen, je Person. Haushalte werden nach ihrer Größe gewichtet. Es ist kein reiner Lohn. Die Erhebung beschreibt das Einkommen des Vorjahres. Der Trend wird um die Inflation bereinigt: Das Einkommen muss stärker steigen als die Preise, damit er als besser gilt.",
  "wachstum-privat": "Wie stark die Wirtschaft ohne den Beitrag des Staates gewachsen wäre. Vom Wirtschaftswachstum wird abgezogen, was der Staat selbst durch seine Ausgaben für Verwaltung, Gesundheit und Bildung dazu beigetragen hat. Spart der Staat, steigt der Wert. Das ist eine eigene Berechnung auf Basis von Eurostat-Daten und keine amtliche Kennzahl.",
  benzin: "Was ein Liter Eurosuper 95 durchschnittlich an der Tankstelle kostet, inklusive Mineralölsteuer, CO2-Abgaben und Mehrwertsteuer, in Cent. Grundlage sind die wöchentlichen Preise des Ölbulletins der EU-Kommission, hier als Monatsdurchschnitt. Der Preis hängt vom Ölpreis und von den Steuern des jeweiligen Landes ab.",
  diesel: "Was ein Liter Diesel durchschnittlich an der Tankstelle kostet, inklusive Mineralölsteuer, CO2-Abgaben und Mehrwertsteuer, in Cent. Grundlage sind die wöchentlichen Preise des Ölbulletins der EU-Kommission, hier als Monatsdurchschnitt. Der Preis hängt vom Ölpreis und von den Steuern des jeweiligen Landes ab.",
  sicherheitsgefuehl: "Wie viele von 100 Menschen in einer Befragung (EU-SILC) angeben, dass es in ihrer Wohngegend Kriminalität, Gewalt oder Vandalismus gibt. Es ist ein Empfinden und sagt nichts darüber, wie viele Straftaten tatsächlich passieren. Es hängt zum Beispiel davon ab, ob jemand in der Stadt oder auf dem Land lebt.",
  toetung: "Wie viele vorsätzliche Tötungen (Mord, Totschlag) die Polizei pro 100.000 Einwohner und Jahr erfasst hat. Tötungsdelikte lassen sich zwischen Ländern am besten vergleichen, weil sie kaum unbemerkt bleiben. Bei kleinen Ländern können einzelne Fälle den Wert stark verändern.",
  raub: "Wie viele Raubdelikte (Wegnahme von Sachen mit Gewalt oder Drohung) die Polizei pro 100.000 Einwohner und Jahr erfasst hat. Gezählt werden angezeigte Fälle. Wie leicht jemand Anzeige erstattet, ist in den Ländern unterschiedlich.",
  einbruch: "Wie viele Einbrüche in Privatwohnungen die Polizei pro 100.000 Einwohner und Jahr erfasst hat. Gezählt werden angezeigte Fälle.",
  kapitalmarkt: "Wie viel die börsennotierten Unternehmen eines Landes an der Börse zusammen wert sind (Börsenwert aller ihrer Aktien), geteilt durch die Zahl der Einwohner. Gezählt werden Unternehmen mit Sitz im Land, einschließlich Banken und Versicherungen. Die Zahl sagt nicht, wie viel davon den Einwohnern gehört, denn viele Aktien halten Anleger aus dem Ausland.",
  kapitalNichtBoerse: "Wie viel Unternehmen wert sind, die nicht an der Börse gehandelt werden (zum Beispiel Familienunternehmen, GmbHs und Firmen im Staatsbesitz), geteilt durch die Zahl der Einwohner. Weil diese Firmen keinen Börsenkurs haben, schätzen die Statistikämter den Wert nach eigenen Verfahren. Der Vergleich zwischen den Ländern ist deshalb weniger genau als beim Börsenwert.",
  kapitalGesamt: "Der Wert aller Kapitalgesellschaften eines Landes, börsennotiert und nicht börsennotiert zusammen, geteilt durch die Zahl der Einwohner. Der nicht börsennotierte Teil beruht auf Schätzungen der Statistikämter und ist weniger genau als der Börsenwert.",
  armut: "Wie viele von 100 Menschen weniger als 60 % des mittleren Einkommens im eigenen Land zur Verfügung haben und deshalb als armutsgefährdet gelten (nach Sozialleistungen). Das misst vor allem Ungleichheit im Land, nicht den absoluten Lebensstandard: In einem reichen Land mit großen Einkommensunterschieden kann die Quote hoch sein.",
  ausgrenzung: "Wie viele von 100 Menschen von Armut oder sozialer Ausgrenzung bedroht sind. Dazu zählt, wer armutsgefährdet ist, wer sich grundlegende Dinge nicht leisten kann (zum Beispiel eine Woche Urlaub oder unerwartete Ausgaben) oder wer in einem Haushalt mit sehr wenig Erwerbsarbeit lebt. Die Zahl ist weiter gefasst als die Armutsgefährdung allein.",
  wohnkosten: "Wie viele von 100 Menschen in Haushalten leben, die mehr als 40 % ihres verfügbaren Einkommens für Wohnen ausgeben (Miete oder Kredit, Betriebskosten, Heizung und Strom). Der Wert zeigt, wie stark das Wohnen das Haushaltsbudget belastet.",
  mieten: "Wie stark die tatsächlich gezahlten Mieten im Vergleich zum gleichen Monat des Vorjahres gestiegen sind (harmonisierter Verbraucherpreisindex, Position tatsächliche Mieten). Das ist die Preisentwicklung bestehender Mietverhältnisse, nicht die Höhe der Miete.",
  jugendarbeitslosigkeit: "Wie viele von 100 jungen Menschen unter 25, die arbeiten könnten und wollen, keine Arbeit haben, obwohl sie aktiv suchen. Schüler und Studierende, die nicht arbeiten wollen, zählen nicht mit. Die Quote schwankt stärker als die allgemeine Arbeitslosenquote, weil die Gruppe kleiner ist.",
  neet: "Wie viele von 100 jungen Menschen zwischen 15 und 29 weder in einem Job noch in Schule, Lehre oder Studium sind (NEET steht für „not in employment, education or training“). Das zeigt, wie viele junge Menschen am Übergang in den Beruf nicht ankommen.",
  forschung: "Wie viel Geld in Forschung und Entwicklung fließt, in Prozent der gesamten Wirtschaftsleistung. Gezählt werden Ausgaben von Unternehmen, Hochschulen und Staat zusammen. Der EU-Zielwert liegt bei 3 % des BIP.",
  ausgabenBildung: "Wie viel der Staat für Bildung ausgibt (Schulen, Hochschulen, Kindergärten, Verwaltung), in Prozent der Wirtschaftsleistung. Bund, Länder und Gemeinden sind zusammengezählt. Die Zahl sagt nichts über die Qualität.",
  ausgabenGesundheit: "Wie viel der Staat für Gesundheit ausgibt (Spitäler, Ärzte, Medikamente, Prävention), in Prozent der Wirtschaftsleistung. Ausgaben der Sozialversicherung zählen dazu, private Zahlungen der Patienten nicht.",
  ausgabenVerteidigung: "Wie viel der Staat für Verteidigung ausgibt (Militär, Rüstung, militärische Hilfe), in Prozent der Wirtschaftsleistung. Das ist nach der internationalen Staatsausgaben-Gliederung (COFOG) berechnet und kann von NATO-Angaben abweichen.",
  ausgabenSoziales: "Wie viel der Staat für soziale Sicherung ausgibt (Pensionen, Arbeitslosengeld, Familienleistungen, Pflege), in Prozent der Wirtschaftsleistung. Das ist meist der größte Ausgabenblock des Staates.",
  genderPayGap: "Um wie viel Prozent die Stundenverdienste von Frauen im Schnitt unter denen der Männer liegen (unbereinigt). Der Wert vergleicht alle Frauen mit allen Männern und berücksichtigt nicht, dass Frauen häufiger in Teilzeit und in schlechter bezahlten Branchen arbeiten.",
  erneuerbare: "Wie groß der Anteil von Strom, Wärme und Treibstoff aus erneuerbaren Quellen (Wasser, Wind, Sonne, Biomasse) am gesamten Energieverbrauch ist. Wasserkraft ist in Österreich ein großer Teil davon.",
  energieabhaengigkeit: "Wie viel Prozent des Energiebedarfs eines Landes aus dem Ausland eingeführt werden müssen. Ein hoher Wert heißt: Das Land hängt stark von Importen ab. Ein Wert über 100 % ist möglich, wenn Vorräte aufgebaut werden.",
  nettozuwanderung: "Wie viele Menschen pro 1.000 Einwohner mehr zu- als wegziehen (Zuzüge minus Wegzüge, einschließlich statistischer Korrekturen). Ein negativer Wert heißt: Es ziehen mehr Menschen weg, als zuziehen.",
  asyl: "Wie viele Menschen pro 100.000 Einwohner in einem Jahr erstmals oder wiederholt einen Antrag auf Asyl stellen. Das zählt Anträge, nicht Entscheidungen und nicht, wie viele Menschen tatsächlich bleiben.",
  lebenszufriedenheit: "Wie zufrieden Menschen ab 16 mit ihrem Leben insgesamt sind, auf einer Skala von 0 (gar nicht zufrieden) bis 10 (völlig zufrieden), laut Befragung. Die Erhebung findet nur alle paar Jahre statt.",
  asylOffen: "Wie viele Menschen pro 100.000 Einwohner am Monatsende auf eine Entscheidung über ihren Asylantrag im Land warten. Gezählt wird, wo der Antrag gestellt wurde. Wer schon Schutz erhalten hat oder abgelehnt wurde, zählt nicht mehr dazu.",
  gefaengnis: "Wie viel Prozent der vorhandenen Haftplätze belegt sind. Über 100 % heißt, dass mehr Menschen inhaftiert sind, als Plätze vorhanden sind (Überbelegung). Das zeigt, wie ausgelastet das Strafvollzugssystem ist.",
  koerperverletzung: "Wie viele Fälle schwerer Körperverletzung die Polizei pro 100.000 Einwohner und Jahr erfasst hat. Der Vergleich zwischen den Ländern ist schwierig: Die Zählweise und die Bereitschaft, Anzeige zu erstatten, unterscheiden sich stark. Die Zahl zeigt also nur bedingt, wo mehr Gewalt passiert.",
  sexualdelikte: "Wie viele Fälle sexueller Gewalt (zum Beispiel Vergewaltigung und sexuelle Übergriffe) die Polizei pro 100.000 Einwohner und Jahr erfasst hat. Definitionen, Zählweise und Anzeigebereitschaft unterscheiden sich zwischen den Ländern stark, und viele Fälle werden nie angezeigt. Ein hoher Wert kann daher auch bedeuten, dass mehr angezeigt wird.",
  durchschnittseinkommen: "Das durchschnittliche Nettoeinkommen je Person nach Steuern und Abgaben, einschließlich Pensionen und Sozialleistungen. Sehr hohe Einkommen ziehen den Durchschnitt nach oben, deshalb liegt er über dem mittleren Einkommen (Median). Der Trend wird um die Inflation bereinigt: Das Einkommen muss stärker steigen als die Preise, damit er als besser gilt.",
  kaufkraft: "Das mittlere Nettoeinkommen, umgerechnet in Kaufkraftstandards. Ein Euro ist nicht überall gleich viel wert: In einem teuren Land kauft man dafür weniger als in einem günstigen. Kaufkraftstandards rechnen das heraus und zeigen, was man sich mit dem Einkommen tatsächlich leisten kann, gemessen an einem EU-weiten Warenkorb. Der Trend wird um die EU-Inflation bereinigt.",
  terror: "Wie viele Terroranschläge (vollendete, gescheiterte und von den Behörden vereitelte) ein Land pro Jahr an Europol gemeldet hat, umgerechnet auf 10 Millionen Einwohner. Die Zahlen stammen aus dem jährlichen EU-Lagebericht zum Terrorismus (TE-SAT) und werden von Hand eingetragen. Die Zahlen sind klein, einzelne Anschläge verändern den Rang stark.",
  rating: "Wie zuverlässig ein Staat nach Einschätzung der Ratingagenturen S&P, Moody's und Fitch seine Schulden zurückzahlt. AAA ist die beste Note. Je besser die Note, desto niedriger sind die Zinsen, die das Land für seine Schulden zahlen muss. Der Rang beruht auf dem Durchschnitt der drei Agenturen.",
  erwerbsdauer: "Wie viele Jahre ein heute 15-Jähriger nach der Statistik im Lauf seines Lebens voraussichtlich erwerbstätig ist (Eurostat: Dauer des Erwerbslebens). Das Ergebnis hängt vom Pensionsantritt, vom Berufseinstieg und von Unterbrechungen ab. Es ist nicht das gesetzliche Pensionsantrittsalter.",
  pensionsausgaben: "Wie viel Prozent der Wirtschaftsleistung ein Land für Pensionen und ähnliche Alters- und Hinterbliebenenleistungen ausgibt. 15 % heißt: Von jedem erwirtschafteten Euro gehen 15 Cent in Pensionen. Der Wert hängt davon ab, wie alt die Bevölkerung ist und wie hoch die Pensionen sind.",
  ersatzquote: "Wie hoch die Pensionen der 65- bis 74-Jährigen im Vergleich zu den Einkommen der 50- bis 59-Jährigen sind (Ersatzquote). 60 % heißt: Die Pension beträgt im Schnitt 60 % des Einkommens, das man vor der Pension hatte, vor Steuern.",
  altersarmut: "Wie viele von 100 Menschen ab 65 weniger als 60 % des mittleren Einkommens im Land zur Verfügung haben und deshalb nach EU-Definition armutsgefährdet sind. Das ist ein Maß dafür, wie weit Pensionen am unteren Rand vom Rest des Landes entfernt sind, nicht für absolute Armut.",
  industrie: "Wie stark die Industrie (Produktion, Bergbau, Energie- und Wasserversorgung, ohne Bau) real gewachsen ist, verglichen mit dem gleichen Quartal des Vorjahres. Die Inflation ist schon herausgerechnet. Die Industrie ist ein Teil der gesamten Wirtschaft und reagiert stärker auf Konjunktur und Exporte.",
  teilzeit: "Wie viele von 100 Erwerbstätigen zwischen 20 und 64 Jahren in Teilzeit arbeiten. Teilzeit heißt hier weniger als die übliche volle Wochenarbeitszeit. Eine hohe Quote kann freiwillig gewählt sein, etwa wegen Kinderbetreuung oder Work-Life-Balance, oder aus Mangel an Vollzeitstellen. Die Statistik unterscheidet das nicht, deshalb gibt es keine Wertung, nur den Vergleich.",
  beschaeftigung5564: "Wie viele von 100 Menschen zwischen 55 und 64 Jahren erwerbstätig sind. Der Wert zeigt, wie viele Ältere bis zur Pension im Arbeitsleben bleiben. Das hat mit dem Pensionssystem und der Gesundheit am Arbeitsplatz zu tun.",
  pensionsantrittsalter: "Ab welchem Alter man in dem jeweiligen Land nach dem Gesetz die reguläre Alterspension bekommt, hier für Männer. Wer früher in Pension geht, muss oft mit Abschlägen rechnen. Das tatsächliche Antrittsalter liegt häufig darunter. In Österreich gilt für Frauen derzeit ein niedrigeres Alter, das schrittweise steigt.",
  marsh: "Wie gut ein Pensionssystem langfristig bezahlbar ist, laut dem Marsh CFA Institute Global Pension Index (Teilindex Nachhaltigkeit). Berücksichtigt werden unter anderem angespartes Pensionsvermögen, Altersstruktur, Staatsschulden und die Erwerbsquote Älterer. Der Index ist eine Bewertung einer Studie, keine amtliche Statistik, und enthält nur 14 der 27 EU-Länder.",
  durchschnittsalter: "Das Alter, das die Bevölkerung in zwei gleich große Hälften teilt (Medianalter, zum 1. Jänner): Die eine Hälfte der Menschen ist jünger, die andere älter. Ein höherer Wert heißt: Die Bevölkerung ist im Schnitt älter.",
  lebenserwartung: "Wie alt ein heute geborenes Kind im Durchschnitt wird, wenn die Sterberaten des Jahres sein Leben lang gelten würden. Frauen und Männer werden zusammen betrachtet. Frauen leben statistisch länger als Männer, das hebt den gemeinsamen Wert.",
  gesundeJahre: "Wie viele Jahre ein neugeborenes Kind im Durchschnitt ohne gesundheitliche Einschränkungen im Alltag leben wird (Healthy Life Years). Beruht auf der Selbsteinschätzung in einer EU-Befragung. Das sind meist deutlich weniger Jahre als die Lebenserwartung insgesamt.",
  abhaengigkeit: "Wie viele Menschen ab 65 auf 100 Menschen zwischen 15 und 64 Jahren kommen. 30 heißt: Auf 100 Menschen im erwerbsfähigen Alter kommen 30 über 65. Je höher der Wert, desto mehr Ältere müssen von den Jüngeren mitgetragen werden, etwa über das Pensionssystem.",
  aktionaersquote: "Wie viele von 100 Haushalten börsennotierte Aktien besitzen (direkt gehalten, ohne Fonds), laut der Haushaltsbefragung der EZB und der Notenbanken. Die Erhebung gibt es nur alle paar Jahre und nicht für alle EU-Länder. Der Wert zeigt, wie verbreitet das Investieren in Aktien ist.",
  religion: "Wie sich Schülerinnen und Schüler (Wiener Pflichtschulen) und die Bevölkerung Österreichs auf Religionen und Konfessionen verteilen. Die Religion wird in Österreich nur an den Schulen laufend erfasst. Bundesweit gibt es nur eine Befragung von 2021. Die Zahlen sind eine reine Übersicht.",
  insolvenzenEU: "Wie stark sich die Zahl der Unternehmensinsolvenzen seit 2021 verändert hat (Index, 2021 = 100). Bei 200 gibt es doppelt so viele Insolvenzen wie 2021. Der Index zeigt nur die Entwicklung, keine absoluten Zahlen, denn die sind wegen unterschiedlicher Insolvenzrechte nicht vergleichbar. 2021 war wegen der Corona-Hilfen ein ungewöhnlich insolvenzarmes Jahr.",
  insolvenzen: "Wie viele Unternehmen in Österreich pro Jahr insolvent werden (eröffnete Verfahren und mangels Vermögen abgewiesene Anträge), laut KSV1870. Das gilt nur für Österreich, ein Vergleich mit anderen Ländern ist hier nicht möglich."
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
  { id: "industrie", name: "Industriewachstum", takt: "quartal", dataset: "namq_10_a10",
    filter: "nace_r2=B-E&na_item=B1G&unit=CLV_PCH_SM&s_adj=SCA", // Bruttowertschöpfung Industrie (inkl. Energie, ohne Bau), preisbereinigt, Veränderung zum Vorjahresquartal
    alternativen: [ { dataset: "namq_10_a10", filter: "nace_r2=B-E&na_item=B1G&unit=CLV_PCH_SM&s_adj=SCA" }, { dataset: "namq_10_a10", filter: "nace_r2=B-E&na_item=B1G&unit=CLV_PCH_SM&s_adj=SA" }, { dataset: "namq_10_a10", filter: "nace_r2=B-E&na_item=B1G&unit=CLV_PCH_SM" } ],
    einheit: "% Veränderung der Wertschöpfung der Industrie zum Vorjahresquartal (preis-, saison- und kalenderbereinigt)",
    rangText: "Rang 1 = höchstes Industriewachstum", maxAlter: 8, minLaender: 20,
    hinweis: "Gemessen wird die Wertschöpfung von Bergbau, Industrie, Energie- und Wasserversorgung (ohne Bau). In kleinen Ländern können einzelne Großbetriebe die Zahl stark bewegen.",
    typ: "hoch", schwelle: 0.3, mock: { base: -1.2, step: 0.4 } },
  { id: "schulden", name: "Schuldenstand", takt: "quartal", dataset: "gov_10q_ggdebt", // Quartalsdaten sind aktueller als die Jahresdaten (gov_10dd_edpt1)
    filter: "unit=PC_GDP&sector=S13&na_item=GD", // Maastricht-Schuldenstand des Staates
    einheit: "% des BIP, Staat insgesamt, Stand am Quartalsende", rangText: "Rang 1 = niedrigster Schuldenstand",
    typ: "niedrig", schwelle: 0.5, schwelleFix: true, mock: { base: 40, step: 5 } },
  { id: "defizit", name: "Budgetsaldo", takt: "jahr", dataset: "gov_10dd_edpt1",
    filter: "unit=PC_GDP&sector=S13&na_item=B9", // Finanzierungssaldo des Staates, negativ = Defizit
    einheit: "% des BIP, Staat insgesamt (negativ = Defizit)",
    rangText: "Rang 1 = bester Budgetsaldo (höchster Überschuss bzw. kleinstes Defizit)",
    typ: "hoch", schwelle: 0.5, schwelleFix: true, mock: { base: -6, step: 0.6 } },
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
    hinweis: "Der Trend wird neutral als höher oder niedriger angezeigt. Andere sehen einen hohen Staatsanteil als Vorteil, etwa für soziale Absicherung, Gesundheit und Bildung. Die Staatsquote zeigt, welcher Anteil der Wirtschaftsleistung (BIP) über den Staat ausgegeben wird.",
    maxAlter: 26, typ: "niedrig", schwelle: 0.5, schwelleFix: true, mock: { base: 42, step: 1.6 } }
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
    hinweis: "Der Trend wird neutral als höher oder niedriger angezeigt. Andere sehen hohe Abgaben als Voraussetzung für Leistungen wie Pensionen, Gesundheit und Bildung. Die Quote zeigt, welcher Anteil der Wirtschaftsleistung (BIP) als Steuern und Sozialbeiträge an den Staat geht.",
    maxAlter: 26, typ: "niedrig", schwelle: 0.5, schwelleFix: true, mock: { base: 33, step: 1.1, ohneCH: true } }
  ,{ id: "beschaeftigung", name: "Beschäftigungsquote", takt: "quartal", dataset: "lfsi_emp_q",
    filter: "indic_em=EMP_LFS&sex=T&age=Y20-64&unit=PC_POP&s_adj=SA", // Erwerbstätige 20 bis 64 Jahre in % der Bevölkerung, saisonbereinigt
    alternativen: [
      { dataset: "lfsi_emp_q", filter: "indic_em=EMP_LFS&sex=T&age=Y20-64&unit=PC_POP&s_adj=SA" },
      { dataset: "lfsi_emp_a", filter: "indic_em=EMP_LFS&sex=T&age=Y20-64&unit=PC_POP" } ],
    einheit: "% der 20- bis 64-Jährigen, saisonbereinigt", rangText: "Rang 1 = höchste Beschäftigungsquote",
    maxAlter: 12, typ: "hoch", schwelle: 0.3, schwelleFix: true, mock: { base: 66, step: 1.2 } }
  ,{ id: "bevoelkerung", name: "Bevölkerungswachstum", takt: "jahr", dataset: "demo_gind",
    filter: "indic_de=JAN", // Einwohner am 1. Jänner (demo_gind ist aktueller als demo_pjan); daraus wird das Wachstum zum Vorjahr berechnet
    alternativen: [ { dataset: "demo_pjan", filter: "age=TOTAL&sex=T&unit=NR" } ],
    wachstum: true, dez: 2, suffix: " %", diffEinheit: "Prozentpunkte",
    einheit: "% Veränderung der Einwohnerzahl (1. Jänner gegenüber 1. Jänner des Vorjahres)", rangText: "Rang 1 = stärkstes Bevölkerungswachstum",
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
    ausblenden2025: true, // Fenster verschwindet, solange Eurostat keine Daten ab 2025 hat (ein Nachtrag fehlt)
    umstritten: true, // Wertung: höheres Preisniveau = schlechter (auch im Trend), aber mit Hinweis
    hinweis: "Ein höheres Preisniveau gilt hier als schlechter (höhere Lebenshaltungskosten). Es geht aber oft mit hohen Einkommen einher, und ein Anstieg gegenüber dem EU-Schnitt kann auch Aufholen bedeuten. Der Index vergleicht die Preise zwischen den Ländern, nicht die Teuerung über die Zeit (dafür siehe Inflation).",
    typ: "niedrig", schwelle: 1, schwelleFix: true, mock: { base: 70, step: 3.5 } }
  ,{ id: "immobilien", name: "Immobilienpreise", takt: "quartal", dataset: "prc_hpi_q",
    filter: "unit=I15_Q&purchase=TOTAL", // Preisindex für Wohnimmobilien (gekaufte Wohnungen und Häuser, neu und gebraucht), 2015 = 100
    alternativen: [ { dataset: "prc_hpi_q", filter: "unit=I15_Q&purchase=DW_EXST" } ],
    seitRegierung: true, // gezeigt wird die Preisänderung seit dem Amtsantritt der Regierung (Basis: Quartal des Amtsantritts = 0 %)
    keinStart: true, // der Rang beim Amtsantritt wäre für alle gleich, deshalb kein Vergleich "seit Regierungsantritt"
    maxAlter: 8, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte",
    einheit: "% Preisänderung von Wohnimmobilien seit dem Quartal des Regierungsantritts (Preisindex, ohne Inflationsbereinigung)",
    rangText: "Rang 1 = geringster Preisanstieg seit Regierungsantritt",
    typ: "neutral", rangNiedrigZuerst: true, umstritten: true,
    hinweis: "Steigende Immobilienpreise nützen Eigentümern und belasten Käufer, Mieter und Familien, die erst kaufen wollen. Gezeigt wird die Veränderung des Preisindex der Wohnimmobilien (Wohnungen und Häuser, neu und gebraucht) gegenüber dem Quartal des Regierungsantritts. Das ist die Preisentwicklung, nicht der Preis pro Quadratmeter, und die Preise sind nicht um die Inflation bereinigt.",
    schwelle: 0.5, mock: { base: 100, step: 3 } }
  ,{ id: "einkommen", name: "Medianeinkommen", takt: "jahr", dataset: "ilc_di03", real: true,
    filter: "statinfo=MED_EI&age=TOTAL&sex=T&unit=EUR", // mittleres (Median-)Nettoeinkommen je Person, nach Haushaltsgröße gewichtet (EU-SILC)
    alternativen: [
      { dataset: "ilc_di03", filter: "statinfo=MED_EI&age=Y_GE16&sex=T&unit=EUR" },
      { dataset: "ilc_di03", filter: "statinfo=MED_EI&age=Y_GE18&sex=T&unit=EUR" } ],
    maxAlter: 26, dez: 0, suffix: " €", diffEinheit: "Euro",
    einheit: "Euro pro Jahr: Median des verfügbaren Nettoeinkommens je Person (nach Haushaltsgröße gewichtet), EU-SILC-Erhebung",
    kaufkraft: { filter: "statinfo=MED_EI&age=TOTAL&sex=T&unit=PPS" }, // zusätzlich in Kaufkraft (PPS), damit Preisunterschiede zwischen den Ländern herausgerechnet sind
    rangText: "Rang 1 = höchstes Medianeinkommen (in Euro)", typ: "hoch", schwelle: 250, schwelleFix: true, mock: { base: 8000, step: 2400 } }
  ,{ id: "durchschnittseinkommen", name: "Durchschnittseinkommen", takt: "jahr", dataset: "ilc_di03", real: true,
    filter: "statinfo=MEAN_EI&age=TOTAL&sex=T&unit=EUR", // durchschnittliches Nettoeinkommen je Person (EU-SILC), nach Haushaltsgröße gewichtet
    alternativen: [ { dataset: "ilc_di03", filter: "statinfo=MEAN_EI&age=Y_GE16&sex=T&unit=EUR" } ],
    maxAlter: 26, dez: 0, suffix: " €", diffEinheit: "Euro",
    einheit: "Euro pro Jahr: Durchschnitt des verfügbaren Nettoeinkommens je Person (nach Haushaltsgröße gewichtet), EU-SILC-Erhebung",
    rangText: "Rang 1 = höchstes Durchschnittseinkommen (in Euro)", typ: "hoch", schwelle: 300, schwelleFix: true,
    hinweis: "Der Durchschnitt liegt meist über dem Median, weil wenige sehr hohe Einkommen ihn nach oben ziehen. Je größer der Abstand zum Median, desto ungleicher sind die Einkommen verteilt. Beide Werte stehen als eigene Indikatoren bereit.",
    mock: { base: 9000, step: 2500 } }
  ,{ id: "kaufkraft", name: "Kaufkraft", takt: "jahr", dataset: "ilc_di03", real: "EU",
    filter: "statinfo=MED_EI&age=TOTAL&sex=T&unit=PPS", // Median-Nettoeinkommen in Kaufkraftstandards (PPS)
    alternativen: [ { dataset: "ilc_di03", filter: "statinfo=MED_EI&age=Y_GE16&sex=T&unit=PPS" } ],
    maxAlter: 26, dez: 0, suffix: " PPS", diffEinheit: "PPS",
    einheit: "PPS (Kaufkraftstandard) pro Jahr: Median des verfügbaren Nettoeinkommens je Person, bereinigt um die Preisunterschiede zwischen den Ländern",
    rangText: "Rang 1 = höchste Kaufkraft", typ: "hoch", schwelle: 250, schwelleFix: true, mock: { base: 8500, step: 2000 } }
  ,{ id: "wachstum-privat", name: "Wachstum ohne Staat", takt: "quartal", dataset: "namq_10_gdp",
    filter: "unit=CLV_PCH_SM&s_adj=SCA&na_item=B1GQ", // Platzhalter (im Test), echte Berechnung: berechnePrivat()
    privat: true, // BIP-Wachstum minus Beitrag des Staatskonsums (Anteil am BIP x Wachstum des Staatskonsums)
    einheit: "Prozentpunkte: BIP-Wachstum zum Vorjahresquartal minus Wachstumsbeitrag des Staatskonsums (preis- und saisonbereinigt)", suffix: " %", diffEinheit: "Prozentpunkte",
    rangText: "Rang 1 = höchstes Wachstum ohne den Beitrag des Staates", maxAlter: 8,
    umstritten: true,
    hinweis: "Die Rechnung ist eine Näherung: Der Beitrag des Staates wird über die Kosten gemessen (Gehälter und Käufe des Staates), nicht über den Nutzen von Schulen, Spitälern oder Polizei. Staatsinvestitionen sind in den Quartalsdaten nicht getrennt ausgewiesen und fehlen deshalb. Pensionen und andere Sozialleistungen zählen nicht als Staatsausgaben im BIP, sie wirken erst über den Konsum der Empfänger.",
    typ: "hoch", schwelle: 0.3, mock: { base: -0.6, step: 0.3 } }
  ,{ id: "benzin", name: "Benzinpreis", takt: "monat", dataset: "une_rt_m", filter: "x=y", // Platzhalter, echte Quelle: Ölbulletin (berechneOel)
    oel: { produkt: "euro95" }, // Euro-super 95
    einheit: "Cent pro Liter Euro-super 95 an der Tankstelle, inklusive Steuern, Monatsdurchschnitt", suffix: " ct", diffEinheit: "Cent pro Liter", dez: 1,
    rangText: "Rang 1 = niedrigster Benzinpreis", maxAlter: 3,
    hinweis: "Quelle ist das Weekly Oil Bulletin der EU-Kommission (Wochenpreise, hier als Monatsdurchschnitt). Ein großer Teil des Preises sind Steuern und Abgaben, die sich zwischen den Ländern stark unterscheiden. Der laufende Monat ist ein Durchschnitt der bisher gemeldeten Wochen.",
    typ: "niedrig", schwelle: 2, mock: { base: 130, step: 4 } }
  ,{ id: "diesel", name: "Dieselpreis", takt: "monat", dataset: "une_rt_m", filter: "x=y",
    oel: { produkt: "diesel" },
    einheit: "Cent pro Liter Diesel an der Tankstelle, inklusive Steuern, Monatsdurchschnitt", suffix: " ct", diffEinheit: "Cent pro Liter", dez: 1,
    rangText: "Rang 1 = niedrigster Dieselpreis", maxAlter: 3,
    hinweis: "Quelle ist das Weekly Oil Bulletin der EU-Kommission (Wochenpreise, hier als Monatsdurchschnitt). Ein großer Teil des Preises sind Steuern und Abgaben, die sich zwischen den Ländern stark unterscheiden. Der laufende Monat ist ein Durchschnitt der bisher gemeldeten Wochen.",
    typ: "niedrig", schwelle: 2, mock: { base: 135, step: 4 } }
  ,{ id: "sicherheitsgefuehl", name: "Wahrgenommene Kriminalität im Wohnumfeld", takt: "jahr", dataset: "sdg_16_20",
    filter: "hhcomp=TOTAL&rskpovth=TOTAL&unit=PC", alternativen: [ { dataset: "sdg_16_20", filter: "hhcomp=TOTAL&rskpovth=TOTAL&unit=PC" } ],
    maxAlter: 48, rueckblick: 3, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 20,
    einheit: "Anteil der Bevölkerung, der Kriminalität, Gewalt oder Vandalismus in der Wohngegend meldet (Befragung EU-SILC)", rangText: "Rang 1 = geringster Anteil, der Kriminalität in der Gegend meldet",
    hinweis: "Subjektives Empfinden aus einer Haushaltsbefragung, kein Maß für tatsächliche Straftaten. Das Sicherheitsgefühl hängt auch von Medien, Stadtanteil und Erwartungen ab.",
    typ: "niedrig", umstritten: true, schwelle: 1, mock: { base: 12, step: 1 } }
  ,{ id: "insolvenzenEU", name: "Insolvenzen im EU-Vergleich", takt: "quartal", dataset: "sts_rb_q",
    filter: "indic_bt=BKRT&nace_r2=B-S_X_O&s_adj=NSA&unit=I21", // Insolvenzanmeldungen, Index 2021 = 100
    alternativen: [
      { dataset: "sts_rb_q", filter: "indic_bt=BKRT&nace_r2=B-S_X_O&s_adj=SCA&unit=I21" },
      { dataset: "sts_rb_q", filter: "indic_bt=BKRT&nace_r2=B-S_X_O_S94&s_adj=NSA&unit=I21" },
      { dataset: "sts_rb_q", filter: "indic_bt=BKRT&nace_r2=B-S_X_O_S94&s_adj=SCA&unit=I21" },
      { dataset: "sts_rb_q", filter: "indic_bt=BKRT&nace_r2=B-S_X_O&s_adj=NSA&unit=I15" } ],
    maxAlter: 12, minLaender: 12, dez: 0, suffix: "", diffEinheit: "Indexpunkte",
    einheit: "Index der Insolvenzanmeldungen, 2021 = 100", rangText: "Rang 1 = niedrigster Index (geringster Anstieg der Insolvenzen seit 2021)",
    hinweis: "Zählweise und Insolvenzrecht unterscheiden sich je Land, deshalb vergleicht dieser Index nur die Entwicklung gegenüber dem jeweils eigenen Land im Jahr 2021. 2021 war wegen Corona-Hilfen und Aussetzungen ein ungewöhnlich insolvenzarmes Jahr, der Anstieg danach ist daher teils ein Aufholeffekt.",
    typ: "niedrig", umstritten: true, schwelle: 5, mock: { base: 110, step: 6 } }
  ,{ id: "erwerbsdauer", name: "Dauer des Erwerbslebens", takt: "jahr", dataset: "lfsi_exi_a",
    filter: "sex=T", alternativen: [ { dataset: "lfsi_dwl_a", filter: "sex=T" } ],
    maxAlter: 26, dez: 1, suffix: " Jahre", diffEinheit: "Jahre", minLaender: 20,
    einheit: "Erwartete Jahre im Erwerbsleben (Erwerbstätige und Arbeitssuchende), in Jahren", rangText: "Rang 1 = längstes Erwerbsleben",
    hinweis: "Eurostat veröffentlicht das durchschnittliche Pensionsantrittsalter derzeit nicht mehr, deshalb zeigt diese Seite die Dauer des Erwerbslebens als Ersatz. Ob ein längeres Erwerbsleben besser ist, ist politisch umstritten: Es entlastet die Pensionskassen, bedeutet aber mehr Arbeitsjahre für den Einzelnen.",
    typ: "neutral", trendNeutral: true, umstritten: true, schwelle: 0.1, schwelleFix: true, mock: { base: 61, step: 0.4 } }
  ,{ id: "pensionsausgaben", name: "Pensionsausgaben", takt: "jahr", dataset: "spr_exp_pens",
    filter: "unit=PC_GDP&spdepb=TOTAL&spdepm=TOTAL", alternativen: [ { dataset: "spr_exp_pens", filter: "unit=PC_GDP&spdepb=TOTAL&spdepm=TOTAL" } ],
    maxAlter: 36, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte des BIP", minLaender: 20,
    einheit: "Pensionsausgaben in % des BIP", rangText: "Rang 1 = niedrigste Pensionsausgaben",
    hinweis: "Gewertet wird: Niedrigere Ausgaben gelten als besser, weil sie den Staatshaushalt weniger belasten. Die Ausgaben hängen aber vom Altersaufbau der Bevölkerung ab, und hohe Ausgaben bedeuten nicht automatisch hohe Pensionen.",
    typ: "niedrig", schwelle: 0.2, mock: { base: 11, step: 0.4 } }
  ,{ id: "ersatzquote", name: "Pensionshöhe (Ersatzquote)", takt: "jahr", dataset: "ilc_pnp3", faktor: 100,
    filter: "sex=T", alternativen: [ { dataset: "ilc_pnp3", filter: "sex=T&indic_il=AGG_RR" }, { dataset: "ilc_pnp3", filter: "sex=T&unit=PC" } ],
    maxAlter: 26, dez: 0, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 20,
    einheit: "Pensionen (65 bis 74 Jahre) in % der Einkommen der 50- bis 59-Jährigen", rangText: "Rang 1 = höchste Ersatzquote",
    hinweis: "Eine höhere Ersatzquote bedeutet höhere Pensionen im Verhältnis zum früheren Einkommen, kostet das System aber mehr.",
    typ: "hoch", umstritten: true, schwelle: 1, schwelleFix: true, mock: { base: 55, step: 3 } }
  ,{ id: "altersarmut", name: "Armutsgefährdung ab 65", takt: "jahr", dataset: "ilc_li02",
    filter: "statinfo=MED_EI&age=Y_GE65&sex=T&unit=PC&rskpovth=B_60", alternativen: [ { dataset: "ilc_li02", filter: "statinfo=MEAN_EI&age=Y_GE65&sex=T&unit=PC&rskpovth=B_60" } ],
    maxAlter: 26, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 20,
    einheit: "Anteil der Menschen ab 65 mit weniger als 60 % des mittleren Einkommens", rangText: "Rang 1 = niedrigste Armutsgefährdung ab 65",
    hinweis: "Die Armutsgefährdungsschwelle liegt bei 60 % des mittleren Einkommens im jeweiligen Land. Das misst die Ungleichheit im Land, nicht den absoluten Lebensstandard.",
    typ: "niedrig", schwelle: 0.3, mock: { base: 15, step: 1.2 } }
  ,{ id: "teilzeit", name: "Teilzeitquote", takt: "jahr", dataset: "lfsa_eppgan",
    filter: "sex=T&age=Y20-64&unit=PC&citizen=TOTAL", alternativen: [ { dataset: "lfsa_eppgan", filter: "sex=T&age=Y20-64&unit=PC&citizen=TOTAL" }, { dataset: "lfsa_eppgan", filter: "sex=T&age=Y20-64&citizen=TOTAL" }, { dataset: "lfsi_pt_a", filter: "indic_em=PT_PC_EMP&sex=T&age=Y20-64&unit=PC_EMP" } ],
    maxAlter: 26, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 24,
    einheit: "Teilzeitbeschäftigte 20 bis 64 Jahre in % aller Erwerbstätigen dieser Altersgruppe", rangText: "Rang 1 = höchste Teilzeitquote",
    hinweis: "Eine hohe Teilzeitquote kann freiwillig gewählt sein (etwa wegen Kinderbetreuung oder Work-Life-Balance) oder an fehlenden Vollzeitstellen liegen. Die Statistik unterscheidet das nicht.",
    typ: "neutral", trendNeutral: true, schwelle: 0.5, mock: { base: 28, step: 0.6 } }
  ,{ id: "beschaeftigung5564", name: "Beschäftigung der 55- bis 64-Jährigen", takt: "jahr", dataset: "lfsi_emp_a",
    filter: "indic_em=EMP_LFS&sex=T&age=Y55-64&unit=PC_POP", alternativen: [ { dataset: "lfsa_ergan", filter: "sex=T&age=Y55-64&unit=PC" }, { dataset: "lfsa_ergan", filter: "sex=T&age=Y55-64" } ],
    maxAlter: 26, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 20,
    einheit: "Erwerbstätige 55 bis 64 Jahre in % der Bevölkerung dieser Altersgruppe", rangText: "Rang 1 = höchste Beschäftigungsquote Älterer",
    typ: "hoch", schwelle: 0.5, schwelleFix: true, mock: { base: 55, step: 1.5 } }
  ,{ id: "durchschnittsalter", name: "Alter der Bevölkerung", takt: "jahr", dataset: "demo_pjanind",
    filter: "indic_de=MEDAGEPOP", alternativen: [ { dataset: "demo_pjanind", filter: "indic_de=MEDAGEPOP" }, { dataset: "demo_pjanind", filter: "indic_de=MEANAGEPOP" }, { dataset: "demo_pjanind", filter: "indic_de=MEDAGE" } ],
    maxAlter: 26, dez: 1, suffix: " Jahre", diffEinheit: "Jahre", minLaender: 20,
    einheit: "Medianalter der Bevölkerung zum 1. Jänner (die Hälfte ist jünger, die Hälfte älter)", rangText: "Rang 1 = höchstes Alter",
    hinweis: "Es ist das Medianalter, nicht der Durchschnitt: Die eine Hälfte der Bevölkerung ist jünger, die andere älter. Eine ältere Bevölkerung belastet das Pensionssystem, bedeutet aber auch Wohlstand und gute Gesundheitsversorgung.",
    typ: "neutral", trendNeutral: true, umstritten: true, schwelle: 0.1, schwelleFix: true, mock: { base: 43, step: 0.4 } }
  ,{ id: "lebenserwartung", name: "Lebenserwartung", takt: "jahr", dataset: "demo_mlexpec",
    filter: "sex=T&age=Y_LT1&unit=YR", alternativen: [ { dataset: "demo_mlexpec", filter: "sex=T&age=Y_LT1" }, { dataset: "demo_mlexpec", filter: "sex=T&age=Y0" } ],
    maxAlter: 26, dez: 1, suffix: " Jahre", diffEinheit: "Jahre", minLaender: 20,
    einheit: "Lebenserwartung bei der Geburt in Jahren, Frauen und Männer zusammen", rangText: "Rang 1 = höchste Lebenserwartung",
    typ: "hoch", schwelle: 0.1, schwelleFix: true, mock: { base: 79, step: 0.5 } }
  ,{ id: "gesundeJahre", name: "Gesunde Lebensjahre", takt: "jahr", dataset: "hlth_hlye",
    filter: "sex=T&unit=YR&hlth_hle=HLY_Y0", alternativen: [ { dataset: "hlth_hlye", filter: "sex=T&unit=YR&hlth_hle=HLY_Y0" } ],
    maxAlter: 26, dez: 1, suffix: " Jahre", diffEinheit: "Jahre", minLaender: 20,
    einheit: "Gesunde Lebensjahre bei der Geburt (Jahre ohne gesundheitliche Einschränkung), Frauen und Männer zusammen", rangText: "Rang 1 = meiste gesunde Lebensjahre",
    hinweis: "Beruht auf der Selbsteinschätzung in der EU-Haushaltsbefragung (EU-SILC), nicht auf ärztlichen Untersuchungen. Die Fragestellung wird in den Ländern unterschiedlich verstanden.",
    typ: "hoch", schwelle: 0.3, schwelleFix: true, mock: { base: 62, step: 1.2 } }
  ,{ id: "abhaengigkeit", name: "Altersabhängigkeitsquote", takt: "jahr", dataset: "demo_pjanind",
    filter: "indic_de=OLDDEP1", alternativen: [ { dataset: "demo_pjanind", filter: "indic_de=OLDDEP1" }, { dataset: "demo_pjanind", filter: "indic_de=OLDDEP" }, { dataset: "demo_pjanind", filter: "indic_de=OLDDEP2" } ],
    maxAlter: 26, dez: 1, suffix: "", diffEinheit: "Personen je 100", minLaender: 20,
    einheit: "Menschen ab 65 je 100 Menschen im Alter von 15 bis 64 Jahren", rangText: "Rang 1 = niedrigste Quote",
    hinweis: "Zeigt die Altersstruktur. Eine höhere Quote bedeutet mehr Ältere je Erwerbsfähigem und damit mehr Druck auf das Pensionssystem. Sie hängt auch von der Zuwanderung und der Beschäftigung ab.",
    typ: "niedrig", schwelle: 0.5, mock: { base: 28, step: 1.5 } }
  ,{ id: "toetung", name: "Tötungsdelikte", takt: "jahr", dataset: "crim_off_cat",
    filter: "iccs=ICCS0101&unit=P_HTHAB", // vorsätzliche Tötung, von der Polizei erfasst, pro 100.000 Einwohner
    alternativen: [ { dataset: "crim_off_cat", filter: "iccs=ICCS0101&unit=P_HTHAB" } ],
    maxAlter: 26, dez: 2, suffix: "", diffEinheit: "Fälle pro 100.000 Einwohner", minLaender: 20,
    einheit: "Von der Polizei erfasste Fälle vorsätzlicher Tötung pro 100.000 Einwohner", rangText: "Rang 1 = wenigste Tötungsdelikte pro Einwohner",
    typ: "niedrig", schwelle: 0.05, mock: { base: 0.5, step: 0.2 } }
  ,{ id: "raub", name: "Raubdelikte", takt: "jahr", dataset: "crim_off_cat",
    filter: "iccs=ICCS0401&unit=P_HTHAB", // Raub, von der Polizei erfasst, pro 100.000 Einwohner
    maxAlter: 26, dez: 1, suffix: "", diffEinheit: "Fälle pro 100.000 Einwohner", minLaender: 20,
    einheit: "Von der Polizei erfasste Raubdelikte pro 100.000 Einwohner", rangText: "Rang 1 = wenigste Raubdelikte pro Einwohner",
    hinweis: "Die Zahlen beruhen auf Polizeistatistiken. Wie Delikte gezählt und erfasst werden, unterscheidet sich zwischen den Ländern, ein hoher Wert kann auch an besserer Erfassung oder höherer Anzeigebereitschaft liegen.",
    typ: "niedrig", schwelle: 2, mock: { base: 15, step: 6 } }
  ,{ id: "einbruch", name: "Wohnungseinbrüche", takt: "jahr", dataset: "crim_off_cat",
    filter: "iccs=ICCS050211&unit=P_HTHAB", // Einbruch in Privatwohnungen, pro 100.000 Einwohner
    alternativen: [ { dataset: "crim_off_cat", filter: "iccs=ICCS05012&unit=P_HTHAB" }, { dataset: "crim_off_cat", filter: "iccs=ICCS0501&unit=P_HTHAB" } ],
    maxAlter: 26, dez: 0, suffix: "", diffEinheit: "Fälle pro 100.000 Einwohner", minLaender: 20,
    einheit: "Von der Polizei erfasste Einbrüche pro 100.000 Einwohner", rangText: "Rang 1 = wenigste Einbrüche pro Einwohner",
    hinweis: "Die Zahlen beruhen auf Polizeistatistiken. Wie Delikte gezählt und erfasst werden, unterscheidet sich zwischen den Ländern, ein hoher Wert kann auch an besserer Erfassung oder höherer Anzeigebereitschaft liegen.",
    typ: "niedrig", schwelle: 15, mock: { base: 100, step: 60 } }
  ,{ id: "kapitalmarkt", name: "Börsenwert pro Einwohner", takt: "jahr", dataset: "nasa_10_f_bs",
    filter: "unit=MIO_EUR&co_nco=NCO&finpos=LIAB&sector=S11&na_item=F511", // Platzhalter (im Test); echte Berechnung: berechneProKopf()
    proKopf: { zaehler: ["unit=MIO_EUR&co_nco=NCO&finpos=LIAB&sector=S11&na_item=F511", "unit=MIO_EUR&co_nco=NCO&finpos=LIAB&sector=S12&na_item=F511"],
      nenner: [ { dataset: "demo_gind", filter: "indic_de=AVG" }, { dataset: "demo_pjan", filter: "age=TOTAL&sex=T&unit=NR" } ], plausibel: [2000, 60000], minLaender: 20 },
    maxAlter: 30, dez: 0, suffix: " €", diffEinheit: "Euro", minLaender: 20, typ: "hoch", umstritten: true, schwelle: 500,
    einheit: "Euro pro Einwohner (Börsenwert der börsennotierten Aktien von Unternehmen im Land, Stand Jahresende)", rangText: "Rang 1 = höchster Börsenwert pro Einwohner",
    hinweis: "Gewertet wird: Ein höherer Wert gilt als besser, weil er für mehr Kapital in heimischen Unternehmen steht. Das ist umstritten, denn ein hoher Wert sagt nichts über Wohlstand oder Verteilung. Der Börsenwert schwankt stark mit den Aktienkursen. In kleinen Ländern mit wenigen, aber großen und international tätigen Konzernen ist der Wert pro Einwohner oft besonders hoch, ohne dass das etwas über den Wohlstand der Einwohner aussagt.",
    mock: { base: 8000, step: 3000 } }
  ,{ id: "kapitalNichtBoerse", name: "Nicht börsennotierte Unternehmen pro Einwohner", takt: "jahr", dataset: "nasa_10_f_bs",
    filter: "unit=MIO_EUR&co_nco=NCO&finpos=LIAB&sector=S11&na_item=F512", // Platzhalter (im Test); echte Berechnung: berechneProKopf()
    proKopf: { zaehler: ["unit=MIO_EUR&co_nco=NCO&finpos=LIAB&sector=S11&na_item=F512", "unit=MIO_EUR&co_nco=NCO&finpos=LIAB&sector=S12&na_item=F512"],
      nenner: [ { dataset: "demo_gind", filter: "indic_de=AVG" }, { dataset: "demo_pjan", filter: "age=TOTAL&sex=T&unit=NR" } ], plausibel: [1000, 1000000], minLaender: 15 },
    maxAlter: 30, dez: 0, suffix: " €", diffEinheit: "Euro", minLaender: 15, typ: "hoch", umstritten: true, schwelle: 500,
    einheit: "Euro pro Einwohner (geschätzter Wert nicht börsennotierter Kapitalgesellschaften im Land, Stand Jahresende)", rangText: "Rang 1 = höchster Unternehmenswert pro Einwohner",
    hinweis: "Gewertet wird: Ein höherer Wert gilt als besser, weil er für mehr Kapital in heimischen Unternehmen steht. Das ist umstritten, denn ein hoher Wert sagt nichts über Wohlstand oder Verteilung. Der Wert nicht börsennotierter Unternehmen wird von den Statistikämtern geschätzt, weil es keinen Börsenkurs gibt. Die Verfahren unterscheiden sich zwischen den Ländern. Der Vergleich ist daher weniger genau als beim Börsenwert. Luxemburg liegt weit vorn, weil dort viele internationale Holdinggesellschaften ihren Sitz haben. Das sagt wenig über die heimische Wirtschaft.",
    mock: { base: 12000, step: 4000 } }
  ,{ id: "kapitalGesamt", name: "Unternehmenswert gesamt pro Einwohner", takt: "jahr", dataset: "nasa_10_f_bs",
    filter: "unit=MIO_EUR&co_nco=NCO&finpos=LIAB&sector=S11&na_item=F511", // Platzhalter (im Test); echte Berechnung: berechneProKopf()
    proKopf: { zaehler: ["unit=MIO_EUR&co_nco=NCO&finpos=LIAB&sector=S11&na_item=F511", "unit=MIO_EUR&co_nco=NCO&finpos=LIAB&sector=S12&na_item=F511", "unit=MIO_EUR&co_nco=NCO&finpos=LIAB&sector=S11&na_item=F512", "unit=MIO_EUR&co_nco=NCO&finpos=LIAB&sector=S12&na_item=F512"],
      nenner: [ { dataset: "demo_gind", filter: "indic_de=AVG" }, { dataset: "demo_pjan", filter: "age=TOTAL&sex=T&unit=NR" } ], plausibel: [2000, 1500000], minLaender: 15 },
    maxAlter: 30, dez: 0, suffix: " €", diffEinheit: "Euro", minLaender: 15, typ: "hoch", umstritten: true, schwelle: 1000,
    einheit: "Euro pro Einwohner (börsennotierte und nicht börsennotierte Kapitalgesellschaften im Land, Stand Jahresende)", rangText: "Rang 1 = höchster Unternehmenswert pro Einwohner",
    hinweis: "Gewertet wird: Ein höherer Wert gilt als besser, weil er für mehr Kapital in heimischen Unternehmen steht. Das ist umstritten, denn ein hoher Wert sagt nichts über Wohlstand oder Verteilung. Der nicht börsennotierte Teil wird von den Statistikämtern geschätzt. In kleinen Ländern mit wenigen großen, international tätigen Konzernen ist der Wert pro Einwohner oft besonders hoch, ohne dass das etwas über den Wohlstand der Einwohner aussagt. Luxemburg liegt weit vorn, weil dort viele internationale Holdinggesellschaften ihren Sitz haben.",
    mock: { base: 20000, step: 6000 } }
  ,{ id: "armut", name: "Armutsgefährdung", takt: "jahr", dataset: "ilc_li02",
    filter: "statinfo=MED_EI&age=TOTAL&sex=T&unit=PC&rskpovth=B_60",
    alternativen: [ { dataset: "ilc_li02", filter: "statinfo=MEAN_EI&age=TOTAL&sex=T&unit=PC&rskpovth=B_60" }, { dataset: "ilc_li02", filter: "indic_il=LI_R_MD60&age=TOTAL&sex=T&unit=PC" } ],
    maxAlter: 26, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 20,
    einheit: "Anteil der Menschen mit weniger als 60 % des mittleren Einkommens (nach Sozialleistungen)", rangText: "Rang 1 = niedrigste Armutsgefährdung",
    hinweis: "Die Armutsgefährdungsschwelle liegt bei 60 % des mittleren Einkommens im jeweiligen Land. Das misst die Ungleichheit im Land, nicht den absoluten Lebensstandard.",
    ausblenden2025: true,
    typ: "niedrig", schwelle: 0.3, mock: { base: 10, step: 1 } }
  ,{ id: "ausgrenzung", name: "Armut oder soziale Ausgrenzung", takt: "jahr", dataset: "ilc_peps01n",
    filter: "age=TOTAL&sex=T&unit=PC",
    alternativen: [ { dataset: "ilc_peps01n", filter: "age=TOTAL&sex=T" }, { dataset: "ilc_peps01", filter: "age=TOTAL&sex=T&unit=PC" } ],
    maxAlter: 26, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 20,
    einheit: "Anteil der Menschen, die von Armut oder sozialer Ausgrenzung bedroht sind (AROPE)", rangText: "Rang 1 = niedrigster Anteil",
    ausblenden2025: true,
    typ: "niedrig", schwelle: 0.5, mock: { base: 10, step: 1 } }
  ,{ id: "wohnkosten", name: "Wohnkostenbelastung", takt: "jahr", dataset: "ilc_lvho07a",
    filter: "age=TOTAL&sex=T&unit=PC&rskpovth=TOTAL",
    alternativen: [ { dataset: "ilc_lvho07a", filter: "age=TOTAL&sex=T&rskpovth=TOTAL" } ],
    maxAlter: 26, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 20,
    einheit: "Anteil der Menschen in Haushalten, die mehr als 40 % ihres Einkommens fürs Wohnen ausgeben", rangText: "Rang 1 = geringste Wohnkostenbelastung",
    ausblenden2025: true,
    typ: "niedrig", schwelle: 0.5, mock: { base: 10, step: 1 } }
  ,{ id: "mieten", name: "Mieten", takt: "monat", dataset: "prc_hicp_minr",
    filter: "unit=RCH_A&coicop18=CP041",
    alternativen: [ { dataset: "prc_hicp_minr", filter: "unit=RCH_A&coicop18=CP0411" }, { dataset: "prc_hicp_manr", filter: "unit=RCH_A&coicop=CP041" } ],
    maxAlter: 8, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 24,
    einheit: "% Veränderung der tatsächlich gezahlten Mieten zum Vorjahresmonat", rangText: "Rang 1 = geringster Mietanstieg",
    typ: "niedrig", schwelle: 0.5, mock: { base: 2, step: 0.4 } }
  ,{ id: "jugendarbeitslosigkeit", name: "Jugendarbeitslosigkeit", takt: "monat", dataset: "une_rt_m",
    filter: "s_adj=SA&age=Y_LT25&unit=PC_ACT&sex=T",
    alternativen: [ { dataset: "une_rt_m", filter: "s_adj=SA&age=Y_LT25&sex=T&unit=PC_ACT" } ],
    maxAlter: 8, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 20,
    einheit: "% der Erwerbspersonen unter 25, saisonbereinigt", rangText: "Rang 1 = niedrigste Jugendarbeitslosigkeit",
    hinweis: "Die Quote misst nur junge Menschen, die arbeiten wollen. Wer studiert oder zur Schule geht, zählt nicht mit. In kleinen Ländern schwankt sie stärker.",
    typ: "niedrig", schwelle: 0.5, mock: { base: 8, step: 1.5 } }
  ,{ id: "neet", name: "Junge Menschen ohne Job und Ausbildung", takt: "jahr", dataset: "edat_lfse_20",
    filter: "age=Y15-29&sex=T&unit=PC&wstatus=NEMP",
    alternativen: [ { dataset: "edat_lfse_20", filter: "age=Y15-29&sex=T&wstatus=NEMP" } ],
    maxAlter: 26, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 20,
    einheit: "Anteil der 15- bis 29-Jährigen, die weder erwerbstätig sind noch in Ausbildung stehen", rangText: "Rang 1 = geringster Anteil",
    ausblenden2025: true,
    typ: "niedrig", schwelle: 0.5, mock: { base: 10, step: 1 } }
  ,{ id: "forschung", name: "Forschung und Entwicklung", takt: "jahr", dataset: "rd_e_gerdtot",
    filter: "sectperf=TOTAL&unit=PC_GDP",
    alternativen: [ { dataset: "rd_e_gerdtot", filter: "unit=PC_GDP" }, { dataset: "rd_e_gerdtot", filter: "sectperf=TOTAL&unit=PC_GDP&freq=A" } ],
    maxAlter: 36, dez: 2, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 20,
    einheit: "Ausgaben für Forschung und Entwicklung in % des BIP", rangText: "Rang 1 = höchste Forschungsquote",
    ausblenden2025: true,
    typ: "hoch", schwelle: 0.1, mock: { base: 10, step: 1 } }
  ,{ id: "ausgabenBildung", name: "Staatsausgaben Bildung", takt: "jahr", dataset: "gov_10a_exp",
    filter: "unit=PC_GDP&sector=S13&cofog99=GF09&na_item=TE",
    alternativen: [ { dataset: "gov_10a_exp", filter: "unit=PC_GDP&cofog99=GF09&na_item=TE&sector=S13&freq=A" } ],
    maxAlter: 26, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 22,
    einheit: "Staatsausgaben für Bildung in % des BIP", rangText: "Rang 1 = höchste Ausgaben",
    hinweis: "Höhere Ausgaben heißen nicht automatisch bessere Leistungen. Ein Land kann mit geringeren Ausgaben mehr erreichen oder mit höheren weniger.",
    ausblenden2025: true,
    typ: "neutral", trendNeutral: true, schwelle: 0.1, mock: { base: 10, step: 1 } }
  ,{ id: "ausgabenGesundheit", name: "Staatsausgaben Gesundheit", takt: "jahr", dataset: "gov_10a_exp",
    filter: "unit=PC_GDP&sector=S13&cofog99=GF07&na_item=TE",
    alternativen: [ { dataset: "gov_10a_exp", filter: "unit=PC_GDP&cofog99=GF07&na_item=TE&sector=S13&freq=A" } ],
    maxAlter: 26, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 22,
    einheit: "Staatsausgaben für Gesundheit in % des BIP", rangText: "Rang 1 = höchste Ausgaben",
    hinweis: "Höhere Ausgaben heißen nicht automatisch bessere Leistungen. Ein Land kann mit geringeren Ausgaben mehr erreichen oder mit höheren weniger.",
    ausblenden2025: true,
    typ: "neutral", trendNeutral: true, schwelle: 0.1, mock: { base: 10, step: 1 } }
  ,{ id: "ausgabenVerteidigung", name: "Staatsausgaben Verteidigung", takt: "jahr", dataset: "gov_10a_exp",
    filter: "unit=PC_GDP&sector=S13&cofog99=GF02&na_item=TE",
    alternativen: [ { dataset: "gov_10a_exp", filter: "unit=PC_GDP&cofog99=GF02&na_item=TE&sector=S13&freq=A" } ],
    maxAlter: 26, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 22,
    einheit: "Staatsausgaben für Verteidigung in % des BIP", rangText: "Rang 1 = höchste Ausgaben",
    hinweis: "Höhere Ausgaben heißen nicht automatisch bessere Leistungen. Ein Land kann mit geringeren Ausgaben mehr erreichen oder mit höheren weniger.",
    ausblenden2025: true,
    typ: "neutral", trendNeutral: true, schwelle: 0.1, mock: { base: 10, step: 1 } }
  ,{ id: "ausgabenSoziales", name: "Staatsausgaben Soziale Sicherung", takt: "jahr", dataset: "gov_10a_exp",
    filter: "unit=PC_GDP&sector=S13&cofog99=GF10&na_item=TE",
    alternativen: [ { dataset: "gov_10a_exp", filter: "unit=PC_GDP&cofog99=GF10&na_item=TE&sector=S13&freq=A" } ],
    maxAlter: 26, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 22,
    einheit: "Staatsausgaben für soziale Sicherung in % des BIP", rangText: "Rang 1 = höchste Ausgaben",
    hinweis: "Höhere Ausgaben heißen nicht automatisch bessere Leistungen. Ein Land kann mit geringeren Ausgaben mehr erreichen oder mit höheren weniger.",
    ausblenden2025: true,
    typ: "neutral", trendNeutral: true, schwelle: 0.1, mock: { base: 10, step: 1 } }
  ,{ id: "genderPayGap", name: "Lohnunterschied Frauen und Männer", takt: "jahr", dataset: "earn_gr_gpgr2",
    filter: "nace_r2=B-S_X_O&unit=PC",
    alternativen: [ { dataset: "earn_gr_gpgr2", filter: "unit=PC" }, { dataset: "earn_gr_gpgr2", filter: "nace_r2=B-S_X_O" } ],
    maxAlter: 26, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 20,
    einheit: "% Unterschied im durchschnittlichen Stundenverdienst (unbereinigt), Frauen im Vergleich zu Männern", rangText: "Rang 1 = geringster Lohnunterschied",
    hinweis: "Der unbereinigte Wert vergleicht alle Frauen mit allen Männern. Er berücksichtigt nicht, dass Frauen häufiger in Teilzeit und in schlechter bezahlten Branchen arbeiten.",
    ausblenden2025: true,
    typ: "niedrig", schwelle: 0.5, mock: { base: 10, step: 1 } }
  ,{ id: "erneuerbare", name: "Erneuerbare Energie", takt: "jahr", dataset: "nrg_ind_ren",
    filter: "nrg_bal=REN&unit=PC",
    alternativen: [ { dataset: "nrg_ind_ren", filter: "nrg_bal=REN" }, { dataset: "nrg_ind_ren", filter: "nrg_bal=REN&unit=PC&freq=A" } ],
    maxAlter: 26, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 20,
    einheit: "Anteil erneuerbarer Quellen am gesamten Energieverbrauch in %", rangText: "Rang 1 = höchster Anteil erneuerbarer Energie",
    hinweis: "Ein hoher Anteil hängt auch von den natürlichen Gegebenheiten ab, etwa von Wasserkraft in den Alpen.",
    ausblenden2025: true,
    typ: "neutral", trendNeutral: true, schwelle: 0.5, mock: { base: 10, step: 1 } }
  ,{ id: "energieabhaengigkeit", name: "Energieabhängigkeit", takt: "jahr", dataset: "nrg_ind_id",
    filter: "siec=TOTAL&unit=PC",
    alternativen: [ { dataset: "nrg_ind_id", filter: "siec=TOTAL" }, { dataset: "nrg_ind_id", filter: "siec=TOTAL&unit=PC&freq=A" } ],
    maxAlter: 26, dez: 1, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 20,
    einheit: "% des Energiebedarfs, die aus dem Ausland importiert werden", rangText: "Rang 1 = höchste Importabhängigkeit",
    ausblenden2025: true,
    typ: "neutral", trendNeutral: true, schwelle: 1, mock: { base: 10, step: 1 } }
  ,{ id: "nettozuwanderung", name: "Nettozuwanderung", takt: "jahr", dataset: "demo_gind",
    filter: "indic_de=CNMIGRATRT",
    alternativen: [ { dataset: "demo_gind", filter: "indic_de=CNMIGRATRT&freq=A" }, { dataset: "demo_gind", filter: "indic_de=CNMIGRAT" } ],
    maxAlter: 18, dez: 1, suffix: "", diffEinheit: "je 1.000 Einwohner", minLaender: 20,
    einheit: "Zuzüge minus Wegzüge je 1.000 Einwohner (einschließlich statistischer Korrekturen)", rangText: "Rang 1 = niedrigste Nettozuwanderung",
    ausblenden2025: true,
    typ: "neutral", rangNiedrigZuerst: true, trendNeutral: true, schwelle: 0.5, mock: { base: 10, step: 1 } }
  ,{ id: "asyl", name: "Asylanträge", takt: "jahr", dataset: "migr_asyappctza",
    filter: "citizen=TOTAL&sex=T&age=TOTAL&applicant=TOTAL&unit=PER",
    maxAlter: 26, dez: 0, suffix: "", diffEinheit: "je 100.000 Einwohner", minLaender: 22,
    einheit: "Asylanträge je 100.000 Einwohner", rangText: "Rang 1 = wenigste Asylanträge je Einwohner",
    hinweis: "Gezählt werden Anträge, nicht Entscheidungen, und zwar in dem Land, in dem sie gestellt wurden. Ob ein Antrag bewilligt wird, zeigt diese Zahl nicht.",
    proKopf: { zaehler: ["citizen=TOTAL&sex=T&age=TOTAL&applicant=TOTAL&unit=PER"], nenner: [ { dataset: "demo_gind", filter: "indic_de=AVG" }, { dataset: "demo_pjan", filter: "age=TOTAL&sex=T&unit=NR" } ], faktor: 1e5, plausibel: [1, 8000], minLaender: 22 },
    ausblenden2025: true,
    typ: "neutral", rangNiedrigZuerst: true, trendNeutral: true, schwelle: 10, mock: { base: 10, step: 1 } }
  ,{ id: "asylOffen", name: "Laufende Asylverfahren", takt: "monat", dataset: "migr_asypenctzm",
    filter: "citizen=TOTAL&sex=T&age=TOTAL&unit=PER",
    proKopf: { zaehler: ["citizen=TOTAL&sex=T&age=TOTAL&unit=PER"], nenner: [ { dataset: "demo_gind", filter: "indic_de=AVG" }, { dataset: "demo_pjan", filter: "age=TOTAL&sex=T&unit=NR" } ], faktor: 1e5, plausibel: [1, 10000], minLaender: 22 },
    maxAlter: 8, dez: 0, suffix: "", diffEinheit: "je 100.000 Einwohner", minLaender: 22,
    einheit: "Personen mit laufendem Asylverfahren je 100.000 Einwohner (Stand Monatsende)", rangText: "Rang 1 = wenigste laufende Verfahren je Einwohner",
    hinweis: "Gezählt werden Personen, deren Asylantrag im jeweiligen Land noch nicht entschieden ist. Wer bereits Schutz erhalten hat oder abgelehnt wurde, zählt nicht mehr mit. Die Zahl zeigt also nicht, wie viele Schutzberechtigte im Land leben.",
    typ: "neutral", rangNiedrigZuerst: true, trendNeutral: true, schwelle: 5, mock: { base: 100, step: 10 } }
  ,{ id: "lebenszufriedenheit", name: "Lebenszufriedenheit", takt: "jahr", dataset: "ilc_pw01",
    filter: "age=Y_GE16&sex=T&isced11=TOTAL&unit=RTG",
    alternativen: [ { dataset: "ilc_pw01", filter: "age=Y_GE16&sex=T&isced11=TOTAL" }, { dataset: "ilc_pw01", filter: "age=Y_GE16&sex=T&unit=RTG" } ],
    maxAlter: 48, dez: 1, suffix: "", diffEinheit: "Punkte", minLaender: 20,
    einheit: "Durchschnitt auf einer Skala von 0 (gar nicht zufrieden) bis 10 (völlig zufrieden)", rangText: "Rang 1 = höchste Lebenszufriedenheit",
    hinweis: "Die Zahl stammt aus einer Befragung, die nur alle paar Jahre durchgeführt wird.",
    ausblenden2025: true,
    typ: "hoch", schwelle: 0.1, mock: { base: 10, step: 1 } }
  ,{ id: "gefaengnis", name: "Gefängnisauslastung", takt: "jahr", dataset: "crim_pris_cap",
    filter: "indic_cr=PRIS_ACT_CAP&unit=NR", // Platzhalter (im Test); echte Berechnung: Häftlinge geteilt durch offizielle Haftplätze
    verhaeltnis: { zaehler: "indic_cr=PRIS_ACT_CAP&unit=NR", nenner: "indic_cr=PRIS_OFF_CAP&unit=NR" },
    maxAlter: 26, dez: 0, suffix: " %", diffEinheit: "Prozentpunkte", minLaender: 15,
    einheit: "% der Haftplätze, die belegt sind (über 100 % = überbelegt)", rangText: "Rang 1 = geringste Auslastung",
    ausblenden2025: true, // Fenster verschwindet, solange weder Eurostat noch der Österreich-Nachtrag Daten ab 2025 hat
    typ: "niedrig", schwelle: 2, mock: { base: 70, step: 6 } }
  ,{ id: "koerperverletzung", name: "Schwere Körperverletzung", takt: "jahr", dataset: "crim_off_cat",
    filter: "iccs=ICCS02011&unit=P_HTHAB", // schwere Körperverletzung (Polizeistatistik), pro 100.000 Einwohner
    alternativen: [ { dataset: "crim_off_cat", filter: "iccs=ICCS0201&unit=P_HTHAB" }, { dataset: "crim_off_cat", filter: "iccs=ICCS020111&unit=P_HTHAB" } ],
    maxAlter: 26, dez: 0, suffix: "", diffEinheit: "Fälle pro 100.000 Einwohner", minLaender: 18,
    einheit: "Von der Polizei erfasste Fälle schwerer Körperverletzung pro 100.000 Einwohner", rangText: "Rang 1 = niedrigste Quote", rangNiedrigZuerst: true,
    hinweis: "Die Polizeizahlen messen auch mit, wie viel angezeigt wird und wo die Grenze zwischen leichter und schwerer Körperverletzung gezogen wird. Ein höherer Wert heißt nicht automatisch mehr Taten.",
    typ: "neutral", schwelle: 10, mock: { base: 40, step: 12 } }
  ,{ id: "sexualdelikte", name: "Sexualdelikte", takt: "jahr", dataset: "crim_off_cat",
    filter: "iccs=ICCS0301&unit=P_HTHAB", // sexuelle Gewalt (Vergewaltigung und sexuelle Übergriffe), pro 100.000 Einwohner
    alternativen: [ { dataset: "crim_off_cat", filter: "iccs=ICCS03&unit=P_HTHAB" }, { dataset: "crim_off_cat", filter: "iccs=ICCS03011&unit=P_HTHAB" } ],
    maxAlter: 26, dez: 0, suffix: "", diffEinheit: "Fälle pro 100.000 Einwohner", minLaender: 18,
    einheit: "Von der Polizei erfasste Sexualdelikte (sexuelle Gewalt) pro 100.000 Einwohner", rangText: "Rang 1 = niedrigste Quote", rangNiedrigZuerst: true,
    hinweis: "Die Länder definieren und zählen Sexualdelikte unterschiedlich (etwa pro Tat oder pro Opfer), und die Dunkelziffer ist hoch. Länder mit hoher Anzeigebereitschaft und weiter Definition haben oft höhere Werte. Ein höherer Wert heißt nicht automatisch mehr Taten.",
    typ: "neutral", schwelle: 5, mock: { base: 30, step: 14 } }
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

const SCHWELLE_ANTEIL = 0.03; // Trend gilt als besser/schlechter ab 3 % des EU-Durchschnitts
let DEZ = 1; // Dezimalstellen des aktuellen Indikators (Geburtenrate: 2)
const r1 = x => Math.round(x * 10 ** DEZ) / 10 ** DEZ;
const scoreOf = ind => v => ind.typ === "niedrig" || ind.rangNiedrigZuerst ? v : -v; // kleiner = besser; neutral: höchster Wert = Rang 1

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

function berechne(ind0, js) {
  const ind = { ...ind0 }; // Kopie: die Schwelle wird unten aus dem EU-Durchschnitt berechnet
  DEZ = ind.dez != null ? ind.dez : 1; MIN_LAENDER = ind.minLaender || 24; // manche Datensätze (z. B. Gefängnisse) haben weniger Länder
  const takt = ind.takt, cfg = TAKT[takt], data = parse(js), sc = scoreOf(ind);
  if (ind.faktor) for (const c in data) for (const t in data[c]) data[c][t] = data[c][t] * ind.faktor; // z. B. EUR/kWh in Cent/kWh
  const urt = (ds, dv) => (ind.typ === "neutral" || ind.trendNeutral)
    ? (dv > ind.schwelle ? "höher" : dv < -ind.schwelle ? "niedriger" : "unverändert")
    : (ds < -ind.schwelle ? "besser" : ds > ind.schwelle ? "schlechter" : "unverändert");
  const periods = [...new Set(Object.values(data).flatMap(o => Object.keys(o)))].sort((a, b) => toIdx(a, takt) - toIdx(b, takt));
  const count = t => Object.keys(NAMES).filter(c => data[c]?.[t] !== undefined).length;
  const latest = [...periods].reverse().find(t => count(t) >= MIN_LAENDER);
  if (!latest) throw new Error("Keine ausreichenden Daten gefunden");
  // Schwelle: SCHWELLE_ANTEIL des EU-Durchschnitts (mindestens eine Einheit der letzten angezeigten Stelle). Ohne EU-Wert oder mit schwelleFix gilt die feste Schwelle aus der Definition.
  const euRef = data.EU27_2020?.[latest] ?? (() => { const v = Object.keys(NAMES).map(c => data[c]?.[latest]).filter(x => x != null); return v.length >= MIN_LAENDER ? v.reduce((p, q) => p + q, 0) / v.length : null; })();
  ind.schwelleArt = "fest";
  if (ind.schwelle != null && !ind.schwelleFix && euRef != null && Math.abs(euRef) > 0) {
    ind.schwelleFestWert = ind.schwelle;
    ind.schwelle = Number(Math.max(10 ** -DEZ, SCHWELLE_ANTEIL * Math.abs(euRef)).toPrecision(2));
    ind.schwelleArt = "relativ";
  }
  const spaeter = periods.filter(t => toIdx(t, takt) > toIdx(latest, takt));
  if (spaeter.length) console.log(`   (${ind.name}: neuere Perioden ohne genug Länder: ${spaeter.map(t => t + "=" + count(t)).join(", ")})`);
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
    // Zweite Zeile: Entwicklung im Vergleich zum EU-Durchschnitt (gleiche Periode), unabhängig vom eigenen Trend
    const euAt = t => { const e = data.EU27_2020?.[t]; if (e != null) return e; const v = rankAt(data, t, sc).map(x => x.value).filter(x => x != null); return v.length >= MIN_LAENDER ? v.reduce((p, q) => p + q, 0) / v.length : null; };
    const e0 = euAt(startP), e1 = euAt(latest);
    let euDd = null, euUrteil = null;
    if (e0 != null && e1 != null) {
      euDd = e1 - e0;
      if (ind.typ !== "neutral" && !ind.trendNeutral) { const rel = ds - (sc(e1) - sc(e0)); euUrteil = rel < -ind.schwelle ? "besser" : rel > ind.schwelle ? "schlechter" : "unverändert"; }
    }
    seitStart = { t: startP, wert: meS.value, rang: meS.rank, n: rkS.length, schnitt: r1(a0), veraenderung: r1(dd),
      richtung: dd > ind.schwelle ? "steigend" : dd < -ind.schwelle ? "sinkend" : "stabil",
      urteil: urt(ds, dd), euVeraenderung: euDd != null ? r1(euDd) : null, euUrteil };
  }
  const rangVergleich = seitStart && ind.typ !== "neutral" ? [{ label: "seit Regierungsantritt", t: startP, rang: seitStart.rang, n: seitStart.n, regierung: true }] : [];
  // Gibt es bei Eurostat keinen EU-Gesamtwert (z. B. Kriminalität), nehmen wir den einfachen Mittelwert der EU-Länder
  const euMittel = t => { const v = rankAt(data, t, sc).map(x => x.value).filter(x => x != null); return v.length >= MIN_LAENDER ? Math.round(v.reduce((p, q) => p + q, 0) / v.length * 100) / 100 : null; };
  const verlauf = [];
  for (let i = cfg.verlaufN - 1; i >= 0; i--) { const t = shift(latest, -i, takt); verlauf.push({ t, at: data.AT?.[t] ?? null, eu: data.EU27_2020?.[t] ?? euMittel(t) }); }
  return {
    id: ind.id, name: ind.name, pfeilModus: "wert", typ: ind.typ, dez: DEZ, suffix: ind.suffix ?? " %", diffEinheit: ind.diffEinheit || "Prozentpunkte", hinweis: ind.hinweis || null, umstritten: !!ind.umstritten, trendNeutral: !!(ind.trendNeutral || ind.typ === "neutral"), schwelle: ind.schwelle ?? null, schwelleArt: ind.schwelleArt || "fest", datensatz: ind.dataset || null, zusatz: ladeZusatz(ind), takt, einheit: ind.einheit, rangText: ind.rangText,
    periode: latest, vorherPeriode: vorher, anzahlLaender: ranks.length, alter,
    warnung: alter > (ind.maxAlter ?? cfg.maxAlter) ? `Der letzte verfügbare Wert ist ${alter} Monate alt. Möglicherweise hat Eurostat den Datensatz umgestellt.` : null,
    oesterreich: { wert: me.value, rang: me.rank, wertVorher: meV?.value ?? null, rangVorher: meV?.rank ?? null,
      schnitt: r1(avgNow), schnittVorher: r1(avgPrev), veraenderung: r1(delta),
      richtung: delta > ind.schwelle ? "steigend" : delta < -ind.schwelle ? "sinkend" : "stabil",
      urteil: urt(dScore, delta) },
    eu: data.EU27_2020?.[latest] ?? euMittel(latest), euMittelwert: data.EU27_2020?.[latest] == null, beste: ranks[0], schlechteste: ranks[ranks.length - 1],
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
  const spalten = {}, produkt = ind.oel.produkt; // Spalten über die Kopfzeile finden (Länder mit eigener Währung haben eine zusätzliche Wechselkurs-Spalte)
  (rows[0] || []).forEach((v, i) => { const m = typeof v === "string" && /^([A-Z]{2,3})_price_with_tax_(euro95|diesel)$/.exec(v); if (m && m[2] === produkt) spalten[m[1] === "GR" ? "EL" : m[1] === "EU" ? "EU27_2020" : m[1]] = i; });
  if (Object.keys(spalten).length < 25) throw new Error(`Ölbulletin: nur ${Object.keys(spalten).length} Spalten für ${produkt} gefunden`);
  const sum = {}, anz = {};
  for (const r of rows.slice(3)) {
    if (!r || typeof r[0] !== "number") continue;
    const m = oelDatum(r[0]); if (m < TAKT.monat.seit) continue;
    for (const [g, c] of Object.entries(spalten)) {
      const v = r[c]; if (typeof v !== "number" || v < 300 || v > 4000) continue; // Plausibilität: 0,30 bis 4 Euro je Liter
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
  for (const g of ["MT", "DK", "AT", "SI"]) { const kk = komp[g]?.[r.periode]; if (kk) console.log(`   Wachstum ohne Staat ${g} ${r.periode}: BIP ${rd(kk.bip)} %, Anteil Staatskonsum ${rd(kk.anteil)} % des BIP, Staatskonsum real ${govG[g]?.[r.periode]} %, Beitrag ${rd(kk.staat)} PP`); }
  if (k) r.komponenten = { bip: rd(k.bip), staat: rd(k.staat), privat: rd(k.bip - k.staat), anteil: rd(k.anteil) };
  return r;
}

// Verhältnis zweier Zeitreihen desselben Datensatzes in Prozent (z. B. Häftlinge / Haftplätze)
async function berechneVerhaeltnis(ind) {
  const v = ind.verhaeltnis, hol = async f => { const rs = await fetch(`${BASE}${ind.dataset}?format=JSON&lang=EN&${f}&sinceTimePeriod=${TAKT[ind.takt].seit}`); if (!rs.ok) throw new Error("HTTP " + rs.status); return parse(await rs.json()); };
  const Z = await hol(v.zaehler), N = await hol(v.nenner), geos = Object.keys(Z).filter(g => N[g]), times = new Set(), val = {};
  for (const g of geos) { val[g] = {}; for (const t of Object.keys(Z[g])) if (N[g][t] > 0) { val[g][t] = Z[g][t] / N[g][t] * 100; times.add(t); } }
  const T = [...times].sort(), idx = arr => Object.fromEntries(arr.map((x, i) => [x, i]));
  return berechne(ind, { id: ["geo", "time"], size: [geos.length, T.length], dimension: { geo: { category: { index: idx(geos) } }, time: { category: { index: idx(T) } } }, value: geos.flatMap(g => T.map(t => val[g][t] ?? null)) });
}

// Wert je Einwohner: Summe mehrerer Eurostat-Reihen (Millionen Euro) geteilt durch die durchschnittliche Bevölkerung des Jahres
async function berechneProKopf(ind) {
  const p = ind.proKopf, seit = TAKT[ind.takt].seit;
  const hol = async (ds, f) => { const rs = await fetch(`${BASE}${ds}?format=JSON&lang=EN&${f}&sinceTimePeriod=${seit}`); if (!rs.ok) throw new Error(`${ds}: HTTP ${rs.status}`); return parse(await rs.json()); };
  const teile = []; for (const f of p.zaehler) teile.push(await hol(ind.dataset, f));
  let N = null, quelleN = null;
  for (const e of p.nenner) { try { N = await hol(e.dataset, e.filter); if (N.AT && Object.keys(N.AT).length) { quelleN = e.dataset; break; } } catch (err) { console.error(`   (Bevölkerung ${e.dataset}: ${err.message})`); } }
  if (!N) throw new Error("Keine Bevölkerungszahlen");
  const geos = Object.keys(teile[0]).filter(g => N[g] && teile.every(t => t[g])), times = new Set(), val = {};
  for (const g of geos) { val[g] = {}; for (const t of Object.keys(teile[0][g])) {
    // Monats- und Quartalswerte: Bevölkerung des Jahres, sonst die zuletzt bekannte
    const jahre = Object.keys(N[g]).filter(k => N[g][k] > 0).sort(), jt = t.slice(0, 4);
    const nn = N[g][t] > 0 ? N[g][t] : N[g][jt] > 0 ? N[g][jt] : N[g][jahre.filter(k => k <= jt).pop() || jahre[jahre.length - 1]];
    if (teile.some(x => x[g][t] == null) || !(nn > 0)) continue;
    val[g][t] = teile.reduce((sum, x) => sum + x[g][t], 0) * (p.faktor || 1e6) / nn; times.add(t); } }
  const T = [...times].sort(), idx = arr => Object.fromEntries(arr.map((x, i) => [x, i]));
  const js = { id: ["geo", "time"], size: [geos.length, T.length], dimension: { geo: { category: { index: idx(geos) } }, time: { category: { index: idx(T) } } }, value: geos.flatMap(g => T.map(t => val[g][t] ?? null)) };
  const r = berechne(ind, js), w = r.oesterreich && r.oesterreich.wert;
  console.error(`   Pro Kopf (Bevölkerung aus ${quelleN}): ${r.anzahlLaender} Länder, Periode ${r.periode}, AT ${Math.round(w)}, Spitze ${r.beste.code} ${Math.round(r.beste.value)}, letzte ${r.schlechteste.code} ${Math.round(r.schlechteste.value)}`);
  if (!(r.anzahlLaender >= (p.minLaender || 20) && w >= p.plausibel[0] && w <= p.plausibel[1])) throw new Error(`unplausibel (AT ${w}, ${r.anzahlLaender} Länder)`);
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
      console.error(`   ${d}: ` + Object.keys(cat.index).slice(0, 70).map(c => c + (labels[c] ? " (" + labels[c].slice(0, 40) + ")" : "")).join("; "));
    });
  } catch (e) { console.error("   Fehlersuche nicht möglich: " + e.message); }
}

// ===== Inflationsbereinigter Trend (Einkommen): Das Einkommen muss stärker steigen als die Preise =====
const DEFL = {};
async function holeDeflator(geo = "AT") {
  if (DEFL[geo]) return DEFL[geo];
  for (const f of ["unit=INX_A_AVG&coicop=CP00", "unit=INX_A_AVG&coicop18=TOTAL", "unit=INX_A_AVG&coicop=TOTAL"]) {
    try { const rs = await fetch(`${BASE}prc_hicp_aind?format=JSON&lang=EN&${f}&geo=${geo}&sinceTimePeriod=2018`); if (!rs.ok) throw new Error("HTTP " + rs.status);
      const A = parse(await rs.json())[geo]; if (A && Object.keys(A).length > 3) return (DEFL[geo] = A); } catch (e) { console.error(`   (Preisindex mit ${f} hat nicht funktioniert: ${e.message})`); }
  }
  throw new Error("Preisindex (prc_hicp_aind) nicht verfügbar");
}
async function realTrend(r, ind) {
  const D = await holeDeflator(ind.real === "EU" ? "EU27_2020" : "AT"), S = 0.5, v = {};
  r.verlauf.forEach(p => { if (p.at != null) v[p.t] = p.at; });
  const idx = t => D[String(+t - 1)]; // EU-SILC-Einkommen beziehen sich auf das Vorjahr der Erhebung
  const g = (a, b) => v[a] != null && v[b] != null && idx(a) && idx(b) ? { nom: (v[b] / v[a] - 1) * 100, infl: (idx(b) / idx(a) - 1) * 100, real: ((v[b] / v[a]) / (idx(b) / idx(a)) - 1) * 100 } : null;
  const rd = x => Math.round(x * 10) / 10, cl = x => x > S ? ["steigend", "besser"] : x < -S ? ["sinkend", "schlechter"] : ["stabil", "unverändert"];
  const y = g(r.vorherPeriode, r.periode); if (!y) throw new Error("Preisindex für den Vorjahresvergleich fehlt");
  const [ri, ur] = cl(y.real);
  Object.assign(r.oesterreich, { veraenderung: rd(y.real), richtung: ri, urteil: ur });
  r.diffEinheit = "% real";
  r.realText = `Inflationsbereinigt: Das Einkommen ist nominal um ${rd(y.nom)} % ${y.nom >= 0 ? "gestiegen" : "gesunken"}, ${ind.real === "EU" ? "die Verbraucherpreise im EU-Durchschnitt" : "die Verbraucherpreise"} sind im Einkommensjahr ${+r.periode - 1} um ${rd(y.infl)} % ${y.infl >= 0 ? "gestiegen" : "gesunken"}. Real ergibt das ${rd(y.real) > 0 ? "+" : ""}${rd(y.real)} %. Als besser gilt, wenn das Einkommen stärker steigt als die Preise.`;
  if (r.seitStart) { const z = g(r.seitStart.t, r.periode); if (z) { const [zi, zu] = cl(z.real); Object.assign(r.seitStart, { veraenderung: rd(z.real), richtung: zi, urteil: zu });
    // Vergleich mit dem EU-Schnitt (ebenfalls real, mit EU-Preisindex)
    try {
      const DE = await holeDeflator("EU27_2020"), ev = {}; r.verlauf.forEach(p => { if (p.eu != null) ev[p.t] = p.eu; });
      const a = r.seitStart.t, b = r.periode, ie = t => DE[String(+t - 1)];
      if (ev[a] != null && ev[b] != null && ie(a) && ie(b)) {
        const euReal = ((ev[b] / ev[a]) / (ie(b) / ie(a)) - 1) * 100, rel = z.real - euReal;
        r.seitStart.euVeraenderung = rd(euReal);
        r.seitStart.euUrteil = rel > S ? "besser" : rel < -S ? "schlechter" : "unverändert";
      }
    } catch (e) { console.error("   (EU-Vergleich seit Regierung nicht möglich: " + e.message + ")"); }
  } }
  return r;
}

// ===== Von Hand gepflegte Tabellen (handdaten.json): eine Ausgabe, kein Verlauf =====
function berechneHand(id, ind) {
  const raw = JSON.parse(fs.readFileSync("handdaten.json", "utf8")), d = raw.indikatoren[id];
  const codes = Object.keys(NAMES), idx = arr => Object.fromEntries(arr.map((x, i) => [x, i]));
  const jahre = [String(d.jahr - 1), String(d.jahr)]; // Vorjahr = gleiche Werte, damit die Rechnung läuft; der Trend wird danach ausgeblendet
  const js = { id: ["geo", "time"], size: [codes.length, 2], dimension: { geo: { category: { index: idx(codes) } }, time: { category: { index: idx(jahre) } } },
    value: codes.flatMap(c => jahre.map(() => d.werte[c] ?? null)) };
  const r = berechne(ind, js);
  r.laender.forEach(x => { if (d.zus?.[x.code]) x.zus = d.zus[x.code]; });
  Object.assign(r.oesterreich, { urteil: null, richtung: null, veraenderung: 0, rangVorher: null, wertVorher: null });
  r.rangVerlauf = []; r.rangVergleich = []; r.seitStart = null; r.verlauf = []; r.ohneTrend = true;
  r.kurzHinweis = ind.kurzHinweis || null; r.stand = raw.stand; r.quelle = d.quelle; r.quelleUrl = d.url; r.hinweisDaten = d.hinweis; r.schweiz = null; r.eu = null;
  return r;
}
const HAND_IND = {
  pensionsantrittsalter: { id: "pensionsantrittsalter", name: "Gesetzliches Pensionsantrittsalter", takt: "jahr", pfeilModus: "wert", dez: 1, suffix: " Jahre", diffEinheit: "Jahre",
    einheit: "Gesetzliches Regelpensionsalter der Männer in Jahren (Stand 2026)", rangText: "Rang 1 = höchstes Pensionsalter",
    hinweis: "Ob ein höheres Pensionsalter besser ist, ist umstritten: Es entlastet die Pensionskassen, bedeutet aber später in Pension zu gehen. In Österreich gilt für Frauen derzeit noch ein niedrigeres Alter, das bis 2033 schrittweise auf 65 steigt.",
    typ: "neutral", trendNeutral: true, umstritten: true, schwelle: 0.1, maxAlter: 26, minLaender: 20 },
  aktionaersquote: { id: "aktionaersquote", name: "Aktionärsquote", takt: "jahr", pfeilModus: "wert", dez: 1, suffix: " %", diffEinheit: "Prozentpunkte",
    einheit: "Anteil der Haushalte mit börsennotierten Aktien in % (Befragung, Welle 2023)", rangText: "Rang 1 = höchster Anteil (nur 22 EU-Länder)",
    typ: "neutral", trendNeutral: true, umstritten: true, schwelle: 0.5, maxAlter: 80, minLaender: 18, kurzHinweis: "Nur 22 von 27 EU-Ländern sind in der Erhebung. Der Rang gilt nur unter diesen 22." },
  marsh: { id: "marsh", name: "Finanzierbarkeit des Pensionssystems", takt: "jahr", pfeilModus: "wert", dez: 1, suffix: " Punkte", diffEinheit: "Punkte",
    einheit: "Teilindex Nachhaltigkeit des Marsh CFA Institute Global Pension Index (0 bis 100 Punkte)", rangText: "Rang 1 = beste Nachhaltigkeitsbewertung (nur 14 EU-Länder im Index)",
    hinweis: "Einschätzung einer privaten Studie, keine amtliche Statistik. Berücksichtigt unter anderem Pensionsvermögen, Altersstruktur, Staatsschulden und Erwerbsquote Älterer.",
    typ: "hoch", schwelle: 1, maxAlter: 26, minLaender: 12, kurzHinweis: "Nur 14 von 27 EU-Ländern sind im Index. Der Rang gilt nur unter diesen 14." }
};

function berechneReligion() {
  const raw = JSON.parse(fs.readFileSync("handdaten.json", "utf8")), d = raw.religion, [haupt, ...weitere] = d.bloecke;
  return { id: "religion", name: "Religionszugehörigkeit", art: "anteile", takt: "jahr", typ: "neutral", trendNeutral: true, ohneTrend: true, umstritten: true,
    einheit: "Anteil in %", periode: haupt.periode, stand: raw.stand, quelle: haupt.quelle, quelleUrl: haupt.url,
    oesterreich: { wert: haupt.anteile[0].wert, rang: null, urteil: null, richtung: null }, anteileTitel: haupt.titel, anteile: haupt.anteile, bloecke: d.bloecke };
}
// ===== Terroranschläge: von Hand gepflegt (terror.json, Quelle Europol TE-SAT), pro 10 Mio. Einwohner =====
function berechneTerror(result) {
  const raw = JSON.parse(fs.readFileSync("terror.json", "utf8")), jahre = Object.keys(raw.jahre).sort();
  const bev = result.find(x => x.id === "bevoelkerung"), pop = {};
  if (!bev || !bev.laender) throw new Error("Bevölkerungsdaten fehlen (für die Rechnung pro Einwohner)");
  bev.laender.forEach(x => { pop[x.code] = x.bestand; });
  const codes = Object.keys(NAMES), idx = arr => Object.fromEntries(arr.map((x, i) => [x, i]));
  const js = { id: ["geo", "time"], size: [codes.length, jahre.length], dimension: { geo: { category: { index: idx(codes) } }, time: { category: { index: idx(jahre) } } },
    value: codes.flatMap(c => jahre.map(y => pop[c] ? (raw.jahre[y][c] || 0) / pop[c] * 10 : null)) };
  const ind = TERROR_IND, r = berechne(ind, js), n = (c, y) => raw.jahre[y]?.[c] || 0;
  r.laender.forEach(x => { x.zus = n(x.code, r.periode) + (n(x.code, r.periode) === 1 ? " Anschlag" : " Anschläge"); });
  r.oesterreich.anzahl = n("AT", r.periode); r.oesterreich.anzahlVorher = n("AT", String(+r.periode - 1));
  r.stand = raw.stand; r.quelle = raw.quelle; r.hinweisDaten = raw.hinweis;
  r.euGesamt = Object.values(raw.jahre[r.periode] || {}).reduce((a, b) => a + b, 0);
  r.schweiz = null;
  return r;
}
const TERROR_IND = { id: "terror", name: "Terroranschläge", takt: "jahr", pfeilModus: "wert", dez: 1, suffix: "", diffEinheit: "Anschläge pro 10 Mio. Einwohner",
  einheit: "Anschläge (vollendet, gescheitert und vereitelt) pro 10 Mio. Einwohner, laut Europol", rangText: "Rang 1 = niedrigste Quote",
  hinweis: "Gezählt werden auch vereitelte Anschläge, eine hohe Zahl kann also auch für erfolgreiche Terrorabwehr sprechen. Die Länder melden unterschiedlich, und die Einzelzahlen sind klein, ein einzelner Anschlag verändert das Ergebnis deutlich. Gemeldet sind nur Anschläge, die den Terrorismus-Definitionen der Mitgliedstaaten entsprechen.",
  typ: "niedrig", schwelle: 0.5, schwelleFix: true, maxAlter: 26 };

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
      const kandidaten = ind.proKopf && !TEST ? [] : [{ dataset: ind.dataset, filter: ind.filter }, ...(ind.alternativen || [])]; // Pro-Kopf-Werte nie aus Rohwerten ersetzen
      if (ind.oel && !TEST) { try { r = await berechneOel(ind); } catch (e) { letzterFehler = e; console.error(`   (Ölbulletin hat nicht funktioniert: ${e.message})`); } }
      if (ind.verhaeltnis && !TEST) { try { r = await berechneVerhaeltnis(ind); } catch (e) { letzterFehler = e; console.error(`   (Verhältnis hat nicht funktioniert: ${e.message})`); } }
      if (ind.proKopf && !TEST) { try { r = await berechneProKopf(ind); } catch (e) { letzterFehler = e; console.error(`   (Pro Kopf hat nicht funktioniert: ${e.message})`); } }
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
      if (ind.real && !TEST) await realTrend(r, ind);
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
  try { const r = berechneReligion(); result.push(r); console.log(`OK  Religionszugehörigkeit: ${r.anteileTitel}, ${r.periode}`); }
  catch (e) { fehler++; console.error(`FEHLER Religion: ${e.message}`); result.push(prev.religion ? { ...prev.religion, veraltet: true, fehler: e.message } : { id: "religion", name: "Religionszugehörigkeit", fehler: e.message }); }
  for (const id of Object.keys(HAND_IND)) {
    try { const r = berechneHand(id, HAND_IND[id]); result.push(r); console.log(`OK  ${r.name}: ${r.periode}, Österreich ${r.oesterreich.wert}, Platz ${r.oesterreich.rang}/${r.anzahlLaender}`); }
    catch (e) { fehler++; console.error(`FEHLER ${HAND_IND[id].name}: ${e.message}`); result.push(prev[id] ? { ...prev[id], veraltet: true, fehler: e.message } : { id, name: HAND_IND[id].name, fehler: e.message }); }
  }
  try {
    const r = berechneTerror(result); result.push(r);
    console.log(`OK  Terroranschläge: ${r.periode}, Österreich ${r.oesterreich.anzahl} Anschläge, Platz ${r.oesterreich.rang}/${r.anzahlLaender}`);
  } catch (e) {
    fehler++; console.error(`FEHLER Terroranschläge: ${e.message}`);
    result.push(prev.terror ? { ...prev.terror, veraltet: true, fehler: e.message } : { id: "terror", name: "Terroranschläge", fehler: e.message });
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
  // Jahresdaten, die älter als das Vorjahr sind: Hinweis, dass Eurostat noch nichts Neueres hat (wird beim nächsten Lauf automatisch ersetzt)
  const jetzt = new Date().getFullYear();
  for (const r of result) { const jahr = /^\d{4}/.test(String(r.periode)) ? +String(r.periode).slice(0, 4) : null;
    if (r.takt === "jahr" && jahr && jahr < jetzt - 1 && r.id !== "terror" && !r.ohneTrend && !r.art) r.datenHinweis = `Neuere Daten hat Eurostat noch nicht veröffentlicht (jüngstes Jahr: ${jahr}).`; }
  // Verläufe beginnen beim ersten vorhandenen Wert (keine leere Vorlaufstrecke im Diagramm)
  for (const r of result) {
    if (Array.isArray(r.rangVerlauf)) { let k = 0; while (k < r.rangVerlauf.length - 2 && r.rangVerlauf[k].rang == null) k++; r.rangVerlauf = r.rangVerlauf.slice(k); }
    if (Array.isArray(r.verlauf)) { let k = 0; while (k < r.verlauf.length - 2 && r.verlauf[k].at == null) k++; r.verlauf = r.verlauf.slice(k); }
  }
  // Österreich-Nachtrag (von Hand) für Indikatoren, bei denen Eurostat noch nichts Neueres hat
  try { const nt = JSON.parse(fs.readFileSync("at-nachtrag.json", "utf8"));
    for (const r of result) { const e = nt.eintraege[r.id], jahr = /^\d{4}/.test(String(r.periode)) ? +String(r.periode).slice(0, 4) : 0;
      if ((r.datenHinweis || r.ohneTrend) && e && e.jahr > jahr) r.nachtrag = { ...e, stand: nt.stand, gesamtAufklaerung: ["toetung","raub","einbruch","sexualdelikte"].includes(r.id) ? nt.gesamtAufklaerung : null }; }
  } catch (e) { console.log("   (at-nachtrag.json nicht lesbar: " + e.message + ")"); }
  // Fenster ohne Daten ab 2025 (weder Eurostat noch Österreich-Nachtrag): ausblenden, erscheinen automatisch wieder, sobald neuere Daten vorliegen
  for (const r of result) { const ind = INDICATORS.find(x => x.id === r.id), jahr = /^\d{4}/.test(String(r.periode)) ? +String(r.periode).slice(0, 4) : 0;
    if (ind && ind.ausblenden2025 && jahr && jahr < 2025 && !r.nachtrag) { r.ausgeblendet = true; console.log(`   AUSGEBLENDET: ${r.name} (jüngste Daten: ${jahr}, kein Nachtrag ab 2025)`); } }
  { // Beispiel Österreich: hohe Pensionsausgaben bedeuten nicht automatisch hohe Pensionen
    const pa = result.find(x => x.id === "pensionsausgaben"), eq = result.find(x => x.id === "ersatzquote");
    if (pa?.oesterreich && eq?.oesterreich) {
      const f = x => String(Math.round(x * 10) / 10).replace(".", ",");
      const t = ` Beispiel Österreich: Das Land gibt ${f(pa.oesterreich.wert)} % des BIP für Pensionen aus (Platz ${pa.oesterreich.rang} von ${pa.anzahlLaender}, wobei Platz 1 die niedrigsten Ausgaben hat), die Pensionen liegen im Verhältnis zum früheren Einkommen aber nur bei ${Math.round(eq.oesterreich.wert)} % (Platz ${eq.oesterreich.rang} von ${eq.anzahlLaender}).`;
      for (const r of [pa, eq]) r.hinweis = ((r.hinweis || "") + t).trim();
    }
  }
  for (const r of result) { if (ERKLAERUNG[r.id]) r.erklaerung = ERKLAERUNG[r.id]; if (GRUPPE_VON[r.id] !== undefined) r.gruppe = GRUPPEN[GRUPPE_VON[r.id]]; }
  if (!TEST && fehler >= INDICATORS.length) { console.error("Eurostat nicht erreichbar: Die bestehenden Daten bleiben unverändert."); process.exit(1); }
  const out = { beispiel: TEST, aktualisiert: new Date().toISOString().slice(0, 10), quelle: "Eurostat", regierung: REGIERUNG, gruppen: GRUPPEN, indikatoren: result };
  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync("docs/daten.json", JSON.stringify(out, null, 1));
  fs.writeFileSync("docs/daten.js", "window.DATEN = " + JSON.stringify(out) + ";\n");
  if (fehler === INDICATORS.length + 7) process.exit(1);
})();
