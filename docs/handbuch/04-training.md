# Training

Ein **Training** ist die Vorbereitung einer ganzen Einheit. Vorab werden die **Aktiven** je Bahn und
**Reihe** sowie mehrere **Trainingssätze** in fester Reihenfolge festgelegt. Am Beckenrand wird dann
Satz für Satz gestartet. Noch offene Sätze — also solche, aus denen noch keine Läufe entstanden sind —
lassen sich während des Trainings ändern, ergänzen, löschen oder verschieben.

Optional kann das Training die Sätze **automatisch nacheinander starten**: Nach dem letzten Ziel
beginnt der nächste Satz direkt, ohne Rückkehr in diesen Tab. Der Schalter steht über der Satzliste
und lässt sich jederzeit umstellen.

Das Training ist damit mehr als eine Serie: Es bündelt mehrere Sätze, eine gemeinsame Aktivenliste
und den Fortschritt über die gesamte Einheit.

## Trainingsplan und Messung sind getrennt

Ein Trainingssatz ist zunächst **nur ein Plan**. Er enthält Bezeichnung, Strecke, Zwischenzeiten,
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
   - den ersten Satz mit Strecke, Zwischenzeiten, Wiederholungen, Takt und Startversatz.
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

Die Aktiven gelten für alle Sätze, die noch **nicht angelegt** sind. Ein Satz wird beim ersten Start
angelegt. Bereits angelegte Sätze — auch solche, die nach einem Reload nur „bereit“ sind — behalten
ihre Bahnen und Zuordnungen, damit gemessene Zeiten nicht nachträglich einer anderen Person
zugeordnet werden. Eine Änderung der Aufteilung schneidet überzählige Plätze ab bzw. ergänzt leere
Plätze; eine Person bleibt dabei in ihrer Reihe und an ihrer Bahn. Wird eine Reihe entfernt, fallen
ihre Plätze weg.

Wer noch keine Schwimmer angelegt hat, kann das im Tab **Schwimmer** tun. Namen sind optional; die
Messung funktioniert auch ohne Namen. Bleibt ein Platz leer, zeigt die Bahnkachel statt eines Namens
Lauf und Bahn an, zum Beispiel `Lauf 1, Bahn 2`; in der Serienansicht und der Analyse steht `Bahn 2`.

## Sätze planen

Die Liste **Sätze** zeigt jeden Trainingssatz mit:

- laufender Nummer,
- Titel (eigene Bezeichnung oder automatisch z. B. `4×100 m`),
- Metazeile: Beckenlänge, ggf. Takt, ggf. Startversatz,
- Status: `offen`, `bereit`, `läuft` oder `fertig`,
- bei laufenden Sätzen: `x von y Runden vollständig · antippen zum Weiterarbeiten`.

### Status eines Trainingssatzes

| Status | Bedeutung |
| --- | --- |
| **offen** | Nur der Plan existiert. Antippen öffnet die Bearbeitung. |
| **bereit** | Der Satz wurde angelegt, aber noch keine Bahn gestartet oder erfasst. Antippen zeigt die Startübersicht; **Jetzt starten** wechselt zum Timer. |
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
| **Bezeichnung** | frei, z. B. „Einschwimmen“; leer = automatisch aus der Strecke |
| **Beckenlänge** | 25 m oder 50 m |
| **Strecke** | 50, 100, 200, 400, 800, 1.500 m oder **offen** |
| **Zwischenzeiten** | automatisch aus Strecke und Becken oder eine eigene Zahl; danach folgt das Ziel |
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

## Automatischer Satzwechsel

Der Schalter **Sätze automatisch starten** über der Satzliste steuert, was nach dem letzten Ziel
passiert:

| Zustand | Verhalten |
| --- | --- |
| **an** | Sobald der aktuelle Satz vollständig im Ziel ist, beginnt der nächste noch offene Satz direkt. |
| **aus** | Der Trainer startet den nächsten Satz wie bisher bewusst im Training-Tab. |

Der automatische Wechsel greift nur beim Übergang von „läuft“ nach „fertig“. Ein bereits fertiger
Satz, den du später im Timer öffnest, startet nichts. Ist der nächste Satz schon einmal angelegt,
aber noch nicht gestartet, holt die App seine fehlenden Starts nach; ein bereits laufender Satz wird
nur ausgewählt.

Der vorige Satz bleibt in der Laufleiste und im Verlauf erreichbar. Sein Ergebnis geht durch den
Wechsel nicht verloren. Neue Trainings haben den Schalter standardmäßig an; bei älteren Trainings
bleibt er aus, bis du ihn einschaltest.

## Einen Satz starten

Unten steht immer die nächste sinnvolle Aktion:

| Situation | Knopf |
| --- | --- |
| Ein Satz ist offen | **Satz N starten** |
| Ein Satz ist bereit oder läuft | **Zum laufenden Satz** |
| Alle Sätze fertig | **Training abgeschlossen** (kein Knopf) |

