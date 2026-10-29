# Barrierefreiheit

Die Zielbedingungen sind ungewöhnlich: **direkte Sonne, nasse Finger, eine Hand, Zeitdruck.** Was
am Schreibtisch großzügig wirkt, ist am Beckenrand die Untergrenze. Dieses Kapitel legt die
Sollwerte fest und nennt die Abweichungen im Bestand.

## Touchziele

| Element | Soll | Bestand | Bewertung |
| --- | --- | --- | --- |
| Primäre Aktion | 56–80 px, volle Breite | 64–80 px | ✅ |
| Sekundärknopf | 48 px | 48 px | ✅ |
| Chip | 44 × 44 px | 44 px | ✅ |
| Eingabefeld | 48 px | 48 px | ✅ |
| Bahn-Kachel | ≥ 96 px | ≥ 120 px | ✅ |
| Tab | 56 px | 56 px | ✅ |
| Listenzeile | ≥ 48 px | ≥ 48 px | ✅ |
| Sheet-Schließen | **44 × 44 px** | 36 × 36 px | ⚠️ **E5** |
| Kopfzeilen-Icon | **44 × 44 px** | 40 × 40 px | ⚠️ **E5** |
| Korrektur-Stift | **44 × 44 px** | 28 × 28 px | ⚠️ vergrößern |
| „Zurück“ in Ergebnis | **44 px hoch** | ca. 28 px | ⚠️ vergrößern |
| Banner-Schließen | **44 × 44 px** | 28 × 28 px | ⚠️ vergrößern |

- **44 × 44 px ist die Untergrenze für jedes interaktive Element**, auch wenn das Icon nur 20 px
  groß ist. Die Trefferfläche wächst über Polster, nicht über das Icon.
- Zwei Ziele liegen mindestens **8 px** auseinander. Bei nassen Fingern ist der Daumen ungenau;
  benachbarte Aktionen dürfen nicht aneinanderkleben.
- Die primäre Aktion liegt in der unteren Bildschirmhälfte, idealerweise in den letzten 25 %.
  Destruktive Aktionen liegen nie oben rechts.
- Kein Ziel wird kleiner, um mehr Inhalt zu zeigen. Lieber scrollen.

## Kontrast

