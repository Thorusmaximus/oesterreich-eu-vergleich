Österreich im EU-Vergleich

Daten aktualisieren:   node update.js        (braucht Internet)
Nur testen:            node update.js --test (Beispieldaten)
Seite ansehen:         docs/index.html im Browser öffnen (Überblick)
                       Details: docs/indikator.html?id=inflation

Seiten:
  index.html      Überblick mit dem Platz Österreichs pro Indikator
  indikator.html  Detailseite (Verlauf, Trend, alle Länder, Schweiz zum Vergleich)
  style.css, common.js  gemeinsames Aussehen und Hilfsfunktionen

Neuen Indikator hinzufügen: in update.js in der Liste INDICATORS einen Eintrag
ergänzen (takt: "monat", "quartal" oder "jahr", typ: "niedrig" oder "hoch" je nachdem,
ob ein niedriger oder hoher Wert besser ist). Überblick und Detailseite zeigen
ihn automatisch an.

Veröffentlichen: siehe VEROEFFENTLICHEN.txt. Automatisch jede Woche: Projekt auf GitHub hochladen, dort unter Settings > Pages
den Ordner /docs veröffentlichen. Die Datei .github/workflows/update.yml
aktualisiert die Daten jeden Montag.

Kreditratings (ratings.json):
Die Ratings werden von Hand gepflegt, es gibt keine kostenlose automatische Quelle.
Ändert sich ein Rating, in ratings.json den Wert und "stand" anpassen, dann node update.js ausführen.
Es ist keine Freigabe nötig. Nach 100 Tagen ohne Änderung erscheint ein Hinweis, die Ratings zu prüfen.
Der Eintrag "unsicher" markiert Werte, die nicht sicher bestätigt sind (†).
Der Eintrag "vorher" (Stand vor 3 Jahren, nur belegte Länder) liefert den Trendpfeil des Ratings.
Der Vergleichsstand kann beliebig gewählt werden (aktuell Nov 2023).

Trendpfeile: ↑ besser, → unverändert, ↓ schlechter (je nach Indikator, nicht nach Zahlenrichtung).

Weitere Einstellungen pro Indikator in update.js:
- typ "neutral": keine Wertung (zum Beispiel Staatsquote). Rang 1 = höchster Wert, Pfeile ohne Farbe.
- dez: Dezimalstellen (Geburtenrate: 2), suffix: Einheitszeichen (leer bei "Kinder pro Frau"), diffEinheit.
- zusatzDatei: Zusatzdaten nur für Österreich, von Hand gepflegt (zusatz-geburten.json, Quelle Statistik Austria).
  Neue Jahre dort in "werte" ergänzen, sobald Statistik Austria sie veröffentlicht.

Insolvenzen: nur Österreich, von Hand gepflegt in insolvenzen.json (Quelle KSV1870).
Jahreswerte im Jänner ergänzen (neues Jahr unter "jahre"), Halbjahreswerte unter "halbjahr", "stand" anpassen.

takt "halbjahr": Eurostat-Halbjahresdaten (Strompreise, "2026-S1"). faktor rechnet Werte um (EUR/kWh x 100 = Cent/kWh).
