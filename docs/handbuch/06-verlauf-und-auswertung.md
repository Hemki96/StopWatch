# Verlauf und Auswertung

Der Tab **Verlauf** zeigt alle Messungen, die tatsächlich begonnen haben. Von dort führt der Weg zu
Splits, Korrekturen, Bestzeiten und CSV-Exporten.

## Was im Verlauf erscheint

Die Läufe werden nach **Satz** gruppiert. Ein Satz ist die gemeinsame Klammer für Läufe mit gleicher
Konfiguration am selben Tag; eine Serie hat einen eigenen Satz, ein Wettkampf hat einen Satz pro
Disziplin.

Eine Gruppe erscheint, sobald mindestens ein Lauf darin begonnen hat:

- Ein einzelner Lauf erscheint mit seinem Start, auch wenn noch kein Anschlag erfasst wurde.
- Die erste Wiederholung einer Serie erscheint mit ihrem Start.
- Spätere Wiederholungen einer Serie erscheinen erst mit dem ersten Anschlag. Rein geplante Runden
  bleiben im Timer und tauchen nicht als unvollständige Läufe im Verlauf auf.

Die Kopfzeile einer Gruppe zeigt:

- das Datum,
- den Satztitel (antippbar zum Umbenennen),
- ggf. das Badge **Takt** mit der Taktzeit,
- ggf. das Badge **Wettkampf**,
- den Papierkorb zum Löschen des Satzes.

Ein Lauf erscheint mit:

- Anzahl Bahnen und Strecke,
- Badge **unvollständig**, wenn nicht alle Bahnen im Ziel sind,
- Runde (`R2`) bzw. Lauf (`Lauf 2`) bei Serien und Wettkämpfen,
- Startuhrzeit,
- schnellster Zeit,
- Wettkampfname, falls zutreffend.

## Satz umbenennen

Ein Tipp auf den Satztitel macht ihn editierbar:

- **Enter** oder außerhalb tippen speichert.
- **Escape** bricht ab.
- Der Titel erscheint im Verlauf und in der Spalte `satz` des CSV-Exports.
- Ein leerer Titel ist erlaubt; der Verlauf zeigt dann wieder eine automatisch gebildete
  Bezeichnung.

Der Satz **„Ohne Satz“** steht für Läufe ohne zugehörigen Satz. Er lässt sich nicht umbenennen.

## Satz löschen

Der Papierkorb neben dem Titel fragt:

> `3 Läufe werden mitgelöscht. Das lässt sich nicht rückgängig machen.`

Gelöscht werden der Satz und **alle** seine Läufe — auch solche, die im Verlauf gerade nicht
angezeigt werden, etwa unberührte Wiederholungen einer Serie. Vorher ein Backup sichern.

## Lauf-Detail

Ein Tipp auf einen Lauf öffnet das Detail. Es zeigt:

- Datum und Startuhrzeit,
- Anzahl Bahnen und Strecke,
- Beckenlänge, Schwimmart und ggf. Startversatz,
- bei Serien und Wettkämpfen die Runde bzw. den Lauf und den Takt,
- einen Hinweis, wenn der Lauf unvollständig ist.

### Bahnen und Zeiten

Pro Bahn:

| Element | Bedeutung |
| --- | --- |
| **Bahnnummer** | 1 bis 10 |
| **Schwimmer-Auswahl** | Ordnet die Bahn einem vorhandenen Schwimmer zu oder entfernt die Zuordnung |
| **Zielzeit** | Die Finish-Zeit, oder `—` |
| **Bestzeit / Delta** | `Bestzeit`, `+01,23 zum PB` oder `-00,45 zum PB` |
| **manuell** | Die Zielzeit wurde von Hand eingetragen oder korrigiert |
| **Pace** | Zeit pro 100 m, nur bei fester Strecke |

Die Schwimmerzuordnung lässt sich auch nachträglich ändern. Die Zeiten bleiben dabei erhalten. Das
ist nützlich, wenn eine Bahn während des Laufs falsch zugeordnet war.

