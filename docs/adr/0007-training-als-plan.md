# Ein Training ist ein Plan, seine Sätze entstehen erst beim Start

Ein **Training** bündelt die Aktiven je Bahn und mehrere **Trainingssätze** in fester Reihenfolge. Der Trainer legt das Training vor der Einheit an, startet am Beckenrand Satz für Satz und passt noch nicht gestartete Sätze während des Trainings an. Ein gestarteter Satz wird zu einem `Satz` mit `Lauf`-Wiederholungen; ab dann zählen die gemessenen Zeiten.

## Considered Options

- **Trainingssätze sofort als `Satz` und `Lauf` anlegen**: Die Vorbereitung wäre sofort messbar, aber jeder noch nicht gestartete Satz würde im Verlauf, in Bestzeiten und im Backup als unvollständiger Lauf auftauchen. Außerdem müsste jede Planänderung bestehende Läufe umschreiben.
- **Nur die Einstellungen als Vorlage speichern**: Deckt „nächster Lauf“ ab, aber nicht mehrere Sätze in einer Einheit und keine Aktivenliste über Sätze hinweg.
- **Ein Trainingssatz als eigenes Messobjekt**: Hätte eine zweite Zeitachse neben `Satz`/`Lauf` gebraucht. Der vorhandene Zeitkern (Serie mit festem Takt, Startversatz, Undo) bliebe ungenutzt.
- **Automatisch zum nächsten Satz springen**: Ein Timer im Hintergrund würde im gedrosselten Browser unzuverlässig und nähme dem Trainer die Kontrolle über die Pause. Der nächste Satz wird deshalb bewusst gestartet.

## Consequences

- `Training` wird getrennt von `Satz` und `Lauf` gespeichert (eigener IndexedDB-Store, Teil des Backups). Ein Training verweist über `gestartet` auf die Sätze, die bereits daraus entstanden sind.
- Beim Start eines Trainingssatzes entstehen alle Wiederholungen auf einmal, genau wie bei einer Serie im Timer. Die Startzeitpunkte werden aus `now` berechnet; es gibt keinen Timer, der später etwas nachholt.
- Der Fortschritt wird aus den vorhandenen `Satz`- und `Lauf`-Daten abgeleitet. Eine verwaiste Zuordnung (gelöschter Satz) fällt automatisch auf „offen“ zurück; ein zusätzlicher Status kann nicht aus dem Takt geraten.
- Aktive und Bahnenzahl liegen am Training. Beim Start werden sie in die Bahnen kopiert. Spätere Änderungen gelten nur für kommende Sätze und schreiben keine bereits gemessenen Zeiten um.
- Nur noch nicht gestartete Trainingssätze sind bearbeitbar. Gestartete Sätze lassen sich im Timer weiter bedienen (Schwimmer zuordnen, Anschläge korrigieren); ein Löschen des Trainings löscht den Plan, nicht den Verlauf.
- Das Training ist ein eigener Tab. Ein Training beginnt mit einem Satz aus den aktuellen Einstellungen, damit die Vorbereitung ohne leeres Formular startet.
