# Ein Lauf besteht aus unabhängigen Bahnen mit gemeinsamem Start

Ein `Lauf` ist keine einzelne Uhr mit mehreren Zwischenzeiten, sondern eine Menge von `Bahn`-Timern. „Start alle“ setzt allen Bahnen denselben Startzeitstempel; danach läuft und endet jede Bahn für sich. Ein Einzel-Stoppuhr-Lauf ist derselbe Code mit einer Bahn.

## Considered Options

- **Eine Uhr, viele Anschläge**: Ein Start, jeder Anschlag erzeugt einen Zeitstempel, der hinterher einer Bahn zugeordnet wird. Scheitert daran, dass bei sechs Anschlägen in zwei Sekunden die Zuordnung geraten werden muss.
- **Unabhängige Stoppuhren pro Bahn**: Jede Bahn startet und stoppt allein. Deckt versetzte Starts ab, macht aber den häufigsten Fall — gemeinsamer Start — zur Mehrfachbedienung.

## Consequences

- Jede Bahn speichert ihren eigenen `startMs`. Ein gemeinsamer Start ist nur ein Schreibvorgang über alle Bahnen.
- Splits sind immer relativ zum Start der eigenen Bahn. Ein Lauf-weiter Startzeitpunkt existiert nur als Wanduhr-Anker (`startWallMs`).
- Versetzte Starts und Einzelmessungen brauchen keine Sonderfälle.
