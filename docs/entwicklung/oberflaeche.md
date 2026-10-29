# Oberfläche

Die Oberfläche ist mobile-first und für eine Hand am Beckenrand gebaut. Dieses Kapitel beschreibt
die Screens, die gemeinsamen Bausteine und die Interaktionsmuster, die beim Erweitern einzuhalten
sind.

## App-Gerüst

`App.tsx` rendert:

```
Handy                              Tablet
┌──────────────────────────────┐    ┌──────┬───────────────────────────┐
│ Banner (optional)            │    │      │ Banner (optional)         │
├──────────────────────────────┤    │      ├───────────────────────────┤
│                              │    │ Nav  │                           │
│  aktiver Screen              │    │ Timer│  aktiver Screen           │
│                              │    │ Train│  (max. 5xl, zentriert)    │
├──────────────────────────────┤    │ …    │                           │
│ Timer Training Wettkampf …   │    │      ├───────────────────────────┤
└──────────────────────────────┘    └──────┴───────────────────────────┘
        Toast (schwebend, optional)
```

- Die Navigation hat sechs Einträge. Auf dem Handy liegt sie unten und verteilt sich auf sechs
  gleich breite Spalten; auf dem Tablet wird daraus eine schmale Leiste links.
- Jeder Screen füllt die Höhe (`h-full`), hat einen festen Kopf, einen scrollenden Inhalt und
  meistens eine feste Aktionsleiste am unteren Rand.
- Die Aktionsleiste respektiert `env(safe-area-inset-bottom)`, im Querformat zusätzlich
  `env(safe-area-inset-left/right)` über die Utility `safe-x`.
- Banner sind statusgerollt (`role="status"` bzw. `role="alert"`) und verschieben den Inhalt nach
  unten, statt ihn zu überdecken.
- Der Toast bleibt dauerhaft im DOM, damit Screenreader Änderungen ansagen; er sitzt oberhalb der
  unteren Aktionsleiste.

### Breakpoints

Zwei eigene Varianten in `src/index.css` beschreiben die Geräteklassen, nicht nur die Breite:

| Variante | Bedingung | Wirkung |
| --- | --- | --- |
| `rail` | `min-width: 768px` **und** `min-height: 560px` | seitliche Navigation, zentrierte Sheets, mehrspaltige Listen |
| `short` | `max-height: 520px` | flachere Navigation mit Symbol und Text nebeneinander (Handy quer) |

Die Höhenbedingung verhindert, dass ein Handy im Querformat (z. B. 844 × 390) die sechs
Navigationseinträge untereinander quetscht. Umgekehrt bleibt ein Tablet im Querformat in der
seitlichen Navigation. Das Manifest erlaubt deshalb beide Ausrichtungen (`orientation: "any"`).

### Globale Banner

| Banner | Auslöser | Verhalten |
| --- | --- | --- |
| **Neue Version verfügbar** | Service Worker meldet `onNeedRefresh` | „Neu laden“ ist während einer laufenden Messung deaktiviert; „Später“ blendet aus |
| **Kein Speicher verfügbar** | IndexedDB-Lesen/Schreiben scheitert | bleibt sichtbar, bis die App neu geladen wird |
| **Anderer Tab aktiv** | Tab-Koordinator meldet `gesperrt` | „Hier weiterarbeiten“ übernimmt |
| **Offline** | `navigator.onLine === false` | Hinweis, dass lokal weitergespeichert wird |

## Screens

| Screen | Datei | Aufgabe |
| --- | --- | --- |
| Onboarding | `ui/Onboarding.tsx` | drei Schritte beim Erststart |
| Timer | `ui/TimerScreen.tsx` | Lauf anlegen, starten, messen, mehrere Läufe |
| Serie | `ui/SerieAnsicht.tsx` | eine Zeile pro Bahn über mehrere Runden, nach Reihen gruppiert |
| Training | `ui/TrainingScreen.tsx` | Pläne, Aktive, Sätze, Fortschritt |
| Wettkampf | `ui/WettkampfScreen.tsx` | drei Ebenen: Wettkampf, Disziplin, Heat |
| Verlauf | `ui/HistoryScreen.tsx` | nach Satz gruppierte Messungen |
| Lauf-Detail | `ui/LaufDetail.tsx` | Splits, Korrekturen, PB, Export |
| Schwimmer | `ui/SchwimmerScreen.tsx` | Namen, Jahrgänge, Bestzeiten |
| Einstellungen | `ui/SettingsScreen.tsx` | Theme, Standardwerte, Daten, Installation |

### Timer

Drei Zustände:

