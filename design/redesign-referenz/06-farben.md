# Farben

## Prinzip

Farbe ist **Status**, nicht Marke und nicht Dekoration. Es gibt genau vier Signalfarben:

| Signal | Bedeutung | Darf nicht für |
| --- | --- | --- |
| **Akzent (Cyan)** | läuft, primäre Aktion, Auswahl | Bestzeit, Warnung, Dekoration |
| **OK (Chlor-Grün)** | im Ziel, Bestzeit, vollständig | primäre Aktion, Navigation |
| **Warn (Amber)** | geplant, überfällig, unterbrochen, Display-Sperre | Fehler, Löschen |
| **Gefahr (Rot)** | destruktive Aktion, Fehler | laufende Bahn, Bestzeit |

Zusätzlich gilt:

- **Keine Verläufe, keine Glasflächen, keine Transparenz als Gestaltung.** Transparenz ist nur
  erlaubt, um eine Statusfarbe als 10–15-%-Fläche auf eine Oberfläche zu legen.
- **Zwei Flächenstufen, nicht mehr:** `--bg` → `--surface` → `--surface-2`. Eine Karte liegt nie
  auf einer Karte auf einer Karte.
- **Ziffern sind weiß.** Die Messzeit trägt keine Statusfarbe; den Status tragen Rahmen,
  Statuswort und Fortschrittslinie (Entscheidung **E2**).
- **Jede Farbe hat ein Wort.** Kein grüner Punkt ohne „Ziel“, kein rotes Feld ohne „Verwerfen“.

## Dunkles Theme (Referenz)

Die Werte stehen bereits in `src/index.css`; `--digit`, `--line-strong`, `--warn-text` und die
Füll-Tokens sind Ergänzungen für die Umsetzung.

| Token | Hex | Kontrast auf `--bg` | Kontrast auf `--surface` | Verwendung |
| --- | --- | --- | --- | --- |
| `--bg` | `#070c15` | — | — | Seitenhintergrund, Messfläche |
| `--surface` | `#111a2b` | 1,12 | — | Karten, Kacheln, Sheets |
| `--surface-2` | `#1a2538` | 1,27 | 1,13 | Chips, erhöhte Fläche, Badges |
| `--fg` | `#f2f6fc` | **18,06** | **16,05** | Text, Labels, Titel |
| `--digit` | `#ffffff` | **19,58** | **17,41** | Messzeiten, Zielzeiten |
| `--muted` | `#94a6c2` | **7,92** | **7,04** | Sekundärtext, Metazeilen |
| `--line` | `#26344c` | 1,56 | 1,39 | dekorative Trenner, Kachelrahmen „bereit“ |
| `--line-strong` | `#556b8c` | 3,61 | **3,21** | Eingabegrenzen, Knopfrahmen, die als Grenze zählen |
| `--accent` | `#38bdf8` | **9,14** | **8,13** | laufende Bahn, Primäraktion, Fokus |
| `--on-accent` | `#04202e` | 7,83 auf Akzent | — | Text auf Akzentfüllung |
| `--ok` | `#34d399` | **10,19** | **9,05** | im Ziel, Bestzeit |
| `--on-ok` | `#000000` | 10,92 auf OK | — | Text auf OK-Füllung |
| `--warn` | `#fbbf24` | **11,73** | **10,43** | geplant, Warnrahmen, Warnfläche |
| `--warn-text` | `#fbbf24` | **11,73** | **10,43** | Warntext |
| `--on-warn` | `#000000` | 12,58 auf Warn | — | Text auf Warnfüllung |
| `--danger` | `#fb7185` | **7,28** | **6,47** | Fehlertext, destruktiver Text |
| `--danger-fill` | `#e11d48` | 4,17 | 3,71 | Füllung des destruktiven Knopfs |
| `--on-danger` | `#ffffff` | 4,70 auf Füllung | — | Text auf Rot |

## Helles Theme (Zweitfassung)

Gleiche Semantik, andere Werte. Zwei Korrekturen gegenüber dem Bestand sind für die
Barrierefreiheit nötig (**E4**).

| Token | Hex | Kontrast auf `--bg` | Kontrast auf `--surface` | Verwendung |
| --- | --- | --- | --- | --- |
| `--bg` | `#eef2f7` | — | — | Seitenhintergrund |
| `--surface` | `#ffffff` | 1,13 | — | Karten, Kacheln, Sheets |
| `--surface-2` | `#e4eaf2` | 1,08 | 1,20 | Chips, erhöhte Fläche |
| `--fg` | `#0a1524` | **16,30** | **17,41** | Text |
| `--digit` | `#0a1524` | **16,30** | **17,41** | Messzeiten |
| `--muted` | `#56657e` | **5,25** | **5,90** | Sekundärtext |
| `--line` | `#cdd7e4` | 1,29 | 1,45 | dekorative Trenner |
| `--line-strong` | `#64748b` | **4,23** | 4,65 | Eingabegrenzen, Knopfrahmen |
| `--accent` | `#0369a1` | **5,28** | **5,93** | laufende Bahn, Primäraktion |
| `--on-accent` | `#ffffff` | 5,93 auf Akzent | — | Text auf Akzent |
| `--ok` | `#047857` | **4,88** | **5,48** | im Ziel, Bestzeit |
| `--on-ok` | `#ffffff` | 5,48 auf OK | — | Text auf OK |
| `--warn` | `#a16207` | 4,38 | 4,92 | **nur Füllung/Rahmen**, nicht Fließtext |
| `--warn-text` | `#854d0e` | **6,09** | **6,85** | Warntext, Warnbadge |
| `--on-warn` | `#ffffff` | 4,92 auf Warn | — | Text auf Warnfüllung (nur fett/≥14 px) |
| `--danger` | `#be123c` | **5,59** | **6,29** | Fehlertext, destruktiver Text |
| `--danger-fill` | `#be123c` | 5,59 | 6,29 | Füllung des destruktiven Knopfs |
| `--on-danger` | `#ffffff` | 4,70 auf Füllung | — | Text auf Rot |

