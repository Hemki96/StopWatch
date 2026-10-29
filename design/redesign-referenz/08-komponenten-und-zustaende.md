# Komponenten und Zustände

Alle Komponenten liegen in `src/ui/`. Dieses Kapitel beschreibt ihre Anatomie und die Zustände, die
jede Fläche haben muss. Neue Komponenten werden aus diesen Bausteinen zusammengesetzt, nicht neu
erfunden.

## Zustandsvokabular

| Zustand | Auslöser | Darstellung | Pflicht |
| --- | --- | --- | --- |
| **default** | nichts | Grundfläche | ja |
| **hover** | Mauszeiger | +1 Flächenstufe | nur Pointer, nie Informationsträger |
| **focus-visible** | Tastatur | 2-px-Akzentring, Offset 2 px | ja |
| **pressed** | Finger/Maus unten | Fläche dunkler, **kein** Verkleinern | ja |
| **selected** | `aria-pressed`/`aria-current` | Akzentfüllung oder Akzentfläche | ja |
| **disabled** | `disabled` | 40 % Deckkraft, nicht fokussierbar | ja |
| **invalid** | Prüfung | 2-px-Gefahrrahmen + Text | bei Eingaben |
| **dragging** | Sheet-Zug | folgt dem Finger, kein Übergang | nur Sheet |

**Loading** gibt es nicht: Alle Aktionen sind lokal und sofort. Ein Spinner würde nur eine
Latenz vortäuschen, die es nicht gibt.

## Knöpfe

### Matrix

| Typ | Default | Pressed | Selected | Disabled |
| --- | --- | --- | --- | --- |
| Primär | `--accent` / `--on-accent` | Akzent 88 % + Schwarz, Text bleibt | — | 40 %, `--muted`-Text |
| Sekundär | `--surface-2` / `--fg`, 1 px `--line-strong` | `--surface-2` 88 % | — | 40 % |
| Ruhig | transparent / `--accent` | `--accent` 10 % | — | 40 % |
| Destruktiv | `--danger-fill` / `--on-danger` | Rot 88 % | — | 40 % |
| Icon | transparent / `--muted` | `--surface-2` | `--accent` | 40 % |

- Pressed wird über **Fläche** gelöst, nicht über `transform: scale()`. Der Bestand nutzt
  `active:scale-[0.99]`; das entfällt (Brief: dimmen statt schrumpfen).
- Übergang: 75 ms, nur `background-color`, `border-color`, `opacity`.
- Fokusring liegt außen; bei `overflow: hidden` als Inset-Ring.
- Ein Knopf hat genau eine Aktion. Kein Doppelklick, kein Long-Press auf Knöpfen.

### Anatomie

```
[ Icon 24 ]  8px  Label 14/600          16px Polster
└──────────────── mindestens 44 px hoch ────────────────┘
```

- Icon und Label sind vertikal zentriert.
- Primärknöpfe haben kein Icon, außer „Jetzt starten“ (Häkchen) und „Neuer Lauf“ (Plus).
- Icon-only braucht `aria-label`; das Icon ist `aria-hidden`.

## Chip

**Datei:** `src/ui/Felder.tsx`

```
┌──────────────┐  44 px hoch, 12 px Radius
│  Freistil    │  14 px, 600
└──────────────┘
```

| Zustand | Fläche | Rahmen | Text |
| --- | --- | --- | --- |
| unselected | `--surface-2` | 1 px `--line` | `--fg` |
| selected | `--accent` | 1 px `--accent` | `--on-accent` |
| disabled | `--surface-2` 40 % | `--line` | `--muted` |
| focus | — | 2 px `--accent` außen | — |

- Immer `aria-pressed`. Ein Chip ist eine Umschaltung, kein Link.
- Deaktivierte Chips bleiben sichtbar und werden durch einen Hinweis erklärt („Nach dem ersten
  Anschlag festgelegt.“). Nie einfach verschwinden.
- Mehrere Chips: `flex-wrap`, 8 px Abstand, keine horizontale Scrollleiste.

