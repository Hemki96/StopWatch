# Probleme und FAQ

Diese Seite sammelt typische Situationen und ihre Lösung. Wenn ein Fall nicht dabei ist, hilft ein
Blick in die Konsole des Browsers und in die [Entwicklerdokumentation](../entwicklung/README.md).

## Schnelle Diagnose

| Symptom | Wahrscheinliche Ursache | Lösung |
| --- | --- | --- |
| „Wird geladen …“ bleibt stehen | Ein anderer Tab hält eine ältere Datenbankversion offen | Anderen Tab schließen, „Neu laden“ tippen |
| Banner „bereits in einem anderen Tab offen“ | Genau ein Tab darf messen | Im gewünschten Tab „Hier weiterarbeiten“ tippen |
| App startet offline nicht | Noch nie online geladen oder Cache geleert | Einmal online öffnen, installieren, erneut testen |
| Zeit fehlt nach dem Display-Sperren | PWA nimmt im Hintergrund keine Tipps an | Display wachhalten, Wake-Lock-Hinweis beachten, Zeit korrigieren |
| Bahn reagiert nicht auf Tipp | Bahn ist geplant oder bereits im Ziel | Countdown abwarten bzw. Verlauf prüfen |
| Nach Reload sind Bahnen „bereit“ oder „unterbrochen“ | `performance.now()` gilt nur pro Seitensitzung | „Weiter“ für fehlende Starts; unterbrochene Bahnen lange drücken und neu starten |
| Keine Bestzeit sichtbar | Keine Zuordnung, offene Strecke oder kein Finish | Schwimmer zuordnen, feste Strecke messen, Ziel erfassen |
| Backup wird abgelehnt | Falsches Format, falsche Version oder beschädigte Datei | Fehlermeldung lesen; Datei nicht bearbeiten |
| CSV öffnet in Excel in einer Spalte | Excel erwartet ein anderes Trennzeichen | Semikolon und UTF-8 beim Import wählen |
| „Alle Daten löschen“ fehlt | Falscher Tab | **Mehr → Daten** öffnen |
| Kein Ton/keine Vibration | Browser unterstützt die Vibration-API nicht | Kein Fehler; visuelles Feedback nutzen |
| Update-Hinweis lässt sich nicht neu laden | Ein Lauf ist aktiv | Lauf beenden, dann neu laden |

## Start und Laden

### „Wird geladen …“ bleibt stehen

Nach fünf Sekunden erscheint ein Hinweis und ein **Neu laden**-Knopf. Häufigste Ursache: Ein anderer
Tab derselben App hält noch eine ältere Datenbankversion offen. Die neue Version wartet auf das
Upgrade, bis dieser Tab geschlossen ist.

1. Andere Tabs mit Beckenrand schließen.
2. Zurück zum wartenden Tab.
3. **Neu laden** tippen.

Wenn das nicht hilft:

- Prüfen, ob die Seite in einem eingebetteten Browser (Instagram, Teams, Mail-App) läuft. Dort ist
  IndexedDB manchmal eingeschränkt. Die Adresse in Safari oder Chrome öffnen.
- Privaten Modus verlassen.
- Browserdaten für die Seite **nicht** löschen, ohne vorher ein Backup zu haben.

### Der zweite Tab ist nur lesend

Die App erlaubt genau einen Tab mit Schreibzugriff. Ein zweiter Tab zeigt oben:

> Beckenrand ist bereits in einem anderen Tab offen. Dieser Tab ist nur lesend.

- **Hier weiterarbeiten** übernimmt die Messung. Der bisherige Tab wird lesend.
- Die Übergabe wartet auf laufende Schreibvorgänge, damit kein Anschlag verloren geht.
- Wird der aktive Tab einfach geschlossen, übernimmt der andere nach einigen Sekunden ohne
  Lebenszeichen automatisch.
