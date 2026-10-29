# Daten und Backup

Beckenrand speichert alles ausschließlich auf dem Gerät. Es gibt kein Konto, keine Cloud und keinen
Abgleich zwischen Geräten. Diese Seite erklärt, wo die Daten liegen, was ein Backup enthält und wie
du sie sicherst oder löschst.

## Wo die Daten liegen

### IndexedDB

Die fachlichen Daten liegen in der IndexedDB-Datenbank **`beckenrand.v2`** (Schema-Version 3):

| Store | Inhalt |
| --- | --- |
| `schwimmer` | Namen, Jahrgang, Notiz |
| `satz` | Sätze, Serienpläne, Disziplinen |
| `lauf` | Läufe mit Bahnen und Anschlägen |
| `wettkampf` | Wettkämpfe |
| `training` | vorbereitete Trainings |

Die Datenbank gehört zum **Origin** der App. `https://hemki96.github.io/StopWatch/` und ein lokaler
Entwicklungsserver haben getrennte Datenbestände. Ein anderer Browser oder ein anderes Gerät sieht
die Daten ebenfalls nicht.

**Geteilte Origin:** GitHub Pages liefert alle Projektseiten eines Accounts unter derselben Origin
(`https://hemki96.github.io`) aus. IndexedDB und `localStorage` sind originweit und nicht durch den
Pfad `/StopWatch/` getrennt. Andere Projekte unter derselben Origin könnten die Daten daher
technisch lesen. Der Namensraum `beckenrand.v2` verhindert versehentliche Kollisionen, ist aber
keine Sicherheitsgrenze. Wer diesen Schutz braucht, muss die App unter einer eigenen Domain
betreiben; siehe [ADR-0011](../adr/0011-geteilte-origin-und-speicher-namensraum.md).

Die App liest beim ersten Start nach dem Update den bisherigen Bestand aus der Datenbank
`beckenrand` und kopiert ihn einmalig nach `beckenrand.v2`. Die alte Datenbank bleibt unverändert
liegen und wird nicht gelöscht; schlägt die Übernahme fehl, arbeitet die App vorerst mit ihr weiter.
Ein Merker verhindert, dass die Übernahme nach **Alle Daten löschen** erneut läuft und gelöschte
Messungen zurückholt. Beim ersten Start nach dem Update sollten andere Beckenrand-Tabs geschlossen
sein: Ein noch offener Tab der alten Version schreibt weiter in die alte Datenbank, und diese
späteren Änderungen werden nicht automatisch nachgezogen.

### localStorage

Kleine Bedieneinstellungen liegen im localStorage:

| Schlüssel | Inhalt |
| --- | --- |
| `beckenrand.v2.onboarding` | ob das Onboarding abgeschlossen ist |
| `beckenrand.v2.theme` | Designwahl `system`, `light` oder `dark` |
| `beckenrand.v2.einstellungen` | Standardwerte für den nächsten Lauf |
| `beckenrand.v2.aktiverLauf` | zuletzt sichtbarer Lauf |
| `beckenrand.v2.aktiveLaeufe` | Liste der aktiven Läufe |
| `beckenrand.v2.training` | zuletzt geöffnetes Training |
| `beckenrand.v2.migration` | technischer Merker: Datenübernahme ist abgeschlossen |

Die früheren Schlüssel ohne `.v2` (`beckenrand.theme` usw.) werden weiterhin gelesen, solange der
neue Schlüssel fehlt, und beim nächsten Schreiben ersetzt. Nichts wird dabei gelöscht.

Diese Werte sind **nicht** Teil des JSON-Backups. Nach einem Import auf einem anderen Gerät sind
Design und Standardwerte deshalb wieder auf den Standard gesetzt.

## Was die Daten gefährdet

- **Browserdaten löschen.** „Websitedaten löschen“, „Verlauf und Websitedaten löschen“ oder das
  Zurücksetzen des Browsers entfernt IndexedDB und localStorage.
- **Privater Modus.** Safari im privaten Modus kann den Speicher beim Schließen verwerfen.
- **iOS ohne Installation.** Safari kann den lokalen Speicher nach längerer Nichtnutzung
  freigeben. Die Installation auf dem Home-Bildschirm reduziert dieses Risiko.
- **Speicherplatzmangel.** Der Browser darf nicht geschützten Speicher bei Platzmangel räumen.
- **Geräteverlust, Defekt, Wechsel.** Ohne Backup sind die Daten weg.
- **Fehlerhafte Erweiterungen oder Zurücksetzen der App.** Können den Origin-Speicher betreffen.

