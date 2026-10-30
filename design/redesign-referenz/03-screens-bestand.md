# Bestands-Screens außerhalb des Briefs

Die App ist größer als die zehn Screens aus dem Brief. Diese Kapitel dokumentiert die übrigen
Flächen, damit das Redesign sie nicht vergisst. Es gelten dieselben Regeln aus Kapitel 1–10.

---

## Globales Gerüst

### Laden

**Datei:** `src/App.tsx`

- Fläche füllt `100dvh`, zentrierter Text „Wird geladen …“ (14 px, `--muted`).
- Nach 5 s erscheint ein Hinweis: „Das dauert länger als erwartet. Ist Beckenrand noch in einem
  anderen Tab geöffnet?“ mit `Neu laden` (44 px, Akzent).
- Kein Spinner mit Endlosanimation. Ein ruhiger Text ist bei Sonne lesbarer.

### Banner

| Banner | Rolle | Position | Aktion |
| --- | --- | --- | --- |
| Neue Version verfügbar | `status` | unter dem oberen Rand, schiebt Inhalt | `Neu laden` (gesperrt während eines Laufs), `Später` |
| Kein Speicher verfügbar | `alert` | oben, bleibt | `Neu laden` |
| Anderer Tab aktiv | `status` | oben, amber | `Hier weiterarbeiten` |
| Offline | `status` | oben, neutral | keine |

- Höhe 32–40 px, Text 11–12 px, eine Zeile wenn möglich.
- Die Aktionsknöpfe im Banner sind 28–32 px sichtbar, erhalten aber 44 px Trefferfläche.
- Banner sind nie modal und blockieren keine Messung.

### Toast

- `role="status"`, `aria-live="polite"`, `aria-atomic="true"`, dauerhaft im DOM.
- Position: 96 px über dem unteren Rand (über der Aktionsleiste), auf `rail` 128 px.
- Pill, `--fg`-Fläche, `--bg`-Text, max. 320 px, 14 px.
- Dauer 3 s, keine Aktion, kein Stapeln. Ein neuer Toast ersetzt den alten.

### Fehlergrenze

- `ErrorBoundary` zeigt eine ruhige Fläche mit „Etwas ist schiefgelaufen“ und `Neu laden`.
- Keine technische Fehlermeldung im UI.

### Tab-Sperre

- Der Screen bleibt lesbar, alle schreibenden Aktionen sind deaktiviert (40 % Deckkraft).
- Der Hinweis steht als Banner oben, nicht als Dialog. „Hier weiterarbeiten“ übernimmt die
  Messung.

---

## Training

**Datei:** `src/ui/TrainingScreen.tsx` · **Ebenen:** Liste, Detail, Sheets

### Liste

```
K  Training                         18 px, 600
   2 Trainings vorbereitet          12 px
I  ┌──────────────────────────────────────────────┐
   │ Dienstag, 28.10. · Training              ›   │
   │ 8 Aktive · 2/5 erledigt                      │
   │ ▬▬▬▬▬▬░░░░░░░░░░░░░░                        │
   └──────────────────────────────────────────────┘
A  [           Neues Training            ]        56 px
```

- Karte: Datum + Bezeichnung (14 px, 600), Meta „n Aktive · x/y erledigt“, Fortschrittsbalken
  (4 px, Akzent).
- Leerzustand: „Noch kein Training vorbereitet“ mit Erklärung und `Neues Training`.
- Die ganze Karte öffnet das Detail.

### Detail

```
K  [‹ Trainings]   Di., 28.10. · Training   [Papierkorb]
I  AKTIVE
   ┌ 8 Aktive · [Bearbeiten] ┐
   FORTSCHRITT
   ▬▬▬▬▬▬░░░░  2 von 5 Sätzen
   SÄTZE
   [1] Einschwimmen    fertig    ›
   [2] Hauptserie      läuft     ›
   [3] Ausschwimmen    offen     ›
A  [        Satz starten / Weiter        ]     56 px
```

- Kopf: Zurück, Datum, Name (18 px), Löschen.
- Aktive-Karte: Anzahl, Namen als Chips oder Liste, `Bearbeiten` öffnet `AktiveSheet`.
- Satzzeile: Nummer in Quadrat, Titel, Status-Badge (`offen`, `bereit`, `läuft`, `fertig`),
  Metazeile mit Strecke/Zwischenzeiten/Takt. Nur offene Sätze öffnen die Bearbeitung; bereite und
  laufende führen in den Timer; fertige sind deaktiviert.
- Fortschrittsbalken 4 px, `--accent`, mit Text `x von y Sätzen`.
- Aktionsleiste zeigt den nächsten sinnvollen Schritt; ohne offenen Satz `Satz hinzufügen`.

### Zustände

| Zustand | Darstellung |
| --- | --- |
| Kein Training | Leerzustand + `Neues Training` |
| Detail, nichts gestartet | `Satz starten`, Sätze sortiert |
| Satz läuft | Status `läuft`, Aktionsleiste `Zum Timer` |
| Alle fertig | Fortschritt voll, `Training abschließen` |
| Gesperrter Tab | Schreibende Aktionen deaktiviert |

---

## Serie

**Datei:** `src/ui/SerieAnsicht.tsx` · **Zustand:** Satz mit Plan, mindestens eine Runde

```
I  ┌──────────────────────────────────────────────┐
   │ 1  Anna          R2/5        01:12,45        │
   │    läuft · zuletzt 01:14,20                  │
   │    ▬▬▬▬▬░░░░░░░░  4 Runden                   │
   └──────────────────────────────────────────────┘
   … eine Zeile pro Schwimmer
```