- Ohne `BroadcastChannel` (sehr alte oder eingebettete Browser) gibt es diese Sperre nicht. Dann
  können beide Tabs schreiben; das ist nicht empfohlen.

### Die App funktioniert offline nicht

- Die App muss **einmal online** geladen worden sein, damit der Service Worker die Dateien cacht.
- Der Service Worker existiert nur im **Produktions-Build**. `npm run dev` läuft ohne Service Worker
  und ist deshalb nicht offline testbar.
- Im privaten Modus oder nach dem Löschen der Websitedaten ist der Cache weg.
- Die lokale Vorschau `preview.html` lädt die App in einem Rahmen; offline gelten dieselben Regeln
  wie für die Hauptseite.
- Prüfen, ob die App installiert ist und über das App-Symbol gestartet wird.

### „Neue Version verfügbar“

Die App lädt sich nicht mitten in einer Messung neu. Der Hinweis erscheint, sobald eine neue Version
im Service-Worker-Cache bereitsteht.

- **Neu laden** ist deaktiviert, solange eine Bahn läuft oder auf ihren Start wartet.
- Erst den Lauf beenden, dann neu laden.
- **Später** blendet den Hinweis aus. Beim nächsten Zurückkehren in die App kann er erneut
  erscheinen.
- Ein Neuladen mitten im Lauf würde laufende Bahnen auf „bereit“ zurücksetzen. Deshalb der
  ausdrückliche Hinweis.

### Die App öffnet sich in einem anderen Browser

PWA-Installationen sind an den Browser und das Gerät gebunden. Ein Link aus einer Mail oder
Messenger-App öffnet oft einen In-App-Browser mit eigenem Speicher. Immer die Adresse direkt in
Safari oder Chrome öffnen und dort installieren.

## Messen

### Der Bildschirm schaltet sich aus

Die App fordert in der Messansicht einen **Wake Lock** an, solange eine Bahn läuft oder geplant ist.
Trotzdem kann der Bildschirm ausgehen:

- Energiesparmodus oder „Low Power Mode“ blockiert den Wake Lock.
- Der Browser unterstützt die Wake-Lock-API nicht.
- Die App war beim Anfordern nicht sichtbar.
- Das System hat eine feste automatische Sperre, die nicht überschrieben wird.

Unter dem Timer erscheint dann:

> Display-Sperre nicht aktiv — Bildschirm kann sich ausschalten.

Maßnahmen: Gerät am Strom lassen, Energiesparmodus aus, automatische Sperre verlängern, App im
Vordergrund halten. Die App kann keine Tipps annehmen, während das Display aus ist. Die verstrichene
Zeit bleibt korrekt, aber der Anschlag fehlt und muss im Verlauf nachgetragen werden.

### Ein Tipp wird nicht angenommen

| Zustand der Bahn | Verhalten |
| --- | --- |
| **bereit** | Ein Tipp startet die Bahn (bei „Start alle“ sind alle schon gestartet). |
| **geplant** | Tipps werden ignoriert, bis der Countdown null erreicht. |
| **läuft** | Ein Tipp erfasst einen Anschlag. |
| **im Ziel** | Weitere Tipps ändern nichts. |

Bei einer Serie schließt ein Tipp immer die **älteste offene Runde**. Ein Doppeltipp kann deshalb
zwei Runden schließen. Wenn das passiert: langes Drücken nimmt den letzten Anschlag zurück.

### Die Zeit wirkt um Hundertstel falsch

Die App **schneidet ab**, sie rundet nicht. Aus `1,239 s` wird `1,23 s`, nicht `1,24 s`. Das
entspricht der üblichen Anzeige von Schwimmzeiten. Der CSV-Export enthält zusätzlich den Rohwert in
Millisekunden.

Weitere Ursachen:

- Der Anschlag wird beim **Tippen** erfasst, nicht bei der tatsächlichen Wandberührung. Die
  Reaktionszeit der messenden Person steckt in der Zeit.
