# Reihen als Startgruppen

Ein **Lauf** kann mehrere **Reihen** enthalten. Alle Bahnen einer Reihe starten gemeinsam; die nächste Reihe startet um den **Startversatz** später. Damit lassen sich mehr Schwimmer messen als Bahnen vorhanden sind, z. B. 3 Personen sofort und 3 weitere nach 10 s.

## Considered Options

- **Startversatz pro Bahn (bisher)**: Jede Bahn startet einzeln versetzt. Das bildet zwar eine Staffelung ab, aber keine Gruppe: Bei 6 Bahnen und 10 s starten die Personen bei 0, 10, 20, 30, 40 und 50 s – nicht drei gemeinsam und drei weitere nach 10 s.
- **Wellen als eigene Läufe**: Jede Reihe wäre ein eigener Lauf mit eigener Leiste und eigenem Abschluss. Der Trainer müsste mehrere Einträge bedienen, obwohl es eine Übung ist; Bestzeiten und Serienrunden würden auseinanderfallen.
- **Reihe als Feld an der Bahn (gewählt)**: `Bahn.reihe` ist eine 1-basierte Startgruppe. Der Lauf bleibt ein Objekt, die Bahnen bleiben unabhängige Timer, und die Startzeit ist `startMs = now + (reihe - 1) * versatz`. Wettkampf-Heats bleiben eigene Läufe und nutzen nur Reihe 1.

## Consequences

- Der Startversatz staffelt ausschließlich Reihen. Innerhalb einer Reihe starten alle Bahnen mit demselben Zeitstempel.
- `bahn.nummer` ist innerhalb ihrer Reihe eindeutig, nicht mehr innerhalb des Laufs: Zwei Personen dürfen auf „Bahn 1“ in unterschiedlichen Reihen stehen. Die Anzeige gruppiert die Kacheln mit einer Überschrift je Reihe.
- Einstellungen, Trainingsplan und Trainingssatz speichern **Bahnen je Reihe** (`bahnen`) und **Reihen** (`reihen`). Die Aktivenliste ist Reihe für Reihe geordnet; ihre Länge ist `bahnen × reihen`.
- Ändert der Trainer die Aufteilung, bleibt jede Person in ihrer Reihe an ihrer Bahn (`ordneAktiveUm`); neue Plätze sind leer, entfallende Reihen fallen weg. Eine Positionsverschiebung über Reihen hinweg wäre am Beckenrand nicht nachvollziehbar.
- Alte Daten ohne `reihe` bzw. `reihen` gelten als eine Reihe. Backups bleiben lesbar; die Normalisierung ergänzt die Felder beim Laden.
- Die Serienwarnung vergleicht den Takt mit dem Versatz bis zur letzten Reihe, nicht bis zur letzten Bahn.
- Der Trainings-CSV-Export bekommt eine Spalte `reihe`; `bahn` bleibt die Nummer innerhalb der Reihe.
- Grenzen: 10 Bahnen je Reihe und 5 Reihen, also höchstens 50 Personen pro Lauf.
