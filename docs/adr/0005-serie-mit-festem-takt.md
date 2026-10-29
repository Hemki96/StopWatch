# Serie mit festem Takt und vorausberechneten Starts

> Hinweis: Seit [ADR 0008](0008-reihen-als-startgruppen.md) staffelt der Startversatz **Reihen** statt einzelner Bahnen. Die Aussagen zu Takt und vorausberechneten Starts gelten unverändert.

Ein Lauf kann einen **Startversatz** haben: Bahn 1 startet sofort, Bahn 2 nach 10 s, Bahn 3 nach 20 s. Ein **Satz mit Plan** ist eine Serie aus mehreren Wiederholungen im festen Takt. Beim Start werden alle Wiederholungen sofort angelegt und ihre Startzeitpunkte vorausberechnet. Die App zählt keine Timer; sie leitet den Zustand jeder Bahn aus `now` ab.

## Considered Options

- **Wiederholungen bei Bedarf per Timer anlegen**: Ein `setTimeout` oder `requestAnimationFrame` startet die nächste Runde. Im Hintergrund drosseln Browser beides; die Runde würde zu spät oder gar nicht beginnen. Die Startzeitpunkte wären nicht reproduzierbar.
- **Ein Lauf mit mehreren Starts pro Bahn**: Eine Bahn bekäme für jede Wiederholung einen weiteren Start. Das bricht das Modell „eine Bahn, ein `startMs`“ und macht Splits, Undo und Bestzeiten mehrdeutig.
- **Pro Schwimmer nach eigener Pause neu starten**: Deckt Intervalltraining ohne festen Takt ab, aber nicht die Pace-Clock-Serie. Die Wiederholungen würden auseinanderlaufen, obwohl der Trainer einen gemeinsamen Takt vorgibt.
- **Serie als eigenes Objekt**: Eine neue Tabelle mit eigenen Runden. Der Satz ist laut Glossar bereits die Trainingsserie; ein zweites Container-Objekt hätte Persistenz, Backup und Verlauf ohne echten Mehrwert vergrößert.

## Consequences

- `Lauf.startversatzMs` staffelt die Bahnen: `startMs = now + index * versatz`. `Satz.plan` hält `wiederholungen`, `taktSek` und `startversatzMs`; `Lauf.wiederholung` ordnet die Läufe der Serie zu.
- Beim Start werden **alle** Wiederholungen angelegt: Runde `k` beginnt bei `t0 + (k-1) * takt`, Bahn `i` bei `+ (i-1) * versatz`. Es gibt keinen Timer, der später etwas nachholt.
- Eine Bahn mit `startMs > now` ist `geplant` und ignoriert Taps. Ihr Countdown wird aus derselben Differenz gerendert.
- Wiederholungen dürfen sich überlappen. Ist eine Bahn noch in Runde 1, während Runde 2 startet, bleiben beide offen; ein Tap schließt die älteste offene Runde. Die Zeile markiert die überholte Runde als überfällig.
- Mehrere aktive Läufe sind eine Liste von Anker-IDs. Eine Serie erscheint als **ein** Eintrag in der Leiste, nicht als fünf Chips.
- Ein Reload setzt laufende und geplante Bahnen auf „nicht gestartet“ zurück, weil `performance.now()` dann wertlos ist. Bereits vollständige Wiederholungen bleiben erhalten; unberührte Runden lassen sich mit „Weiter“ neu planen.
- Der Verlauf sieht pro Wiederholung einen Lauf im selben Satz. CSV exportiert Wiederholungsnummer, Anzahl, Takt und Startversatz.