- Ein Startversatz verschiebt den Start der Bahn; die angezeigte Zeit ist relativ zum Start der
  **eigenen** Bahn.
- Eine geplante Bahn ignoriert frühe Tipps.
- Nach einem Reload wurde der Start zurückgesetzt.

### Nach einem Reload stimmen die Zeiten nicht mehr

Das ist eine bewusste Grenze. `performance.now()` ist nach einem Reload wertlos; die App setzt
laufende und geplante Bahnen auf **bereit** zurück. Bereits erfasste Anschläge bleiben erhalten.
Eine Bahn mit Anschlägen, aber ohne Startzeit wird als **unterbrochen** angezeigt; ein einfacher
Tap startet sie nicht neu, damit keine Zeit vor den bereits erfassten Splits entsteht.

Empfehlung:

- Den unterbrochenen Lauf im Verlauf prüfen und als unvollständig behandeln.
- Für eine saubere Zeit den Lauf verwerfen und neu starten.
- Bei einer Serie oder einem einzelnen Lauf **Weiter** verwenden, wenn nur unberührte Bahnen
  fehlen.
- Unterbrochene Bahnen lange drücken, um die Anschläge schrittweise zurückzunehmen; danach neu
  starten.
- Im Wettkampf den Heat erneut starten; vorhandene Zielzeiten bleiben.

Eine **Tab-Übergabe** ist kein Reload: „Hier weiterarbeiten“ übernimmt die laufende Messung und
rechnet die Startzeiten auf den neuen Tab um.

### Eine Serie ist „überfällig“

Das ist kein Fehler. Die nächste Runde hat begonnen, während eine Schwimmerin noch in der vorigen
ist. Ein Tipp schließt die **älteste** offene Runde, nicht die neueste. Das Badge „R3 läuft schon“
zeigt die Überholung an.

### „Alle beenden“ fehlt

Der Knopf erscheint nur bei **Offener Strecke** und nur, solange eine Bahn läuft. Bei fester Strecke
endet die Bahn automatisch mit dem letzten Anschlag.

### „Weiter“ fehlt bei einer Serie

**Weiter** erscheint nur, wenn mindestens eine Wiederholung völlig unberührt ist — kein Start, kein
Anschlag. Sind bereits Anschläge in einer offenen Runde, musst du sie zu Ende messen oder den Lauf
verwerfen.

### Der Startversatz lässt sich nicht ändern

Der Startversatz wird beim Anlegen eines Laufs festgeschrieben. Im laufenden Lauf ist die Auswahl
deaktiviert. Unter **Mehr → Nächster Lauf** einen neuen Wert wählen und einen neuen Lauf anlegen.

## Training

### Ein Satz lässt sich nicht mehr bearbeiten

Sobald ein Trainingssatz gestartet wurde, zählen die gemessenen Läufe. Der Plan ist dann gesperrt;
Änderungen gelten nur für kommende Sätze. Das ist Absicht, damit Zeiten nicht nachträglich einer
anderen Konfiguration zugeordnet werden.

### „Ein Training braucht mindestens einen Satz“

Der letzte Satz eines Trainings lässt sich nicht löschen. Entweder einen neuen Satz anlegen oder das
ganze Training löschen. Beim Löschen des Trainings bleiben bereits gemessene Sätze im Verlauf.

### Der Fortschritt steht still

Der Fortschritt wird aus den vorhandenen Sätzen und Läufen berechnet. Ein Satz wird erst fertig,
wenn **alle** seine Läufe vollständig sind. Prüfe im Timer, ob noch eine Bahn offen ist. Wurde der
Satz im Verlauf gelöscht, fällt der Trainingssatz auf **offen** zurück.

## Wettkampf

### Der Start-Knopf fehlt

- Sind bereits alle Bahnen im Ziel, zeigt die App **Lauf beendet** und den nächsten Schritt.
- Wurden alle Zeiten manuell eingetragen, gilt der Lauf ebenfalls als beendet, auch ohne Start.
- Sind einzelne Zeiten manuell gesetzt und andere Bahnen offen, bleibt **Start** sichtbar.

