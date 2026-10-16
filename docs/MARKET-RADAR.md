# Markt-Radar · Erweiterung vom 16.10.2026

Ziel: zeigen, **was** steigt oder fällt, **welche Messung** dahintersteht und **welche Erklärung tatsächlich belegt ist**. Eine Kursbewegung allein beweist keine Ursache. Es werden keine automatisch erfundenen Ursachen oder Kaufempfehlungen ausgegeben.

## Tatsächliche Abdeckung

| Bereich | Messung | Quelle | Status |
|---|---|---|---|
| Entrümpelung, Umzug, Rückbau, Entsorgung | Veröffentlichungszahlen im gleichen deutschen TED-Suchprofil, zusätzlich regionaler Filter | TED Search API | produktiver Scanner mit Abdeckungssnapshot |
| Produkte/Konsum | Reales Einzelhandels-Verkaufsvolumen Deutschland, ohne Kraftfahrzeuge | Eurostat `sts_trtu_m`, G47, VOL_SLS | live verifiziert |
| Branchen | Deutsche Industrieproduktion, Bergbau/verarbeitendes Gewerbe/Energie | Eurostat `sts_inpr_m`, B–D, PRD | live verifiziert |
| Krypto | Bitcoin/Euro und Ethereum/Euro, abgeschlossene Tages-Schlusskurse | Coinbase Exchange | live verifiziert |
| Devisen | US-Dollar für einen Euro, tägliche Referenzwerte | EZB | live verifiziert |
| Aktien | IBM, unbereinigte tägliche Schlusskurse | Alpha Vantage TIME_SERIES_DAILY | Adapter implementiert und mit Fixture geprüft; mangels API-Schlüssel nicht live verifiziert |

Das sind ausgewählte reale Messreihen, keine vollständige Beobachtung sämtlicher Produkte, Unternehmen, Branchen oder Kryptowährungen. Einzelhandelsvolumen ist kein Trend für ein bestimmtes Produkt. Industrieproduktion ist weder Gesamtwirtschaft noch ein Nachfrageindex. TED misst nur den konfigurierten Vergabeausschnitt.

## Vergleichsverfahren

- **Tageskurse:** Mittel der letzten sieben Kalendertage mit Daten bis zum letzten abgeschlossenen Quellen-Datum gegen das Mittel der sieben davorliegenden Kalendertage. Krypto benötigt sieben Werte je Fenster, Börsen-/EZB-Reihen mindestens vier. Der aktuelle UTC-Tag und zukünftige Werte werden ausgeschlossen. Ältester akzeptierter letzter Wert: vier Tage. Signale: STEIGT über +0,5 %, FÄLLT unter −0,5 %, dazwischen STABIL. Schwellen sind Heuristiken, keine statistische Signifikanz.
- **Monatsindizes:** Mittel der letzten drei veröffentlichten Monate gegen die drei Vormonate. Sechs lückenlose Monatswerte erforderlich. Der aktuelle Monat wird ausgeschlossen; letzter Monat maximal vier Monate alt. Saison-/kalenderbereinigt, 2021 = 100. Vorläufige Kennzeichnung `p` wird gespeichert und in der Datentabelle als solche gezeigt. Prozentänderungen beziehen sich auf Indexmittelwerte, nicht Euro-Umsätze.
- **TED:** zwei komplette 28-Tage-Fenster bis zum Tag vor dem erfolgreichen Scan. Mindestens zehn Veröffentlichungen insgesamt, Vergleichsbasis größer null und Suchabdeckung beider Fenster erforderlich. ±5 % als heuristische Schwelle. Ohne ausreichende Stichprobe oder bei älter als vier Tagen liegendem Suchstand: ZU WENIG DATEN. Kein Vergleich bloß wachsender Datenbankbestände.
- Ein Scan-Snapshot enthält ausschließlich deduplizierte **Live-Mitglieder dieses erfolgreichen vollständigen Scans**, dessen Start-Suchparameter und dessen regionale Einordnung. Andere früher gespeicherte Einträge, synthetische Testdaten, neue Importe oder fehlgeschlagene Teilscans verfälschen die Vergleichsmenge nicht. Frühere Scans vor Einführung des Moduls werden nicht nachträglich als verifizierte Abdeckung ausgegeben. Alter/nicht mehr in der Suche auftauchender Bekanntmachungen und Veröffentlichungsversionen wegen bleibt TED ein Suchausschnitt mit Einschränkungen.
- Nullbasis ergibt keine erfundene unendliche Wachstumsrate. Fehlende Monatsdaten werden nicht mit null aufgefüllt. Bei Tageszahlen für TED sind null Beobachtungen nur bei dokumentierter vollständiger Abdeckung zulässig.

## Warum steigt etwas?

Die Detailansicht trennt:

1. **Messung:** Werte, Zeitfenster und nachvollziehbare Prozentberechnung.
2. **Wirtschaftliche Ursache:** ausdrücklich nicht belegt, solange keine belastbare Prüfung vorliegt.
3. **Offizielle Veröffentlichungen:** beim Euro-Dollar-Markt zeitnahe EZB-Pressemitteilungen, Reden und Interviews aus dem offiziellen RSS-Feed, automatisch geladen. Datum und Original-Link werden gezeigt. Zeitliche Nähe beweist keine Kursursache; die Inhalte werden nicht automatisch als kausal klassifiziert.
4. **Eigene Quellenhinweise und Hypothesen:** Titel, Ereignisdatum, HTTPS-Original-Link und Notiz dauerhaft speichern/löschen. Nutzerhinweise bleiben als ungeprüft, Hypothesen als unbewiesen gekennzeichnet. Kein automatischer Abruf nutzereingegebener URLs.
5. **Prüfschritt und Messgrenzen:** marktbezogene Recherchehinweise, keine unbelegten Tatsachenbehauptungen.

