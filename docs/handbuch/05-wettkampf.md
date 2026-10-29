# Wettkampf

Der Tab **Wettkampf** begleitet einen Wettkampftag. Er bündelt **Disziplinen** (z. B. 100 m
Freistil) mit mehreren **Läufen** (Heats). Gemessen wird pro Bahn mit einem einzigen Tipp: Nach dem
Start ist der nächste Tipp das **Ziel**. Zwischenzeiten pro Länge gibt es hier bewusst nicht.

## Begriffe im Wettkampf

| Begriff | Bedeutung in der App |
| --- | --- |
| **Wettkampf** | Ein Tag mit Name, Datum und Beckenlänge. Der Rahmen für alle Disziplinen. |
| **Disziplin** | Eine Strecke mit Schwimmart, z. B. 100 m Freistil. In der Datenhaltung ein Satz mit `wettkampfId`. |
| **Lauf / Heat** | Eine Gruppe von Bahnen innerhalb einer Disziplin, z. B. Lauf 2. |
| **Bahn** | Ein Start mit Name und Zielzeit. |
| **Meldeliste** | Die Startliste als CSV, aus der Disziplinen, Läufe und Bahnen entstehen. |
| **Zielzeit** | Die Zeit vom Start der Bahn bis zum Ziel. Im Wettkampf genügt ein Tipp. |

## Einen Wettkampf anlegen

1. Tab **Wettkampf** öffnen.
2. Auf **Neuer Wettkampf** tippen.
3. Name, Datum und Beckenlänge (25 m oder 50 m) eingeben.
4. **Wettkampf anlegen** tippen.

Die Beckenlänge gilt für alle Disziplinen dieses Wettkampfs und ist später nicht mehr änderbar. Der
Wettkampf erscheint in der Liste mit Datum, Beckenlänge, Anzahl Disziplinen und erfassten Zeiten.

Ein Wettkampf darf leer bleiben und später über eine Meldeliste oder einzelne Disziplinen gefüllt
werden.

## Disziplinen anlegen

Im Wettkampf auf **Disziplin anlegen** tippen:

| Feld | Werte |
| --- | --- |
| **Strecke** | 50, 100, 200, 400, 800 oder 1.500 m |
| **Schwimmart** | Freistil, Brust, Rücken, Schmetterling, Lagen oder Beliebig |
| **Läufe** | 1 bis 20 |
| **Bahnen pro Lauf** | 1 bis 10 |

Die Strecke muss ein Vielfaches der Beckenlänge sein; sonst bleibt der Anlegen-Knopf deaktiviert.
Die App legt die gewünschte Anzahl Heats an. Jede Bahn ist zunächst **ohne Namen**. Der Titel der
Disziplin wird automatisch gebildet, z. B. `100 m Freistil`.

## Namen eintragen

Solange Bahnen ohne Namen existieren, zeigt die App unten:

> `6 Bahnen ohne Namen · Namen eintragen`

Ein Tipp öffnet ein Sheet mit einem Feld pro Bahn:

- Leere Felder bleiben ohne Zuordnung.
- Vorhandene Schwimmer:innen werden über den Namen wiederverwendet (Groß-/Kleinschreibung wird
  ignoriert).
- Unbekannte Namen legen neue Schwimmer:innen im Tab **Schwimmer** an.
- Ein bereits zugeordneter Name kann durch Leeren des Feldes entfernt werden.

Fehlende Namen lassen sich auch nach dem Start noch ergänzen — der Knopf erscheint, solange
mindestens eine Bahn ohne Namen ist. Eine bereits vorhandene Zuordnung lässt sich im
**Verlauf → Lauf-Detail** über die Schwimmer-Auswahl ändern.

## Einheiten: Meter und Yards

Ein Wettkampf wird in **Meter** oder **Yards** angelegt. Die Wahl gilt für alle Disziplinen und die
Ergebnis-CSV:

- Bei Yards steht nur das **25-Yard-Becken** (`25 yd`, kanonisch 22,86 m) bereit.
- Disziplinen werden in der Einheit des Wettkampfs gewählt, z. B. `100 yd Freistil`; intern
  gespeichert werden 91,44 m.
