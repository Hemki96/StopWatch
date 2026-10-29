# Timer und Bahnen

Der Tab **Timer** ist die Grundlage jeder Messung. Ein **Lauf** besteht aus einer oder mehreren
**Bahnen**; jede Bahn gehört genau einem Schwimmer. Die Bahnen starten gemeinsam oder mit
**Startversatz** und werden danach unabhängig voneinander gestoppt.

## Der Ablauf eines Laufs

```
Nächster Lauf konfigurieren
        │
        ▼
   Start / Start alle
        │
        ├── Bahn 1: läuft ── Anschlag ── Anschlag ── Ziel
        ├── Bahn 2: läuft ── Anschlag ────────────── Ziel
        └── Bahn 3: wartet auf Start ── läuft ────── Ziel
        │
        ▼
   Alle im Ziel → Verlauf
```

Es gibt drei Wege, einen Lauf zu beginnen:

| Weg | Was passiert |
| --- | --- |
| **Start** auf der Karte „Nächster Lauf“ | Legt einen Lauf aus den aktuellen Einstellungen an und startet alle Bahnen sofort. |
| **+** in der Lauf-Leiste | Legt einen weiteren Lauf aus den aktuellen Einstellungen an, startet ihn aber noch nicht. Danach **Start alle** tippen. |
| **Start alle** im bereits angelegten Lauf | Startet alle Bahnen, die noch nicht gestartet oder beendet sind. |

## Die Lauf-Leiste

Sobald mindestens ein Lauf aktiv ist, erscheint oben eine Leiste mit einem Eintrag pro Lauf:

- **Punkt:** grün = fertig, Akzentfarbe = läuft, grau = bereit.
- **Titel:** z. B. `100 m · Freistil` oder bei einer Serie `5×100 m · Freistil`.
- **Status:** `bereit`, `läuft` oder `Ziel`.
- **Rundenanzeige:** bei einer Serie zusätzlich `R2/5`.
- **+:** weiterer Lauf.

Ein Tipp auf einen Eintrag wechselt den sichtbaren Lauf. Die anderen Läufe laufen im Hintergrund
weiter. Eine Serie erscheint als **ein** Eintrag, nicht als ein Eintrag pro Wiederholung.

Ganz rechts in der Kopfzeile des sichtbaren Laufs stehen zwei Aktionen:

| Symbol | Wann sichtbar | Wirkung |
| --- | --- | --- |
| **X** | alle Bahnen im Ziel | Schließt den Lauf. Die Zeiten bleiben im **Verlauf**. |
| **Papierkorb** | noch nicht alle im Ziel | Verwirft den Lauf samt Zeiten nach einer Rückfrage. |

Das Schließen ist kein Löschen. Ein geschlossener Lauf verschwindet nur aus der aktiven Leiste.

## Bahnen starten und stoppen

### Gemeinsamer Start

**Start alle** setzt allen noch unberührten Bahnen denselben Startzeitstempel. Danach läuft jede Bahn
für sich.

### Startversatz

Mit **Startversatz** startet Bahn 1 sofort, Bahn 2 nach dem eingestellten Abstand, Bahn 3 nach dem
doppelten Abstand und so weiter. Bei 10 s und vier Bahnen:

| Bahn | Startzeit relativ zum Startknopf |
| --- | --- |
| 1 | 0 s |
| 2 | 10 s |
| 3 | 20 s |
| 4 | 30 s |

Die Bahnen zeigen vor ihrem Start einen Countdown, z. B. **„Start in 7,4“**. In dieser Zeit ignoriert
die Bahn Tipps; ein Tipp darf den Countdown nicht vorziehen. Langes Drücken auf einer geplanten Bahn
bricht ihren Start ab („Halten: Start abbrechen“).

Der Startversatz wird beim Anlegen des Laufs festgeschrieben. Im laufenden Lauf lässt er sich nicht
mehr ändern; dafür unter **Mehr → Nächster Lauf** einen neuen Wert wählen und einen neuen Lauf
anlegen.

### Anschläge

Ein Tipp auf eine laufende Bahn erfasst einen **Anschlag**. Die angezeigte Zeit ist immer die
kumulierte Zeit seit dem Start **dieser** Bahn, nicht seit dem Start des Laufs.

Bei fester Strecke ist der letzte Anschlag automatisch das Ziel:

