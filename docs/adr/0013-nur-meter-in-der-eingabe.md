# 0013 — Nur Meter in der Eingabe

## Status

Angenommen, 2026-10-30. Ergänzt ADR 0009.

## Kontext

ADR 0009 führte Meter und Yards als gleichwertige Anzeige-Einheiten ein. In der
Praxis wird die App ausschließlich an Meterbecken verwendet. Die Einheitenwahl
kostet im Konfigurations-Sheet, im Onboarding und im Trainingssatz-Sheet jeweils
einen eigenen Schritt, ohne einen Nutzen zu haben. Zwei Personen, die dieselbe
Strecke schwimmen, sollen nicht versehentlich in getrennten Bestzeiten landen,
nur weil eine unsichtbare Einheit anders gesetzt ist.

Alte Daten und Backups können Yard-Läufe enthalten und müssen weiterhin lesbar
bleiben. Eine nachträgliche Umrechnung vorhandener Messungen wäre falsch: Die
gemessene Zeit gehört zu der Bahnlänge, auf der sie entstanden ist.

## Entscheidung

- **Keine Einheitenwahl mehr.** Onboarding, Konfigurations-Sheet und
  Trainingssatz-Sheet bieten nur noch Meter an. Neue Läufe, Sätze und Trainings
  werden ohne `einheit` gespeichert; fehlt das Feld, gilt Meter.
- **Meter bleibt die kanonische Eingabe.** `beckenlaengeM` und `streckeM` werden
  weiterhin in Metern gespeichert. Die Beckenlängen sind 25 m und 50 m.
- **Alte Yard-Daten bleiben lesbar.** Vorhandene Läufe und Sätze mit
  `einheit: 'yd'` werden unverändert angezeigt und ausgewertet. Sie behalten
  ihre getrennten Bestzeiten, weil ihre Zeiten auf einer anderen Bahnlänge
  entstanden sind.
- **Alte Einstellungen werden beim Laden zu Meter.** Eine gespeicherte
  Yard-Konfiguration in den Einstellungen oder in einem bearbeiteten
  Trainingssatz wird übernommen, indem die angezeigten Zahlen beibehalten
  werden: 25 yd werden 25 m, 100 yd werden 100 m. Danach entfällt das Feld
  `einheit`. So bleibt keine unsichtbare Einheit zurück, die den nächsten Lauf
  unbemerkt steuert.
- **Die Domäne behält die Umrechnung.** `domain/einheit.ts` bleibt die einzige
  Stelle für die Anzeige alter Yard-Daten. Neue Oberflächen rufen sie nur noch
  mit `'m'` auf.

## Alternativen

- **Einheitenwahl behalten, aber standardmäßig ausblenden.** Löst das
  Bedienproblem nicht und lässt die Möglichkeit offen, versehentlich wieder in
  Yards zu geraten.
- **Alle Yard-Daten beim Laden in Meter umrechnen.** Würde gemessene Zeiten
  nachträglich einer anderen Strecke zuordnen und Bestzeiten vermischen. Das
  verletzt die Herkunft der Messung.
- **`einheit` aus dem Datenmodell entfernen.** Alte Backups würden dann beim
  Import abgelehnt oder stillschweigend falsch gelesen. Das Feld bleibt als
  reines Lesefeld für Bestandsdaten erhalten.

## Folgen

- Die Einstellungen normalisieren beim Lesen und Schreiben auf Meter.
- Das Konfigurations-Sheet beginnt direkt mit der Beckenlänge; das Onboarding
  hat in Schritt 2 nur noch Becken und Strecke.
- Handbuch und Design-Referenz beschreiben keine Einheitenwahl mehr. Die
  Auswertung alter Yard-Läufe bleibt dokumentiert.
- `einheitVon`, `formatStreckeEinheit` und `pacePro100Einheit` bleiben für alte
  Daten bestehen.