## Segment-Control

Für `Verlauf`/`Analyse` und `System`/`Hell`/`Dunkel`.

- Container: `--surface-2`, 12 px Radius, 2 px Innenabstand, Höhe 40 px (Handy) / 44 px.
- Segment: 36/40 px hoch, 8 px Radius, 13 px, 600.
- Aktiv: `--accent` + `--on-accent`; inaktiv: transparent + `--muted`.
- `role="group"` mit `aria-label`, Segmente mit `aria-pressed` (oder `radiogroup` mit
  `aria-checked` bei Theme).
- Kein gleitender Indikator; der Wechsel ist sofort.

## Zahlenstepper

**Dateien:** `KonfigurationSheet`, `Onboarding`, `AktiveSheet`

```
[ − ]   4   [ + ]       je 48 × 48 px, Wert 20 px tabellarisch
```

- Minus links, Plus rechts, Wert in der Mitte, mindestens 48 px breit.
- Disabled am Rand (1 oder 10), sichtbar 40 %.
- Ein Tap ändert um 1, kein Long-Press-Autorepeat (versehentliche Sprünge bei Nässe).
- `aria-label` am Wert: „Bahnen je Reihe: 4“; die Knöpfe heißen „weniger“/„mehr“.
- Änderung wird sofort übernommen; kein Speichern.

## Eingabefeld

- 48 px hoch, 12 px Radius, `--surface-2`, 1 px `--line-strong`, 16 px Text.
- Fokus: 2 px `--accent`, Offset 2 px; der Rahmen bleibt stehen, um Layoutsprung zu vermeiden.
- Fehler: 2 px `--danger`, Text darunter 12 px mit `role="alert"`.
- `inputMode` passend: `decimal` für Zeiten, `numeric` für Zahlen, `text` für Namen.
- `autocomplete="off"` für Namen und Zeiten.
- Kein Feld ohne Label; Placeholder nur als Beispiel, nie als Beschriftung.

## Bahn-Kachel (`LaneTile`)

**Datei:** `src/ui/LaneTile.tsx` · **Einsatz:** Timer, einzelner Lauf

### Anatomie

```
┌──────────────────────────────────────────────┐  2-px-Statusrahmen, 16/24 px Radius
│ [3]                               Anna       │  20-px-Nummer, Name 11 px
│                                              │
│              01:23,45                        │  digit-lane 22–52 px, weiß
│                                              │
│ Länge 2/4                         00:41,10   │  11 px, tabellarisch
│ 1/3 Zwischenzeiten                           │  10 px
│ ▬▬▬▬▬▬▬░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  6 px Fortschritt, unten
└──────────────────────────────────────────────┘  min. 112 px (Kapitel 4)
```

- **Zeile 1:** Bahnnummer in `--surface-2` (20 px hoch, 11 px fett) links; Schwimmername rechts,
  eine Zeile, `truncate`, vollständiger Name im `aria-label`.
- **Mitte:** die Zeit. Bei fester Strecke die laufende Zeit, bei geplanter Bahn der Countdown, im
  Ziel die Zielzeit. Immer `tabular`, `nowrap`, zentriert.
- **Zeile 3:** links der Längenstand (`Länge 3/4`, `Bereit`, `Ziel`, `Unterbrochen`), rechts der
  letzte Split. Darunter optional `2/3 Zwischenzeiten` (10 px).
- **Unten:** Fortschritt. Siehe unten.
- **Ziel-Knopf:** nur bei offener Strecke und laufender Bahn, 44 × 44 px, `--ok`, schwarzer Text
  „Ziel“. Er stoppt die Propagation, damit der Tap nicht zusätzlich als Anschlag zählt.

### Zustände

