# Roadmap

Beckenrand ist eine mobile-first PWA für Schwimmtrainer:innen. Diese Roadmap legt fest, welche
Funktionen zu welcher Major-Version gehören. Sie ist keine Terminzusage, sondern die verbindliche
Reihenfolge des Funktionsumfangs.

## Leitlinien

- **Ein Gerät, kein Konto, offline zuerst.** Die App bleibt ohne Anmeldung und Cloud nutzbar.
- **Messen geht vor Auswerten.** Eine Version muss am Beckenrand vollständig bedienbar sein.
- **Bestehende Daten bleiben lesbar.** Jede Version migriert oder ergänzt, ohne Verlauf zu verlieren.
- **Keine Funktion ohne Test und Doku.** Die Handbuch- und Entwicklerseiten wachsen mit.
- **Nicht-Ziele sind Teil der Entscheidung.** Was nicht in einer Version steht, wird hier genannt.

## 1.0 — „Am Beckenrand“

Ziel: ein stabiles Trainingswerkzeug für metrische Becken. Die Kernfunktionen sind bereits in 0.1.0
vorhanden; 1.0 schließt die offenen Lücken und ergänzt die Auswertung.

### Inhalt

- **Kern:** Timer, Startversatz, mehrere aktive Läufe, Serien, Training, Verlauf, Bestzeiten,
  CSV/JSON, Offline/PWA.
- **Training:** Sätze optional automatisch nacheinander starten; der Schalter gilt pro Training.
- **Abschluss und Vertrauen:**
  - [#35](https://github.com/Hemki96/StopWatch/issues/35) Lauf-Ende: Ergebnisübersicht mit
    Bestzeit-Vergleich
  - [#36](https://github.com/Hemki96/StopWatch/issues/36) Statuszeile: verstrichene Laufzeit
  - [#37](https://github.com/Hemki96/StopWatch/issues/37) Schwimmer: Bestzeiten-Eintrag öffnet den
    Lauf
  - [#39](https://github.com/Hemki96/StopWatch/issues/39) Schwimmer-Liste: „alle zeigen“ absichern
- **Analyse:**
  - [#34](https://github.com/Hemki96/StopWatch/issues/34) Analyse: Zwischenzeiten im Satz
    vergleichen (Personen, Runden, Sätze)
- **Qualität:** `npm run verify` und die e2e-Suite sind grün, der Backup-Roundtrip ist geprüft, die
  Doku ist aktualisiert, die Version steht auf 1.0.0.

### Nicht in 1.0

- Einheiten und Yards ([#40](https://github.com/Hemki96/StopWatch/issues/40)–[#43](https://github.com/Hemki96/StopWatch/issues/43))
- Staffeln und Vereinsdaten
- Sync, Konto oder Mehrgerätebetrieb
- Trainingsvorlagen, Anwesenheit und Saisonkalender
- Diagramme und Sparklines
- Die Design-Referenz [#14](https://github.com/Hemki96/StopWatch/issues/14) ist ein separates
  Design-Artefakt und kein Release-Blocker; das Redesign ist bereits umgesetzt. Die inhaltliche
  Fassung liegt unter [`design/redesign-referenz/`](design/redesign-referenz/README.md).

### Release-Kriterien

- [ ] [#34](https://github.com/Hemki96/StopWatch/issues/34)–[#39](https://github.com/Hemki96/StopWatch/issues/39) sind geschlossen.
- [ ] `npm run verify` ist grün.
- [ ] `npm run test:e2e` ist gegen Dev-Server und Produktions-Build grün.
- [ ] Ein Backup aus 0.1.0 lässt sich in 1.0.0 einlesen.
- [ ] Handbuch, README und Glossar beschreiben den Stand von 1.0.
- [ ] `package.json` und die App-Info nennen 1.0.0.

## 1.1 — „Einheiten & Yards“

Ziel: metrische und Yard-Becken mit derselben Genauigkeit. Die Oberfläche bleibt Deutsch.

- [#40](https://github.com/Hemki96/StopWatch/issues/40) Einheiten-Fundament: Meter und Yards
- [#41](https://github.com/Hemki96/StopWatch/issues/41) Einheiten im Messfluss
- [#42](https://github.com/Hemki96/StopWatch/issues/42) Einheiten in Verlauf, Detail und Bestzeiten
- [#43](https://github.com/Hemki96/StopWatch/issues/43) Einheiten in Training, Serien und CSV
- ADR und Handbuch zu Meter/Yards, Umrechnung und getrennten Bestzeiten

**Nicht in 1.1:** automatische Umrechnung alter Läufe, UI-Sprachwechsel, imperiale Zeitformate.

> **Nachtrag:** Mit [ADR 0013](docs/adr/0013-nur-meter-in-der-eingabe.md) entfällt die
> Einheitenwahl in der Oberfläche. Neue Läufe sind immer Meter; alte Yard-Läufe bleiben lesbar und
> getrennt.

## 1.2 — „Training & Team“

Ziel: Trainingseinheiten und die Gruppe am Beckenrand besser abbilden.

- Trainingsvorlagen für wiederkehrende Einheiten
- Anwesenheit und Saisonkalender
- Vereins- und Teamdaten sowie Jahrgang und Geschlecht am Schwimmer
- Staffel-Aufstellung innerhalb einer Trainingseinheit
- Teilbare Trainingszusammenfassung

**Nicht in 1.2:** externe Ergebnisdienste, Live-Übertragung im Netz.

## 1.3 — „Analyse vertiefen“

Ziel: Entwicklung über mehrere Sätze und Saisons sichtbar machen. Alles wird aus vorhandenen Splits
abgeleitet; es gibt keine neue Speicherung von Aggregaten.

- Diagramme und Sparklines für Zeitentwicklung
- Saisonvergleich und Bestzeiten-Verlauf
- Zielzeiten und Prognosen
- Takt-Compliance („Takt verpasst“) als Kennzahl
- Vergleich über Sätze und Beckenlängen

**Nicht in 1.3:** Videoanalyse, automatische Trainingsempfehlungen, externe Datenquellen.

## Nicht geplant

- Trainingsplanung mit Vorlagen, Anwesenheit und Saisonkalender
- Sync, Konto und Mehrgerätebetrieb
- Hintergrundbetrieb mit Taps (Grenze der PWA, siehe
  [ADR 0001](docs/adr/0001-pwa-statt-native.md))
- Apple Watch, Bluetooth-Taster und andere Hardware
- Sprachsteuerung
- Wechsel der UI-Sprache

## Offene Entscheidungen

- **Einheiten:** Kanonische Speicherung in Metern und die Behandlung von 25-Yard-Becken werden in
  [#40](https://github.com/Hemki96/StopWatch/issues/40) als ADR festgehalten.
- **Analyse:** Diagramme bleiben in 1.3 lesend; eine manuelle Referenzwahl kommt erst, wenn der
  automatische Vergleich nachweislich daneben liegt.

## Pflege

- Diese Datei ist die Quelle für den Funktionsumfang je Version.
- Neue Funktionen brauchen eine Version und ein Ticket; Tickets ohne Version bleiben im Backlog.
- Änderungen an der Reihenfolge werden hier und im Issue-Tracker gemeinsam nachgezogen.
- Die Detailanforderungen stehen in den Tickets, nicht in dieser Datei.