- Die Meldeliste erkennt `m`, `yd`, `yard(s)` und `y`. Ohne Suffix gilt die Einheit des
  Wettkampfs. Ein Meter-Eintrag in einem Yard-Wettkampf wird **mit Zeilennummer** abgelehnt.
- Der CSV-Export weist `strecke_m` (kanonisch) und `strecke` + `einheit` (Anzeige) aus.

## Meldeliste importieren

Der Import ist der schnellste Weg zu einem vollständigen Wettkampf. Er akzeptiert eine CSV aus einer
Wettkampfsoftware, eine selbst gebaute Tabelle oder die Schnellform `bahn;name`.

### Wo der Import startet

- **Neuer Wettkampf:** Im Tab **Wettkampf** auf **Meldeliste importieren**.
- **Bestehender Wettkampf:** Im Wettkampf auf **Meldeliste hinzufügen**.

Beim Import in einen bestehenden Wettkampf sind Name, Datum und Beckenlänge bereits fest. Der Import
**ergänzt** Disziplinen und Läufe; er ersetzt keine vorhandenen Daten. Dieselbe Datei zweimal zu
importieren erzeugt deshalb Duplikate.

### Die Vorlage

Die App kann unter **Vorlage laden** eine CSV speichern:

```csv
disziplin;strecke;schwimmart;lauf;bahn;name;jahrgang
100 m Freistil;100 m;freistil;1;3;Anna Muster;2010
100 m Freistil;100 m;freistil;1;4;Ben Beispiel;2011
100 m Freistil;100 m;freistil;2;3;Clara Muster;2010
50 m Brust;50 m;brust;1;1;Dana Beispiel;2012
```

In einem Yard-Wettkampf stehen in den ersten beiden Spalten z. B. `100 yd Freistil;100 yd`.

Die Datei ist UTF-8 mit BOM und Semikolon, damit deutsches Excel sie direkt öffnet.

### Erkannte Spalten

Die Kopfzeile darf deutsche oder englische Namen verwenden. Groß-/Kleinschreibung, Leerzeichen und
Umlaute werden normalisiert.

| Feld | Erkannte Spalten (Auswahl) |
| --- | --- |
| Name | `name`, `schwimmer`, `schwimmerin`, `athlet`, `athletin`, `teilnehmer`, `starter` |
| Vorname | `vorname`, `firstname`, `first_name`, `givenname` |
| Nachname | `nachname`, `lastname`, `last_name`, `surname`, `familienname` |
| Bahn | `bahn`, `lane`, `spur`, `platz` |
| Lauf | `lauf`, `heat`, `vorlauf`, `runde`, `race` |
| Strecke | `strecke`, `strecke_m`, `distanz`, `distance`, `meter`, `laenge`, `länge` |
| Schwimmart | `schwimmart`, `lage`, `stroke`, `style`, `technik` |
| Disziplin | `disziplin`, `wettkampf`, `event`, `bewerb`, `wettkampfart`, `wettkampfnummer` |
| Jahrgang | `jahrgang`, `jg`, `jahr`, `year`, `geburtsjahr` |

Getrennte Spalten `vorname` und `nachname` werden zu einem Namen zusammengesetzt. Unbekannte Spalten
werden ignoriert.

### Format und Toleranz

- **Trennzeichen:** Semikolon, Komma oder Tabulator. Erkannt wird das Zeichen, das in der ersten
  sinnvollen Zeile am häufigsten vorkommt.
- **Kopfzeile:** optional. Ohne Kopfzeile werden nur eine Spalte (`Name`) oder zwei Spalten
  (`Bahn;Name`) verstanden. Bei mehr Spalten ohne Kopfzeile bricht der Import mit einem Hinweis ab.
- **Kommentare:** Zeilen, die mit `#` beginnen, und Leerzeilen werden ignoriert.
- **BOM:** ein UTF-8-BOM am Dateianfang wird entfernt.
- **Grenze:** höchstens 2.000 Zeilen pro Import.
- **Namen:** erforderlich, höchstens 80 Zeichen.