| Zustand | Rahmen | Fläche | Zeit | Statuszeile | Fortschritt | Tap |
| --- | --- | --- | --- | --- | --- | --- |
| **bereit** | `--line` 2 px | `--surface` | `00:00,00` weiß | „Bereit“ | leer | startet die Bahn |
| **geplant** | `--warn` 60 % | `--warn` 10 % | Countdown weiß | „Start in“ / „wartet“ | leer | gesperrt |
| **läuft** | `--accent` 70 % | `--accent` 10 % | laufend weiß | „Länge 3/4“ | gefüllt | Anschlag |
| **im Ziel** | `--ok` 50 % | `--ok` 10 % | Zielzeit weiß | „Ziel“ | voll | gesperrt, Undo möglich |
| **unterbrochen** | `--warn` 60 % gestrichelt | `--warn` 10 % | eingefroren weiß | „Unterbrochen“ | eingefroren | gesperrt, Undo möglich |
| **gedrückt** | unverändert | Fläche 80 % / +5 % Helligkeit | unverändert | — | — | Geste läuft |
| **Langdruck** | unverändert | Overlay `--warn` | unverändert | „Halten: Anschlag zurücknehmen“ | 450-ms-Balken | Undo beim Auslösen |

- **Farbe nie allein:** Jeder Zustand hat ein Statuswort. Die Zeit bleibt weiß, auch im Ziel
  (Entscheidung **E2**). Wer die Statusfarbe nicht sieht, liest „Ziel“.
- **Pressed** dimmt die Fläche, ohne die Kachel zu verkleinern. Dauer 75 ms.
- **Langdruck** nach 450 ms: amber Overlay mittig, Text 10 px fett, darunter ein 3-px-Balken, der
  in 450 ms von links nach rechts läuft. Bei `prefers-reduced-motion` entfällt der Balken, der
  Text bleibt.
- **Unterbrochen** entsteht nach einem Reload, wenn Anschläge ohne Startzeit übrig sind. Ein Tap
  startet nicht neu; langes Drücken nimmt Anschläge schrittweise zurück.

### Fortschrittslinie

- Position: `absolute`, untere Kante, volle Breite, 6 px hoch, 4 px seitlicher Innenabstand.
- **Bis 10 Längen:** ein Segment pro Länge, 1 px Abstand, gefüllt in der Statusfarbe (Akzent,
  Grün, Amber), leer als 2-px-Linie in `--line`.
- **Über 10 Längen:** ein durchgehender Balken; Füllstand = `Anschläge / Längen`, Mindestbreite
  2 px, damit ein einzelner Anschlag sichtbar bleibt.
- **Offene Strecke:** keine Linie.
- Die Linie ist `aria-hidden`; der Längenstand steht als Text und im `aria-label`.

### Semantik

```html
<div role="button" tabindex="0"
     aria-label="Reihe 1, Bahn 3, Anna, läuft"
     aria-describedby="zwischenzeiten-…"
     aria-keyshortcuts="Backspace Delete">
```

- `Enter` und `Leertaste` lösen den Tap aus.
- `Backspace`/`Delete` lösen Undo aus, wenn möglich.
- Ein reiner `click` ohne Pointer (VoiceOver/TalkBack) zählt als Tap.
- Eingebettete Knöpfe stoppen die Propagation.
- `touch-action: pan-y`, kein Kontextmenü, keine Textauswahl.

## Serienzeile (`SerieAnsicht`)

**Datei:** `src/ui/SerieAnsicht.tsx`

```
┌──────────────────────────────────────────────┐  2-px-Statusrahmen, 16 px Radius
│ 1  Anna                            R2/5     │
│    01:12,45                                  │  40 px, weiß
│    läuft · zuletzt 01:14,20 · R3 läuft schon │  11 px
│    ▬▬▬▬▬▬░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  4 px pro Runde
└──────────────────────────────────────────────┘  min. 88 px
```

- Ein Tap schließt die **älteste offene Runde**, nicht die sichtbare. Das steht im `aria-label`:
  „Runde 2 schließen“.
- Zustände: `bereit`, `wartet auf Start`, `läuft`, `überfällig`, `im Ziel`.
- Überfällig: Amber, Text „überfällig“, keine Animation.
- Bei > 12 Runden wird aus den Segmenten ein durchgehender Balken.
- Long-Press und reduzierte Bewegung wie `LaneTile`.

