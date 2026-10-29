# Dokumentation

Beckenrand ist eine mobile-first PWA für Schwimmtrainer:innen am Beckenrand. Sie misst Zeiten,
plant Serien und Trainings, führt durch einen Wettkampf und speichert alles ausschließlich auf dem
eigenen Gerät.

Diese Dokumentation richtet sich an zwei Gruppen:

- **Anwender:innen** — Trainer:innen, die mit der App messen, planen und auswerten.
- **Entwickler:innen** — Menschen, die den Code lesen, testen, erweitern oder veröffentlichen.

## Schnell finden

| Ich möchte … | Seite |
| --- | --- |
| die App installieren und den ersten Lauf messen | [Erste Schritte](handbuch/01-erste-schritte.md) |
| einen einzelnen Lauf mit mehreren Bahnen stoppen | [Timer und Bahnen](handbuch/02-timer.md) |
| eine Serie im festen Takt schwimmen | [Serien](handbuch/03-serien.md) |
| eine Trainingseinheit vorbereiten und abarbeiten | [Training](handbuch/04-training.md) |
| einen Wettkampf anlegen oder eine Meldeliste importieren | [Wettkampf](handbuch/05-wettkampf.md) |
| Zeiten, Bestzeiten und Splits auswerten | [Verlauf und Auswertung](handbuch/06-verlauf-und-auswertung.md) |
| Daten exportieren, sichern oder löschen | [Daten und Backup](handbuch/07-daten-und-backup.md) |
| ein Problem lösen | [Probleme und FAQ](handbuch/08-probleme-und-faq.md) |
| verstehen, wie der Code aufgebaut ist | [Architektur](entwicklung/architektur.md) |
| das Datenmodell nachschlagen | [Datenmodell](entwicklung/datenmodell.md) |
| eine Domänenfunktion nachschlagen | [Domänenreferenz](entwicklung/domain-referenz.md) |
| Tests ausführen oder erweitern | [Testen](entwicklung/testen.md) |
| bauen und veröffentlichen | [Bauen und Veröffentlichen](entwicklung/bauen-und-veroeffentlichen.md) |
| Begriffe der Domäne nachlesen | [GLOSSARY.md](../GLOSSARY.md) |
| eine getroffene Entscheidung verstehen | [Architekturentscheidungen](adr/) |
| den Funktionsumfang je Version nachlesen | [ROADMAP.md](../ROADMAP.md) |

## Handbuch

Das Handbuch beschreibt die App aus Sicht der Bedienung. Es erklärt nicht nur, welche Knöpfe es
gibt, sondern auch, warum ein Ablauf so ist und wo die Grenzen liegen.

1. [Erste Schritte](handbuch/01-erste-schritte.md) — Installation, Onboarding, Aufbau der App
2. [Timer und Bahnen](handbuch/02-timer.md) — einzelner Lauf, Startversatz, offene Strecke, Korrekturen
3. [Serien](handbuch/03-serien.md) — mehrere Wiederholungen im festen Takt
4. [Training](handbuch/04-training.md) — Aktive, Trainingssätze und Fortschritt
5. [Wettkampf](handbuch/05-wettkampf.md) — Disziplinen, Heats, Meldeliste, Zielzeit
6. [Verlauf und Auswertung](handbuch/06-verlauf-und-auswertung.md) — Splits, Bestzeiten, CSV
7. [Daten und Backup](handbuch/07-daten-und-backup.md) — IndexedDB, Backup, Import, Löschen
8. [Probleme und FAQ](handbuch/08-probleme-und-faq.md) — typische Fälle und ihre Lösung

Einstieg für Ungeduldige: [Erste Schritte → „Die erste Messung in fünf Minuten“](handbuch/01-erste-schritte.md#die-erste-messung-in-fünf-minuten).

## Entwicklung

Die Entwicklerdokumentation setzt TypeScript, React und Grundkenntnisse im Browser voraus.

1. [Architektur](entwicklung/architektur.md) — Schichten, Zeitkern, Datenfluss, Tab-Koordination
2. [Datenmodell](entwicklung/datenmodell.md) — Typen, Invarianten, IndexedDB, Backup-Schema
3. [Domänenreferenz](entwicklung/domain-referenz.md) — Funktionen aus `src/domain/` mit Verhalten
4. [Oberfläche](entwicklung/oberflaeche.md) — Screens, Dialoge, Interaktionsmuster, Gestaltung
5. [Testen](entwicklung/testen.md) — Unit-Tests, Playwright, Teststrategie
6. [Bauen und Veröffentlichen](entwicklung/bauen-und-veroeffentlichen.md) — Vite, PWA, CI, GitHub Pages
7. [Beitragen](entwicklung/beitragen.md) — Arbeitsweise, Konventionen, Checkliste für Änderungen

## Referenz und Entscheidungen

- [`ROADMAP.md`](../ROADMAP.md) — Funktionsumfang je Major-Version, Release-Kriterien und Nicht-Ziele.
- [`GLOSSARY.md`](../GLOSSARY.md) — die verbindlichen Begriffe: Lauf, Bahn, Satz, Serie, Training,
  Aktive, Wettkampf, Disziplin, Meldeliste und weitere.
- [`docs/adr/`](adr/) — Architekturentscheidungen mit Kontext, Alternativen und Folgen.
- [`README.md`](../README.md) — Kurzüberblick, Schnellstart und Live-URL.

## Aufbau und Pflege

- **Ein Ort pro Aussage.** Das Handbuch beschreibt die Bedienung, die Entwicklerdokumentation den
  Code. Beide verweisen auf das Glossar statt Begriffe neu zu definieren.
- **Änderungen an der Bedienung** gehören in denselben Pull Request wie die Codeänderung. Wer ein
  Label, einen Ablauf oder eine Grenze ändert, aktualisiert die betroffene Handbuchseite.
- **Änderungen an Architektur oder Daten** brauchen eine ADR, wenn sie eine bewusste Alternative
  verwerfen. Das Format steht in den vorhandenen ADRs.
- **Keine Screenshots als einzige Quelle.** Beschreibungen nennen die sichtbaren Labels, damit die
  Doku auch nach einem Redesign lesbar bleibt.
- **Deutsch ist die Dokumentationssprache**, passend zur Oberfläche. Codebezeichner und
  Dateinamen bleiben wie im Repository.

Stand: Oktober 2026, App-Version 0.1.0.