1. **Kein aktiver Lauf** — Karte „Nächster Lauf“, Startknopf, kurze Bedienhinweise.
2. **Lauf aktiv** — Lauf-Leiste, Konfigurationskopf, Bahnenraster, Statuszeile, Aktionsleiste.
3. **Serie aktiv** — statt des Rasters die Serienansicht.

Das Bahnenraster ist ein CSS-Grid mit einer Spaltenzahl, die zur Bahnzahl **je Reihe** passt: Eine
Bahn nimmt die volle Breite, zwei Bahnen stehen nebeneinander, ab drei Bahnen wächst das Raster auf
dem Tablet bis auf fünf Spalten. Bei mehreren Reihen bekommt jede Reihe einen Abschnitt mit
Überschrift und Startzeit („Reihe 2 · +10 s“); die Spaltenzahl richtet sich nach der größten Reihe,
nicht nach der Gesamtzahl der Personen. Gleich große Reihen bleiben erhalten; reicht die Höhe nicht,
scrollt der Bereich, statt die Kacheln unter die Mindesthöhe zu drücken. Die Zeit in `LaneTile`
skaliert über eine Container-Abfrage (`cqw`) mit der Kachelbreite, nicht mit dem Viewport — so bleibt
sie bei zehn Bahnen auf dem Handy und bei einer Bahn auf dem Tablet gleichermaßen lesbar.

Die Kopfzeile des Laufs ist gleichzeitig ein Knopf zum Öffnen des Konfigurations-Sheets. Rechts
steht entweder **X** (alle im Ziel) oder der **Papierkorb** (verwerfen).

### Training

Der Screen hat zwei Zustände:

- **Liste** — alle Trainings, leerer Zustand, „Neues Training“.
- **Detail** — Kopf mit Zurück, Datum, Name, Löschen; Aktive-Karte; Fortschrittsbalken; Satzliste;
  „Satz hinzufügen“; feste Aktionsleiste mit nächstem Schritt.

Die Satzzeile ist ein großer Button mit Nummer, Titel, Status-Badge und Metazeile. Nur offene Sätze
öffnen die Bearbeitung; bereite und laufende führen in den Timer; fertige sind deaktiviert.

### Wettkampf

Drei Ebenen mit gemeinsamem `Kopf`:

1. **Wettkampfliste** — Karten mit Name, Datum, Becken, Disziplinen und Zeiten; unten Import und
   „Neuer Wettkampf“.
2. **Disziplinen** — Karten mit Titel, Heats und Fortschritt; unten „Meldeliste hinzufügen“ und
   „Disziplin anlegen“; Kopf mit Export und Löschen.
3. **Heat** — Heat-Leiste, Bahnenliste, Statuszeile, Start- oder Fortschrittsleiste.

Jede Ebene hat einen eigenen Zurück-Pfad: Heat → Disziplinen → Wettkämpfe.

### Verlauf und Detail

Der Verlauf ist eine Liste von Satzgruppen. Das Detail ist ein Vollbild-Screen (`fixed inset-0`),
kein Sheet, weil es viel Inhalt und eigene Aktionen hat.

### Einstellungen

Karten mit Zeilen:

- **Darstellung:** Segment-Control für System/Hell/Dunkel.
- **Nächster Lauf:** öffnet das Konfigurations-Sheet.
- **Daten:** CSV, Backup, Import, Speicherschutz, alles löschen.
- **Installation:** Status oder Anleitung.
- **Fußzeile:** Version und Datenschutzhinweis.

## Gemeinsame Bausteine

### `Dialog`

`src/ui/Dialog.tsx` ist die einzige modale Hülle. Sie übernimmt:

- Fokusfalle über alle fokussierbaren Elemente,
- initialen Fokus (explizit oder Panel),
- Scroll-Sperre mit Zähler für gestapelte Dialoge,
- **Escape** nur für den obersten Dialog,
- History-Eintrag für die System-Zurück-Geste,
- Fokus-Rückgabe zum Auslöser,
- `role="dialog"` oder `role="alertdialog"`, `aria-modal`, `aria-labelledby`.

Neue Dialoge werden **nicht** mit eigenem `position: fixed` gebaut. Immer `Dialog` oder `Sheet`
verwenden.

### `Sheet`

Bottom Sheet auf Basis von `Dialog`:

- Griff oben,
- Ziehen nach unten > 90 px schließt,
- maximal 88 % der Viewport-Höhe, intern scrollbar,
- `overscroll-contain`, damit die Seite dahinter nicht mitscrollt,
- Safe-Area unten.
- Auf dem Tablet (`rail`) wird daraus ein zentriertes Fenster mit `max-w-xl`; der Griff entfällt,
  die Ziehgeste bleibt als Maus- und Touch-Geste erhalten.