### Fehlende Angaben

Fehlt eine Angabe, greift die Vorgabe aus dem Import-Dialog:

| Fehlt | Verhalten |
| --- | --- |
| **Strecke** | Vorgabe aus dem Dialog (Standard 100 m). Die Strecke kann auch aus dem Disziplintext gelesen werden, z. B. „100 m Freistil“. |
| **Schwimmart** | Vorgabe aus dem Dialog (Standard Freistil). Die Art kann auch aus dem Disziplintext gelesen werden. |
| **Disziplin** | Wird aus Strecke und Schwimmart gebildet. |
| **Lauf** | Lauf 1. |
| **Bahn** | Die nächste freie Bahn von 1 bis 10. Ist keine frei, bricht der Import ab. |
| **Jahrgang** | Leer. |

### Prüfungen und Fehlermeldungen

Der Import prüft vor dem Schreiben und nennt das erste Problem mit Zeilennummer, z. B.:

- „Zeile 7: Die Bahn muss zwischen 1 und 10 liegen.“
- „Zeile 4: Bahn 3 ist in 100 m Freistil, Lauf 1 doppelt belegt.“
- „Zeile 2: 100 m passt nicht zu einem 25 m-Becken.“
- „Zeile 12: Der Name fehlt.“

Warnungen — etwa eine unbekannte Schwimmart, die durch die Vorgabe ersetzt wurde — blockieren den
Import nicht. Die Vorschau zeigt:

> `2 Disziplinen, 3 Läufe, 4 Starts`

sowie die erkannten Disziplinen. Erst **Importieren** schreibt die Daten.

### Gruppierung

- Jede Zeile ist ein **Start**.
- Starts mit gleicher Disziplin und gleicher Laufnummer landen im selben Heat.
- Die Reihenfolge der Disziplinen in der Datei ist die Reihenfolge des Wettkampfprogramms.
- Heats werden nach Nummer sortiert, Bahnen nach Bahnnummer.
- Vorhandene Schwimmer:innen werden über den Namen wiederverwendet; fehlende werden angelegt.

## Einen Lauf messen

Die Disziplin öffnet sich mit einer Leiste der Heats und der Liste der Bahnen.

### Vor dem Start

- Jede Bahn zeigt Bahnnummer, Name und **Bereit**.
- Unten steht der große **Start**-Knopf.
- Fehlende Namen werden über **Namen** ergänzt.
- Mit **Nächster Lauf** kann vor dem Start zu einem anderen Heat gewechselt werden.

### Start

**Start** startet alle Bahnen des Laufs gemeinsam. Ein Startversatz gibt es im Wettkampf nicht; die
Heats starten als Gruppe.

Ein Tipp auf eine einzelne **bereite** Bahn startet auch nur diese. Das ist ein Ausnahmeweg, etwa
wenn ein Nachzügler allein schwimmt. Der übliche Weg ist der Start-Knopf.

### Ziel

Nach dem Start ist der **erste Tipp** auf eine laufende Bahn sofort das **Ziel**:

- Es entsteht genau ein Anschlag mit `istFinish`.
- Es gibt keine Zwischenzeiten pro Länge.
- Die Zielzeit ist die Differenz zwischen Start und Tipp.
- Weitere Tipps auf einer Bahn im Ziel ändern nichts.

Wer Zwischenzeiten braucht, misst im **Timer**-Tab. Der Wettkampfmodus ist bewusst auf ein Ziel pro
Bahn reduziert, weil ein zusätzlicher Längen-Tipp am Beckenrand eine Fehlerquelle wäre.

### Zielzeit von Hand

Neben jeder Bahn steht ein **Stift**. Er öffnet ein Sheet für eine manuelle Zielzeit:

- Format `mm:ss,hh`, z. B. `01:23,45`. Alternativ sind `83,45` oder `1:23,45` möglich.
- Die Zeit wird immer als **manuell** markiert.
- Eine vorhandene Zielzeit wird überschrieben.
- Eine manuell eingetragene Zeit beendet die Bahn auch dann, wenn sie nie gestartet wurde; die
  Startzeit bleibt in diesem Fall leer.

