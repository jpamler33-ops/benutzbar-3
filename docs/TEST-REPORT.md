# Verifikation · 15.10.2026

## Implementierte und ausgeführte Prüfungen

- `npm test`: **15/15 erfolgreich**. Reproduzierbare aufgezeichnete TED-Antwort; mehrsprachige Werte, Arrays, Datum/Zeitzone, Anforderungen, leere Ergebnisse, Query, Pagination und Seitengrenze, 429/Retry-After, 400, Quell-Timeout und Abbruch, unvollständige API-Antwort, semantische Score-Regeln und fehlende Daten, Haversine, belegte Ortszuordnung, persistente SQLite-Datenbank nach Schließen/Öffnen, stabile Quellen-IDs, Quellhistorie, Status/Notizen/Bookmark, Sperren über zwei Verbindungen, Scanfehler, authentifizierte Endpunkte, Eingabevalidierung, Filter und CSV-Injection-Schutz.
- `npm run build`: **erfolgreich**, TypeScript strict und Vite-Produktion. Harmlose Build-Warnungen zu entfernten PURE-Kommentaren einer Zod-Abhängigkeit; kein Buildfehler.
- `npm run test:e2e`: **4/4 erfolgreich**, Chromium, Desktop 1440 × 1000 und Smartphone 390 × 844. Produktionsserver startet durch Playwright. Browser → API → SQLite → Antwort geprüft: Login, Leerzustand, Einstellungen nach Reload, Quellenprotokoll, Details, erklärter Score, Statusänderung, Notizen, Speicherung, Suche, Status-/Entfernungsfilter, Download. Kein horizontaler Seitenüberlauf. Isolierte, ausdrücklich als TESTDATEN bezeichnete Testdaten; keine Produktdaten verändert.
- `npm audit --audit-level=high`: **0 bekannte Schwachstellen** zum Prüfzeitpunkt.
- Tatsächlicher Produktionsstart auf Port 3000, `/api/health` → 200, geschützte Daten ohne Schlüssel → 401 (API-Test).
- Produktionsprozess mit 629 live abgerufenen Einträgen beendet und neu gestartet; SQLite-Daten bleiben erhalten. Konsistentes Backup über `node:sqlite backup` erzeugt und erneut geöffnet: **629 Einträge, Migrationen V1/V2 vorhanden**.
- Zusätzlicher Browser-Smoke gegen den laufenden Produktdatenbestand auf Desktop und Smartphone: siehe `production-smoke.log` und Live-Screenshots.

Protokolle: `unit-tests.log`, `build.log`, `browser-tests.log`, `dependency-audit.log`, `production-smoke.log`. Logdateien werden lokal erzeugt und sind per .gitignore nicht Bestandteil des Quell-Commits. Die Screenshots unter docs/ zeigen entweder explizite TESTDATEN oder echte, unter `live-dashboard-*` getrennte Live-Daten.

## Live-Verifikation TED

Der dokumentierte zweimalige Integrationslauf (631 Treffer) wurde am **15.10.2026, 20:27 UTC** erfolgreich beendet:

| Lauf | Gefunden | Neu gespeichert | Aktualisiert |
|---|---:|---:|---:|
| Erster vollständiger Lauf | 631 | 631 | 0 |
| Identischer Wiederholungslauf | 631 | 0 | 0 |

Sieben Seiten wurden jeweils vollständig abgerufen. 631 Datensätze blieben gespeichert, keine Duplikate. Dieser isolierte reale Datenbestand liegt unter `data/live-verification.sqlite`; er wird nicht mit synthetischen Fixtures befüllt. Der anfängliche Query-Versuch mit einem von TED nicht unterstützten Bekanntmachungstyp schlug sichtbar fehl; nach Korrektur folgten zwei vollständig erfolgreiche Läufe. Der Fehler wird nicht als erfolgreiche Verbindung gezählt.

Der separat gestartete reguläre Produktionsscanner hat 629 Einträge gespeichert. Live-Ergebniszahlen sind zeitabhängig und können zwischen Läufen abweichen; dies ist kein synthetischer Datenbestand. Die aktuell gespeicherten Quellenauszüge, ScanRuns und Original-Links bilden die konkrete Evidenz, nicht eine dauerhafte Zusage dieser Trefferzahl.

Live-Protokoll: `live-verification.log`. Zugriff auf https://api.ted.europa.eu/v3/notices/search erfolgreich. Die offizielle deutsche OpenAPI-Spezifikation unter https://oeffentlichevergabe.de/documentation/api/opendata wurde erfolgreich abgerufen und ausgewertet; **kein produktiver deutscher Importadapter und kein erfolgreicher deutscher Ausschreibungsimport behauptet**.

## Offene Grenzen

