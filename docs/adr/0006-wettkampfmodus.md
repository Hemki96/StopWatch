# 0006 — Wettkampfmodus als eigener Tab

## Status

Angenommen, 2026-10-29.

## Kontext

Am Beckenrand wird zwischen Training und Wettkampf unterschieden. Im Training
sind Zwischenzeiten pro Länge wichtig; im Wettkampf zählt die Zielzeit, und ein
zusätzlicher Tap pro Länge wäre eine Fehlerquelle. Außerdem kommt die Startliste
nicht aus der App, sondern aus der Ausschreibung oder einer Wettkampfsoftware.

Die bestehende Datenhaltung kennt bereits `Satz` (eine Gruppe von Läufen mit
gleicher Konfiguration) und `Lauf` (Bahnen mit Anschlägen). Ein Wettkampf mit
mehreren Disziplinen und Heats passt gut in dieses Modell, wenn der Satz eine
Disziplin und der Lauf einen Heat beschreibt.

## Entscheidung

- **Wettkampf** ist ein eigener Rahmen (`Wettkampf` mit Name, Datum,
  Beckenlänge). Eine **Disziplin** ist ein `Satz` mit `wettkampfId`; ihre
  **Heats** sind `Lauf`-Datensätze mit `modus: 'wettkampf'` und
  `wiederholung` als Laufnummer.
- Im Wettkampfmodus ist der erste Tap nach dem Start das **Ziel**. `tapLane`
  verzweigt auf `finishLane`, statt einen Split pro Länge anzulegen. Das
  Finish-Flag und die Zielzeit bleiben dieselben Felder wie im Training.
- Eine Zielzeit kann über einen Stift von Hand eingetragen oder korrigiert
  werden. Sie wird als `manuell` markiert, damit sie im CSV und bei
  Bestzeiten sichtbar bleibt.
- Die **Meldeliste** wird als tolerante CSV importiert: Semikolon, Komma oder
  Tab; deutsche und englische Spaltennamen; eine vollständige Disziplinliste
  oder die Schnellform `bahn;name`. Der Import zeigt vor dem Schreiben eine
  Vorschau und nennt Fehler mit Zeilennummer.
- Der Import legt fehlende Schwimmer an und verwendet vorhandene über den
  Namen wieder. So bleiben Bestzeiten über Training und Wettkampf hinweg
  vergleichbar.
- Wettkampf-Sätze erscheinen im Verlauf mit einem Wettkampf-Badge. Das
  Lauf-Detail zeigt „Lauf“ statt „Runde“ und „Ziel“ statt einer Längenzeit.
- Das JSON-Backup wird um `wettkampfe` erweitert; ältere Versionen bleiben
  lesbar und werden mit einer leeren Wettkampfliste geladen. Die
  IndexedDB-Datenbank bekommt einen `wettkampf`-Store sowie einen
  `by-wettkampf`-Index auf `satz`. Die konkrete Versionsnummer teilt sich das
  Backup mit dem später ergänzten Trainingsplan.

## Alternativen

- **Eigene Wettkampf-Objekte für Disziplin und Heat.** Das hätte das
  bestehende Modell nicht belastet, aber Verlauf, CSV, Bestzeiten und Backup
  müssten zwei parallele Datenwege kennen. Die Wiederverwendung von Satz und
  Lauf hält die Auswertung an einer Stelle.
- **Splits auch im Wettkampf.** Ein Tap pro Länge ist am Beckenrand zu
  fehleranfällig, und die Zwischenzeiten stehen meist im offiziellen Protokoll.
  Wer sie braucht, misst im Timer-Tab.
- **Direkte Anbindung an eine Wettkampfsoftware.** Dafür gibt es zu viele
  Formate und keine stabile Schnittstelle. CSV mit Vorschau deckt den
  praktischen Fall ab und bleibt offline nutzbar.

## Folgen

- Ein Wettkampf-Lauf hält den Takt und den Wake-Lock wie ein Trainingslauf,
  auch wenn er nicht in der Trainingsleiste steht.
- Beim Reload werden laufende Wettkampf-Bahnen wie Trainingsbahnen auf
  „bereit“ zurückgesetzt; bereits erfasste Zielzeiten bleiben erhalten.
- Ein Wettkampf kann leer angelegt und später mit einer Meldeliste oder einer
  manuellen Disziplin gefüllt werden.
- Die Ergebnis-CSV ist eine Zeile pro Start, gewertet nach Platz, mit offenen
  Bahnen am Ende.
