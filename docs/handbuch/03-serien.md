# Serien

Eine **Serie** ist ein Satz mit Plan: mehrere Wiederholungen im festen Takt, z. B. 5×100 m alle
2:00. Sie ist die richtige Betriebsart, wenn alle Schwimmer:innen nach einer Uhr schwimmen und die
nächste Runde startet, unabhängig davon, wer noch im Wasser ist.

## Wann eine Serie, wann ein einzelner Lauf?

| Betriebsart | Geeignet für |
| --- | --- |
| **Einzelner Lauf** | Eine Gruppe startet gemeinsam und wird bis zum Ziel beobachtet. Die nächste Gruppe startet später als neuer Lauf. |
| **Serie** | Wiederholungen im festen Takt, z. B. 5×100 m alle 2:00. Die App legt alle Runden vorab an. |
| **Training** | Eine ganze Einheit mit mehreren Sätzen, Aktiven und Pausen dazwischen. Siehe [Training](04-training.md). |

## Eine Serie anlegen

Serien werden über die Standardwerte für den nächsten Lauf angelegt:

1. Tab **Timer** öffnen.
2. Auf die Karte **„Nächster Lauf“** tippen.
3. Im Abschnitt **Serie** die Anzahl der Wiederholungen einstellen (`+` / `−`, 1 bis 20).
4. Bei mehr als einer Wiederholung erscheint die Auswahl **Takt (Start zu Start)**: gängige Werte
   als Chip, jeder andere Takt über die Felder **Minuten** und **Sekunden**.
5. Optional **Startversatz** zwischen den Reihen innerhalb einer Runde wählen.
6. Das Sheet schließen und **Start** tippen. In der Startübersicht stehen Wiederholungen und Takt
   noch einmal; **Jetzt starten** beginnt die Serie.

**1×** bedeutet einzelner Lauf. Erst ab **2×** entsteht eine Serie.

Der **Takt** ist die Zeit von einem Start einer Wiederholung bis zum Start der nächsten. Er ist
unabhängig davon, wann die Schwimmer:innen tatsächlich im Ziel sind. Bei 5×100 im 2:00-Takt starten
die Runden also bei 0:00, 2:00, 4:00, 6:00 und 8:00 — auch dann, wenn jemand für 100 m länger als
2:00 braucht.

### Startzeiten im Detail

Beim Start werden **alle** Wiederholungen sofort angelegt. Für Runde `k` und Reihe `r` gilt:

```
Startzeit = Startknopf + (k − 1) × Takt + (r − 1) × Startversatz
```

Alle Bahnen einer Reihe starten gemeinsam. Beispiel: 3×100 m, Takt 2:00, 2 Reihen, Startversatz
10 s:

| Runde | Reihe 1 (ab 0:00) | Reihe 2 (ab 0:10) |
| --- | --- | --- |
| 1 | 0:00 | 0:10 |
| 2 | 2:00 | 2:10 |
| 3 | 4:00 | 4:10 |

Die App zählt keine Timer herunter und holt keine Runde nach. Der Zustand jeder Bahn wird bei jedem
Rendern aus der aktuellen Uhrzeit abgeleitet. Ein gedrosselter Tab oder ein ausgelassener Frame
verschiebt deshalb keinen Start.

### Warnung bei zu kurzem Takt

Ist der Takt kürzer als der Startversatz bis zur letzten Reihe, startet die nächste Runde, bevor alle
Reihen der vorigen gestartet sind. Die App zeigt dann einen Hinweis:

> Der Takt ist kürzer als der Startversatz der letzten Reihe. Die nächste Runde beginnt, bevor alle
> Reihen gestartet sind.

Das ist kein Fehler, aber meistens ein Zeichen für eine ungeeignete Kombination.

## Die Serien-Ansicht

Anders als beim einzelnen Lauf zeigt die Serie **eine Zeile pro Schwimmer:in**, nicht eine Kachel pro
Bahn und Runde. Das hält die Ansicht auch bei 5 Runden und 6 Bahnen bedienbar.

```
┌──────────────────────────────────────────┐
│ 3   Anna Muster                 R2/5     │
│     02:14,08   läuft                     │
│     +01,32 zur Vorrunde                  │
│     zuletzt 02:11,44 2/3 Zwischenzeiten  │
│     R3 läuft schon                       │
│ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
└──────────────────────────────────────────┘
```