## Wettkampf-Kachel (`WettkampfLane`)

**Datei:** `src/ui/WettkampfLane.tsx`

- Wie `LaneTile`, aber:
  - **keine** Längenfortschrittslinie,
  - Status `bereit`, `läuft`, `im Ziel`, `DNS`, `DNF`,
  - Platz und Rückstand statt Länge/Split,
  - Stift (44 px Ziel) für eine manuelle Zielzeit,
  - Zeit „DNS“/„DNF“ in `--warn-text`, nicht als Zahl.
- Ein Tap ist die Zielzeit. Kein Undo per Long-Press; Korrektur über den Stift.

## Ergebniszeile

**Datei:** `src/ui/LaufErgebnis.tsx`

```
┌──────────────────────────────────────────────┐  1-px-Rahmen, 16 px Radius, 12 px Polster
│ [1]  Anna            01:12,45          Zurück │
│      Bestzeit                                │
└──────────────────────────────────────────────┘
```

- Bahnnummer 36 × 36 px, `--surface-2`, 14 px fett.
- Name 14 px, 600; darunter Badge/Delta 11 px.
- Zeit 24 px tabellarisch, rechts; immer weiß.
- „Zurück“ ist ein ruhiger Textknopf mit 44 px Trefferhöhe; er nimmt das Ziel zurück.
- Die ganze Zeile ist **kein** Knopf; nur „Zurück“ ist interaktiv.

## Listenzeile und Karte

### Listenzeile

- Mindestens 48 px hoch, 16 px Polster, 1-px-Trenner zwischen Zeilen.
- Ganze Zeile ist ein Knopf, wenn sie eine Ebene öffnet; sonst nur der benannte Teil.
- Gepresst: `--surface-2`. Ausgewählt: `--accent` 10 % + 2-px-Akzentkante links.
- Kein Chevron ohne Aktion.

### Karte

- 1 px `--line`, 16 px Radius, 16/20 px Polster, `--surface`, kein Schatten.
- Eine Karte hat eine Hauptaktion. Ist die ganze Karte antippbar, ist der Press-Zustand
  `--surface-2`.
- Karten werden nicht ineinander verschachtelt; Abschnitte innerhalb einer Karte nutzen 1-px-
  Trenner.

## Badges

| Badge | Fläche | Text | Regel |
| --- | --- | --- | --- |
| Bestzeit / PB | `--ok` 15 % | `--ok`, 10 px, 700 | immer mit Wort |
| unvollständig | `--warn` 15 % | `--warn-text` | immer mit Wort |
| manuell / korrigiert | `--warn` 15 % | `--warn-text` | zusätzlich zur Zeit |
| Ziel | `--ok` 15 % | `--ok` | in Splitzeile |
| Status (läuft/bereit) | `--surface-2` | `--muted` | 10 px Versalien |

- Höhe 20 px, Radius 6 px, Polster 4/6 px.
- Kein Badge ohne Text, kein Badge als einziger Status, keine Icons in Badges.

## Fortschritt

- **Liste/Training:** 4 px hoch, `--line`-Spur, `--accent`-Füllung, voll gerundet.
- **Kachel:** 6 px, Segmente oder durchgehend (siehe oben).
- **Serie:** 4 px, ein Segment pro Runde.
- Immer mit Text daneben (`2 von 5`, `Länge 3/4`). Der Balken allein ist keine Information.
- Keine Animation beim bloßen Rendern; nur bei einer echten Zustandsänderung (300 ms).

## Leerzustand

```
        (kein Bild, kein Icon)
        Noch keine Messungen.          14 px, 600
        Starte im Timer deinen ersten  12 px, --muted
        Lauf.
        [   Zum Timer   ]              48 px, sekundär
```

- Max. 320 px breit, zentriert, 40 px Abstand oben.
- Keine Illustration, kein Emoji, keine Grafik.
- Ein Leerzustand hat höchstens **eine** Aktion.

## Sheet

**Datei:** `src/ui/Sheet.tsx`

