# Redesign-Referenz — „Beckenrand Instrument“

Umsetzbare Design-Referenz für die bestehende PWA. Sie beschreibt die visuelle Richtung aus
[`../brief.md`](../brief.md) als konkrete Sollwerte: Informationsarchitektur, Screen-Inventar,
Raster, Typografie, Farb-Tokens, Abstände, Komponenten-Zustände, Bewegung und
Barrierefreiheitsgrenzen. Alles ist auf den vorhandenen Code in `src/ui/`, `src/App.tsx` und
`src/index.css` abgebildet.

- **Stand:** 29. Oktober 2026
- **Status:** Entwurf zur Abnahme (`ready-for-human`)
- **Geltungsbereich:** Oberfläche, keine Fachlogik, keine neuen Funktionen
- **Kanonisches Theme:** Dunkel („deep water“). Hell ist die gleichwertige Zweitfassung.

## Warum diese Referenz existiert

Issue [#14](https://github.com/Hemki96/StopWatch/issues/14) verlangt einen Sleek-Designlauf. In der
Umgebung fehlen `SLEEK_API_KEY` und die menschliche Bestätigung des Device-Flows. Ein Sleek-Projekt
konnte deshalb nicht angelegt werden. Diese Referenz hält die Designentscheidungen trotzdem
implementierbar fest, damit die folgenden Tickets nicht blockiert sind.

## Abweichungen von Issue #14

| Akzeptanzkriterium aus #14 | Stand hier | Folge |
| --- | --- | --- |
| Projekt in Sleek angelegt, Brief als eine Chat-Nachricht übergeben | **nicht erfüllt** — kein Sleek-Zugang | Formales Artefakt fehlt weiterhin |
| Je Screen ein Nutzer- und ein Full-Height-Review-Screenshot unter `design/<projekt>/` | **nicht erfüllt** — keine Screenshots | Screens sind stattdessen als Anatomie und Sollmaße beschrieben |
| Component-HTML je Screen (`GET /api/v1/projects/:id/components`) | **nicht erfüllt** — kein Projekt | Komponenten sind als Zustandstabellen und Anatomie beschrieben |
| Projekt-ID und Editor-Link in `design/<projekt>/README.md` | **nicht vorhanden** | Kein Link, keine ID |
| Abweichungen zwischen Brief und Ergebnis im README | **erfüllt** — siehe unten | — |

### Brief gegen Referenz

| Punkt im Brief | Referenz | Grund |
| --- | --- | --- |
| Kondensierte Grotesk für die Uhr | System-Sans mit `tabular-nums`, enger Laufweite; optional gebündelte Condensed-Schrift | Offline-PWA, keine Netzabhängigkeit, kein Font-TOFU; Entscheidung **E3** |
| Ziffern bleiben reinweiß, Status trägt die Signalfarbe | Zeit ist immer `#ffffff`; Status sitzt in 2-px-Rahmen, Statuszeile und Fortschrittslinie | Widerspruch zum Bestand, der die Ziffer färbt; Entscheidung **E2** |
| Haarline-Fortschrittslinie auf jeder Bahn-Kachel | 6-px-Spur, ein Segment pro Länge bis 10 Längen, darüber ein durchgehender Füllstand | 1500 m / 25 m ergibt 60 Längen; 60 Segmente wären unlesbar |
| Maximal 10 Bahn-Kacheln | 10 Bahnen **je Reihe**, bis zu 5 Reihen; jede Reihe ist ein eigener Block | Bestand und `MAX_BAHNEN`/`MAX_REIHEN`; 50 Personen sind möglich |
| Kein Scrollen während der Messung | Kein Seiten-Scroll; nur das Kachelfeld darf scrollen, Kopf und Aktionsleiste bleiben stehen | Bei 10 Bahnen auf 667-px-Handys physisch nicht anders lösbar |
| Bottom Sheets mit Griff | vorhanden; auf `rail` zentriertes Fenster ohne Griff | Bestand |
| Verwerfen-Dialog | `alertdialog`, Fokus auf „Abbrechen“, Bestätigung rot | Bestand |
| Zehn Screens | Zehn Referenz-Screens plus Bestands-Screens (Training, Wettkampf, Serie, Analyse, Startübersicht, Banner) | App ist größer als der Brief |
| Export/Teilen im Lauf-Detail | CSV-Download; kein Web-Share | Kein Share-Ziel im Bestand, nicht Teil des Redesigns |

## Lesereihenfolge

1. [Informationsarchitektur](01-informationsarchitektur.md) — Navigation, Ebenen, Abläufe
2. [Screens](02-screens.md) — die zehn Screens aus dem Brief
3. [Bestands-Screens](03-screens-bestand.md) — Training, Wettkampf, Serie, Analyse, Startübersicht, globales Gerüst
4. [Layout und Raster](04-layout-und-raster.md) — Gerüst, Breakpoints, Bahnenraster, Sheets
5. [Typografie](05-typografie.md) — Skala, Ziffern, deutsche Formate
6. [Farben](06-farben.md) — Tokens, Kontraste, Statusfarben, Theme-Regeln
7. [Abstände und Form](07-abstaende-und-form.md) — Spacing, Radien, Rahmen, Schatten, Touchziele
8. [Komponenten und Zustände](08-komponenten-und-zustaende.md) — Anatomie und Zustandsmatrix
9. [Bewegung](09-bewegung.md) — Dauer, Easing, reduzierte Bewegung, Haptik
10. [Barrierefreiheit](10-barrierefreiheit.md) — Kontrast, Ziele, Tastatur, Screenreader, Sonne/Nässe
11. [Produktreferenzen](11-referenzen.md) — fünf reale Produkte und was genau entlehnt wird

## Leitentscheidungen

| Nr. | Entscheidung | Begründung |
| --- | --- | --- |
| D1 | Ein Screen ist eine **Kontrollfläche**, keine Seite: fester Kopf, flexibler Inhalt, verankerte Aktionsleiste | Einhandbedienung am Beckenrand |
| D2 | Sechs Tabs bleiben: Timer, Training, Wettkampf, Verlauf, Schwimmer, Mehr | Messung zuerst; bestehende IA funktioniert |
| D3 | Genau **eine** primäre Aktion je Screen, unten, 56–80 px hoch | Kein Suchen mit nassen Fingern |
| D4 | Farbe ist **Status**, nie Dekoration. Zusätzlich immer Text oder Form | Sonne, Farbsehschwäche, Screenreader |
| D5 | Keine Bilder, Verläufe, Glasflächen. Grafiken sind Zahlen, Haarlinien und das Beckenmuster im Leerzustand | Brief; Lesbarkeit bei Sonne |
| D6 | Zeiten immer tabellarisch, mit deutschem Komma, Hundertstel abgeschnitten | Kein Ziffernspringen, keine Scheingenauigkeit |
| D7 | Dunkel ist die Referenz, Hell die Zweitfassung mit denselben Semantiken | Eine visuelle Sprache, zwei Themes |
| D8 | Bewegung nur als Rückmeldung, nie als Dekoration oder Dauerloop | Instrument, kein Spielzeug |

## Offene Entscheidungen (menschliche Abnahme)

| Nr. | Frage | Empfehlung | Auswirkung |
| --- | --- | --- | --- |
| E1 | Sollen Messflächen im hellen Theme ebenfalls dunkel bleiben („Scoreboard im hellen Rahmen“)? | **Nein.** Messflächen folgen dem Theme; Dunkel bleibt Referenz | Kein Misch-Theme, weniger Umbau |
| E2 | Ziffern reinweiß (Brief) oder statusfarbig (Bestand)? | **Reinweiß.** Status über Rahmen, Text und Fortschritt | Ändert `LaneTile`, `LaufErgebnis`, `LaufDetail` |
| E3 | Condensed-Webfont bündeln? | **Nein.** System-Sans + `tabular-nums`; Condensed nur, wenn Gestaltung sie ausdrücklich will | Sonst Font-Datei, OFL-Prüfung, Ladezustand |
| E4 | `--warn` im hellen Theme für Text abdunkeln? | **Ja**, neues Text-Token `#854d0e` (6,09:1) neben dem Füll-Token | Kleine Farbänderung an Warnungen |
| E5 | Icon-Knöpfe von 36/40 px auf 44 px Trefferfläche vergrößern? | **Ja**, visuell 40 px, Trefferfläche 44 px | Leichte Layoutverschiebung in Kopfzeilen |
| E6 | 10 Bahnen im Querformat: 5 Spalten à 96 px oder scrollen? | **5 Spalten**, Kacheln min. 96 px | Kacheltext kleiner, dafür kein Scrollen |
| E7 | Beckenmuster im Leerzustand (Brief) oder komplett flächig? | **Muster**, 1-px-Linien bei 3 % Deckkraft, nur im Leerzustand | Ein dezentes CSS-Pseudo-Element |
| E8 | Ersetzt diese Referenz das Sleek-Artefakt für #14? | **Nur inhaltlich.** #14 bleibt formal offen, bis Screenshots/HTML vorliegen | Issue darf nicht allein deshalb geschlossen werden |

## Grundsätze für die Umsetzung

1. **Ein Screen, eine Hauptaktion.** Sie steht in der unteren Leiste und scrollt nie weg.
2. **Die Zahl ist das größte Element ihrer Zeile.** Kein Label, kein Badge darüber.
3. **Status ist immer doppelt kodiert:** Farbe plus Wort (`läuft`, `Ziel`, `Bestzeit`, `unterbrochen`).
4. **Keine schwebenden Speichern-Knöpfe.** Aktionen gehören in die Leiste oder ins Sheet.
5. **Dialoge nur über `Dialog`/`Sheet`.** Kein eigenes Fokus- oder Scroll-Handling.
6. **Touchziele nie verkleinern, um Inhalt zu zeigen.** Lieber das Kachelfeld scrollen lassen.
7. **Deutsche Labels und Formate.** Begriffe aus [`GLOSSARY.md`](../../GLOSSARY.md).
8. **Reduzierte Bewegung respektieren.** Der Text bleibt, nur die Animation entfällt.
9. **Keine Farbe allein.** Kein grüner Punkt ohne „Ziel“, kein rotes Feld ohne „verwerfen“.
10. **Sonne und Nässe sind Testbedingungen**, nicht Randfälle.

## Quellen

- [`design/brief.md`](../brief.md) — Richtung und Constraints
- [`docs/entwicklung/oberflaeche.md`](../../docs/entwicklung/oberflaeche.md) — aktueller Stand
- [`src/index.css`](../../src/index.css) — bestehende Tokens und Breakpoints
- [`src/App.tsx`](../../src/App.tsx), [`src/ui/`](../../src/ui/) — tatsächliche Screens und Maße
- [`GLOSSARY.md`](../../GLOSSARY.md) — verbindliche Begriffe

## Definition of Done für Umsetzungstickets

- [ ] Alle Sollwerte aus Kapitel 4–10 sind im Code nachweisbar (Klassen, Tokens, Maße).
- [ ] Jeder Screen aus Kapitel 2 und 3 hat die genannten Zustände, inklusive Leer- und Fehlerzustand.
- [ ] Kein Text unter 10 px, keine Ziffer ohne `tabular-nums`.
- [ ] Jedes interaktive Ziel erreicht 44 × 44 px, die primäre Aktion 56–80 px.
- [ ] Kontraste erfüllen Kapitel 10 in beiden Themes.
- [ ] `prefers-reduced-motion` entfernt alle Animationen, ohne Information zu verlieren.
- [ ] Handy 390 × 844, Handy quer 844 × 390 und Tablet 820 × 1180 sind geprüft.
- [ ] `docs/entwicklung/oberflaeche.md` und die Handbuchseiten sind aktualisiert.