| Strecke | Becken | Längen | Tipps bis zum Ziel |
| --- | --- | --- | --- |
| 100 m | 50 m | 2 | 2 |
| 100 m | 25 m | 4 | 4 |
| 200 m | 50 m | 4 | 4 |
| 400 m | 25 m | 16 | 16 |

Die Unterkante jeder Kachel zeigt den Fortschritt: ein Segment pro Länge, gefüllt nach jedem
Anschlag.

### Offene Strecke

Bei **Offener Strecke** gibt es keine automatische Längenanzahl. Jeder Tipp ist ein Split; die Bahn
endet erst über den Knopf **Ziel** auf der Kachel. Ist eine Bahn bereits im Ziel, ändert ein weiterer
Tipp nichts mehr.

Unten erscheint bei offener Strecke **„Alle beenden“**. Der Knopf beendet alle gerade laufenden
Bahnen mit demselben Zeitpunkt und ist praktisch, wenn eine ganze Gruppe gleichzeitig anschlägt.

### Einzelne Bahn starten

Ein Lauf ohne gemeinsamen Start lässt sich auch bahnweise beginnen: Ein Tipp auf eine **bereite**
Bahn startet nur diese. Das ist die Ausnahme; der übliche Weg ist **Start alle**.

## Die Kachel verstehen

```
┌──────────────────────────────────┐
│ 3            Anna Muster         │  Bahnnummer, Schwimmer
│                                  │
│          01:23,45                │  laufende Zeit oder Zielzeit
│                                  │
│ Länge 2/4            01:05,12    │  nächste Länge, letzter Split
│ ████████░░░░░░░░░░░░░░░░░░░░░░░  │  Fortschritt
└──────────────────────────────────┘
```

| Zustand | Große Zeit | Kleine Zeile |
| --- | --- | --- |
| **bereit** | `00:00,00` | `Bereit` |
| **geplant** | Countdown | `Start in`, `wartet` |
| **läuft** | laufende Zeit | `Länge 2/4`, letzter Split |
| **beendet** | Zielzeit | `Ziel` |

## Rückgängig machen

Langes Drücken (etwa 0,45 s) auf einer Bahn nimmt die letzte Aktion zurück:

1. Der letzte **Anschlag** wird gelöscht.
2. Ist kein Anschlag mehr vorhanden, wird der **Start** der Bahn zurückgenommen.
3. Auf einer unberührten Bahn passiert nichts.

Während des Haltens erscheint ein Hinweis mit Fortschrittsbalken. Auf Geräten, die Vibration
unterstützen, gibt es ein kurzes Feedback; auf dem iPhone ist die Vibrations-API im Browser nicht
verfügbar.

Rückgängig wirkt immer auf die zuletzt erfasste Aktion **dieser Bahn**. Es gibt kein globales Undo
über mehrere Bahnen.

## Nachträgliche Korrekturen

Im Timer lässt sich eine bereits erfasste Zeit nicht direkt bearbeiten. Das geschieht im
**Verlauf**:

1. Tab **Verlauf** öffnen.
2. Den Lauf antippen.
3. Bei der gewünschten Zeit auf das **Stift**-Symbol tippen.
4. Eine Zeit wie `01:23,45` eingeben.

