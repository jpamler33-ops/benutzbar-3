# Opportunity OS V1.1

Geschütztes Vergabe- und Markt-Radar für Entrümpelung L&P in Schwarzenfeld/Schwandorf. React, TypeScript, Tailwind CSS, Express und persistente SQLite-Datenbank. Eine wartbare Anwendung, keine Microservices. Keine als echt ausgegebenen Demoaufträge.

## Benutzen

In der Web-App mit dem privaten Zugriffsschlüssel anmelden. **Überblick** und **Opportunity Feed** zeigen öffentliche Aufträge; **Markt-Radar** zeigt historische Entwicklungen, Berechnung, offizielle Meldungen und automatisch zugeordnete mögliche Erklärungen. Datenquelle, Datenstand und Fehler bleiben sichtbar.

Der Cloud-Zugriffsschlüssel wird separat übergeben und steht weder im Repository noch im Frontend-Build. Persönliche Notizen, gespeicherte Chancen, Status, Suchparameter und Markt-Watchlist bleiben nach Neustart erhalten.

## Lokal starten

Node.js **24** und npm erforderlich.

```bash
npm ci
cp .env.example .env
# ADMIN_TOKEN in .env durch eigenen Zufallsschlüssel ersetzen (mindestens 24 Zeichen).
# Schlüssel generieren: openssl rand -hex 32
npm run build
node --env-file=.env --import tsx server/index.ts
```

App: http://localhost:3000. Anmeldung mit dem selbst gesetzten ADMIN_TOKEN. Für Hot Reload zuerst die Variablen aus `.env` in der Shell laden und `npm run dev` ausführen; Frontend dann auf Port 5173. `npm start` erwartet bereits gesetzte Variablen. `.env` wird nicht automatisch von tsx geladen.

## Tatsächliche Funktionen

- **Vergaben:** offizielle TED Search API und deutscher Bekanntmachungsservice. Einheitliches Quellenmodell, manuelle/automatische Scans, Score mit Begründung, vollständige Originaltexte soweit veröffentlicht, Fristen, Anforderungen, Original-Link.
- **Deutschland:** inkrementeller offizieller OCDS-Tagesexport der letzten bis zu sieben Tage, ergänzt durch eForms derselben Tage. Dadurch werden die im OCDS-Export fehlenden Fristen, Anforderungen und KMU-Hinweise aus der Originalstruktur übernommen. Noch nicht importierte Tage nach einem längeren Ausfall außerhalb dieses Fensters werden nicht automatisch nachgeladen.
- **Relevanz:** erklärte Text- und CPV-Regeln für Entrümpelung, Räumung, Umzug, Entsorgung, Container, Demontage/Rückbau. Standardgewichtung 40/25/15/10/10 für Branche, Region, Bewerbungszeit, KMU-Zugang und Datenqualität; konfigurierbar. Unbekannte Kriterien werden ausgewiesen und aus dem Score-Nenner entfernt. Score ist eine Priorisierungsheuristik, keine Gewinnwahrscheinlichkeit.
- **Region:** Zielradius 60 km ab Schwarzenfeld, konfigurierbar. Belegte GeoNames-Ortszentren, Haversine-Luftlinie, keine Fahrtstrecken. Mehrdeutige/unbekannte Orte bleiben ohne Kilometerangabe; der reine Kilometerfilter schließt diese aus.
- **Arbeitsabläufe:** NEU, PRÜFEN, INTERESSANT, KONTAKTIERT, GEWONNEN/VERLOREN; Speicherung, Notizen, Historie, Suche, Filter und geschützter CSV-Export mit Formelschutz.
- **Marktdaten:** Coinbase BTC/ETH in EUR, EZB EUR/USD, Eurostat deutscher Einzelhandel/Industrie, Nasdaq historische Aktienkurse in USD. Aktien-Watchlist mit bis zu acht US-Symbolen, ohne zusätzlichen API-Schlüssel. Keine vollständige Abdeckung aller Weltmärkte oder einzelnen Produkte.
- **Warum bewegt sich etwas?** Berechnung mit Vergleichsperioden; bei TED zusätzliche messbare Beiträge einzelner Auftraggeber. Automatisch passende offizielle EZB-, IBM- und Ethereum-Meldungen werden mit Datum/Link als **Hypothesen** eingeordnet. Ereignisse und zeitliche Nähe sind keine bewiesenen wirtschaftlichen Ursachen. Quellenlücken werden ausdrücklich benannt. Eigene Quellenhinweise/Hypothesen lassen sich ergänzen und löschen.
- **Charts:** Tages-/Monatsverlauf, echte Zeitachse, Datenpunkttabelle, vorläufige Eurostat-Werte, Filter für steigende/fallende/stabile Signale und unzureichende Daten. Nachfrageindikatoren und Kurse werden getrennt bezeichnet.

## Automation und Railway-Free-Plan

Der Server plant Vergabe- und Markt-Scans alle vier Stunden, solange er läuft. Railway Free erzwingt für den Webdienst den Schlafmodus. Deshalb ruft zusätzlich `.github/workflows/scan.yml` die HTTPS-App automatisch alle vier Stunden auf, weckt sie und startet beide geschützten Scans unabhängig von einem geöffneten Browser. Der Workflow ist auch manuell auslösbar.