**Wichtig:** `--warn` (`#a16207`) erreicht auf `--bg` nur 4,38:1 und ist damit für normalen Text
knapp unter AA. Deshalb gibt es `--warn-text` (`#854d0e`, 6,09:1). Die Fläche bleibt `--warn`,
der Text wechselt. Kein pauschales Abdunkeln von `--warn`, sonst kippt der Kontrast auf der
gefüllten Fläche.

## Statusfarben und Flächen

| Zustand | Rahmen | Fläche | Text | Zusätzliches Signal |
| --- | --- | --- | --- | --- |
| **bereit** | `--line`, 2 px | `--surface` | `--muted` | Statuswort „Bereit“ |
| **geplant** | `--warn` 60 %, 2 px | `--warn` 10 % | `--warn-text` | Countdown, „Start in“ |
| **läuft** | `--accent` 70 %, 2 px | `--accent` 10 % | `--digit` | „Länge 3/4“, Fortschrittslinie |
| **im Ziel** | `--ok` 50 %, 2 px | `--ok` 10 % | `--digit` | „Ziel“, volle Linie |
| **unterbrochen** | `--warn` 60 %, 2 px gestrichelt | `--warn` 10 % | `--warn-text` | „Unterbrochen“, eingefrorene Zeit |
| **überfällig** | `--warn`, 2 px | `--warn` 10 % | `--warn-text` | „überfällig“ |
| **Fehler** | `--danger` 40 % | `--danger` 10 % | `--danger` | `role="alert"` |
| **Bestzeit** | — | `--ok` 15 % | `--ok` | Badge „Bestzeit“ |
| **unvollständig** | — | `--warn` 15 % | `--warn-text` | Badge „unvollständig“ |
| **ausgewählt** | `--accent` | `--accent` | `--on-accent` | `aria-pressed` / `aria-current` |
| **gesperrt** | `--line` | `--surface-2` | `--muted` | 40 % Deckkraft + Grund als Text |

### Deckkraft-Regeln

- Statusflächen: **10 %** der Signalfarbe auf `--surface`. Bei „Bestzeit“/„unvollständig“ 15 %,
  weil das Badge klein ist.
- Statusrahmen: **50–70 %** der Signalfarbe, immer 2 px an Messflächen, 1 px an Listen.
- **Nie Signalfarbe als Text auf Signalfarbe.** Auf gefüllten Flächen gilt `--on-*`.
- **Nie zwei Signalfarben in derselben Fläche** außer „Bestzeit in einer Ergebniszeile“ (Grün auf
  neutraler Fläche).

## Theme-Regeln

- **Dunkel ist die Referenz.** Alle Screens werden zuerst dunkel entworfen und geprüft.
- **Hell ist gleichwertig, nicht umgefärbt.** Semantik, Statuswörter und Kontraste bleiben
  identisch; nur die Werte wechseln.
- **Kein Misch-Theme.** Messflächen folgen dem Theme (Entscheidung **E1**). Kein dunkles
  Scoreboard in einer hellen Liste.
- **Kein Flackern beim Start.** Das Theme wird vor dem ersten Render aus `localStorage` bzw.
  `prefers-color-scheme` gesetzt (`index.html`).
- **Wechsel ohne Übergang** oder mit maximal 120 ms; keine Farbreise über den Bildschirm.
- **Systemeinstellung ist der Standard.** „Hell“ und „Dunkel“ sind Übersteuerungen.

## Beckenmuster (Leerzustand)

Nur im Timer-Leerzustand, nur hinter dem Inhalt, nie hinter Text oder der Startfläche:

```css
/* dunkel */ rgba(255, 255, 255, 0.03)
/* hell   */ rgba(10, 21, 36, 0.03)
```

- Waagerechte 1-px-Linien im Abstand von **64 px**, um **24 px** eingezogen.
- Maximal 4 Linien sichtbar; das Muster endet vor der Aktionsleiste.
- `aria-hidden="true"`, `pointer-events: none`.
- Keine Wellen, keine Kacheln, keine Wassergrafik, keine Animation.
- Bei `prefers-contrast: more` entfällt das Muster.

## Fokus und Auswahl

