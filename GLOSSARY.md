# Schwimm-Stoppuhr

Zeitmessung für Schwimmtrainer am Beckenrand. Eine Messung besteht aus mehreren gleichzeitig laufenden Bahnen, die einzeln gestoppt werden.

## Sprache

**Lauf**:
Eine einzelne Messung über eine definierte Strecke, bestehend aus einer oder mehreren Bahnen. Die Bahnen starten gemeinsam oder mit Startversatz; jede Bahn wird einzeln gestoppt.
_Avoid_: Session, Durchgang, Run

**Satz**:
Eine Trainingsserie aus mehreren Läufen, z. B. 8×100 m. Ein Satz mit Plan ist eine **Serie** mit festem Takt.
_Avoid_: Set, Durchgang

**Serie**:
Ein Satz mit Plan: mehrere Wiederholungen im festen Takt, z. B. 5×100 m alle 2:00. In der Datenhaltung ist die Serie kein eigenes Objekt, sondern ein `Satz` mit `plan`; die Wiederholungen sind Läufe.
_Avoid_: Eigenes Serien-Objekt, Kurs

**Wiederholung**:
Ein einzelner Lauf innerhalb einer Serie, z. B. die dritte 100 m einer 5×100-Serie. In der Serien-Ansicht als „Runde 3/5“ angezeigt.
_Avoid_: Durchgang, Rep

**Training**:
Die Vorbereitung einer Einheit: feste **Aktive** und mehrere **Trainingssätze** in fester Reihenfolge. Der Plan wird vor dem Training angelegt und dann am Beckenrand Satz für Satz abgearbeitet. Optional startet der nächste Satz nach dem letzten Ziel automatisch.
_Avoid_: Einheit, Session, Workout

**Trainingssatz**:
Ein geplanter Satz innerhalb eines Trainings, z. B. „4×100 m im 2:00-Takt“. Erst beim Start entstehen daraus ein **Satz** und seine **Läufe**; vorher ist nur der Plan gespeichert.
_Avoid_: Vorlage, Satz (sobald gemessen)

**Tagesbezeichnung**:
Ein Name für einen Trainingstag im Verlauf, z. B. „Kader A“. Er gilt für alle **Sätze** desselben Datums und wird an der Tagesüberschrift gepflegt. In der Datenhaltung ist er kein eigenes Objekt, sondern ein optionales Feld an jedem Satz des Tages.
_Avoid_: Tagesnotiz, eigener Tag-Datensatz

**Aktive**:
Die Schwimmer, die an einem Training teilnehmen, je **Bahn** und **Reihe** zugeordnet. Die Zuordnung gilt für alle noch nicht gestarteten Sätze.
_Avoid_: Teilnehmer, Kader

**Startversatz**:
Der feste Zeitabstand zwischen den Starts zweier **Reihen** eines Laufs. Bei 10 s startet Reihe 1 sofort, Reihe 2 nach 10 s, Reihe 3 nach 20 s. Innerhalb einer Reihe starten alle Bahnen gemeinsam.
_Avoid_: Verzögerung, Offset, Abstand, Bahnversatz

**Reihe**:
Eine Startgruppe innerhalb eines Laufs oder einer Wiederholung. Alle Bahnen einer Reihe starten gemeinsam; die nächste Reihe folgt um den Startversatz. Mehrere Reihen erlauben mehr Schwimmer als Bahnen, z. B. 3 Personen sofort und 3 weitere nach 10 s.
_Avoid_: Welle, Runde, Durchgang

**Takt**:
Die Zeit von einem Start einer Wiederholung bis zum Start der nächsten, z. B. 2:00 bei 5×100. Der Takt ist unabhängig davon, wann die Schwimmer tatsächlich im Ziel sind.
_Avoid_: Intervall, Pause, Send-off

**Bahn**:
Ein einzelner Timer innerhalb eines Laufs, der genau einem Schwimmer zugeordnet ist.
_Avoid_: Lane, Timer, Spur

**Schwimmer**:
Die Person, deren Zeit auf einer Bahn gemessen wird. Im MVP ein freier Name an der Bahn, kein Stammdatensatz.
_Avoid_: Athlet, Teilnehmer, Sportler

**Länge**:
Eine zurückgelegte Beckenlänge (25 m oder 50 m). Die Strecke eines Laufs ist ein Vielfaches der Beckenlänge.
_Avoid_: Lap, Runde, Bahn

**Split**:
Die vom Start der Bahn kumulierte Zeit an einer Länge oder an einer eingestellten Zwischenzeit.
_Avoid_: Lap Time, Runde

**Zwischenzeit**:
Ein Anschlag vor dem Ziel. Wie viele davon erfasst werden, stellt der Trainer ein oder leitet die
App aus Strecke und Beckenlänge ab; der nächste Anschlag nach der letzten Zwischenzeit ist das Ziel.
_Avoid_: Lap, Abschnitt

**Längenzeit**:
Die Zeit einer einzelnen Länge: die Differenz zwischen ihrem Split und dem Split der Länge davor.
_Avoid_: Zwischenzeit, Lap Time, Abschnitt

**Anschlag**:
Die Wandberührung des Schwimmers, die eine Länge beendet.
_Avoid_: Touch, Finish (nur der letzte Anschlag)

**Tap**:
Die Bedienhandlung des Trainers auf dem Touchscreen.
_Avoid_: Anschlag, Klick, Press

**Strecke**:
Die zu schwimmende Distanz eines Laufs, angegeben in Metern (z. B. 100 m).
_Avoid_: Distanz, Event

**Offene Strecke**:
Ein Lauf ohne festgelegte Distanz. Jeder Anschlag ist ein Split, das Ziel wird ausdrücklich gesetzt.
_Avoid_: Freies Training, Endlos, Open

**Import-Konflikt**:
Ein Datensatz in einem Backup mit derselben ID wie ein lokaler Datensatz, aber abweichendem Inhalt. Standardmäßig bleibt der lokale Stand; erst eine ausdrückliche Entscheidung ersetzt ihn durch das Backup.
_Avoid_: Duplikat, Merge-Konflikt, Überschreiben

**Zielzeit**:
Die Zeit vom Start einer Bahn bis zu ihrem letzten Anschlag.
_Avoid_: Endzeit, Finish Time

**Bestzeit (PB)**:
Die schnellste gültige Zielzeit eines Schwimmers für eine Kombination aus Strecke und Beckenlänge.
_Avoid_: Rekord, Bestwert, PR

**Abweichung**:
Der Unterschied zwischen einer Zeit und ihrem eigenen Bezug (Vorrunde, erste Runde, Bestzeit); positiv heißt langsamer.
_Avoid_: Delta, Differenz, Rückstand

**Rückstand**:
Der Unterschied zwischen einer Zeit und der schnellsten Zeit desselben Laufs.
_Avoid_: Abweichung, Delta

