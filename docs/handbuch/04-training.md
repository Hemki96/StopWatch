# Training

Ein **Training** ist die Vorbereitung einer ganzen Einheit. Vorab werden die **Aktiven** je Bahn und
**Reihe** sowie mehrere **Trainingssätze** in fester Reihenfolge festgelegt. Am Beckenrand wird dann
Satz für Satz gestartet. Noch offene Sätze — also solche, aus denen noch keine Läufe entstanden sind —
lassen sich während des Trainings ändern, ergänzen, löschen oder verschieben.

Das Training ist damit mehr als eine Serie: Es bündelt mehrere Sätze, eine gemeinsame Aktivenliste
und den Fortschritt über die gesamte Einheit.

## Trainingsplan und Messung sind getrennt

Ein Trainingssatz ist zunächst **nur ein Plan**. Er enthält Bezeichnung, Strecke, Schwimmart,
Wiederholungen, Takt und Startversatz — aber keine Zeiten.

Erst beim Start entstehen aus einem Trainingssatz:

- ein **Satz** mit seiner Konfiguration,
- ein **Lauf** pro Wiederholung,
- die Bahnen mit den zu diesem Zeitpunkt gültigen Aktiven.

Vorher taucht der Satz nicht im Verlauf und nicht in den Bestzeiten auf. Das verhindert, dass eine
lange Planung als viele unvollständige Läufe erscheint.

## Ein Training anlegen

1. Tab **Training** öffnen.
2. Auf **Neues Training** tippen.
3. Die App legt ein Training für heute an. Es übernimmt aus den aktuellen Einstellungen:
   - die Anzahl der Bahnen je Reihe und die Reihenzahl,
   - die Schwimmerzuordnung,
   - den ersten Satz mit Strecke, Schwimmart, Wiederholungen, Takt und Startversatz.
4. Das Training öffnet sich direkt. Name, Aktive und Sätze lassen sich jetzt anpassen.

Ein neu angelegtes Training heißt zunächst **„Training“**. Der Name lässt sich über einen Tipp auf
den Titel ändern („Training benennen“, z. B. „Kader A, Dienstag“). Das Datum wird beim Anlegen
gesetzt und ist nicht nachträglich editierbar.

Es gibt bewusst keine Kopierfunktion: Ein neues Training startet aus den aktuellen Einstellungen,
nicht aus dem letzten Plan. So bleibt der Einstieg kurz und der alte Plan unverändert.

## Die Trainingsliste

Der Tab zeigt alle vorbereiteten Trainings als Karten:

- Datum (Wochentag und Tag/Monat),
- Bezeichnung,
- Anzahl Sätze und Aktive,
- `fertig/gesamt erledigt`,
- Badge **„abgeschlossen“**, wenn alle Sätze fertig sind.

Ein Tipp öffnet das Training. Der leere Zustand erklärt, wofür ein Training gedacht ist.

## Aktive festlegen

Die Karte **Aktive** zeigt die Aufteilung in Reihen und die zugeordneten Namen. Ein Tipp öffnet das
Sheet:

| Feld | Bedeutung |
| --- | --- |
| **Bahnen pro Reihe** | 1 bis 10. Gilt für alle noch nicht gestarteten Sätze. |
| **Reihen** | 1 bis 5 Startgruppen; jede startet gemeinsam, die nächste nach dem Reihenversatz. |
| **Wer schwimmt mit?** | Ein Schwimmer pro Person aus dem Tab **Schwimmer**; leer bedeutet ohne Zuordnung. |
| **Einheit** | Meter oder Yards; gilt für Strecke, Becken und Pace dieses Satzes. |

Die Aktiven gelten für alle Sätze, die noch **nicht angelegt** sind. Ein Satz wird beim ersten Start
angelegt. Bereits angelegte Sätze — auch solche, die nach einem Reload nur „bereit“ sind — behalten
ihre Bahnen und Zuordnungen, damit gemessene Zeiten nicht nachträglich einer anderen Person
zugeordnet werden. Eine Änderung der Aufteilung schneidet überzählige Plätze ab bzw. ergänzt leere
Plätze; eine Person bleibt dabei in ihrer Reihe und an ihrer Bahn. Wird eine Reihe entfernt, fallen
ihre Plätze weg.

Wer noch keine Schwimmer angelegt hat, kann das im Tab **Schwimmer** tun. Namen sind optional; die
Messung funktioniert auch mit „Ohne Namen“.