| Zustand | Darstellung |
| --- | --- |
| geschlossen | nichts im DOM |
| öffnend | von unten, 180 ms, Backdrop 0 → 60 % |
| offen | max. 88 dvh, Kopf klebt, Inhalt scrollt |
| ziehend | folgt dem Finger, kein Übergang |
| zurückfedernd | 150 ms `ease-out`, zurück auf 0 |
| schließend | 150 ms nach unten, dann unmount |
| `rail` | zentriert, 576 px, ohne Griff, 24 px Radius |

- Griff 40 × 4 px, 6 px vom oberen Rand, `--line`.
- Kopf 56 px, Titel 16 px 600, Schließen 44 px Ziel.
- Ziehen nur am Kopf; `touch-action: none` dort.
- Schließen per X, Backdrop, Escape, Zug > 90 px. Ein `pointercancel` schließt nie.
- `overscroll-contain`; die Seite dahinter scrollt nicht.

## Dialog

**Datei:** `src/ui/Dialog.tsx`, `Bestaetigung.tsx`

- Backdrop 60 % Schwarz, kein Blur.
- Panel 384 px, 16 px Radius, 20 px Polster, `shadow-overlay`.
- Öffnen 120 ms (Opacity + Scale 0.98 → 1), Schließen 100 ms.
- Fokusfalle, initialer Fokus, Fokus-Rückgabe, Scroll-Sperre, History-Eintrag.
- `role="alertdialog"` bei Bestätigungen, sonst `dialog`; `aria-modal`, `aria-labelledby`,
  `aria-describedby`.
- Nur der oberste Dialog reagiert auf Escape.

## Toast und Banner

- Toast: `--fg`-Fläche, `--bg`-Text, Pill, 36 px, 14 px, 3 s, `role="status"`.
- Banner: `--surface-2`, 1-px-Unterlinie, 32–40 px, 11–12 px, Aktion 28–32 px sichtbar /
  44 px Ziel.
- Kein Stacking von Toasts; ein neuer ersetzt den alten.
- Banner verschieben den Inhalt, überdecken ihn nicht.

## Icons

**Datei:** `src/ui/icons.tsx`

- Inline-SVG, `viewBox="0 0 24 24"`, `stroke="currentColor"`, `stroke-width="2"`,
  `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"`.
- Größen: 16 px (Badge/Meta), 20 px (Knopf), 24 px (Navigation/Kachel-Aktion).
- Immer `aria-hidden="true"`; die Beschriftung kommt vom Knopf.
- Keine Icon-Bibliothek, keine externen Assets, keine Emojis.
- Ein Icon allein ist nie die einzige Information; es steht neben Text oder hat `aria-label`.

## Komponenten-Inventar

| Baustein | Datei | Zustände |
| --- | --- | --- |
| `Dialog` | `Dialog.tsx` | offen, gestapelt, schließend |
| `Sheet` | `Sheet.tsx` | offen, ziehend, zurückfedernd, `rail` |
| `Bestaetigung` | `Bestaetigung.tsx` | offen, gefahr/nicht gefahr |
| `LaneTile` | `LaneTile.tsx` | bereit, geplant, läuft, Ziel, unterbrochen, gedrückt |
| `SerieAnsicht` | `SerieAnsicht.tsx` | bereit, wartet, läuft, überfällig, Ziel |
| `WettkampfLane` | `WettkampfLane.tsx` | bereit, läuft, Ziel, DNS, DNF |
| `LaufErgebnis` | `LaufErgebnis.tsx` | PB, Delta, kein PB, offen |
| `Feld`/`Chip`/`TaktWahl` | `Felder.tsx` | default, selected, disabled, error |
| `Startuebersicht` | `Startuebersicht.tsx` | Lauf, Training, Warnung |
| `Zeile`/`Karte` | `SettingsScreen.tsx` u. a. | default, pressed, disabled |
| `Badge` | inline | PB, unvollständig, manuell, Ziel |
| `EmptyState` | inline | eine Aktion |