Das ist der Ausweg, wenn ein Tipp danebenging, eine Zeit aus dem Protokoll nachgetragen wird oder
eine Bahn ausgefallen ist.

### DNS und DNF

Neben der Zeit lassen sich zwei endgültige Zustände ohne Zeit eintragen — im selben Stift-Sheet:

| Status | Bedeutung | Anzeige |
| --- | --- | --- |
| **DNS** | did not start, nicht gestartet | `DNS` und „nicht gestartet“ |
| **DNF** | did not finish, nicht beendet | `DNF` und „nicht beendet“ |

- Markierte Bahnen sind **endgültig**: Tippen, Starten und Zeiteintragen ändern nichts mehr.
- Sie zählen **nicht** in Platzierung und Rückstand, beenden den Heat aber mit.
- **Markierung entfernen** im Stift-Sheet oder langes Drücken macht die Bahn wieder offen.
- Ein Heat gilt als beendet, sobald jede Bahn eine Zeit, DNS oder DNF hat.
- Der Status überlebt Reload und Backup-Import.

### Rückgängig

Langes Drücken auf einer Bahn nimmt die letzte Aktion zurück:

1. Eine Zielzeit wird entfernt; die Bahn läuft wieder (falls sie gestartet war).
2. Ohne Anschlag wird der Start zurückgenommen; die Bahn ist wieder bereit.

## Ergebnis und Platzierung

Nach dem Ziel zeigt jede Bahn:

- die Zielzeit,
- den **Platz**,
- den **Rückstand** auf die Siegerzeit, z. B. `+00,45`,
- ggf. den Hinweis **manuell**.

Die Platzierung wird auf Hundertstel verglichen:

- Schnellste Zeit zuerst.
- Zeitgleiche Zeiten teilen sich den Platz: `1, 1, 3`.
- Bahnen ohne Zielzeit stehen am Ende: erst DNS, dann DNF, dann offene Bahnen.
- DNS/DNF tragen keinen Platz und keinen Rückstand.
- Der Rückstand bezieht sich auf die schnellste rohe Zeit des Laufs.

Sind alle Bahnen entschieden, erscheint:

> `Lauf beendet · 6 von 6 entschieden · Sieger 00:58,31`

Danach führt der große Knopf zum nächsten Heat, zur nächsten Disziplin oder zurück zum Wettkampf.

### Fehlende Zeiten und nächster Heat

Ein Lauf gilt als beendet, wenn **alle** Bahnen eine Zielzeit, DNS oder DNF haben. Solange einzelne
Bahnen offen sind, bleibt der Lauf sichtbar. Über **Nächster Lauf** kann trotzdem zum nächsten Heat gewechselt
werden; die offenen Bahnen bleiben offen und können später nachgetragen werden.

## Ergebnisse exportieren

Es gibt zwei CSV-Exporte:

| Ort | Inhalt |
| --- | --- |
| **Download-Symbol im Wettkampf** | Alle Disziplinen und Heats des Wettkampfs |
| **Download-Symbol in der Disziplin** | Nur diese Disziplin |

Die Datei heißt `beckenrand-wettkampf-JJJJ-MM-TT.csv` und enthält eine Zeile pro Start:

```csv
wettkampf;datum;disziplin;strecke_m;strecke;einheit;schwimmart;lauf;platz;bahn;schwimmer;zeit_ms;zeit_formatiert;status;manuell
Herbstpokal;2026-10-29;100 m Freistil;100;100;m;freistil;1;1;3;Anna Muster;58310;00:58,31;Ziel;0
Herbstpokal;2026-10-29;100 m Freistil;100;100;m;freistil;1;2;4;Ben Beispiel;59020;00:59,02;Ziel;0
Herbstpokal;2026-10-29;100 m Freistil;100;100;m;freistil;1;;5;Clara Muster;;;offen;0
Herbstpokal;2026-10-29;100 m Freistil;100;100;m;freistil;1;;6;Dana Beispiel;;;DNS;0
Herbstpokal;2026-10-29;100 m Freistil;100;100;m;freistil;1;;7;Emil Beispiel;;;DNF;0
```

