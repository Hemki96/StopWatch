# Handbuch

Das Handbuch führt durch die tägliche Arbeit mit Beckenrand: vom ersten Start über die Messung am
Beckenrand bis zu Verlauf, Auswertung und Datensicherung.

## Die Bereiche der App

Die untere Leiste hat fünf Bereiche:

| Bereich | Zweck |
| --- | --- |
| **Timer** | Einzelne Läufe messen, mehrere Läufe parallel verwalten |
| **Training** | Eine Einheit vorbereiten und Satz für Satz abarbeiten |
| **Verlauf** | Gemessene Läufe ansehen, korrigieren, exportieren und löschen |
| **Schwimmer** | Namen, Jahrgänge und Bestzeiten pflegen |
| **Mehr** | Design, Standardwerte für den nächsten Lauf, Daten und Installation |

Der Tab **Mehr** heißt in der Leiste „Mehr“, die Seite selbst „Einstellungen“.

## Die vier Grundgriffe

| Geste | Wirkung |
| --- | --- |
| **Tippen** | Startet eine Bahn oder erfasst den nächsten Anschlag. |
| **Lange drücken** (ca. 0,45 s) | Nimmt die letzte Aktion dieser Bahn zurück: erst den letzten Anschlag, dann den Start. Auf einer noch unberührten Bahn passiert nichts. |
| **Wischen** | Scrollt Listen und bewegt Bottom Sheets nach unten. Ein Wisch ersetzt keinen Tipp. |
| **Sheet schließen** | Über „Schließen“, den abgedunkelten Hintergrund, die Zurück-Geste oder Escape. |

Ein **Sheet** ist die von unten einfahrende Fläche für Konfiguration und Eingaben. Sie überdeckt die
App nur teilweise und lässt sich durch Ziehen am Griff schließen.

## Welche Seite wofür?

1. [Erste Schritte](01-erste-schritte.md) — Installation, Onboarding, Standardwerte, erste Messung
2. [Timer und Bahnen](02-timer.md) — einzelner Lauf, Startversatz, offene Strecke, mehrere Läufe
3. [Serien](03-serien.md) — Wiederholungen im festen Takt, überfällige Runden, „Weiter“
4. [Training](04-training.md) — Aktive, Trainingssätze, Reihenfolge, Fortschritt
5. [Verlauf und Auswertung](06-verlauf-und-auswertung.md) — Splits, Korrekturen, Bestzeiten, CSV
6. [Daten und Backup](07-daten-und-backup.md) — lokale Speicherung, Backup, Import, Löschen
7. [Probleme und FAQ](08-probleme-und-faq.md) — Ladehemmung, zweiter Tab, Update, fehlende Zeiten

## Grundsätze, die überall gelten

- **Alles bleibt auf diesem Gerät.** Es gibt kein Konto, keine Cloud und keinen Abgleich zwischen
  Geräten. Ein Backup ist die einzige Sicherung.
- **Die Zeit kommt aus Zeitstempeln, nicht aus einem Zähler.** Ein gedrosselter Tab oder ein
  ausgelassener Frame verfälscht eine bereits erfasste Zeit nicht. Siehe
  [Architektur](../entwicklung/architektur.md#der-zeitkern).
- **Zeiten werden auf Hundertstel abgeschnitten, nicht gerundet.** Aus 1,239 s wird 1,23 s.
- **Ein Gerät hält die Messung.** Ein zweiter Tab derselben App ist nur lesend, bis du die Messung
  ausdrücklich übernimmst.
- **Die App nimmt keine Tipps an, während sie im Hintergrund ist oder das Display schläft.** Die
  verstrichene Zeit bleibt trotzdem korrekt; nur der Anschlag fehlt. Der Wake-Lock-Hinweis warnt,
  wenn der Bildschirm nicht mehr gehalten wird.
- **Nach einem Reload sind laufende Bahnen „bereit“.** Bereits erfasste Zeiten bleiben erhalten;
  laufende und geplante Bahnen werden auf „nicht gestartet“ zurückgesetzt, weil die monotone Uhr
  der alten Seitensitzung nicht mehr gilt.

## Begriffe

Die App benutzt eine eigene, im Repository festgelegte Sprache. Die wichtigsten Wörter:

- **Lauf** — eine Messung mit einer oder mehreren Bahnen.
- **Bahn** — der Timer genau eines Schwimmers innerhalb eines Laufs.
- **Anschlag** — die Wandberührung, die per Tipp erfasst wird.
- **Split** — die kumulierte Zeit an einer Länge.
- **Satz** — eine Gruppe von Läufen mit gleicher Konfiguration, z. B. 8×100 m.
- **Serie** — ein Satz mit festem Takt und mehreren Wiederholungen.
- **Training** — der Plan einer Einheit aus Aktiven und Trainingssätzen.

Die vollständige und verbindliche Fassung steht in [`GLOSSARY.md`](../../GLOSSARY.md).
