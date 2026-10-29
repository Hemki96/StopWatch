# Zeitbasis bei der Tab-Übergabe

## Kontext

Eine Messung lebt von `performance.now()`. Der Nullpunkt dieser Uhr gehört zum Dokument: Nach
einem Reload und in einem anderen Tab ist derselbe Zahlenwert eine andere Zeit. Deshalb setzt
`normalizeOnLoad` laufende Bahnen beim Laden auf „bereit“ zurück. Das ist für einen Reload richtig,
war aber auch auf dem Pfad „Hier weiterarbeiten“ aktiv: Der zweite Tab lud den Bestand, verwarf
alle Startzeiten und zeigte eine laufende Messung als „bereit“ an. Ein weiterer Tap hätte neu
gestartet statt den nächsten Anschlag zu erfassen.

## Entscheidung

Bei einer **Tab-Übergabe** bleibt die Messung erhalten. Der neue Tab lädt die Läufe mit
`behalteLaufende: true` und verschiebt jede gestartete Bahn über `rebaseLauf` auf seine eigene
Uhr. Die Umrechnung nutzt den bereits gespeicherten Wanduhr-Anker `startWallMs`:

```
Wanduhr-Start = startWallMs + (startMs - frühester Start)
neuer startMs = performance.now() + (Wanduhr-Start - Date.now())
```

Der früheste Start eines Laufs entspricht `startWallMs`; Abstände zwischen Bahnen und Reihen
bleiben dadurch erhalten. Die Umrechnung ist pro Lauf unabhängig, weil jeder Lauf seinen eigenen
Anker trägt. Ein Reload (`neuLaden`, Backup-Import, Seitenaufruf) normalisiert weiterhin wie
bisher.

## Alternativen

- **Übergabe während einer Messung sperren.** Sicher, aber die Funktion „Hier weiterarbeiten“
  wäre mitten im Lauf unbrauchbar; ein eingefrorener Tab ließe sich nicht ablösen.
- **Startzeiten unverändert übernehmen.** Falsch, weil `performance.now()` dokumentlokal ist.
- **Start aus der Wanduhr rekonstruieren.** Würde auch die Zeit zwischen letztem Anschlag und
  Reload überbrücken, ändert aber die dokumentierte Grenze „kein Fortsetzen nach Reload“ und
  macht die Messung von einer potenziell springenden Systemuhr abhängig.

## Folgen

- Eine laufende Messung übersteht den Tab-Wechsel; die e2e-Spec prüft, dass die Bahn danach
  weiterläuft und der nächste Tap den zweiten Anschlag erfasst.
- Nach einem echten Reload bleibt die bisherige Regel: Startzeiten sind weg, Anschläge bleiben.
  Solche Bahnen erscheinen als **unterbrochen** und lassen sich nicht versehentlich neu starten.
- `startWallMs` wird zur fachlichen Schnittstelle zwischen Dokumenten. Wer das Feld entfernt oder
  anders interpretiert, bricht die Übergabe.
- Die Systemuhr beeinflusst nur den Übergang, nicht die laufende Messung: Innerhalb eines
  Dokuments zählt weiterhin ausschließlich `performance.now()`.