### Nach einem Tipp ist die Bahn sofort im Ziel

Das ist der Wettkampfmodus: Ein Tipp pro Bahn ist das Ziel, es gibt keine Splits. Für
Zwischenzeiten den **Timer**-Tab verwenden.

### Eine Zielzeit ist falsch

Den **Stift** neben der Bahn verwenden. Die neue Zeit wird als **manuell** markiert und ersetzt die
bisherige Zielzeit. Langes Drücken entfernt die Zielzeit und nimmt die Bahn aus dem Ziel.

### Die Platzierung stimmt nicht

Die App sortiert nach auf Hundertstel abgeschnittenen Zeiten. Zeitgleiche Zeiten teilen sich den
Platz (`1, 1, 3`). Der Rückstand bezieht sich auf die schnellste rohe Zeit. Offene Bahnen stehen am
Ende. Wenn eine Zeit manuell korrigiert wurde, sofort prüfen, ob die Markierung **manuell** sichtbar
ist.

### Der Import erzeugt Duplikate

Ein Import in einen bestehenden Wettkampf **ergänzt** und ersetzt nichts. Dieselbe Datei zweimal zu
importieren erzeugt doppelte Disziplinen und Läufe. Vor einem erneuten Import entweder den
Wettkampf löschen oder die Datei nur einmal übernehmen. Ein Backup vorher sichern.

### „Bahn X ist doppelt belegt“

In derselben Disziplin und demselben Lauf darf jede Bahn nur einmal vorkommen. Die Fehlermeldung
nennt die Zeile. Entweder die Bahnnummer in der CSV ändern oder die doppelte Zeile entfernen.

## Daten und Backup

### Das rote Speicher-Banner erscheint

> Kein Speicher verfügbar — Daten gehen beim Schließen verloren.

Sofort handeln:

1. Kein weiteres Training in diesem Zustand beginnen.
2. **Mehr → Backup sichern** versuchen.
3. Privaten Modus verlassen, Speicherplatz freigeben, blockierte Website-Daten erlauben.
4. App neu laden und erneut prüfen.

Ohne funktionierenden Speicher gehen die Daten beim Schließen verloren.

### Das Backup wird abgelehnt

Die Meldung nennt das erste Problem und den Pfad. Häufige Fälle:

- **Falsche Datei:** Die Formatkennung `beckenrand-backup` fehlt.
- **Zu neue Version:** Die App liest Version 1 bis 3.
- **Beschädigtes JSON:** Die Datei wurde bearbeitet oder unvollständig kopiert.
- **Ungültiges Feld:** z. B. eine Beckenlänge ungleich 25/50 oder ein Datum ohne `JJJJ-MM-TT`.

Die Datei nicht von Hand reparieren, außer du kennst das Schema. Der vorhandene Bestand bleibt bei
einem Fehler unverändert.

### Nach dem Import sind Daten doppelt

Der Import führt zusammen, er ersetzt nicht. Datensätze mit gleicher ID werden überschrieben, alle
anderen ergänzt. Wenn du exakt den Backup-Stand willst:

1. Backup sichern (falls der aktuelle Stand wichtig ist).
2. **Alle Daten löschen**.
3. Backup importieren.

### Nach dem Löschen der Browserdaten sind die Daten weg

Ohne Backup gibt es keine Wiederherstellung. Die App hat keinen Server und keinen Papierkorb. Das ist
der Grund für die Backup-Empfehlung.

## Installation

### „App installieren“ wird nicht angeboten

- Auf dem iPhone gibt es keinen Installationsdialog. Safari → Teilen → **Zum Home-Bildschirm**.
- In-App-Browser unterstützen die Installation oft nicht. Adresse in Safari oder Chrome öffnen.
- Ist die App bereits installiert, zeigt **Mehr → Installation** „Als App installiert“.
- Der Browser kann den Dialog jederzeit verweigern. Die Anleitung bleibt sichtbar.