Die vollständige Matrix steht in [Kapitel 6](06-farben.md#kontrast-matrix-prüfwerte). Die
Mindestwerte:

| Element | Mindestkontrast | Soll |
| --- | --- | --- |
| Fließtext, Labels, Status | 4,5:1 | 7:1 bei Sonne |
| Große Zeit (≥ 24 px, 600) | 3:1 | 7:1 |
| Rahmen, Icons, Fokus, Eingabegrenzen | 3:1 | 3:1 |
| Deaktivierte Elemente | ausgenommen | trotzdem lesbar |
| Statusfarbe als Fläche | 3:1 zur Nachbarfläche | 3:1 |

Bekannte Abweichungen:

| Problem | Wert | Lösung |
| --- | --- | --- |
| `--warn` im hellen Theme als Text | 4,38:1 auf `--bg` | `--warn-text` `#854d0e` (6,09:1), **E4** |
| `--line` als Eingabegrenze | 1,29 hell / 1,56 dunkel | `--line-strong` (4,23 / 3,21) |
| 9-px-Text in der Laufleiste | zu klein | auf 10 px anheben |
| Status nur über Farbe | Akzent/Grün | Statuswort ergänzen, **E2** |

**Sonne:** Ein Kontrast von 4,5:1 ist am Bildschirm bei direkter Einstrahlung oft nicht genug.
Deshalb:

- Messzeiten sind **reinweiß** auf dunkler Fläche (17–19:1).
- Sekundärtext ist mindestens 7:1 im dunklen Theme.
- Keine 1-px-Haarlinien als einzige Information; Statusrahmen sind 2 px.
- Keine Fotos, keine Verläufe, keine Glasflächen, die bei Sonne spiegeln.
- Das dunkle Theme ist die Referenz, nicht das helle.

## Tastatur

| Ort | Taste | Wirkung |
| --- | --- | --- |
| Bahn-Kachel | `Enter`, `Leertaste` | Anschlag / Start |
| Bahn-Kachel | `Backspace`, `Delete` | letzten Anschlag zurücknehmen |
| Bahn-Kachel | `Tab` | zur nächsten Kachel / zum „Ziel“-Knopf |
| Ziel-Knopf | `Enter`, `Leertaste` | Bahn auf offener Strecke beenden |
| Dialog | `Tab` / `Shift+Tab` | Fokusfalle im Panel |
| Dialog | `Escape` | obersten Dialog schließen |
| Lauf-Detail | `Escape` | zurück |
| Chip | `Enter`, `Leertaste` | auswählen |
| Segment-Control | `Tab`, `Enter` | Segment wechseln |
| Sheet | `Escape` | schließen |

- Die DOM-Reihenfolge ist **Inhalt vor Navigation**. Auf dem Tablet steht die Navigation visuell
  links, wird aber nach dem Inhalt fokussiert. Das ist bewusst: Der Screenreader bekommt zuerst
  den Inhalt, und die visuelle Position ändert die Reihenfolge nicht.
- Jedes fokussierbare Element hat einen sichtbaren Fokusring (2 px Akzent, Offset 2 px).
- Kein `tabIndex > 0`, keine Fokusfallen außerhalb von Dialogen.
- Der Fokus springt nie automatisch während einer Messung. Ausnahme: Dialog-Öffnung und
  Feldkorrektur.
- Nach dem Schließen eines Dialogs kehrt der Fokus zum Auslöser zurück; existiert er nicht mehr,
  auf ein sinnvolles Element im `main`.

## Screenreader

### Namen und Rollen

| Element | Rolle | Name | Beschreibung |
| --- | --- | --- | --- |
| Bahn-Kachel | `button` | „Reihe 1, Bahn 3, Anna, läuft“ | Zwischenzeiten, Längenstand |
| Ziel-Knopf | `button` | „Bahn 3 beenden“ | — |
| Kachel bei unterbrochen | `button` | „…, unterbrochen“ | Hinweis auf langes Drücken |
| Tab | `button` | „Verlauf“ | `aria-current="page"` |
| Chip | `button` | „Freistil“ | `aria-pressed` |
| Ergebniszeile | `listitem` | — | Zeit, PB, Delta als Text |
| Korrektur-Stift | `button` | „Anschlag 2 korrigieren“ | — |
| Schließen | `button` | „Schließen“ | — |
| Dialog | `alertdialog` | Titel | Erklärungstext |
| Toast | `status` | — | `aria-live="polite"` |
| Fortschritt | `status` (versteckt) | — | nur bei diskreter Änderung |

### Live-Regionen

- Der **Toast** ist dauerhaft im DOM und `aria-live="polite"`.
- Der **Fortschritt** („3 von 4 im Ziel“) wird nur bei diskreten Änderungen angesagt, nicht bei
  jedem Frame. Dafür gibt es eine eigene `sr-only`-Region; die sichtbare Zeile mit der Laufzeit ist
  **nicht** live.
- Die **Display-Sperre-Warnung** erscheint als `role="status"` und wird einmal angesagt.
- **Keine** Live-Region auf der tickenden Zeit, den Splits oder dem Countdown. Sonst würde der
  Screenreader 60-mal pro Sekunde unterbrochen.
- Statusänderungen einer Kachel werden über das aktualisierte `aria-label` zugänglich, nicht über
  eine eigene Live-Region.

### Semantik

- Eine Bahn ist ein `role="button"` mit `tabIndex=0`, weil Tap, Enter und Leertaste dieselbe
  Aktion auslösen.
- Ein Dialog ist `role="dialog"` bzw. `alertdialog`, `aria-modal="true"`, mit
  `aria-labelledby` und `aria-describedby`.
- Der Backdrop ist ein echter Knopf mit `aria-label="Dialog schließen"`; kein nacktes `div`.
- Fortschrittsbalken tragen `role="progressbar"` mit `aria-valuemin/max/now` und einem Text.
- Dekorative Linien, Muster und Icons sind `aria-hidden="true"`.
- Überschriften folgen der Hierarchie: `h1` pro Screen, `h2` für Gruppen, `h3` für Abschnitte im
  Sheet. Keine Sprünge.

## Sonne und Nässe

### Sonne

- Messzeiten weiß auf dunkel, mindestens 17:1.
- Kein Text unter 10 px, Status nie nur als 1-px-Linie.
- Keine spiegelnden Flächen, keine Transparenz außer Status-Tints.
- Der Bildschirm bleibt an (`useWakeLock`), solange etwas läuft; fällt er aus, wird die
  Statuszeile amber und der Text nennt die Folge.
- Das dunkle Theme ist die Referenz; das helle Theme ist für Innenräume gedacht.

### Nässe

- Keine Doppeltipp-, Wisch- oder Zwei-Finger-Geste als **einzige** Möglichkeit.
- Langdruck hat immer eine Alternative: Tastatur (`Backspace`/`Delete`) und einen sichtbaren
  Hinweistext.
- Das Sheet lässt sich per X, Backdrop, Escape und Zug schließen — vier Wege, keiner exklusiv.
- Destruktive Aktionen fragen nach; „Abbrechen“ ist vorfokussiert.
- Kein Hover als Informationsträger.
- Keine kleinen Ziele an den Bildschirmrändern; die Aktionsleiste hat 12–16 px Polster.
- Ein versehentlicher Tap darf keine Daten löschen. Löschen ist immer zwei Schritte entfernt.

## Vergrößerung und Umbruch

- **200 % Zoom** ohne horizontales Scrollen; Text bleibt lesbar.
- **320 px Breite** ist die Untergrenze. Sechs Tabs bleiben sichtbar; Labels dürfen auf 10 px
  gehen, nicht verschwinden.
- **Reflow:** Kein Inhalt benötigt horizontales Scrollen außer einer echten Tabelle. Das
  Lauf-Detail bleibt bei 320 px einspaltig.
- **Textabstand:** Zeilenhöhe mindestens 1,4; Absätze 1,5. Kein festes `height` an Textcontainern.
- **Ausrichtung:** Beide Orientierungen. Im Querformat bleibt die Aktionsleiste erreichbar.
- **Sprache:** `<html lang="de">`; Zeit- und Datumsformate deutsch.

## Farbe und Farbschwäche

- Status ist immer **Farbe + Wort + Form** (Rahmen, Badge, Fortschritt).
- Rot/Grün werden nie allein gegenübergestellt. „Bestzeit“ steht als Text, „Ziel“ als Text.
- Das Delta trägt immer ein Vorzeichen (`+`/`-`), nicht nur eine Farbe.
- Ein Graustufen-Screenshot muss alle Zustände unterscheidbar lassen.
- `prefers-contrast: more`: Statusrahmen auf volle Deckkraft, Muster entfällt, Sekundärtext auf
  `--fg`.

## Fehler und Rückmeldung

- Fehler stehen am Feld, nicht am Screen-Ende, mit `role="alert"` und `aria-describedby`.
- Ein Fehler nennt die Korrektur: „Bitte eine Zeit wie 01:23,45 eingeben.“
- Ein Importfehler nennt die Zeilennummer und ändert nichts am Bestand.
- Ein Speicherfehler wird zum dauerhaften Banner, nicht zu einem flüchtigen Toast.
- Ein fehlgeschlagener Export bleibt nicht stumm: Toast „Export fehlgeschlagen.“
- Haptik ist nie die einzige Rückmeldung; auf iPhone-Safari fehlt sie ganz.

## WCAG-Bezug

| Kriterium | Umsetzung |
| --- | --- |
| 1.4.1 Farbe | Status immer zusätzlich als Text/Form |
| 1.4.3 Kontrast | 4,5:1 Text, 3:1 große Zeit |
| 1.4.4 Textgröße | 200 % Zoom, rem-basiert |
| 1.4.10 Reflow | 320 px, kein horizontales Scrollen |
| 1.4.11 Nicht-Text-Kontrast | 3:1 für Rahmen, Icons, Fokus |
| 2.1.1 Tastatur | alle Aktionen per Tastatur |
| 2.3.3 Animation | keine Bewegung ohne Absicht, reduzierte Bewegung |
| 2.4.3 Fokusreihenfolge | Inhalt vor Navigation, logisch |
| 2.4.7 Fokus sichtbar | 2-px-Ring |
| 2.5.1 Zeigergesten | Long-Press hat Tastatur- und Textalternative |
| 2.5.5 Zielgröße | 44 × 44 px (über AAA hinaus) |
| 3.1 Sprache | `lang="de"` |
| 3.3.1 Fehlerkennzeichnung | Text am Feld, `role="alert"` |
| 4.1.2 Name, Rolle, Wert | `role`, `aria-label`, `aria-pressed`, `aria-current` |

## Prüfprotokoll

Vor jedem Redesign-Ticket:

1. **Sonne:** Gerät bei direkter Einstrahlung, dunkles Theme, Zeit aus 2 m lesen.
2. **Nässe:** Display leicht besprühen, 10 Anschläge tippen, Undo, Sheet schließen.
3. **Eine Hand:** 390 × 844, nur Daumen, Start und Verwerfen erreichen.
4. **VoiceOver (iOS):** Onboarding, Start, ein Anschlag, Ergebnis, Dialog.
5. **TalkBack (Android):** dieselben Schritte, Fokusfalle im Sheet.
6. **Tastatur:** alle Aktionen ohne Maus, Fokusring sichtbar, Escape schließt.
7. **Reduzierte Bewegung:** Systemeinstellung an, Long-Press, Sheet, Fortschritt.
8. **Zoom 200 %:** 320 px Breite, kein horizontales Scrollen.
9. **Graustufen:** alle Status unterscheidbar.
10. **Kontrast:** die Matrix aus Kapitel 6 stichprobenartig nachmessen.

## Offene Punkte

| Nr. | Punkt | Entscheidung |
| --- | --- | --- |
| E2 | Ziffern statusfarbig oder weiß | Empfehlung weiß; Bestand färbt |
| E4 | Warnkontrast im hellen Theme | `--warn-text` einführen |
| E5 | Icon-Trefferflächen | auf 44 px vergrößern |
| — | 9-px-Label in der Laufleiste | auf 10 px anheben |
| — | `active:scale` auf Primärknöpfen | durch Flächendimmen ersetzen |
| — | Fortschritt als Live-Region | nur diskrete Änderungen ansagen |
