# Schwimm-Stoppuhr

Zeitmessung für Schwimmtrainer am Beckenrand. Eine Messung besteht aus mehreren gleichzeitig laufenden Bahnen, die einzeln gestoppt werden.

## Sprache

**Lauf**:
Eine einzelne Messung über eine definierte Strecke, bestehend aus einer oder mehreren Bahnen, die gemeinsam gestartet werden.
_Avoid_: Session, Durchgang, Heat, Run

**Satz**:
Eine Trainingsserie aus mehreren Läufen, z. B. 8×100 m.
_Avoid_: Serie, Set, Runde

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
Die vom Start des Laufs kumulierte Zeit an einer Länge.
_Avoid_: Zwischenzeit, Lap Time, Runde

**Anschlag**:
Die Wandberührung des Schwimmers, die eine Länge beendet.
_Avoid_: Touch, Finish (nur der letzte Anschlag)

**Tap**:
Die Bedienhandlung des Trainers auf dem Touchscreen.
_Avoid_: Anschlag, Klick, Press

**Strecke**:
Die zu schwimmende Distanz eines Laufs, angegeben in Metern (z. B. 100 m).
_Avoid_: Distanz, Event, Wettkampf

**Offene Strecke**:
Ein Lauf ohne festgelegte Distanz. Jeder Anschlag ist ein Split, das Ziel wird ausdrücklich gesetzt.
_Avoid_: Freies Training, Endlos, Open

**Bestzeit (PB)**:
Die schnellste gültige Zielzeit eines Schwimmers für eine Kombination aus Strecke, Schwimmart und Beckenlänge.
_Avoid_: Rekord, Bestwert, PR