Der Nutzer kann damit die Belege sammeln und eine Erklärung prüfen. Eine automatische fundierte Kausalanalyse für alle Märkte ist **noch nicht implementiert**.

## Quellen und Anbindung

- Coinbase-Dokumentation: https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles
- BTC: `GET https://api.exchange.coinbase.com/products/BTC-EUR/candles?granularity=86400&start=...&end=...`, ETH analog. Anfrage begrenzt auf 90 Tage; Antwort wird auf abgeschlossene UTC-Tage innerhalb dieses Fensters gefiltert. Ein großzügiger, begrenzter Parser akzeptiert abweichende Antwortlängen; der erste tatsächlich gelieferte Abruf enthielt mehr Kerzen als das dokumentierte Seitenmaximum. Keine Iteration oder Limitumgehung.
- EZB-Kurse: https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml
- EZB-Pressefeed: https://www.ecb.europa.eu/rss/press.html; importierte Links nur HTTPS und Host `www.ecb.europa.eu`.
- Eurostat-API: `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{dataset}`; Dimensionen `geo=DE`, `unit=I21`, `s_adj=SCA`, Monatsfrequenz, `nace_r2=G47&indic_bt=VOL_SLS` bzw. `nace_r2=B-D&indic_bt=PRD`. Es werden 24 Monate angefragt; Einheiten/Dimensionen und Einzelzeitreihe werden validiert.
- Eurostat-Methodik/API: https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access
- Alpha Vantage: https://www.alphavantage.co/documentation/#daily. Optional `ALPHA_VANTAGE_API_KEY` nur serverseitig setzen, anschließend Server neu starten. Beispielinstrument IBM ist fest konfiguriert; noch keine Aktien-Watchlist. API-Berechtigungen, Anbieterlimit und Bedingungen beachten; bei fehlendem Schlüssel kein Request und Status NICHT VERFÜGBAR. Unbereinigte Kurse können Splits/Dividenden enthalten. Kein Live-Erfolg behauptet.

## Persistenz und Betrieb

Neue Tabellen: MarketSeries, MarketPoints, MarketPointUpdates, MarketPointFlags, MarketEvidence, MarketCoverage, MarketNews, MarketLock. Nicht destruktive Migrationen V3–V5, bestehende Opportunity-Daten und Notizen bleiben erhalten. `(seriesId,date)` ist eindeutig. Numerische Revisionen historisiert; bestehende Messwerte bleiben bei Fehlern erhalten. Abrufstatus und letzter Erfolg werden getrennt gespeichert.

Authentifizierte API: `GET /api/markets?scope=all|regional`, `POST /api/markets/refresh`, `POST /api/markets/evidence`, `DELETE /api/markets/evidence/:id`.

Preis-, Index- und Nachrichtenabrufe laufen beim Start und alle vier Stunden mit serverseitigem Scheduler, nicht im Browser. Mit `SCANS_ENABLED=false` werden beide Scheduler deaktiviert. Datenbank-Lease mit Heartbeat verhindert parallele Markt-Abrufe. Feste Quelladressen, 20 Sekunden Request-Timeout, maximal drei Versuche, Backoff/Retry-After, manueller Abruf rate-limitiert. Providerfehler werden einzeln ausgewiesen; andere Anbieter können trotzdem erfolgreich sein. Regelmäßige Datenbanksicherung umfasst die neuen Tabellen.

## Reproduzieren

```bash
npm test
npm run build
npm run test:e2e
node --import tsx scripts/markets-live.ts
```

Der isolierte Live-Test verwendet `data/markets-live.sqlite` (oder DATABASE_PATH) und protokolliert erfolgreiche und fehlgeschlagene Einzelabrufe. Reproduzierbare aufgezeichnete Quellenantworten unter `tests/fixtures/`. Keine externen Quellen werden durch Browsertests abgerufen. Die synthetische Bitcoin-Browserzeitreihe ist ausdrücklich TESTDATEN und lebt nur in der temporären Testdatenbank.

Live-Verifikation am 16.10.2026: BTC und ETH je 90 vollständige Tageswerte, EZB 64 Referenzwerte, 15 offizielle Veröffentlichungen; Eurostat je 23 Monatswerte bis August 2026. Die aktuelle Signalrichtung kann fallen oder stabil sein. Das Modul ist kein ausschließlich auf steigende Märkte zugeschnittener Filter.

Nächste Erweiterung: frei konfigurierbare Instrumente/Produktgruppen und breitere Ereignisquellen mit überprüfbarer Zuordnung. Vollautomatische belegte Ursachen erfordern mehr als gemeinsame Zeitstempel.

## Aktueller Stand V1.1 (ersetzt frühere offene Punkte)

Aktien sind inzwischen ohne API-Schlüssel über den öffentlichen Nasdaq-Endpunkt live angebunden; bis zu acht Symbole lassen sich in der Aktien-Watchlist verwalten. Alpha Vantage ist nicht mehr die aktive Aktienquelle. Automatische, datierte Erklärungsbausteine sind implementiert: gemessene Beiträge einzelner TED-Auftraggeber und ausdrücklich als unbewiesen bezeichnete Hypothesen anhand passender offizieller EZB-, IBM- und Ethereum-Meldungen. Es wird weiterhin keine Kausalität aus zeitlicher Nähe behauptet. Deutscher Vergabeimport samt eForms ist ebenfalls aktiv. Details und Bereitstellungsstatus: [COMPLETION.md](COMPLETION.md).