Die App kann das nicht verhindern. Sie kann nur warnen und ein Backup anbieten.

## Speicherschutz anfordern

Unter **Mehr → Daten → Speicher dauerhaft sichern** fragt die App den Browser um dauerhaften
Speicher (`navigator.storage.persist`). Zusätzlich versucht sie das beim Start einmalig
automatisch. Drei Zustände:

| Anzeige | Bedeutung |
| --- | --- |
| **Speicher geschützt** | Der Browser hat den Schutz gewährt und löscht die Daten nicht wegen Platzmangels. |
| **Speicher dauerhaft sichern** | Der Schutz ist noch nicht gewährt; ein Tipp fordert ihn erneut an. |
| **Wird von diesem Browser nicht unterstützt** | Die Storage-API fehlt; es bleibt nur das Backup. |

Der Schutz ist **kein Backup**. Er schützt nicht vor „Websitedaten löschen“, Geräteverlust oder
einem Browserwechsel.

Schlägt das Schreiben in IndexedDB fehl, versucht die App es kurz erneut. Bleibt der Fehler
bestehen (etwa weil der Speicher voll ist), erscheint ein rotes Banner:

> Kein Speicher verfügbar — Daten gehen beim Schließen verloren.

Gelingt ein späterer Schreibvorgang, verschwindet das Banner wieder. Solange es steht, die App
nicht schließen, sondern zuerst ein Backup versuchen und die Ursache beheben (Speicherplatz,
privater Modus, blockierte Website-Daten).

## CSV oder Backup?

| | CSV | JSON-Backup |
| --- | --- | --- |
| Zweck | Auswertung in Excel, Weitergabe | vollständige Sicherung und Wiederherstellung |
| Inhalt | Zeiten und Metadaten, eine Zeile pro Anschlag bzw. Start | alle fachlichen Datensätze |
| Wiederherstellbar | Nein | Ja |
| Einstellungen | Nein | Nein |
| Für Menschen lesbar | Ja, tabellarisch | Ja, technisches JSON |
| Empfohlen | Nach jedem Wettkampf, für die Auswertung | Regelmäßig und vor riskanten Aktionen |

## Backup sichern

1. Tab **Mehr** öffnen.
2. Unter **Daten** auf **Backup sichern** tippen.
3. Die Datei `beckenrand-backup-JJJJ-MM-TT.json` wird geteilt oder heruntergeladen.
4. Die Datei außerhalb des Geräts ablegen, z. B. in einer Cloud, per Mail oder auf einem Rechner.

Auf dem iPhone öffnet sich das Share-Sheet. „In Dateien sichern“ oder „AirDrop“ ist zuverlässiger
als das direkte Öffnen in einer anderen App.

### Aufbau der Datei

```json
{
  "format": "beckenrand-backup",
  "version": 3,
  "exportiertAm": "2026-10-29T18:42:00.000Z",
  "schwimmer": [],
  "satze": [],
  "laeufe": [],
  "wettkampfe": [],
  "trainings": []
}
```

Die Arrays enthalten die Datensätze, wie sie in IndexedDB liegen. Die Datei ist kein
Datenbank-Dump, sondern eine fachliche Sicherung. Sie bleibt lesbar, wenn sich die interne
Speicherung ändert.

### Versionen

| Version | Inhalt |
| --- | --- |
| 1 | Schwimmer, Sätze, Läufe |
| 2 | zusätzlich Wettkämpfe |
| 3 | zusätzlich Trainings |

Die aktuelle App schreibt **Version 3** und liest **Version 1 bis 3**. Fehlende Listen älterer
Backups werden als leer ergänzt. Ein Backup einer neueren Version wird abgelehnt.

## Backup einlesen

1. **Mehr → Daten → Backup einlesen**.
2. Eine `.json`-Datei wählen.
3. Die App prüft die Datei vollständig, **bevor** sie schreibt.
4. Bei Erfolg erscheint eine Vorschau, z. B.:
   > Vorhandene Daten bleiben erhalten. Übernommen werden: 12 Schwimmer, 1 Wettkampf, 2 Trainings,
   > 8 Sätze, 24 Läufe.
5. **Importieren** bestätigt.
6. Die App lädt den Datenbestand neu und zeigt eine Bestätigung.

### Der Import ersetzt nichts

Der Import ist eine **Zusammenführung**:

- Vorhandene Datensätze bleiben erhalten.
- Datensätze mit derselben ID werden überschrieben.
- Datensätze mit anderer ID werden ergänzt.
- Dadurch können gleiche Personen oder Sätze doppelt erscheinen, wenn sie auf zwei Geräten
  unabhängig angelegt wurden.