Das Sheet wird für Konfiguration, Aktive, Sätze, Namen, Zeiten und Import verwendet.

### `Bestaetigung`

`alertdialog` für destruktive Aktionen:

- initialer Fokus auf **Abbrechen**,
- Backdrop-Klick und Escape brechen ab,
- der bestätigende Knopf ist rot,
- `aria-describedby` verweist auf den Erklärungstext.

### `LaneTile`

Die Kachel eines einzelnen Laufs:

- großes Zeitfeld mit `clamp(1.5rem, 7.6vw, 3.25rem)`,
- Bahnnummer, Name, Status, letzter Split,
- Fortschrittslinie unten (ein Segment pro Länge),
- **Ziel**-Knopf nur bei offener Strecke,
- Long-Press-Overlay mit Fortschrittsbalken.

### `SerieAnsicht`

Eine scrollbare Liste von Zeilen:

- Bahnnummer, Name, `R2/5`,
- große Zeit, Statustext,
- „zuletzt …“, ggf. „R3 läuft schon“,
- Fortschrittssegmente pro Runde,
- **Ziel**-Knopf bei offener Strecke,
- Long-Press-Overlay.

### `WettkampfLane`

Wie `LaneTile`, aber:

- keine Längenfortschrittslinie,
- Stift für manuelle Zielzeit,
- Platz und Rückstand statt Länge,
- Status **bereit**, **läuft**, **im Ziel**.

### `Felder.tsx`

`Feld`, `Chip` und `TaktWahl` für Formulare in Sheets:

- `Feld` = Abschnitt mit Label und optionalem Hinweis,
- `Chip` = große Auswahlfläche mit aktivem Zustand,
- deaktivierte Chips sind sichtbar, aber nicht bedienbar,
- `TaktWahl` = Schnellauswahl plus freie Eingabe in Minuten und Sekunden; der Wert bleibt in
  Sekunden, die Felder öffnen die Zifferntastatur.

### Icons

`src/ui/icons.tsx` enthält ausschließlich Inline-SVGs mit `currentColor` und `aria-hidden`. Keine
Icon-Bibliothek, keine externen Assets.

## Interaktionsmuster

### Tap mit Zeitstempel beim Drücken

Die Messkomponenten erfassen `performance.now()` und `Date.now()` beim **PointerDown**, nicht beim
PointerUp. Dadurch zählt der Moment der Berührung, nicht der Moment des Loslassens.

Gleichzeitig wird ein **Long-Press-Timer** gestartet. Wird er nach 450 ms nicht abgebrochen, gilt
die Geste als Undo und der anschließende Klick wird ignoriert.

### Klick-Fallback für Screenreader

Ein reiner `click` ohne vorherige Pointer-Eingabe kommt von VoiceOver/TalkBack. Die Komponenten
verarbeiten ihn als Tap, damit die App auch ohne echte Pointer-Events bedienbar ist.

Die Prüfung erfolgt über `klickRef`: Ein Pointer- oder Tastatur-Klick setzt den Ref und wird nicht
doppelt verarbeitet.

### Tastatur

- **Enter** und **Leertaste** auf einer Bahn lösen den Tap aus.
- **Escape** schließt den obersten Dialog.
- **Tab** bleibt im Dialog.
- Eingebettete Knöpfe (**Ziel**, **Stift**) stoppen die Propagation, damit sie nicht zusätzlich
  einen Anschlag auslösen.

### Touch-Verhalten

- `touch-action: pan-y` erlaubt vertikales Scrollen, verhindert aber Doppeltipp-Zoom.
- `WebkitTouchCallout` und `WebkitUserSelect` sind aus, damit langes Drücken kein Kontextmenü öffnet.
- `setPointerCapture` hält die Geste auf der Kachel, auch wenn der Finger leicht wandert.
- `onContextMenu` wird verhindert.

### Haptik

`haptic(8)` bei Tap, `haptic([16, 40, 16])` bei Undo. Die Funktion nutzt `navigator.vibrate`, wo
vorhanden; auf iPhone-Safari bleibt sie wirkungslos. Haptik ist nie die einzige Rückmeldung.

### Reduzierte Bewegung

`useReducedMotion` liest `prefers-reduced-motion`. Der Long-Press-Balken entfällt dann; der Text
„Halten: …“ bleibt. CSS setzt zusätzlich alle Animationen und Übergänge praktisch auf 0.

## Gestaltung

### Farben

Die Tokens stehen in `src/index.css`:

| Token | Hell | Dunkel | Bedeutung |
| --- | --- | --- | --- |
| `--bg` | `#eef2f7` | `#070c15` | Seitenhintergrund |
| `--surface` | `#ffffff` | `#111a2b` | Karten, Dialoge |
| `--surface-2` | `#e4eaf2` | `#1a2538` | erhöhte Fläche, Chips |
| `--fg` | `#0a1524` | `#f2f6fc` | Text und Zahlen |
| `--muted` | `#56657e` | `#94a6c2` | Sekundärtext |
| `--line` | `#cdd7e4` | `#26344c` | Rahmen und Trennlinien |
| `--accent` | `#0369a1` | `#38bdf8` | laufend, primäre Aktion |
| `--ok` | `#047857` | `#34d399` | im Ziel, Bestzeit |
| `--warn` | `#a16207` | `#fbbf24` | geplant, überfällig, Hinweis |
| `--danger` | `#be123c` | `#fb7185` | destruktive Aktion, Fehler |

Die Akzentfarbe ist nicht dekorativ: Sie markiert laufende Bahnen und primäre Aktionen. Grün ist
„abgeschlossen“, Amber ist „wartet“ oder „überfällig“. Farbe ist nie das einzige Signal; es gibt
immer Text und Status.

### Typografie

- System-Sans für Labels und Fließtext.
- `font-variant-numeric: tabular-nums` über die Utility `tabular` für alle Zeiten.
- Große Zahlen stehen allein in ihrer Zeile und dominieren die Kachel.
- Überschriften in Versalien sind klein, gesperrt und sekundär (`text-[11px] font-bold uppercase
  tracking-wider`) — sie strukturieren, ohne mit den Zeiten zu konkurrieren.
- Zeiten werden mit `formatTime` gerendert, nie mit `toFixed` oder lokalen Zahlenformaten.

### Form

- 2 px Statusrahmen an Messkacheln.
- Radien 16–24 px, Sheets oben 24 px.
- Keine Glass-Effekte, keine Verläufe, keine dekorativen Bilder.
- Ein weicher Schatten liegt unter primären Aktionen, Sheets, Dialogen und dem Toast.
- Primäre Aktionen sind 56–80 px hoch und am unteren Rand verankert.
- Touchziele sind mindestens 36–44 px; die wichtigsten 56–80 px.

## Zustandsgrenzen

| Zustand | Ort |
| --- | --- |
| Fachliche Daten | `AppProvider` |
| Einstellungen, Theme | `localStorage` + `AppProvider` |
| aktiver Tab | lokaler State in `App.tsx` |
| offene Sheets/Dialoge | lokaler Screen-State |
| Auswahl eines Trainings | `localStorage` (`beckenrand.training`) |
| Lauf-Auswahl | `localStorage` + `AppProvider` |
| Timer-Anzeige | `useNow` + abgeleitete Werte |

Ein Screen darf keinen fachlichen Zustand „neben“ dem Provider halten. Was gespeichert werden soll,
gehört in den Provider und die Persistenz.

## Leere Zustände und Fehler

Jeder Screen hat einen erklärenden Leerzustand:

- Timer: „Nächster Lauf“ mit Bedienhinweisen.
- Training: „Noch kein Training vorbereitet“.
- Wettkampf: „Noch kein Wettkampf“.
- Verlauf: „Noch keine Messungen.“
- Schwimmer: „Noch keine Schwimmer.“

Fehler werden nicht als Alert-Box mitten im Inhalt versteckt:

- Speicherfehler → globales Banner.
- Importfehler → Fehlerblock im Sheet mit Zeilennummer.
- Korrekturfehler → `role="alert"` direkt am Feld.
- Renderfehler → `ErrorBoundary`.

## Regeln für neue Oberfläche

1. **Ein Screen, eine Hauptaktion.** Die primäre Aktion gehört in die untere Leiste.
2. **Keine schwebenden Speichern-Knöpfe über der Navigation.**
3. **Dialoge immer über `Dialog`/`Sheet`.** Kein eigenes Fokus- oder Scroll-Handling.
4. **Touchziele nicht verkleinern**, um mehr Inhalt zu zeigen. Lieber scrollen.
5. **Status nie nur über Farbe.** Immer Text, Badge oder ARIA-Label ergänzen.
6. **Deutsche Labels**, konsistent mit dem Glossar.
7. **Zahlen tabellarisch** und mit `formatTime`.
8. **Safe-Area** an jedem unteren Rand.
9. **Reduzierte Bewegung** respektieren.
10. **Kein Autofokus außerhalb von Dialogs**, außer das Feld ist der einzige Zweck des Sheets.

## Weiterlesen

- [Architektur](architektur.md)
- [Testen](testen.md) — wie die Oberfläche getestet wird
- [Handbuch](../handbuch/README.md) — was Anwender:innen sehen