- Fokusring: **2 px `--accent`**, `outline-offset: 2px`. Auf Akzentflächen: 2 px `--on-accent`
  innen plus 2 px `--accent` außen.
- `:focus-visible` nur für Tastatur und Screenreader, nicht für jeden Tap.
- Textauswahl: `--accent` Fläche, `--on-accent` Text.
- Kein `outline: none` ohne Ersatz.

## Verbotene Muster

| Verboten | Warum |
| --- | --- |
| Verlauf von Cyan nach Grün | Farbe wäre Dekoration, nicht Status |
| Glasige Karten (`backdrop-filter`) | Bei Sonne unlesbar, kostet Performance |
| Reines Schwarz `#000` als Seite | Zu hart, killt die Flächenstufen |
| Reines Weiß als Fläche im dunklen Theme | Blendet, zerstört die Hierarchie |
| Grüner Punkt ohne Text | Farbe allein |
| Rot für „läuft“ | Kollidiert mit Fehler/destruktiv |
| Amber für Bestzeit | Kollidiert mit „geplant/überfällig“ |
| Farbe für Dekoration (Icons, Rahmen ohne Bedeutung) | Verwischt die Signalsprache |
| Text in Signalfarbe unter 4,5:1 | Im hellen Theme bei `--warn` der Fall |
| Zwei Statusfarben auf einer Kachel | Unlesbarer Zustand |

## Kontrast-Matrix (Prüfwerte)

| Paar | Verhältnis | AA normal (4,5) | AA groß (3,0) | Einsatz |
| --- | --- | --- | --- | --- |
| `--fg` / `--bg` dunkel | 18,06 | ✅ | ✅ | Text |
| `--muted` / `--surface` dunkel | 7,04 | ✅ | ✅ | Meta |
| `--accent` / `--surface` dunkel | 8,13 | ✅ | ✅ | Status, Aktion |
| `--ok` / `--surface` dunkel | 9,05 | ✅ | ✅ | Bestzeit |
| `--danger` / `--surface` dunkel | 6,47 | ✅ | ✅ | Fehler |
| `--on-accent` / `--accent` dunkel | 7,83 | ✅ | ✅ | Primärknopf |
| `--fg` / `--bg` hell | 16,30 | ✅ | ✅ | Text |
| `--muted` / `--bg` hell | 5,25 | ✅ | ✅ | Meta |
| `--accent` / `--bg` hell | 5,28 | ✅ | ✅ | Status, Aktion |
| `--ok` / `--bg` hell | 4,88 | ✅ | ✅ | Bestzeit |
| `--warn` / `--bg` hell | 4,38 | ❌ | ✅ | **nur Rahmen/Füllung** |
| `--warn-text` / `--bg` hell | 6,09 | ✅ | ✅ | Warntext |
| `--danger` / `--bg` hell | 5,59 | ✅ | ✅ | Fehler |
| `--on-danger` / `--danger-fill` | 6,29 hell / 4,70 dunkel | ✅ | ✅ | Destruktiver Knopf |
| `--line` / `--bg` dunkel | 1,56 | — | ❌ | nur dekorativ |
| `--line-strong` / `--surface` dunkel | 3,21 | — | ✅ | Eingabegrenze |
| `--line-strong` / `--bg` hell | 4,23 | — | ✅ | Eingabegrenze |

Nicht-textliche Kontraste (Rahmen, Icons, Fokus) brauchen mindestens **3:1** zur angrenzenden
Fläche. `--line` erfüllt das bewusst nicht und darf deshalb nur dekorativ sein. Sobald ein Rahmen
einen Zustand oder eine Eingabegrenze markiert, gilt `--line-strong` oder eine Signalfarbe.

## Token-Mapping für die Umsetzung

Die vorhandenen Variablen bleiben. Ergänzt werden:

```css
:root {
  --digit: #0a1524;
  --line-strong: #64748b;
  --warn-text: #854d0e;
  --danger-fill: #be123c;
  --on-danger: #ffffff;
  --on-ok: #ffffff;
  --on-warn: #ffffff;
}
.dark {
  --digit: #ffffff;
  --line-strong: #556b8c;
  --warn-text: #fbbf24;
  --danger-fill: #e11d48;
  --on-danger: #ffffff;
  --on-ok: #000000;
  --on-warn: #000000;
}
```

Tailwind erhält die Entsprechungen über `@theme inline` (`--color-digit`, `--color-line-strong`,
`--color-warn-text`, …). Bestehende Namen (`bg`, `surface`, `surface2`, `fg`, `muted`, `line`,
`accent`, `ok`, `warn`, `danger`) werden nicht umbenannt, damit der Bestand lesbar bleibt.

## Prüfsteine

- Ist die Zeit auch bei Sonne weiß auf dunkel und nicht grün auf grün?
- Gibt es außerhalb von Statusflächen irgendeine gesättigte Farbe? Wenn ja, entfernen.
- Hat jeder Status ein Wort, das auch ohne Farbe funktioniert?
- Ist der Warntext im hellen Theme `--warn-text` und nicht `--warn`?
- Sind Eingabegrenzen `--line-strong` und nicht `--line`?
- Bleibt bei `prefers-contrast: more` jedes Signal sichtbar?