Der nächste Satz ist zuerst ein bereits angelegter oder laufender Satz, sonst der erste noch offene.
Die feste Reihenfolge wird also eingehalten.

### Startübersicht

**Satz N starten** beginnt nicht sofort zu messen. Zuerst erscheint eine Übersicht der ganzen Einheit:

- **Aktive** in ihrer Aufteilung auf Reihen und Bahnen, leere Plätze als **„frei“**,
- die Zahl der Sätze mit dem Fortschritt,
- alle **Sätze in fester Reihenfolge** mit Titel, Metazeile und Status; der Satz, dessen Uhr gleich
  beginnt, ist hervorgehoben und trägt **„startet jetzt“**.

Unten stehen **Jetzt starten** und **Aktive ändern**. Erst **Jetzt starten** legt Satz und Läufe an
und wechselt in den Timer. Wurde der Satz schon einmal angelegt (Status **bereit**), zeigt die
Übersicht erneut und setzt danach die fehlenden Starts.

Beim ersten Start eines Satzes passiert Folgendes:

1. Die App legt den Satz und alle Wiederholungen an.
2. Die Aktiven werden in die Bahnen kopiert.
3. Die Startzeiten werden — wie bei einer Serie — vorausberechnet.
4. Die erste Runde startet sofort — bei Startversatz startet jede weitere Reihe um den eingestellten
   Abstand später.
5. Die App wechselt in den **Timer**, wo der Satz wie ein normaler Lauf bzw. eine Serie bedient wird.

Bei einem bereits angelegten Satz zeigt die Übersicht erneut; **Jetzt starten** wechselt danach zum
Timer. Ein nach einem Reload zurückgesetzter Satz muss dort mit **Start alle** bzw. **Weiter**
fortgesetzt werden.

## Während des Trainings

Das Training ist ein Plan, kein starres Formular. Während der Einheit gilt:

- Noch nicht gestartete Sätze lassen sich öffnen, ändern, ergänzen, löschen und verschieben.
- Die Aktiven, die Aufteilung in Reihen und die Bahnenzahl lassen sich für kommende Sätze anpassen.
- Gestartete und bereits angelegte Sätze bleiben unverändert und werden im Timer bedient.
- Der Fortschritt oben zählt nur **vollständig** beendete Sätze.
- Ist der automatische Wechsel aus, nach jedem Satz zurück zum Tab **Training** wechseln und den
  nächsten starten. Ist er an, beginnt der nächste Satz direkt im Timer.

Die Pause zwischen zwei Sätzen wird bei ausgeschaltetem automatischem Wechsel nicht überbrückt. Die
App startet den nächsten Satz erst auf ausdrücklichen Tipp. Ein Timer im Hintergrund wäre im
gedrosselten Browser unzuverlässig und würde die Kontrolle über die Pause nehmen. Bei eingeschaltetem
Wechsel beginnt der nächste Satz ohne Pause; für längere Pausen den Schalter vorher ausschalten.

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
| Automatischer Wechsel | pro Training an oder aus; neue Trainings standardmäßig an |
| Bearbeitbar | nur Sätze im Status `offen` (noch kein Satz/Läufe angelegt) |

## Empfohlener Ablauf am Beckenrand

**Vorher, in Ruhe:**

1. Training anlegen, Namen vergeben.
2. Aktive und Bahnen prüfen.
3. Sätze in die gewünschte Reihenfolge bringen.
4. Bei jedem Satz Strecke, Zwischenzeiten, Wiederholungen und Takt kontrollieren.

**Am Becken:**

1. Training öffnen.
2. **Satz 1 starten**, in der Startübersicht Aktive und Reihenfolge prüfen, dann **Jetzt starten**.
3. Im Timer messen, wie gewohnt.
4. Ist der automatische Wechsel aus: zurück zum Training, Fortschritt prüfen und **Satz 2 starten**.
   Ist er an: Der nächste Satz beginnt nach dem letzten Ziel von selbst; der vorige bleibt in der
   Leiste erreichbar.
5. Den Plan für die nächsten Sätze bei Bedarf anpassen.
6. Am Ende steht **Training abgeschlossen**.

## Abgrenzung zur Serie

| Frage | Training | Serie |
| --- | --- | --- |
| Mehrere Sätze in einer Einheit | Ja | Nein |
| Feste Aktive über Sätze hinweg | Ja | Nein |
| Pausen zwischen Sätzen | Manuell oder automatisch (Schalter) | Im Takt |
| Splits pro Länge | Ja | Ja |
| Plan vor der Einheit | Ja | Teilweise (Einstellungen) |

## Verwandte Seiten

- [Serien](03-serien.md) — wie Wiederholungen im Takt funktionieren
- [Timer und Bahnen](02-timer.md) — Bedienung während eines Satzes
- [Verlauf und Auswertung](06-verlauf-und-auswertung.md) — was nach dem Training sichtbar bleibt