Dazu sind im GitHub-Repository die Variable `OPPORTUNITY_URL` und das Secret `OPPORTUNITY_ADMIN_TOKEN` erforderlich. Der Workflow wartet bei Anlauf-/Parallelitätsproblemen und meldet Quellfehler als fehlgeschlagenen Lauf. GitHub-Zeitpläne können sich verzögern und benötigen verfügbare Actions-Minuten; die App zeigt tatsächliche letzte Erfolge. Bei deaktivierten Actions ist auf dem Free-Plan kein verlässlicher Dauerbetrieb des lokalen Schedulers gegeben. In einem Always-on-Tarif kann Server-Sleep deaktiviert werden.

## Persistenz und Sicherheit

- Tabellen für Opportunities, Sources, ScanRuns, OpportunityUpdates, UserNotes, Settings sowie Marktzeitreihen, Revisionen, Quellenhinweise, offizielle Meldungen, Watchlist, Importtage, Abdeckungssnapshots und Sperren. Nicht destruktive Migrationen V1–V7.
- UNIQUE(source,sourceId), Datenbanksperren/Leases, idempotente Importe und Änderungsverlauf. Versionen derselben deutschen Quellen-ID aktualisieren den Datensatz, ohne Notizen/Status zu überschreiben. Dieselbe Ausschreibung kann bei TED und DE als zwei Quellenbelege erscheinen; noch keine verfahrensübergreifende Zusammenführung.
- Persistentes Railway-Volume unter `/data` ist verpflichtend; Start mit ausschließlich flüchtiger Railway-Datenhaltung wird verweigert. Eine Replika. Für horizontale Skalierung zuerst auf PostgreSQL migrieren.
- Alle API-Endpunkte außer Healthcheck benötigen Authentifizierung. Strikte Eingabeprüfung, Rate Limits, Timeouts, Retry/Backoff, SQL-Parameterbindung, CSP/Helmet, React-Textescaping, sichere CSV-Zellen, begrenzte ZIP-/XML-Verarbeitung. Keine CAPTCHA-, Login- oder Rate-Limit-Umgehung. Keine automatischen Auftraggeber-Nachrichten.
- Session-Schlüssel nur in sessionStorage. Für mehrere Mitarbeitende später persönliche Accounts ergänzen. Secrets nicht in URLs, Git oder Screenshots ablegen.
- Tagesarchive werden nach erfolgreichem Import mit Profil-Checkpoint markiert. Fehlerhafte Teilscans werden nicht als erfolgreicher Vollscan dargestellt; bereits gespeicherte Einträge bleiben erhalten.
- Nur echte Mitglieder eines vollständigen erfolgreichen TED-Scans bilden die Trendvergleichsmenge. Ein wachsender Datenbankbestand wird nicht als steigende Nachfrage ausgegeben.

## Prüfen und sichern

```bash
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npm run test:markets:live
node --import tsx scripts/completion-live.ts
node --env-file=.env --import tsx scripts/backup.ts backups/opportunity.sqlite
```

Tests arbeiten mit isolierten Datenbanken und ausdrücklich bezeichneten Testdaten. Live-Tests verwenden eigene Dateien unter `data/` oder DATABASE_PATH. Backups über SQLite-Backup-API, nicht durch Kopieren der geöffneten Hauptdatei ohne WAL. Vorhandene Backupziele werden nicht überschrieben. Restore regelmäßig prüfen.

## Deployment

Private GitHub-Quelle: `jpamler33-ops/benutzbar-3`. Railway-Service `opportunity-os` im zuvor leeren Projekt `earnest-renewal`, persistentes 500-MB-Volume `/data`. `.railwayignore` und `.gitignore` schließen Zugangsdaten, lokale Datenbanken und Backups aus. Build/Start/Healthcheck sind in `railway.toml` definiert. GitHub-CI prüft Tests, Build und mobile/desktop Chromium-Abläufe.

Variablen: ADMIN_TOKEN, NODE_ENV=production, DATABASE_PATH=/data/opportunity.sqlite, SCANS_ENABLED=true; Railway stellt PORT und RAILWAY_VOLUME_MOUNT_PATH bereit. Zugangswechsel immer auch im GitHub-Secret OPPORTUNITY_ADMIN_TOKEN nachziehen.

## Grenzen

Es wird weder eine vollständige globale Marktüberwachung noch eine Gewinnprognose oder bewiesene Kausalität versprochen. Kleine regionale Stichproben, offizielle Veröffentlichungsverzögerungen, Revisionen, Kapitalmaßnahmen und Quellenausfälle beeinflussen Aussagen. Nasdaq ist ein öffentlicher Web-Endpunkt ohne garantierten API-Vertrag. Verbindliche Vergabeunterlagen, Loszuordnung, Anforderungen und Fristen vor jeder Bewerbung im Original prüfen. Monatsindizes beziehen sich auf veröffentlichte Monate, nicht die Echtzeitlage.

Details und historische Prüfstände: [Abschlussbericht](docs/COMPLETION.md), [Marktmethodik](docs/MARKET-RADAR.md), [Tests](docs/TEST-REPORT.md), [Quellenprüfung](docs/DATA-SOURCES.md).