## Sätze planen

Die Liste **Sätze** zeigt jeden Trainingssatz mit:

- laufender Nummer,
- Titel (eigene Bezeichnung oder automatisch z. B. `4×100 m · Freistil`),
- Metazeile: Beckenlänge, ggf. Takt, ggf. Startversatz,
- Status: `offen`, `bereit`, `läuft` oder `fertig`,
- bei laufenden Sätzen: `x von y Runden vollständig · antippen zum Weiterarbeiten`.

### Status eines Trainingssatzes

| Status | Bedeutung |
| --- | --- |
| **offen** | Nur der Plan existiert. Antippen öffnet die Bearbeitung. |
| **bereit** | Der Satz wurde angelegt, aber noch keine Bahn gestartet oder erfasst. Antippen führt zum Timer. |
| **läuft** | Mindestens eine Bahn wurde gestartet oder hat einen Anschlag. Antippen führt zum Timer. |
| **fertig** | Alle Läufe des Satzes sind vollständig im Ziel. Der Satz ist nicht mehr bearbeitbar. |

### Satz hinzufügen

**Satz hinzufügen** öffnet ein Sheet. Es übernimmt die Werte des letzten Satzes als Ausgangspunkt,
lässt aber die Bezeichnung leer und vergibt eine neue ID. Maximal sind **20 Sätze** pro Training
möglich; danach ist der Knopf deaktiviert.

### Satz bearbeiten

Ein Tipp auf einen **offenen** Satz öffnet „Satz N bearbeiten“:

| Feld | Werte |
| --- | --- |
| **Bezeichnung** | frei, z. B. „Einschwimmen“; leer = automatisch aus Strecke und Schwimmart |
| **Beckenlänge** | 25 m oder 50 m |
| **Strecke** | 50, 100, 200, 400, 800, 1.500 m oder **offen** |
| **Schwimmart** | Freistil, Brust, Rücken, Schmetterling, Lagen, Beliebig |
| **Wiederholungen** | 1 bis 20; 1 = einzelner Lauf |
| **Takt** | nur bei mehreren Wiederholungen; Start zu Start |
| **Startversatz** | 0 bis 120 s zwischen den Reihen |

Unten stehen **Nach oben**, **Nach unten** und **Satz löschen**. Die Reihenfolge lässt sich nur so
ändern; Drag-and-drop gibt es nicht. Ein Training braucht mindestens einen Satz — der letzte Satz
lässt sich nicht löschen, die App zeigt stattdessen einen Hinweis.

Die Strecke muss ein Vielfaches der Beckenlänge sein. Bei einem Wechsel der Beckenlänge korrigiert
die App eine unpassende Strecke auf zwei Bahnlängen. Ungültige Eingaben werden vor dem Speichern
angezeigt, und **Satz speichern** bleibt deaktiviert.

### Bearbeitungsregel

Ein Trainingssatz ist nur bearbeitbar, solange er **offen** ist — also bevor er zum ersten Mal
gestartet und damit angelegt wurde. Sobald ein Satz angelegt ist, zählen die gemessenen Läufe.
Änderungen an Aktiven, Bahnenzahl und Reihenfolge gelten nur für die kommenden, noch nicht
angelegten Sätze.

Das ist bewusst streng: Eine nachträgliche Änderung würde sonst gespeicherte Zeiten, Bestzeiten und
den Verlauf umschreiben.

## Einen Satz starten

Unten steht immer die nächste sinnvolle Aktion:

| Situation | Knopf |
| --- | --- |
| Ein Satz ist offen | **Satz N starten** |
| Ein Satz ist bereit oder läuft | **Zum laufenden Satz** |
| Alle Sätze fertig | **Training abgeschlossen** (kein Knopf) |

Der nächste Satz ist zuerst ein bereits angelegter oder laufender Satz, sonst der erste noch offene.
Die feste Reihenfolge wird also eingehalten.

Beim ersten Start eines Satzes passiert Folgendes:

1. Die App legt den Satz und alle Wiederholungen an.
2. Die Aktiven werden in die Bahnen kopiert.
3. Die Startzeiten werden — wie bei einer Serie — vorausberechnet.
4. Die erste Runde startet sofort — bei Startversatz startet jede weitere Reihe um den eingestellten
   Abstand später.
5. Die App wechselt in den **Timer**, wo der Satz wie ein normaler Lauf bzw. eine Serie bedient wird.