- Gewertete Bahnen stehen nach Platz, markierte und offene am Ende.
- In einem Yard-Wettkampf heißt die Disziplin z. B. `100 yd Freistil`; `strecke_m` bleibt mit
  91,44 kanonisch, `strecke` zeigt 100 und `einheit` ist `yd`.
- `status` ist `Ziel`, `DNS`, `DNF` oder `offen`.
- `manuell` ist `1` bei von Hand eingetragenen oder korrigierten Zeiten.
- Semikolon und UTF-8-BOM, damit deutsches Excel die Datei direkt öffnet.
- Auf dem iPhone öffnet sich beim Teilen das Share-Sheet; auf Desktop wird die Datei
  heruntergeladen.

## Löschen

| Aktion | Folge |
| --- | --- |
| **Disziplin löschen** | Alle Heats und Zeiten dieser Disziplin werden dauerhaft entfernt. |
| **Wettkampf löschen** | Alle Disziplinen, Heats und Zeiten des Wettkampfs werden dauerhaft entfernt. |

Beide Aktionen fragen vorher nach und lassen sich nicht rückgängig machen. Ein Backup vor dem
Löschen ist sinnvoll.

## Reload, zweiter Tab und Wake Lock

- Ein laufender Wettkampf-Lauf hält den Bildschirm wie ein Trainingslauf wach.
- Nach einem Reload werden laufende Bahnen auf **bereit** zurückgesetzt; bereits erfasste Zielzeiten
  bleiben erhalten. Der Heat muss erneut gestartet werden, wenn noch Bahnen offen sind.
- Wettkampf-Läufe erscheinen **nicht** in der Lauf-Leiste des Timers. Sie werden ausschließlich im
  Wettkampf-Tab bedient.
- Im **Verlauf** erscheinen Wettkampf-Sätze mit einem Badge **Wettkampf**. Das Lauf-Detail zeigt
  „Lauf“ statt „Runde“ und „Ziel“ statt einer Längenbezeichnung.
- Ein zweiter Tab ist wie überall nur lesend, bis die Messung übernommen wird.

## Grenzen

| Regel | Wert |
| --- | --- |
| Beckenlänge | 25 m, 50 m oder 25 yd (22,86 m), fest pro Wettkampf |
| Strecke | Vielfaches der Beckenlänge, in der Einheit des Wettkampfs |
| Heats pro Disziplin (manuell) | 1 bis 20 |
| Heats pro Disziplin (Import) | 1 bis 99 |
| Bahnen pro Heat | 1 bis 10 |
| Meldeliste | höchstens 2.000 Zeilen, UTF-8 |
| Splits | keine; ein Ziel pro Bahn |
| Startversatz | keiner; alle Bahnen eines Heats starten gemeinsam |

## Beispiel: Wettkampftag in zehn Schritten

1. Wettkampf mit Name, Datum und Beckenlänge anlegen.
2. Meldeliste importieren oder Disziplinen manuell anlegen.
3. Vorschau prüfen: Stimmen Disziplinen, Heats und Starts?
4. Fehlende Namen ergänzen.
5. Erste Disziplin öffnen, Heat 1 prüfen.
6. **Start** tippen.
7. Bei jeder Ankunft die Bahn antippen — der Tipp ist das Ziel.
8. Bei Bedarf die Zielzeit mit dem Stift korrigieren.
9. **Nächster Lauf** bzw. **Nächste Disziplin**.
10. Am Ende die Ergebnis-CSV exportieren und ein JSON-Backup sichern.

## Verwandte Seiten

- [Meldeliste importieren](../../README.md#meldeliste-importieren) — Kurzfassung im Projekt-README
- [Verlauf und Auswertung](06-verlauf-und-auswertung.md) — Wettkampfzeiten im Verlauf
- [Daten und Backup](07-daten-und-backup.md) — Ergebnisse sichern
- [ADRs 0006](../adr/0006-wettkampfmodus.md) — warum der Wettkampf ein eigener Tab ist
