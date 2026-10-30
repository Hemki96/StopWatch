# Layout und Raster

## Grundmaß

Alle Maße sind Vielfache von **4 px**. Die Skala ist bewusst kleiner als bei einer Marketing-Seite:
Am Beckenrand zählt Lesbarkeit, nicht Luft.

| Token | Wert | Verwendung |
| --- | --- | --- |
| `space-1` | 4 px | Icon zu Text, Haarlinien-Abstand |
| `space-2` | 8 px | Kachelabstand, Chip-Abstand, innere Enge |
| `space-3` | 12 px | Aktionsleiste, Kartenpolster klein |
| `space-4` | 16 px | Screen-Polster, Kartenpolster, Sheet-Polster |
| `space-5` | 20 px | Sheet-Abschnitt, Dialog-Polster |
| `space-6` | 24 px | Abschnittsabstand, Sheet-Radius |
| `space-8` | 32 px | großer Blockabstand |
| `space-10` | 40 px | Leerzustand-Abstand |
| `space-12` | 48 px | Knopfhöhe sekundär |
| `space-14` | 56 px | Knopfhöhe primär klein |
| `space-16` | 64 px | Knopfhöhe primär |
| `space-20` | 80 px | Startknopf |

## Geräteklassen

Zwei eigene Varianten, die Geräteklassen beschreiben, nicht nur Breite. Sie stehen bereits in
`src/index.css`.

| Klasse | Bedingung | Gerät | Folgen |
| --- | --- | --- | --- |
| **Handy hoch** | < 768 px Breite | 320–767 px | untere Tab-Leiste 56 px, Inhalt volle Breite, Polster 16 px |
| **Handy quer** (`short`) | max-height 520 px | z. B. 844 × 390 | Tab-Leiste 48 px mit Icon+Text nebeneinander, Kopf 44 px, Kacheln 96 px, 5-Spalten-Raster |
| **Tablet** (`rail`) | min-width 768 px **und** min-height 560 px | 820 × 1180 | seitliche Navigation 96 px, Inhalt zentriert, Sheets als Fenster |
| **Referenz Handy** | 390 × 844 | iPhone 14/15 | alle Maße in diesem Kapitel |
| **Referenz Tablet** | 820 × 1180 | iPad Air | zwei Spalten für Listen, 5 Spalten für Bahnen |

Die Höhenbedingung ist wichtig: Ein Handy im Querformat (844 × 390) darf **nicht** die seitliche
Navigation bekommen, sonst quetschen sich fünf Einträge auf 390 px Höhe.

## Rahmen

| Bereich | Höhe | Regel |
| --- | --- | --- |
| Globales Banner | 32–40 px | schiebt Inhalt, überdeckt nichts |
| Screen-Kopf | 48 px (44 px `short`) | fest, 1-px-Unterlinie, nie mitscrollend |
| Laufleiste | 40 px | nur Timer, horizontal scrollbar |
| Inhaltsbereich | flexibel | **einziger** scrollender Bereich |
| Aktionsleiste | 80–104 px inkl. Safe-Area | fest, 1-px-Oberlinie, Polster 12/16 px |
| Tab-Leiste | 56 px (48 px `short`, 96 px breit `rail`) | fest, 1-px-Oberlinie |
| Toast | 36 px | schwebend, 96 px über dem unteren Rand |

### Höhenbudget (Handy 390 × 844)

```
844  Gesamthöhe
-56  Tab-Leiste
-48  Screen-Kopf
-104 Aktionsleiste (80 + 24 Safe-Area/Polster)
────
636  verfügbar für das Kachelfeld
-16  Rasterpolster oben/unten (8 + 8)
────
620  für Kacheln und Zwischenräume
```

10 Bahnen in 2 Spalten = 5 Reihen × 112 px + 4 × 8 px = **592 px**. Passt ohne Scrollen.
Mit der alten Mindesthöhe von 120 px wären es 648 px und damit ein kleiner Scroll. Deshalb gilt
unter 900 px Gerätehöhe **112 px**. Auf einem 667-px-Handy bleiben 439 px: 10 Bahnen scrollen dann
im Kachelfeld, 6 Bahnen passen. **Regel:** Die Seite scrollt nie; nur das Kachelfeld darf scrollen.
Kopf, Status und Aktionsleiste bleiben stehen.