### Splits

Unter jeder Bahn stehen die Anschläge:

- Bei fester Strecke mit der Distanz, z. B. `50 m`, `100 m`.
- Bei offener Strecke ebenfalls mit der kumulierten Distanz.
- Im Wettkampf mit **Ziel** statt einer Längenbezeichnung.
- Das letzte Finish trägt das Badge **Ziel**.
- Von Hand korrigierte Anschläge tragen das Badge **manuell**.

## Splits korrigieren

1. Im Lauf-Detail bei der gewünschten Zeit auf das **Stift**-Symbol tippen.
2. Eine Zeit wie `01:23,45` eingeben.
3. **OK** tippen.

Die Eingabe akzeptiert:

- `01:23,45`
- `1:23,45`
- `83,45`
- auch `1:23.45` mit Punkt statt Komma

Nicht akzeptiert werden negativen Werte, Buchstaben oder Sekunden ab 60 innerhalb einer Minute.

### Regeln

- Die neue Zeit muss **nach** dem vorherigen Anschlag liegen.
- Sie muss **vor** dem nächsten Anschlag liegen.
- Das Finish-Flag bleibt erhalten: Ein Zwischenanschlag wird nie zum Ziel, ein Ziel nie zum
  Zwischenanschlag.
- Folgende Zeiten werden **nicht** automatisch verschoben. Eine Korrektur wirkt genau auf einen
  Anschlag.
- Jede Korrektur markiert den Anschlag als **manuell**. Das bleibt im Detail und im CSV sichtbar.

Beispiel: Ein Split bei 50 m wird von `00:31,20` auf `00:30,95` korrigiert. Der Anschlag bei 100 m
bleibt bei `01:02,40`; die Korrektur verändert also die zweite Längenzeit, nicht die Zielzeit.

## Bestzeiten

Eine **Bestzeit (PB)** gilt je Kombination aus:

- Schwimmer:in,
- Strecke,
- Schwimmart,
- Beckenlänge.

Kurzbahn und Langbahn sind bewusst getrennt, weil sie nicht vergleichbar sind. Offene Strecken
erzeugen keine Bestzeit.

Eine Zielzeit zählt, sobald sie als Finish erfasst ist. Ein Lauf, in dem nicht alle Bahnen im Ziel
sind, wird im Verlauf und im Detail als **unvollständig** markiert; die vorhandenen Zielzeiten
bleiben aber sichtbar und werden für die Bestzeit herangezogen. Prüfe in diesem Fall, ob die
Messung belastbar ist.

### Wo Bestzeiten erscheinen

- **Lauf-Detail:** Delta zur Bestzeit bzw. Badge **Bestzeit** neben der Zielzeit.
- **Schwimmer-Tab:** pro Schwimmer:in Gruppen mit Bestzeit und Zeitverlauf.
- **Wettkampf:** Platzierung und Rückstand, unabhängig von der Bestzeit.

### Schwimmer-Tab