- Zeile statt Kachel: Bahnnummer, Name, `R2/5`, große Zeit, Statustext, „zuletzt …“, ggf.
  „R3 läuft schon“, Fortschrittssegmente pro Runde, `Ziel` bei offener Strecke.
- Ein Tap schließt die **älteste offene Runde**, nicht die sichtbare.
- Überfällige Runden sind amber markiert und tragen das Wort „überfällig“.
- Bei vielen Wiederholungen (> 12) wird aus den Segmenten ein durchgehender Balken.
- Langdruck-Overlay und reduzierte Bewegung wie `LaneTile`.

---

## Analyse

**Datei:** `src/ui/AnalyseScreen.tsx` · **Zustand:** Satzliste → Matrix → Längenzeiten

```
K  [‹ Verlauf]  Analyse              18 px
I  SÄTZE MIT ZWISCHENZEITEN
   [ 5×100 m · 27.10.    › ]
   ── Matrix ─────────────────────────────
   Person        R1      R2      R3
   Anna       01:12,45  +0,80   −0,40
   Ben        01:14,20  +1,20   —
A  keine; Zurück im Kopf
```

- Einstieg über den Verlauf; die Analyse ist kein eigener Tab.
- Matrix: Person × Runde, Zeiten tabellarisch, Abweichung als kleine Zeile darunter
  (grün = schneller, rot = langsamer, immer mit Vorzeichen und `sr-only` „zur Vorrunde“).
- Drill-down: eine Person, alle Längen über alle Runden. Zurück im Kopf.
- Keine Diagramme, keine Sparklines, keine Farbflächen. Zahlen und Haarlinien.
- Leerzustand: „Noch keine Zwischenzeiten“ mit Verweis auf einen Satz mit Splits.

---

## Startübersicht

**Datei:** `src/ui/Startuebersicht.tsx` · **Zustand:** Sheet vor jedem Start

```
┌──────────────────────────────────────────────┐
│ Start prüfen                          [×]    │
│ Prüfe Becken, Strecke, Bahnen und Schwimmer. │
│ Erst mit „Jetzt starten“ beginnt die Uhr.    │
│ ┌──────────────────────────────────────────┐ │
│ │ Beckenlänge            25 m              │ │
│ │ Strecke                4×100 m           │ │
│ │ Zwischenzeiten        Automatisch      │ │
│ │ Bahnen                 4 Personen        │ │
│ │ Startversatz           aus               │ │
│ │ Takt                   2:00              │ │
│ ├ SCHWIMMER ───────────────────────────────┤ │
│ │ Bahn 1  Anna                             │ │
│ │ Bahn 2  frei                             │ │
│ └──────────────────────────────────────────┘ │
│ [✓ Jetzt starten]                  64 px     │
│ [Einstellungen ändern]             48 px     │
└──────────────────────────────────────────────┘
```

- Die Übersicht ist die **einzige** Stelle, die einen Startzeitstempel erzeugt.
- Die Liste ist ruhig: Label links (12 px, `--muted`), Wert rechts (14 px, 600), 1-px-Trenner.
- Eine leere Bahn heißt ausdrücklich „frei“ (kursiv, `--muted`).
- Bei einer Serie steht die Runde im Titel; bei Training die Reihenfolge der Sätze.
- „Ändern“ schließt die Übersicht und öffnet das passende Formular. Schließen ändert nichts.
- Der Startknopf ist 64 px, damit er nicht mit „Abbrechen“ verwechselt wird.

---

## Weitere Sheets

| Sheet | Datei | Inhalt | Primäraktion |
| --- | --- | --- | --- |
| Aktive | `AktiveSheet.tsx` | Bahnen/Reihen, Namen je Platz, `−`/`+` | `Übernehmen` (56 px) |
| Trainingssatz | `TrainingsSatzSheet.tsx` | Titel, Strecke, Becken, Zwischenzeiten, Bahnen, Takt, Versatz | `Satz speichern` |
| Schwimmer | `SchwimmerScreen.tsx` | Name, Jahrgang, Notiz, Löschen | `Speichern` |

- Alle Sheets nutzen `Sheet`, alle Bestätigungen `Bestaetigung`.
- Formularfelder sind 48 px hoch, Labels 11 px Versalien, Fehler 12 px `--danger` mit
  `role="alert"` direkt am Feld.
- Ein Sheet schließt nie ungefragt bei Fehlern; der eingegebene Stand bleibt.

---

## Leer- und Fehlerzustände (Gesamtübersicht)

| Ort | Zustand | Text | Aktion |
| --- | --- | --- | --- |
| App | Laden | „Wird geladen …“ | nach 5 s `Neu laden` |
| App | Speicherfehler | „Kein Speicher verfügbar“ | `Neu laden` |
| App | fremder Tab | „Beckenrand ist bereits in einem anderen Tab offen …“ | `Hier weiterarbeiten` |
| Timer | kein Lauf | „Nächster Lauf“ + Gestenhinweise | `Start` |
| Timer | Tab gesperrt | „Messung läuft in einem anderen Tab“ | kein Start |
| Timer | unvollständig nach Reload | „Unterbrochene Bahn: lange drücken …“ | Long-Press |
| Verlauf | leer | „Noch keine Messungen.“ | Verweis Timer |
| Training | leer | „Noch kein Training vorbereitet“ | `Neues Training` |
| Schwimmer | leer | „Noch keine Schwimmer.“ | `Schwimmer anlegen` |
| Analyse | keine Splits | „Noch keine Zwischenzeiten.“ | Verweis |
| Detail | Lauf gelöscht | „Zurück“ | schließt |
| Import | Fehler | Fehlerblock mit Zeilennummer | Datei erneut wählen |
| Korrektur | Fehler | „Bitte eine Zeit wie 01:23,45 eingeben.“ | Feld bleibt offen |