Ein Import ist deshalb **kein Wiederherstellen eines alten Zustands**. Wer exakt den Stand des
Backups will, muss vorher **Alle Daten löschen** und dann importieren. Dabei gehen alle Daten
verloren, die nicht im Backup stehen.

### Prüfung und Fehler

Die Prüfung kontrolliert unter anderem:

- Formatkennung `beckenrand-backup`,
- unterstützte Version,
- gültiges `exportiertAm`,
- Pflichtfelder, Datumsformat und IDs,
- Beckenlänge 25/50 und gültige Strecken,
- gültige Schwimmarten,
- Anschläge mit Zeit, Reihenfolge und Finish-Flag,
- Satzpläne und Trainingsgrenzen,
- maximal 10 Bahnen, 20 Wiederholungen, 20 Sätze.

Bei einem Fehler erscheint **„Import nicht möglich“** mit dem ersten konkreten Problem und dem Pfad,
z. B. `Training 2, Satz 3: Feld "wiederholungen" muss ...`. Der vorhandene Bestand wird **nicht**
verändert.

Der eigentliche Schreibvorgang läuft in einer Transaktion über alle fünf Stores: Entweder wird alles
übernommen oder nichts.

### Nach dem Import

- Die Oberfläche lädt den neuen Stand.
- Der zuletzt aktive Lauf kann sich ändern oder verschwinden.
- Laufende Messungen werden wie nach einem Reload behandelt: Bahnen ohne Finish sind „bereit“.
- Design und Standardwerte bleiben die des Geräts.

## Alle Daten löschen

**Mehr → Daten → Alle Daten löschen** entfernt nach einer Rückfrage:

- alle Schwimmer,
- alle Trainings,
- alle Wettkämpfe,
- alle Sätze,
- alle Läufe.

Nicht entfernt werden:

- Designwahl,
- Standardwerte für den nächsten Lauf,
- Onboarding-Status,
- die installierte App selbst.

Die Aktion ist endgültig. Vorher ein Backup sichern. Wenn nur einzelne Messungen stören, ist das
Löschen eines Laufs oder Satzes im Verlauf der bessere Weg.

## Empfohlene Routine

| Zeitpunkt | Aktion |
| --- | --- |
| Nach dem ersten Einrichten | Speicherschutz anfordern und ein Backup testen |
| Nach jedem Trainingstag | Backup sichern, wenn die Daten wichtig sind |
| Nach jedem Wettkampf | Ergebnis-CSV exportieren **und** Backup sichern |
| Vor einem App-Update | Backup sichern |
| Vor „Alle Daten löschen“ | Backup sichern und den Import einmal prüfen |
| Monatlich | Backup außerhalb des Geräts ablegen |

Ein Backup, das nie zurückgespielt wurde, ist nur eine Hoffnung. Gelegentlich auf einem zweiten
Gerät oder nach dem Löschen der Daten den Import testen.

## Datenschutz

- Die App sendet **keine Messdaten** an einen Server.
- Es gibt keine Anmeldung, keine Analyse und keine Werbung.
- Die Live-App wird als statische Seite über GitHub Pages ausgeliefert. Beim Laden der App fallen
  die üblichen Server-Zugriffsdaten an; die Messdaten bleiben davon unberührt.
- **Die GitHub-Pages-Origin ist geteilt.** Alle Projektseiten desselben Accounts laufen unter
  `https://hemki96.github.io`. IndexedDB und `localStorage` gelten für die ganze Origin, nicht nur
  für `/StopWatch/`. Anderes JavaScript auf dieser Origin könnte die lokal gespeicherten Daten
  technisch lesen. Das ist kein akuter Angriff, aber eine bewusste Grenze. Der Namensraum
  `beckenrand.v2` verhindert nur Verwechslungen, keine fremden Zugriffe.
- Namen und Jahrgänge sind personenbezogene Daten. Das Backup entsprechend behandeln und nicht
  öffentlich ablegen.

## Grenzen

- Kein automatischer Sync und keine Cloud.
- Kein automatisches Backup.
- Kein Export der Einstellungen.
- Kein Zusammenführen von Duplikaten nach Namen.
- Kein Passwortschutz für das Backup. Es ist eine lesbare JSON-Datei.

## Verwandte Seiten

- [Verlauf und Auswertung](06-verlauf-und-auswertung.md) — CSV-Formate
- [Wettkampf](05-wettkampf.md#ergebnisse-exportieren) — Ergebnis-CSV
- [Probleme und FAQ](08-probleme-und-faq.md) — wenn der Import scheitert
