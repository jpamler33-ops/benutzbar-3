# Quellenprüfung · 15.10.2026

## TED: integriert und live geprüft

- Offizielle API: `POST https://api.ted.europa.eu/v3/notices/search`, ohne Authentifizierung.
- Dokumentation: https://docs.ted.europa.eu/api/latest/search.html
- Wiederverwendung/Pagination: https://docs.ted.europa.eu/ODS/latest/reuse/search-api.html
- Feldkatalog: https://docs.ted.europa.eu/ODS/latest/reuse/field-list.html
- `PAGE_NUMBER`, Seiten ab 1, 100 Datensätze pro Seite; dokumentiertes Maximum 250, 15.000 Gesamttreffer und 10.000 Felder/Seite. MVP begrenzt auf 60 Seiten; Überschreitung ist ein sichtbarer Fehler, kein erfolgreicher Teilscan.
- Query nutzt `place-of-performance = DEU`, rollierendes `publication-date >= YYYYMMDD`, CPV-Codes und `FT ~ (...)`, `SORT BY publication-date DESC`. `cn-standard`, `cn-social`, `pin-cfc-standard`, `pin-cfc-social` wurden mit der Live-API geprüft. Ein zunächst probierter anderer Typ wurde von der API abgelehnt und entfernt.
- Antwort: `notices`, `totalNoticeCount`, `iterationNextToken`, `timedOut`. Mehrsprachige Objekte priorisieren Deutsch, dann Englisch. Arrays für Losfristen und Leistungsorte bleiben erhalten.
- Ergebnisarten mit bereits erfolgter Vergabe werden nicht gesucht. Vorinformationen mit Aufruf zum Wettbewerb können enthalten sein; fehlende Bewerbungsfrist bedeutet Aktivität ungeklärt.
- Alle Daten bleiben unter stabiler Veröffentlichungsnummer nachvollziehbar. Versionen mit eigener Veröffentlichungsnummer bleiben getrennte Bekanntmachungen; es gibt noch keine Zusammenführung auf Verfahrensebene.
- Anfragen nur serverseitig, 30 Sekunden Timeout, maximal drei Versuche, Backoff und `Retry-After`; nach jeder Seite 300 ms Pause. Server blockiert parallele Scanläufe.
- Gespeicherte Rohdaten und historische Versionen ermöglichen spätere Feldverbesserungen. Keine HTML-Ausführung aus Fremdtexten.

## Bekanntmachungsservice Deutschland: Schnittstelle geprüft, nicht integriert

- https://oeffentlichevergabe.de/documentation/swagger-ui/opendata/index.html
- Live abgerufene OpenAPI-Spezifikation: https://oeffentlichevergabe.de/documentation/api/opendata
- Offizieller Export: `GET /api/notice-exports?pubDay=YYYY-MM-DD&format=ocds.zip` oder `pubMonth=YYYY-MM`; Parameter schließen sich aus.
- Formate: `eforms.zip`, `ocds.zip`, `csv.zip`. ZIPs enthalten alle am ausgewählten Tag/Monat veröffentlichten Versionen. Veröffentlichungstage beziehen sich auf Europe/Berlin. Daten bis zum vorigen Mitternachtsschnitt verfügbar.
- OCDS 1.1; Tagesarchive eignen sich für einen zukünftigen Adapter mit Checkpoint, Größenbegrenzung und ZIP-Sicherheitsprüfungen. Metadaten werden aktuell nicht produktiv eingelesen. Der Quellenstatus bleibt NICHT VERFÜGBAR.
- Diese zentrale offizielle Exportquelle ist die bevorzugte deutsche Erweiterung; sie vermeidet individuelle Portal-Scraper. Keine Abdeckung sämtlicher kleiner kommunaler Beschaffungen behauptet.

## Weitere deutsche Portale

- e-Vergabe Bund: https://www.evergabe-online.de/ – öffentliche Bekanntmachungssuche; keine hier verifizierte frei dokumentierte Such-API. Nicht integriert.
- Vergabe Bayern: https://www.vergabe.bayern.de/ – öffentliche Suche und Plattformzugänge; keine hier verifizierte frei dokumentierte Such-API. Nicht integriert.
- DTVP und weitere Plattformen werden nicht automatisiert abgefragt. Vor jeder Integration sind dokumentierte API-/Exportrechte und Nutzungslimits zu prüfen. Kein CAPTCHA-, Login- oder Rate-Limit-Bypass.

## Geografische Referenzdaten

- GeoNames `DE.zip`: https://download.geonames.org/export/dump/DE.zip
- Lizenz CC BY 4.0, https://www.geonames.org/ und https://creativecommons.org/licenses/by/4.0/
- Datei `server/places.json` enthält Abrufzeitpunkt, SHA-256 des Downloads und 710 ausgewählte bewohnte Orte im regionalen Umfeld (48,5–50,5° N; 11–13,5° E; mindestens 500 Einwohner).
- Nur eindeutige exakte Namen/Aliase werden aufgelöst. Zusätzlich werden 907 deutschlandweit mehrdeutige Ortsnamen/Aliase aus den bewohnten GeoNames-Orten (mindestens 500 Einwohner) gesperrt; beispielsweise bleibt „Amberg“ ohne Zusatz ungeklärt. Mehrdeutige Orte und Orte außerhalb dieses Ausschnitts sind unbekannt. Keine externe Anfrage beim Anzeigen.
- Distanz: Haversine mit Erdradius 6.371 km zwischen Ortszentren, Ausgangspunkt Schwarzenfeld, GeoNames-ID 2834945. Keine Fahrtstrecke, keine exakte Objektadresse. Bei mehreren verifizierten Leistungsorten wird konservativ der größte Abstand verwendet; bei einem ungeklärten Ort bleibt die gesamte Entfernung unbekannt.
- Regionale Namenshinweise bleiben als solche gekennzeichnet. Daten sind eine belegte geografische Näherung; operative Einsatzplanung erfordert Adressprüfung im Original.

## Aktualisierung 16.10.2026 · V1.1

Die oben beschriebene Prüfung vom 15.10. ist historisch. Der deutsche Bekanntmachungsservice ist jetzt **integriert und live geprüft**: OCDS-Tagesexport und zugehöriger eForms-ZIP-Export; Quell-ID als UUID oder ältere numerische Bekanntmachungs-ID; Fristen/Anforderungen ergänzend aus den Original-XML-Strukturen. Zeitbereiche folgen Europe/Berlin. 419 relevante Einträge beim ersten Siebentage-Import, danach keine Duplikate.

Aktien: öffentlicher Nasdaq-Historien-Endpunkt `https://api.nasdaq.com/api/quote/{SYMBOL}/historical?assetclass=stocks&fromdate=YYYY-MM-DD&todate=YYYY-MM-DD&limit=250&offset=0`, live mit IBM geprüft. Kein API-Schlüssel, keine Browserprüfung umgangen. Der öffentlich verwendete Web-Endpunkt besitzt keine vertragliche API-Verfügbarkeitsgarantie. Stooq wurde nach einer Zugangs-/Browserprüfung nicht verwendet. Offizielle Kontextmeldungen: https://newsroom.ibm.com/announcements?pagetemplate=rss und https://blog.ethereum.org/feed.xml. Fest zugelassene HTTPS-Hosts, begrenzte XML-Auswertung, keine externen Entitäten.