| Element | Bedeutung |
| --- | --- |
| **R2/5** | Die Runde, die die Zeile gerade beschreibt: älteste offene, sonst nächste geplante, sonst letzte beendete. |
| **Große Zeit** | Laufende Zeit, Countdown oder Zielzeit — je nach Zustand. |
| **zuletzt …** | Zielzeit der letzten abgeschlossenen Runde, solange die Zeile nicht fertig ist. |
| **2/3 Zwischenzeiten** | Bereits erfasste Zwischenzeiten der ältesten offenen Runde — genau der Runde, die der nächste Tipp abschließt. Das Ziel zählt nicht mit. |
| **… zur Vorrunde** | Nach dem letzten Ziel: Abweichung zur selben Bahn in der vorigen Runde. Grün = schneller, rot = langsamer. In Runde 1 gibt es keinen Bezug. |
| **R3 läuft schon** | Eine neuere Runde hat begonnen, während diese Runde noch offen ist. |
| **Fortschrittslinie** | Ein Segment pro Runde; die Linie reicht bis zur höchsten beendeten Runde. |

Die Kopfzeile über der Liste zeigt `5× · Takt 02:00` und `gemeinsamer Start` bzw. den Startversatz.

Ist die Serie vollständig, steht unter der Zielzeit die Abweichung zur Vorrunde desselben
Schwimmers. Sie erscheint erst ab Runde 2 und nur, wenn die Vorrunde im Ziel liegt. Mehr zur
Auswertung über mehrere Sätze: [Analyse](06-verlauf-und-auswertung.md#analyse).

### Zustände einer Zeile

| Status | Anzeige | Bedeutung |
| --- | --- | --- |
| **bereit** | `—`, „Startet mit dem Startknopf“ | Die Serie wurde noch nicht gestartet. |
| **geplant** | Countdown, „Start in“ | Die Runde startet erst in der Zukunft. Tipps werden ignoriert. |
| **läuft** | laufende Zeit | Genau eine Runde dieser Bahn ist offen. |
| **überfällig** | laufende Zeit, gelb/amber | Mindestens zwei Runden sind offen. Die ältere wird zuerst geschlossen. |
| **fertig** | Zielzeit, „Ziel“ | Alle Runden dieser Bahn sind beendet. |

## Tippen in einer Serie

Ein Tipp auf eine Zeile schließt **immer die älteste offene Runde** dieser Schwimmer:in. Das ist die
zentrale Regel: Die App rät nicht anhand der Rundennummer, welche Runde gemeint ist, sondern geht
nach der tatsächlichen Reihenfolge.

### Überlappende Runden

Überholungen sind ausdrücklich erlaubt. Beispiel mit 5×100 im 2:00-Takt:

1. Runde 1 startet. Anna ist nach 2:10 noch nicht im Ziel.
2. Runde 2 startet bei 2:00. Annas Zeile ist jetzt **überfällig**, weil Runde 1 und Runde 2 offen
   sind. Das Badge zeigt „R2 läuft schon“.
3. Der nächste Tipp schließt **Runde 1** und zeigt deren Zielzeit.
4. Ein weiterer Tipp schließt **Runde 2**.

Die App versteckt die überholte Runde nicht und ordnet den Tipp nicht der neueren Runde zu. Das ist
wichtig, damit eine langsame Wiederholung nicht stillschweigend verschwindet.

### Ziel bei offener Strecke

Bei **Offener Strecke** erscheint auf jeder Zeile ein **Ziel**-Knopf. Er beendet die älteste offene
Runde, ohne einen weiteren Split zu erfassen. Ein normaler Tipp auf die Zeile erfasst weiterhin
einen Anschlag.

## Rückgängig machen

Langes Drücken auf einer Zeile nimmt den **letzten Anschlag dieser Bahn** zurück — über alle Runden
hinweg betrachtet. Maßgeblich ist der tatsächliche Erfassungszeitpunkt, nicht die Rundennummer.

Beispiel: Ein versehentlicher Tipp schließt Runde 2, obwohl Runde 1 noch offen war. Langes Drücken
nimmt genau diesen letzten Anschlag zurück; Runde 2 ist danach wieder offen.

Bei offener Strecke nimmt langes Drücken auch ein gesetztes **Ziel** zurück.

## Fortschritt und Abschluss

Unten zeigt die App:

> `2 von 5 Runden vollständig`

Eine Runde ist vollständig, wenn **alle Bahnen** dieser Runde im Ziel sind. Eine einzelne schnelle
Bahn beendet die Runde also noch nicht.

Sind alle Runden vollständig:

- Die Zeilen werden grün.
- Unten erscheint **„Serie beendet · 5 Runden“**.
- **Neuer Lauf** legt den nächsten Lauf aus den aktuellen Einstellungen an.
- Das **X** in der Kopfzeile schließt die Serie aus der aktiven Leiste. Die Zeiten bleiben im
  Verlauf.

## Nach einem Reload: „Weiter“

Nach einem Reload sind laufende und geplante Bahnen auf **bereit** zurückgesetzt. Bereits
vollständige Runden bleiben erhalten.

Die App erkennt, welche Runden noch völlig unberührt sind — kein Start, kein Anschlag. Für diese
Runden erscheint die Aktion **Weiter**:

- **Weiter** plant genau die unberührten Runden neu, mit dem aktuellen Zeitpunkt als neuem Anker.
- Bereits gemessene Runden werden nicht angefasst.
- Die Serie erscheint weiterhin als ein Eintrag in der Leiste.

Ein unterbrochener Lauf mit bereits erfassten Anschlägen lässt sich nicht nahtlos fortsetzen.
Siehe [Timer: Reload und unterbrochene Läufe](02-timer.md#reload-und-unterbrochene-läufe).

## Serie abbrechen

Der **Papierkorb** in der Kopfzeile öffnet die Rückfrage **„Serie abbrechen?“**:

> Alle Wiederholungen und Zeiten dieser Serie werden gelöscht. Das lässt sich nicht rückgängig
> machen.

Das ist strenger als das Schließen eines Laufs: Abbrechen löscht die gesamte Serie inklusive Satz
und aller gemessenen Runden. Nur bei einem Fehlstart oder einer komplett falsch konfigurierten
Serie sinnvoll.

## Grenzen und Prüfungen

| Regel | Wert |
| --- | --- |
| Wiederholungen | 2 bis 20 für eine Serie; 1 ergibt einen einzelnen Lauf |
| Takt | größer 0 s, höchstens 60 min; gängige Werte als Chip, jeder andere über Minuten und Sekunden |
| Startversatz | 0 bis 120 s zwischen zwei Reihen |
| Bahnen | 1 bis 10 je Reihe, 1 bis 5 Reihen |
| Strecke | Vielfaches der Beckenlänge; offen erlaubt |
| Startzeiten | werden beim Start vorausberechnet, nicht später nachgeholt |

## Serie, Training und Wettkampf abgrenzen

| Frage | Antwort |
| --- | --- |
| Mehrere Sätze hintereinander? | **Training** verwenden. Eine Serie ist genau ein Satz. |
| Pausen zwischen den Sätzen? | **Training**: Der nächste Satz wird bewusst gestartet. |
| Zwischenzeiten pro Länge? | **Serie** oder einzelner Lauf; im Wettkampf gibt es keine Splits. |
| Startliste mit Heats? | **Wettkampf**. |
| Namen und Aktive vorab festlegen? | **Training**; in der Serie werden Namen im Lauf zugeordnet. |

## Beispiel: 5×100 m Freistil, 2:00-Takt, 4 Bahnen

1. Unter **Mehr → Nächster Lauf** oder direkt im Timer-Sheet: Strecke 100 m, Schwimmart Freistil,
   Becken 50 m, Bahnen 4.
2. **Serie** auf 5× stellen, **Takt** 2:00 wählen.
3. **Start** tippen, in der Startübersicht `5×100 m` und den Takt prüfen, dann **Jetzt starten**.
4. Runde 1 startet auf allen vier Bahnen. Der Takt läuft ab dem Startknopf.
5. Bei jeder Ankunft die Zeile der Schwimmerin antippen. Der Tipp schließt die älteste offene Runde.
6. Nach 2:00 startet Runde 2 automatisch. Wer noch in Runde 1 ist, wird als **überfällig** markiert.
7. Nach der letzten Ankunft in Runde 5 steht **„Serie beendet · 5 Runden“**.
8. Im **Verlauf** erscheint pro Runde ein Lauf im selben Satz. Der CSV-Export enthält
   Wiederholungsnummer, Anzahl, Takt und Startversatz.