## Breiten

| Inhalt | Maximalbreite | Wo |
| --- | --- | --- |
| Gesamter Screen | 1024 px (`max-w-5xl`) | `App.tsx`, zentriert |
| Leerzustand Timer, Formulare | 672 px (`max-w-2xl`) | Timer idle, Einstellungen |
| Laufende Aktionsleiste | 768 px (`max-w-3xl`) | Timer running |
| Lauf-Detail | 896 px (`max-w-4xl`) | `LaufDetail` |
| Sheet | 576 px (`max-w-xl`) | `rail` |
| Dialog | 384 px (`max-w-sm`) | `Bestaetigung` |
| Fließtext | 65 Zeichen | Onboarding, Hinweise |

Auf dem Handy ist die Breite immer 100 % minus 2 × 16 px. Kein Screen hat einen eigenen
Außenabstand, der nicht durch das Gerüst kommt.

## Navigation

### Handy hoch

- Sechs gleich breite Spalten, Höhe 56 px, Icon 24 px über Label 10–11 px.
- Aktiver Eintrag: Akzentfarbe, `aria-current="page"`.
- Der Safe-Area-Abstand sitzt im unteren Polster, nicht als zusätzliche Leiste.
- Kein horizontaler Scroll, kein „Mehr“-Überlauf.

### Handy quer (`short`)

- Höhe 48 px, Icon und Label nebeneinander, 12 px Label.
- Der Inhalt verliert 8 px; das Kachelfeld gewinnt sie zurück.

### Tablet (`rail`)

- Leiste links, 96 px breit, fünf Einträge untereinander, je 64 px hoch, 12 px Radius.
- Aktiver Eintrag: `bg-accent/10` plus Akzenttext, nicht die volle Akzentfüllung.
- Die Leiste hat oben und unten 16 px Polster; sie scrollt nicht.

## Bahnenraster

Das Raster richtet sich nach der **größten Reihe**, nicht nach der Gesamtzahl der Personen. Eine
Reihe ist eine Startgruppe; sie wird nie mit einer anderen gemischt.

| Bahnen je Reihe | Handy < 560 | Handy ≥ 560 | Handy quer (`short`) | Tablet (`rail`) |
| --- | --- | --- | --- | --- |
| 1 | 1 Spalte | 1 | 1 | 1 (Kachel max. 640 px breit) |
| 2 | 2 | 2 | 2 | 2 |
| 3 | 2 | 3 | 3 | 3 |
| 4 | 2 (2 × 2) | 2 (2 × 2) | 4 (1 × 4) | 4 |
| 5 | 2 | 3 | 5 | 3 |
| 6 | 2 | 3 | 3 (2 Reihen) | 3 |
| 7–8 | 2 | 3 | 4 (2 Reihen) | 4 |
| 9–10 | 2 | 3 | 5 (2 Reihen) | 5 |

- **Kachelmindesthöhe:** 112 px bei Gerätehöhe < 900 px, 120 px ab 900 px, 96 px `short`,
  128 px `rail`. `auto-rows-[minmax(<wert>,1fr)]`; bei wenig Inhalt wachsen die Kacheln, statt oben
  zu kleben.
- **Abstand:** 8 px zwischen Kacheln, 12 px auf `rail`. Abschnitt zwischen Reihen: 12 px.
- **Reihenüberschrift:** 24 px hoch, `REIHE n` 10 px Versalien, rechts Status/Countdown 10 px
  tabellarisch. Sie klebt beim Scrollen oben (`sticky`), Hintergrund `--bg`.
- **Spaltenzahl** bleibt für alle Reihen gleich; sie folgt der größten Reihe. Eine kleinere Reihe
  füllt von links, ohne die Kacheln zu strecken.
- **Eine Bahn** nimmt die volle Breite bis 640 px und zentriert; sie wird nicht zu einer
  Briefmarke.
- **Keine Kachel unter 96 px Höhe.** Lieber scrollt das Feld.

### Warum diese Matrix