Bei einem bereits angelegten Satz wird nur zum Timer gewechselt. Ein nach einem Reload
zurückgesetzter Satz muss dort mit **Start alle** bzw. **Weiter** fortgesetzt werden.

## Während des Trainings

Das Training ist ein Plan, kein starres Formular. Während der Einheit gilt:

- Noch nicht gestartete Sätze lassen sich öffnen, ändern, ergänzen, löschen und verschieben.
- Die Aktiven, die Aufteilung in Reihen und die Bahnenzahl lassen sich für kommende Sätze anpassen.
- Gestartete und bereits angelegte Sätze bleiben unverändert und werden im Timer bedient.
- Der Fortschritt oben zählt nur **vollständig** beendete Sätze.
- Nach jedem Satz zurück zum Tab **Training** wechseln und den nächsten starten.

Die Pause zwischen zwei Sätzen wird nicht automatisch überbrückt. Die App startet den nächsten Satz
erst auf ausdrücklichen Tipp. Ein Timer im Hintergrund wäre im gedrosselten Browser unzuverlässig
und würde die Kontrolle über die Pause nehmen.

## Fortschritt

Der Fortschritt wird aus den tatsächlich vorhandenen Sätzen und Läufen abgeleitet, nicht aus einem
separaten Statusfeld. Dadurch kann er nach einem Reload oder nach dem Löschen eines Satzes nicht
„festhängen“:

- Fortschrittsbalken und Text `x von y Sätzen erledigt`.
- Ein Satz ist fertig, wenn alle seine Läufe vollständig sind.
- Eine verwaiste Verknüpfung — der Satz wurde im Verlauf gelöscht — fällt automatisch auf **offen**
  zurück.
- Wird ein Training gelöscht, bleibt der Verlauf erhalten; der Plan verschwindet.

## Training löschen

Der Papierkorb in der Kopfzeile fragt:

> Der Plan wird gelöscht. Bereits gemessene Sätze und Läufe bleiben im Verlauf erhalten.

Das Löschen betrifft also **nur den Plan**. Es ist der sichere Weg, eine Vorlage loszuwerden, ohne
Messdaten zu verlieren. Zum Löschen von Messdaten den Verlauf verwenden.

## Grenzen

| Regel | Wert |
| --- | --- |
| Sätze pro Training | 1 bis 20 |
| Wiederholungen pro Satz | 1 bis 20 |
| Bahnen | 1 bis 10 je Reihe, 1 bis 5 Reihen |
| Takt | 1 s bis 60 min (gängige Werte als Chip, jeder andere über Minuten und Sekunden) |
| Startversatz | 0 bis 120 s zwischen zwei Reihen |
| Strecke | Vielfaches der Beckenlänge oder offen |
| Bearbeitbar | nur Sätze im Status `offen` (noch kein Satz/Läufe angelegt) |

## Empfohlener Ablauf am Beckenrand

**Vorher, in Ruhe:**

1. Training anlegen, Namen vergeben.
2. Aktive und Bahnen prüfen.
3. Sätze in die gewünschte Reihenfolge bringen.
4. Bei jedem Satz Strecke, Schwimmart, Wiederholungen und Takt kontrollieren.

**Am Becken:**

1. Training öffnen.
2. **Satz 1 starten**.
3. Im Timer messen, wie gewohnt.
4. Zurück zum Training, Fortschritt prüfen.
5. **Satz 2 starten** — oder den Plan für die nächsten Sätze anpassen.
6. Am Ende steht **Training abgeschlossen**.

## Abgrenzung zu Serie und Wettkampf

| Frage | Training | Serie | Wettkampf |
| --- | --- | --- | --- |
| Mehrere Sätze in einer Einheit | Ja | Nein | Nein (Disziplinen) |
| Feste Aktive über Sätze hinweg | Ja | Nein | Nein |
| Pausen zwischen Sätzen | Manuell | Im Takt | Zwischen Heats |
| Splits pro Länge | Ja | Ja | Nein |
| Startliste als CSV | Nein | Nein | Ja |
| Plan vor der Einheit | Ja | Teilweise (Einstellungen) | Ja |

## Verwandte Seiten

- [Serien](03-serien.md) — wie Wiederholungen im Takt funktionieren
- [Timer und Bahnen](02-timer.md) — Bedienung während eines Satzes
- [Verlauf und Auswertung](06-verlauf-und-auswertung.md) — was nach dem Training sichtbar bleibt