Der Tab **Schwimmer** listet **alle** Personen, auch solche ohne Bahnzuordnung. Die Liste filtert
bewusst nicht auf gemessene Schwimmer:innen — sonst ließe sich ein Name, der noch keiner Bahn
zugeordnet ist, nicht mehr bearbeiten oder später zuordnen. Diese Regel ist eine bewusste Abweichung
von der ursprünglichen Anforderung in [#19](https://github.com/Hemki96/StopWatch/issues/19); ein
Regressionstest in `e2e/schwimmer.spec.ts` hält sie fest.

Ein Tipp klappt die Bestzeiten auf:

- Gruppen nach Strecke, Schwimmart und Beckenlänge, z. B. `100 m · Freistil · 50 m`.
- Die schnellste Zeit ist grün markiert.
- Darunter stehen die Zeiten chronologisch mit Datum (Tag/Monat).
- Manuell korrigierte Zeiten tragen den Hinweis **korrigiert**.
- Ein Eintrag ohne Zielzeit zeigt „noch keine Zielzeit“; ohne Bahnzuordnung „noch keiner Bahn
  zugeordnet“.

Jede Zeit ist antippbar und öffnet das **Lauf-Detail** des Laufs, in dem sie gemessen wurde — aus
Training und Wettkampf gleichermaßen. Der Rückweg führt zum selben aufgeklappten Schwimmer; der
Screenreader-Text nennt Schwimmer, Datum und Zeit.

Ein Klick auf **Bearbeiten** öffnet Name, Jahrgang und Notiz. Beim Löschen einer Person bleiben die
gemessenen Zeiten erhalten, verlieren aber ihre Zuordnung. Die Person wird außerdem aus den
Standardwerten und aus vorbereiteten Trainings entfernt.

## Analyse

Der Verlauf hat zwei Ansichten: **Verlauf** und **Analyse**. Der Umschalter sitzt in der
Kopfzeile; die Wahl wird nicht gespeichert. Die Analyse zeigt nur Sätze mit **Zwischenzeiten** —
Wettkampf-Läufe haben keine Splits und erscheinen dort nicht.

### Satzliste

Die Liste ist wie der Verlauf nach Tag gruppiert, neueste Sätze zuerst. Jede Zeile nennt
Bezeichnung, Konfiguration und die durchschnittliche Abweichung je Runde (`R2 +01,20`).
Unvollständige und manuell korrigierte Sätze tragen ein Kennzeichen.

### Matrix Person × Runde

Ein Tipp auf einen Satz öffnet die Matrix:

- **Zeilen** sind Personen, nach Bahnnummer sortiert.
- **Spalten** sind die Runden. Die aktuelle Runde ist markiert.
- Die Zelle zeigt die **Zielzeit**; darunter steht die **Abweichung zur Vorrunde** desselben
  Schwimmers. Grün heißt schneller, rot langsamer, grau gleich oder ohne Bezug. Die Zeit selbst
  bleibt ungefärbt; die schnellste Zeit je Runde ist fett.
- Fehlende Zeiten bleiben leer; unvollständige und manuell korrigierte Zellen sind markiert.
- Die Spalte **zuletzt** zeigt die Zielzeiten derselben Personen aus dem letzten vergleichbaren
  Satz. Darüber steht die Referenz mit Datum und Takt, z. B. `zuletzt: 22.10. · Takt 02:00`.

Verglichen wird nur bei gleicher **Strecke, Schwimmart, Beckenlänge und Rundenzahl**. Der Takt
zählt nicht zum Ausschluss, wird aber genannt. Offene Strecken erscheinen in der Matrix, aber nie
als Referenz für einen anderen Satz. Fehlt eine Person in der Referenz, bleibt ihre Zelle leer.

### Längenzeiten einer Person

Ein Tipp auf eine Personenzeile öffnet die **Längenzeiten** über alle Runden:

- Zeilen sind die Längen (`50 m`, `100 m`, …), Spalten die Runden.
- Der Wert ist die **Längenzeit**, nicht die kumulierte Splitzeit; darunter steht die Abweichung
  zur Vorrunde.
- Läuft der Satz noch, bleiben spätere Längen leer.

Es gibt keine Diagramme und keine manuelle Referenzwahl. Mehrere Runden lassen sich nur vergleichen,
wenn sie zur selben Strecke und Beckenlänge gehören.

## CSV-Export

Es gibt drei Wege:

| Ort | Umfang |
| --- | --- |
| **Mehr → Ergebnisse als CSV** | alle Läufe |
| **Lauf-Detail → Download** | genau dieser Lauf |
| **Wettkampf → Download** | Wettkampfergebnisse (eigenes Format, siehe [Wettkampf](05-wettkampf.md#ergebnisse-exportieren)) |

### Trainings-CSV: eine Zeile pro Anschlag

Die Datei heißt `beckenrand-JJJJ-MM-TT.csv` und enthält:

| Spalte | Inhalt |
| --- | --- |
| `satz` | Satzbezeichnung, ggf. leer |
| `datum` | lokales Datum des Laufs |
| `beckenlaenge_m` | 25 oder 50 |
| `strecke_m` | Strecke oder leer bei offener Strecke |
| `schwimmart` | interner Wert, z. B. `freistil` |
| `bahn` | Bahnnummer |
| `schwimmer` | Name oder leer |
| `laenge_nr` | fortlaufende Nummer des Anschlags |
| `split_ms` | kumulierte Zeit in Millisekunden |
| `split_formatiert` | Zeit als `mm:ss,hh` |
| `ist_finish` | `1` für das Ziel, sonst `0` |
| `manuell` | `1` für korrigierte Anschläge |
| `wiederholung` | Rundennummer bei Serien/Wettkämpfen |
| `wiederholungen` | Anzahl der Runden bei einer Serie |
| `takt_s` | Takt in Sekunden |
| `startversatz_ms` | Startversatz in Millisekunden |

Wichtige Eigenschaften:

- **Langformat:** eine Zeile pro Anschlag, nicht pro Bahn. Eine Bahn ohne Anschlag erzeugt keine
  Zeile.
- **Finish filtern:** Für Zielzeiten `ist_finish=1` verwenden.
- **Sortierung:** nach Startzeit aufsteigend.
- **Semikolon und UTF-8-BOM:** deutsches Excel öffnet die Datei ohne Import-Dialog.
- **Formelschutz:** Texte, die mit `=`, `+`, `-` oder `@` beginnen, erhalten ein führendes
  Apostroph, damit Excel sie nicht als Formel ausführt. Der sichtbare Text bleibt gleich.
- **Teilen:** Auf Geräten mit Web Share API öffnet sich das Share-Sheet; sonst wird die Datei
  heruntergeladen.

### Auswertung in Excel oder LibreOffice

Typische Auswertungen:

- **Zielzeiten:** `ist_finish = 1` filtern, dann nach `schwimmer`, `strecke_m`, `schwimmart` und
  `beckenlaenge_m` gruppieren.
- **Splits:** `split_ms` in Sekunden umrechnen (`/1000`) und pro `lauf`/`bahn` sortieren.
- **Serien:** nach `satz` und `wiederholung` gruppieren; `takt_s` und `startversatz_ms` stehen in
  jeder Zeile.
- **Korrekturen:** `manuell = 1` markiert alle von Hand geänderten Zeiten.

## Löschen

| Aktion | Folge |
| --- | --- |
| **Lauf löschen** im Detail | Der Lauf und alle seine Zeiten werden entfernt. War es der letzte Lauf seines Satzes, verschwindet auch der Satz. |
| **Satz löschen** im Verlauf | Der Satz und alle zugehörigen Läufe werden entfernt. |
| **Alle Daten löschen** unter Mehr | Alle Schwimmer, Trainings, Wettkämpfe, Sätze und Läufe werden entfernt. |

Alle drei Aktionen sind endgültig. Ein Backup ist die einzige Wiederherstellung.

## Grenzen der Auswertung

- Bestzeiten brauchen eine feste Strecke und eine zugeordnete Schwimmerin.
- Ein Lauf ohne Finish erzeugt keine Zielzeit.
- Die App führt keine Saison-, Alters- oder Wettkampfwertung. Dafür ist der CSV-Export gedacht.
- Die Anzeige schneidet auf Hundertstel ab; die CSV enthält zusätzlich den Rohwert in
  Millisekunden.
- Ein Lauf, der nach einem Reload unterbrochen wurde, ist keine saubere Messung. Bereits erfasste
  Splits bleiben sichtbar, sollten aber nicht als Wettkampfzeit verwendet werden.

## Verwandte Seiten

- [Timer und Bahnen](02-timer.md) — wie die Zeiten entstehen
- [Serien](03-serien.md) — Runden und Takt
- [Wettkampf](05-wettkampf.md) — Wettkampf-CSV und Platzierung
- [Daten und Backup](07-daten-und-backup.md) — Sicherung und Wiederherstellung