- 2 Spalten auf schmalen Handys halten die Zeit bei 22–30 px und den Namen lesbar.
- 3 Spalten ab 560 px nutzen die Breite, ohne die Kachel unter 160 px zu drücken.
- 5 Spalten im Querformat sind der einzige Weg, 10 Bahnen ohne Scrollen zu zeigen: 2 Reihen à
  96 px + 8 px Abstand = 200 px bei 218 px verfügbarer Höhe.
- Auf dem Tablet sind 5 Spalten das Maximum. Mehr wird zur Wand und die Zeit schrumpft.

## Sheets

| Eigenschaft | Handy | Tablet (`rail`) |
| --- | --- | --- |
| Einstieg | von unten | zentriert, ohne Fahrt |
| Breite | 100 % | 576 px |
| Höhe | max. 88 dvh | max. 85 dvh |
| Radius | oben 24 px | allseitig 24 px |
| Griff | 40 × 4 px, mittig, 6 px vom Rand | entfällt |
| Ziehen | Kopfzeile, > 90 px schließt | bleibt als Maus-/Touch-Geste |
| Innenabstand | 16 px, unten Safe-Area | 24 px |
| Scrollen | nur Inhalt, `overscroll-contain` | dito |
| Schließen | X (44 px), Backdrop, Escape, Zug | dito |

- Der Sheet-Kopf ist 56 px hoch und klebt. Er ist die einzige Ziehfläche.
- Der Inhalt beginnt mit 16 px Abstand; Abschnitte haben 20 px Abstand.
- Aktionen stehen am Ende des Inhalts, nicht in einer zweiten Leiste. Ein bestätigender Knopf ist
  56–64 px hoch.
- Auf dem Tablet wird das Sheet zum Fenster: Der Griff entfällt, der Radius gilt rundum.

## Dialoge

- Breite max. 384 px, Polster 20 px, Radius 16 px, zentriert.
- Backdrop `rgba(0,0,0,0.6)`, kein Blur.
- Zwei Knöpfe nebeneinander, je 48 px hoch, 8 px Abstand, gleiche Breite.
- Auf schmalen Geräten bleiben 24 px Rand zum Viewport.

## Lauf-Detail

- Vollbild, `fixed inset-0`, z-index 30.
- Kopf 48 px, Inhalt max. 896 px, Polster 16/24 px.
- Bahnkarten: eine Spalte auf dem Handy, zwei ab `rail`, Abstand 8 px.
- Die Anschlagstabelle bleibt auch bei zwei Spalten eine Tabelle; Zeiten rechtsbündig.

## Safe Areas und Ausrichtung

- Unten: `padding-bottom: max(env(safe-area-inset-bottom), 8/12/16px)` an Navigation und
  Aktionsleiste. Nie beide addieren.
- Querformat: `padding-left/right: env(safe-area-inset-left/right)` am äußersten Rahmen.
- Das Manifest erlaubt beide Ausrichtungen. Es gibt kein erzwungenes Hochformat.
- Die Tastatur schiebt die Aktionsleiste nach oben; das Sheet bleibt scrollbar. Kein Feld wird
  von der Tastatur verdeckt.

## Ebenen und Überlagerung

| Ebene | z-index | Beispiele |
| --- | --- | --- |
| Screen | 0 | Timer, Verlauf |
| Vollbild-Detail | 30 | Lauf-Detail |
| Dialog/Sheet | 40 + 10 × Tiefe | Sheet 40, Bestätigung darüber 50 |
| Toast | 50 | schwebend |
| Banner | im Fluss | kein z-index |

- Kein Screen legt eigene `fixed`-Elemente über die Navigation.
- Der Toast liegt über der Aktionsleiste, aber unter einem offenen Dialog.

## Prüfmatrix

Jede Layoutänderung wird auf diesen vier Flächen geprüft:

| Fläche | Größe | Prüfpunkt |
| --- | --- | --- |
| Kleines Handy | 320 × 667 | fünf Tabs, kein horizontales Scrollen, 10 Bahnen scrollen kontrolliert |
| Referenz Handy | 390 × 844 | 10 Bahnen passen, Startknopf im Daumenbereich |
| Handy quer | 844 × 390 | `short`-Leiste, 5 Spalten bei 10 Bahnen, kein Seiten-Scroll |
| Tablet | 820 × 1180 | `rail`, zwei Listenspalten, Sheets als Fenster |
