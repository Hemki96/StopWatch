# 0009 — Meter und Yards: kanonisch in Metern, getrennte Bestzeiten

## Status

Angenommen, 2026-10-29. Die Einheitenwahl in der Oberfläche entfällt mit
[ADR 0013](0013-nur-meter-in-der-eingabe.md); die kanonische Speicherung und die
Lesbarkeit alter Yard-Daten bleiben bestehen.

## Kontext

Die App misst bisher ausschließlich in Meterbecken. In der Praxis gibt es
daneben 25-Yard-Becken. Eine Yard-Zeit auf einer 25-Yard-Bahn ist nicht mit
einer Meter-Zeit vergleichbar: 100 yd sind 91,44 m, und ein 1:00 auf 100 yd
entspricht nicht einem 1:00 auf 100 m. Eine reine Umrechnung der Anzeige würde
Bestzeiten, Pace und Rekorde vermischen.

Außerdem sind die vorhandenen Daten und Backups ausschließlich metrisch. Sie
müssen unverändert lesbar bleiben und dürfen nicht nachträglich umgerechnet
werden.

## Entscheidung

- **Kanonische Speicherung:** `LaufKonfiguration.beckenlaengeM` und
  `streckeM` bleiben immer Meter. Ein Yard-Lauf speichert 25 yd als `22.86` m
  und 100 yd als `91.44` m. Die Anzeige-Einheit steht getrennt in
  `konfiguration.einheit` (`m` oder `yd`); fehlt sie, gilt `m`.
- **Ein Feld für alle Kontexte:** `Lauf`, `Satz` und `TrainingsSatz` tragen die
  Einheit über dieselbe `LaufKonfiguration`.
- **Eine Umrechnungsstelle:** `src/domain/einheit.ts` enthält den Faktor
  1 yd = 0,9144 m, die Anzeige-Rundung auf ganze Yards, die Beckenlängen je
  Einheit und die Pace pro 100 in der jeweiligen Einheit. Anzeige-, Eingabe-
  und Exportcode rufen nur diese Funktionen auf.
- **Getrennte Bestzeiten:** `pbKey` enthält die Einheit. Meter- und
  Yard-Becken erzeugen damit getrennte Bestzeiten. Das gilt auch dann, wenn
  ein Meter- und ein Yard-Becken zufällig dieselbe kanonische Länge hätten.
- **Grenzen:** Für Yards ist nur das 25-Yard-Becken vorgesehen. Strecken sind
  ganze Yard-Vielfache; die kanonischen Meter werden auf zwei
  Nachkommastellen gerundet. Ein Yard-Eintrag in einem Meter-Lauf (und
  umgekehrt) wird abgelehnt, statt still umgerechnet zu werden.
- **Rückwärtskompatibilität:** Backup-Version und IndexedDB-Schema bleiben
  unverändert. Fehlende Einheiten in alten Daten und Backups bedeuten Meter;
  vorhandene Meter-Läufe werden nicht angefasst. `beckenlaengeM` akzeptiert
  zusätzlich `22.86`.
- **Anzeige:** Strecken, Beckenlängen, Längen-Splits, Pace und
  Gruppentitel der Bestzeiten nennen die Einheit des Laufs. Die
  Reihenfolge der CSV-Spalten wird um `einheit` und die Anzeige-Strecke
  ergänzt; die kanonischen Meter bleiben für Berechnungen erhalten.

## Alternativen

- **Yards nur als Anzeige umrechnen.** Das hätte keine Schemaänderung
  gebraucht, würde aber Yard- und Meter-Zeiten in dieselbe Bestzeit werfen und
  die Pace falsch beschriften.
- **Kanonisch in Yards speichern.** Dann müssten alle bestehenden Meter-Daten
  migriert werden, und jede Anzeige müsste rückrechnen. Meter bleiben die
  gemeinsame Basis, weil die App und ihre Daten bisher metrisch sind.
- **Ein zweites Beckenlängen-Feld für Yards.** `beckenlaengeM: 22.86` plus
  `einheit: 'yd'` beschreibt ein 25-Yard-Becken bereits eindeutig; ein
  zusätzliches Feld wäre eine zweite Wahrheit.

## Folgen

- `Beckenlaenge` ist nicht mehr auf `25 | 50` beschränkt, sondern kennt
  `22.86` für 25 yd. Validierungen prüfen Vielfache mit einer kleinen Toleranz,
  weil `91.44 / 22.86` in Gleitkomma nicht exakt `4` ergibt.
- Das Handbuch beschreibt Umrechnung, Bedienung und die Grenzen; die
  Datenmodell- und Domain-Referenz nennen die abgeleiteten Anzeigen.
- Alte Backups ohne Einheit bleiben unverändert gültig. Ein Import schreibt
  keine Einheit in bestehende Meter-Datensätze.