- Railway ist vorbereitet, aber nicht deployed. Volume-Mount, kontinuierlicher Betrieb, realer vierstündiger Zeitablauf und Wiederanlauf nach Railway-Redeploy müssen dort geprüft werden. Der Scheduler startet lokal nachweislich ohne Browser; der Vierstundenmechanismus ist implementiert, ein vierstündiger Dauertest wurde nicht abgewartet.
- Smartphoneprüfung ist Chromium mit mobilem Viewport, kein physisches iPhone und kein Safari-Test.
- GeoNames-Distanzen sind belegte Ortszentrum-Luftlinien. Deutschlandweit mehrdeutige Ortsnamen werden vorsichtig nicht aufgelöst. Außerhalb des regionalen Ausschnitts bleibt die Entfernung unbekannt.
- Loszuordnung, verbindliche Fristuhrzeit, tatsächliche Kapazität und rechtliche/technische Anforderungen müssen im Original geprüft werden.
- Es wurde keine Gewinnquote oder wirtschaftliche Rentabilität nachgewiesen. Der Priorisierungsscore ist eine transparente Heuristik; breite CPV-Klassen können unpassende Treffer liefern.

## Ergänzung Markt-Radar · 16.10.2026

Der vorherige Bericht beschreibt den V1-Stand vom 15.10.; die folgende Prüfung ergänzt ihn um das Markt-Radar:

- **28 Backend-/API-Tests**: bisherige Regressionen plus rollierende Kursfenster, Tages-/Monatsabschluss, Wochenenden, veraltete Reihen, Nullbasis, Monatslücken, Mindeststichproben, echte Coinbase-/EZB-/Eurostat-Fixtures, Quelldimensionen/Einheiten, vorläufige Werte, Revisionen, persistente Zeitreihen, Backoff/Quellenlimit, parallele Abrufsperre, exakte TED-Scanmitgliedschaft, eingefrorene regionale Scanparameter, spätere Quellenfehler sowie authentifizierte Quellenhinweise/Hypothesen mit URL-Validierung.
- **Sechs Chromium-Browsertests**: bestehende vier plus Markt-Radar auf Desktop und Smartphone, Charts, Datenkennzeichnung, Berechnung, Ursachenbegrenzung, Quellen-/Hypothesenformular, Persistenz nach Reload und Entfernen von Hinweisen. Kein horizontaler Seitenüberlauf. Testzeitreihen ausdrücklich TESTDATEN in isolierter temporärer Datenbank.
- Produktionsbuild erfolgreich. Zusätzlicher echter Browser-Smoke gegen die laufende Produktdatenbank: Marktübersicht und automatisch verknüpfte offizielle EZB-Veröffentlichungen auf Desktop und Smartphone.
- Live-Anbieter geprüft: Coinbase BTC/ETH je 90 vollständige Tageswerte, EZB 64 Tageswerte, offizieller EZB-Pressefeed 15 Veröffentlichungen, Eurostat Einzelhandel/Industrie je 23 Monatswerte. Alpha Vantage nicht live getestet: API-Schlüssel fehlt; der Zustand bleibt NICHT VERFÜGBAR.
- Neuer regulärer TED-Lauf: 629 Treffer aus dem aktuellen Suchfenster, elf erstmals gespeicherte Bekanntmachungen; ältere gespeicherte Einträge bleiben erhalten. Erster dokumentierter vollständiger Markt-Abdeckungssnapshot gespeichert. Der Snapshot umfasst nur Mitglieder dieses Scans und nicht den gesamten historisch angesammelten Bestand.
- Konkretes Signal im geprüften Suchstand: Rückbau-Bekanntmachungen +21,82 % in den beiden 28-Tage-Fenstern, deutschlandweit im L&P-Suchprofil. Es wird daraus keine Ursache und keine generelle Nachfragezunahme abgeleitet. Regionale Stichproben können für belastbare Signale zu klein sein.

Protokolle: `markets-tests.log`, `markets-build.log`, `markets-browser.log`, `markets-live.log`, `markets-smoke.log`. Screenshots `markets-live-*` und `market-context-live-*` zeigen echte Produktdaten; `markets-*`/`market-detail-*` aus Browsertests sind getrennt bezeichnete Testansichten. Details der Methodik und Grenzen: [MARKET-RADAR.md](MARKET-RADAR.md).

## Abschlussprüfung V1.1

40 Backend-/API-Tests und acht Desktop-/Mobil-Browsertests bestanden. Zusätzliche Abdeckung: deutsche UUID-/numerische IDs, ZIP-Traversal und Größenlimits, eForms-Fristen mit Zeitzone, inkrementelle Checkpoints, Wiederholung ohne Duplikate, Quelländerungen unter Beibehaltung des Nutzerstatus, Nasdaq-Instrument-/Paginierungsvalidierung, sichere offizielle Feeds, datierte automatische Hypothesen, beobachtete Auftraggeberbeiträge und Watchlist-Validierung. Produktionsbuild und Audit erfolgreich. Der echte deutsche Import speicherte 419 relevante Einträge; der Wiederholungslauf fügte keinen Datensatz hinzu. Cloud- und Actions-Verifikation stehen im aktuellen [Abschlussbericht](COMPLETION.md).