### Die installierte App zeigt andere Daten

Installation und Browser teilen sich normalerweise denselben Origin-Speicher. Unterschiedliche
Adressen (`http://` vs. `https://`, anderer Pfad, `localhost`) haben getrennte Daten. Immer dieselbe
Adresse verwenden.

## Export

### Der CSV-Export öffnet sich nicht

- Auf dem iPhone erscheint das Share-Sheet. Abbrechen ist kein Fehler.
- Wenn der Browser Downloads blockiert, die Datei über das Share-Sheet in „Dateien“ sichern.
- Bei „Export fehlgeschlagen“ erneut versuchen; bei anhaltendem Fehler ein Backup sichern und die
  Konsole prüfen.

### Excel zeigt alles in einer Spalte

Die Datei ist mit **Semikolon** und UTF-8-BOM geschrieben. Deutsches Excel erkennt das normalerweise
automatisch. Wenn nicht:

1. In Excel **Daten → Aus Text/CSV** wählen.
2. Trennzeichen **Semikolon**.
3. Kodierung **UTF-8**.
4. Die erste Zeile als Kopfzeile bestätigen.

### Ein Name beginnt mit `=`, `+`, `-` oder `@`

Die App setzt ein führendes Apostroph davor, damit Excel den Text nicht als Formel ausführt. Das
Apostroph ist nur im Bearbeitungsmodus sichtbar, nicht in der Zelle.

## Bedienung und Barrierefreiheit

### Tastatur und Screenreader

- **Enter** oder **Leertaste** auf einer Bahn löst denselben Tap aus wie eine Berührung.
- **Escape** schließt den obersten Dialog. Bei gestapelten Dialogen bleibt der darunterliegende
  offen.
- Der Fokus bleibt im offenen Dialog und kehrt nach dem Schließen zum Auslöser zurück.
- Bahn-Kacheln und Serienzeilen haben sprechende Labels mit Bahnnummer, Name, Status und ggf. Platz.
- Ein Screenreader-Klick ohne vorherige Pointer-Eingabe wird als Tap verarbeitet.

### Reduzierte Bewegung

Bei `prefers-reduced-motion` werden Animationen und Übergänge praktisch abgeschaltet. Der
Long-Press-Fortschrittsbalken entfällt; der Statustext bleibt.

### Keine Vibration

Die App nutzt `navigator.vibrate`, wo verfügbar. iPhone-Safari unterstützt die API nicht. Das ist
kein Fehler und keine Voraussetzung für die Bedienung.

## Grenzen, die keine Fehler sind

- Kein Hintergrundbetrieb mit Eingaben.
- Kein Sync zwischen Geräten.
- Keine Cloud und kein Konto.
- Kein automatisches Backup.
- Keine Splits im Wettkampf.
- Keine nachträgliche Änderung eines gestarteten Trainingssatzes.
- Kein Fortsetzen eines unterbrochenen Laufs nach Reload.
- Keine Bestzeit bei offener Strecke.
- Keine Alters- oder Saisonwertung.

## Wenn nichts hilft

1. Ein **Backup** sichern, bevor du etwas löschst oder zurücksetzt.
2. Die genaue Meldung und den Tab notieren.
3. In der Browser-Konsole nach roten Fehlern suchen.
4. Ein Issue im Repository anlegen: <https://github.com/Hemki96/StopWatch/issues>
5. Bei einem reproduzierbaren Fehler die Schritte, das Gerät, den Browser und die App-Version
   (unten unter **Mehr**) angeben.

## Verwandte Seiten

- [Daten und Backup](07-daten-und-backup.md)
- [Timer und Bahnen](02-timer.md)
- [Wettkampf](05-wettkampf.md)
- [Entwicklerdokumentation](../entwicklung/README.md)
