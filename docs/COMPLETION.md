# Abschlussstand Opportunity OS V1.1 · 16.10.2026

## Implementiert

- Produktionsfähige geschützte React-/TypeScript-App, responsiv, persistente SQLite-Datenbank und nicht destruktive Migrationen.
- TED und offizieller deutscher Bekanntmachungsservice. DE verwendet kontrollierte OCDS-Tagesarchive plus eForms-Ergänzung für echte Fristen, Qualifikationen und KMU-Angaben. Inkrementelle Importtage, sichere ZIP/XML-Verarbeitung, Dublettenschutz und Änderungshistorie.
- Datenbasierter Score, regionale Luftlinien, Feed/Details, Status, Notizen, Speicherung, Suche, Filter, CSV, Quellen-/Fehlerprotokolle.
- Reale historische Coinbase-, EZB-, Eurostat- und Nasdaq-Reihen. Aktien-Watchlist ohne zusätzlichen API-Schlüssel. Eigene Quellenhinweise und Hypothesen.
- Automatische Erklärungen: transparente Messung, bei TED Beiträge einzelner Auftraggeber, zeitlich eingegrenzte offizielle Meldungen aus EZB/IBM/Ethereum. Wirtschaftliche Wirkung bleibt eine ausdrücklich unbewiesene Hypothese, solange sie nicht kausal belegt ist. Keine erfundenen Ursachen oder Daten.
- Server-Scheduler sowie externer GitHub-Zeitplan alle vier Stunden zum Wecken des Railway-Free-Dienstes und Ausführen der geschützten Scans. Zugang als GitHub-Secret, niemals im Quellcode.

## Lokale Prüfungen

- 38 Unit-/Integrations-/API-Tests erfolgreich.
- Acht Browser-Tests erfolgreich (Desktop 1440 px, Smartphone 390 px): bestehende Arbeitsabläufe, Markterklärungen, Belege und Aktien-Watchlist; kein horizontaler Überlauf.
- Produktionsbuild erfolgreich; Dependency-Audit ohne bekannte Schwachstellen.
- Konsistente Datenbank-Backups, Persistenz, Versionen, Quellenfehler, Zeitfenster und unbekannte Angaben geprüft.

## Echte Quellen

- TED zuvor doppelt vollständig verifiziert, 631 Treffer und beim zweiten Lauf keine neuen Duplikate. Aktuelle vollständige Scans werden im Scanprotokoll gespeichert.
- DE: erster vollständiger Siebentage-Import **419 relevante Bekanntmachungen**, Wiederholung des jüngsten Tages **104 Treffer, 0 neue Einträge, 0 Änderungen**. 259 Treffer mit Fristen, 174 mit Anforderungen; zwei über eindeutige Ortskoordinaten regional zugeordnet. Erfolgreicher Abruf am 16.10.2026, 15:49 UTC. Wiederholung lädt absichtlich nur noch notwendige Archive.
- Nasdaq: IBM erfolgreich, 83 historische Tageswerte, aktuelle Vergleichsberechnung möglich; kein API-Schlüssel benötigt.
- Coinbase BTC/ETH, EZB-Referenzwerte und Pressefeed, Eurostat-Einzelhandel/Industrie sowie offizielle IBM-/Ethereum-Feeds erfolgreich abgerufen.
- Eine alternative Aktienquelle verlangte eine Browserprüfung und wurde verworfen. Kein Umgehen einer Zugangssperre.

## Hosting und GitHub

Railway-Service `opportunity-os` im vorher vollständig leeren Projekt `earnest-renewal`, 500-MB-Volume `/data`. Das andere bestehende Projekt wurde nicht verändert. Ein neues Projekt war durch das Free-Plan-Ressourcenlimit gesperrt. Der Free-Plan verlangt `sleepApplication=true`; deshalb ist der externe GitHub-Zeitplan erforderlich. Eine Tarifumstellung wurde nicht vorgenommen.

Geplante/konfigurierte Adresse: https://opportunity-os-production-37e2.up.railway.app
Private GitHub-Quelle: https://github.com/jpamler33-ops/opportunity-os

Der verbindliche Deployment- und Actions-Prüfstatus wird nach Abschluss unten ergänzt. Die bloße Domain-Erzeugung ist noch kein erfolgreicher Deploy.

Zugriffsschlüssel separat in der ignorierten Datei `deployment-access.txt`. Keine Zugangsdaten im Repository oder in öffentlichen Protokollen.

## Praktische Grenzen

Keine Allwissenheit über sämtliche Produkte und Finanzinstrumente, keine Gewinnzusage. TED und DE können denselben Vorgang unabhängig abbilden; die eindeutige Identität gilt pro Quelle. Der deutsche Import blickt rollierend maximal sieben Tage zurück. Ein wirtschaftlicher Treiber wird nicht aus bloßer zeitlicher Nähe als Tatsache ausgegeben. Kleine regionale Stichproben bleiben als unzureichend gekennzeichnet. Börsenendpunkte, offizielle Veröffentlichungstermine und GitHub-Zeitpläne haben keine zugesicherte sekundengenaue Verfügbarkeit. Verbindliche Vergabeunterlagen bleiben vor einer Bewerbung maßgeblich.