Korrigierte Anschläge werden als **manuell** markiert. Die Korrektur muss zwischen dem vorherigen
und dem nächsten Anschlag liegen; folgende Zeiten werden nicht automatisch mitverschoben. Details:
[Verlauf und Auswertung](06-verlauf-und-auswertung.md#splits-korrigieren).

## Mehrere Läufe gleichzeitig

Die App kann mehrere Läufe parallel halten, etwa wenn eine Gruppe noch schwimmt und die nächste
schon startet.

- **+** legt einen weiteren Lauf an. Er erscheint als neuer Eintrag und ist zunächst bereit.
- Jeder Lauf hat eigene Bahnen, eigene Startzeiten und eigene Anschläge.
- Der sichtbare Lauf wird über die Leiste gewechselt.
- Ein Lauf, der im Hintergrund läuft, wird weiter aus Zeitstempeln berechnet. Es gibt keinen
  separaten Timer, der anhalten könnte.
- Die Leiste zeigt höchstens einen Eintrag pro Serie.

Beim Anlegen eines neuen Laufs entfernt die App vollständig beendete Läufe aus der aktiven Leiste.
Die Daten bleiben im Verlauf.

## Sperren der Konfiguration

| Feld | Änderbar im laufenden Lauf? |
| --- | --- |
| Schwimmerzuordnung | Ja, jederzeit über das Sheet. |
| Beckenlänge, Strecke, Schwimmart | Nur solange **kein** Anschlag erfasst wurde; bei einer Serie sofort gesperrt. |
| Startversatz | Nein, er ist beim Anlegen fest. |
| Wiederholungen / Takt | Nein; eine Serie ist nach dem Anlegen gesperrt. |

Für eine geänderte Konfiguration den Lauf verwerfen und neu anlegen. Bereits gemessene Zeiten
lassen sich nicht in einen anderen Lauf übertragen.

## Display, Wachhalten und Grenzen

- Solange die Messansicht (**Timer** oder **Wettkampf**) sichtbar ist und eine Bahn läuft oder auf
  ihren Start wartet, fordert die App einen **Wake Lock** an und hält den Bildschirm nach
  Möglichkeit wach.
- Kann der Browser den Wake Lock nicht halten, erscheint unter dem Timer ein gelber Hinweis:
  „Display-Sperre nicht aktiv — Bildschirm kann sich ausschalten.“
- Die App nimmt **keine Eingaben im Hintergrund** an. Wird das Display gesperrt oder die App
  verlassen, fehlen die Tipps aus dieser Zeit. Die bereits erfassten Zeiten bleiben korrekt.
- Der Wake Lock wird erst wieder angefordert, wenn die App sichtbar ist. Ein Wechsel in eine andere
  App ist deshalb während der Messung zu vermeiden.

## Reload und unterbrochene Läufe

`performance.now()` gilt nur innerhalb einer Seitensitzung. Nach einem Reload kann die App eine
laufende Zeit nicht weiterzählen. Deshalb gilt:

- Laufende und geplante Bahnen werden beim Laden auf **bereit** zurückgesetzt.
- Bereits erfasste Anschläge und Zielzeiten bleiben erhalten.
- Die App zeigt den Hinweis: „Der letzte Lauf wurde unterbrochen. Erfasste Zeiten bleiben
  erhalten.“
- Ein angelegter, aber noch nicht gestarteter Lauf bleibt unverändert.
- Ein vollständig beendeter Lauf bleibt unverändert.

Ein unterbrochener Lauf ist **keine** nahtlose Fortsetzung. Für eine saubere Messung den Lauf
verwerfen und neu starten. Bereits vorhandene Anschläge bleiben sonst in der Historie und werden mit
den neuen Tipps vermischt.

Bei einer **Serie** gibt es zusätzlich die Aktion **Weiter**: Sie plant nur die Wiederholungen neu,
die noch völlig unberührt sind. Vollständige Runden bleiben erhalten. Siehe
[Serien](03-serien.md#nach-einem-reload-weiter).

## Grenzen

- **1 bis 10 Bahnen** pro Lauf.
- **1 bis 20 Wiederholungen** pro Serie.
- **Startversatz** von 0 bis 120 s.
- **Takt** von 10 s bis 60 min in den Einstellungen; die Auswahl im Sheet bietet gängige Werte.
- **Strecken** 50, 100, 200, 400, 800, 1.500 m oder offen. Die Strecke muss ein Vielfaches der
  Beckenlänge sein.
- Ein Lauf gehört zu genau einem **Satz**. Ein einzelner Lauf aus dem Timer mit gleicher
  Konfiguration am selben Tag landet im selben Satz; eine Serie und ein gestarteter Trainingssatz
  haben immer einen eigenen Satz.

## Tipps für den Beckenrand

- Vor dem Start prüfen, ob Beckenlänge und Strecke stimmen. Nach dem ersten Anschlag sind sie
  gesperrt.
- Bei vielen Bahnen die Kacheln nicht zu klein werden lassen: 10 Bahnen sind auf einem kleinen
  Handy eng. Für 8–10 Bahnen ein größeres Gerät oder Querformat verwenden — die App zeigt dann
  mehr Spalten und rückt auf dem Tablet die Navigation an die Seite. Auf einem kleinen Handy im
  Querformat bleibt dagegen wenig Höhe; dort lieber hochkant messen.
- Den Startknopf mit dem Daumen erreichbar halten; die untere Aktionsleiste scrollt nicht weg.
- Bei Sonne das dunkle Design und volle Helligkeit verwenden.
- Vor dem ersten Einsatz einen Testlauf mit zwei Bahnen machen und den Verlauf prüfen.
