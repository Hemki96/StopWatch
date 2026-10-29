# Informationsarchitektur

## Leitidee

Die App ist kein Dokument und keine Sammlung von Seiten. Sie ist ein **Instrumentenbrett** mit
sechs Bereichen, einem austauschbaren Screen und einer unteren Aktionsleiste. Der Trainer hält das
Handy in einer Hand, schaut auf eine Bahn und tippt. Jede Ebene darüber ist eine Unterbrechung, die
schnell und eindeutig wieder schließen muss.

Drei Regeln folgen daraus:

- **Messung liegt vorn.** Der Timer ist der erste und wichtigste Tab. Alles andere ist
  Vorbereitung oder Auswertung.
- **Keine tiefen Bäume.** Höchstens drei Ebenen: Tab → Screen → Sheet/Dialog. Ein Lauf-Detail ist
  ein Vollbild über dem Verlauf, kein vierter Tab.
- **Zurück ist immer sichtbar oder systemisch.** Es gibt keine URL-Navigation und keinen
  versteckten Verlauf. Die System-Zurück-Geste schließt den obersten Dialog, nicht die App.

## App-Gerüst

```
Handy 390 × 844                         Tablet 820 × 1180
┌──────────────────────────────┐        ┌──────┬─────────────────────────────┐
│ Banner (optional, 32–40 px)  │        │      │ Banner (optional)           │
├──────────────────────────────┤        │      ├─────────────────────────────┤
│ Screen-Kopf (44–52 px)       │        │ Nav  │ Screen-Kopf                 │
├──────────────────────────────┤        │ 96   │                             │
│                              │        │ px   │ Inhalt, max. 1024 px        │
│ flexibler Inhalt             │        │      │                             │
│ (scrollt nur hier)           │        │      │                             │
│                              │        │      │                             │
├──────────────────────────────┤        │      ├─────────────────────────────┤
│ Aktionsleiste (72–104 px)    │        │      │ Aktionsleiste               │
├──────────────────────────────┤        │      │                             │
│ Tab-Leiste (56 px)           │        │      │                             │
└──────────────────────────────┘        └──────┴─────────────────────────────┘
              Toast: schwebend oberhalb der Aktionsleiste
```

- Das Gerüst füllt `100dvh`. Nur der Inhaltsbereich scrollt.
- Die Aktionsleiste ist Teil des Screens, nicht des Fensters; sie liegt unter dem Inhalt und über
  der Tab-Leiste. Auf dem Tablet gibt es keine Tab-Leiste, die Aktionsleiste bleibt.
- `env(safe-area-inset-bottom)` gilt an jedem unteren Rand, im Querformat zusätzlich links/rechts
  über `safe-x`.
- Banner schieben den Inhalt nach unten, statt ihn zu überdecken. Der Toast liegt darüber und
  blockiert keine Taps.

## Navigation

Sechs Einträge, feste Reihenfolge. Die Reihenfolge ist die Häufigkeit am Beckenrand, nicht die
Datenmenge.

| # | Label | Icon | Aufgabe | Primäre Aktion | Badge/Status |
| --- | --- | --- | --- | --- | --- |
| 1 | **Timer** | Stoppuhr | Lauf vorbereiten, starten, messen, beenden | `Start` / `Neuer Lauf` | Punkt je aktivem Lauf (läuft = Akzent, fertig = Grün, bereit = Grau) |
| 2 | **Training** | Hantel/Plan | Trainings planen und Satz für Satz abarbeiten | `Neues Training` / nächster Satz | Fortschritt `2/5` in der Liste |
| 3 | **Wettkampf** | Pokal | Wettkämpfe, Disziplinen, Heats | `Neuer Wettkampf` / `Heat starten` | Anzahl Disziplinen, Heat-Fortschritt |
| 4 | **Verlauf** | Uhr mit Pfeil | Messungen ansehen, auswerten, exportieren | keine (Lesen) | Anzahl Läufe |
| 5 | **Schwimmer** | Personen | Namen, Jahrgänge, Bestzeiten | `Schwimmer anlegen` | Anzahl PBs |
| 6 | **Mehr** | Zahnrad | Einstellungen, Theme, Daten, Installation | keine (Lesen) | — |

Regeln:

- Der aktive Eintrag ist über `aria-current="page"` markiert und trägt Akzentfarbe plus
  `rail:bg-accent/10`. Auf dem Handy zusätzlich die volle Fläche heller (`text-accent`).
- Die Tab-Leiste hat **immer sechs gleich breite Spalten**. Kein Eintrag wird ausgeblendet, kein
  „Mehr“-Menü verschachtelt die Bereiche.
- Die Beschriftung ist sichtbar, nicht nur das Icon. Unter 360 px bleibt sie bei 10 px, darüber
  11 px; im Querformat stehen Icon und Text nebeneinander.
- Ein Wechsel hängt den alten Screen aus. Laufende Messungen liegen deshalb im Provider, nicht im
  Screen.

## Ebenen

| Ebene | Komponente | Verwendung | Verhalten | z-index |
| --- | --- | --- | --- | --- |
| 0 | Screen | Timer, Training, Wettkampf, Verlauf, Schwimmer, Einstellungen | füllt den Inhaltsbereich | — |
| 0 | Lauf-Detail | Vollbild über Verlauf/Schwimmer | eigener Kopf mit Zurück, eigene Aktionen | 30 |
| 1 | `Sheet` | Konfiguration, Startübersicht, Aktive, Satz, Name, Import, Zeitkorrektur | von unten, 88 dvh, Ziehen > 90 px schließt; auf Tablet zentriert | 40 |
| 2 | `Dialog` / `Bestaetigung` | Verwerfen, Löschen, Import bestätigen | `alertdialog`, Fokus auf Abbrechen, nur oberster reagiert | 50+ |
| — | Toast | Rückmeldung nach Aktion | `role="status"`, bleibt im DOM | 50 |
| — | Banner | Update, Offline, Speicherfehler, fremder Tab | schiebt Inhalt, `role="status"`/`alert` | — |

- **Sheet über Sheet ist erlaubt**, aber nur eine Ebene tief: Die Startübersicht kann die
  Konfiguration nicht gleichzeitig offen haben; „Ändern“ schließt die Übersicht und öffnet das
  Formular.
- **Dialog über Sheet** ist der einzige Stapel: Eine Bestätigung liegt über dem Formular. Der
  darunterliegende Dialog bleibt offen, reagiert aber nicht auf Escape.
- **Kein eigener `position: fixed`-Dialog.** Fokus, Scroll-Sperre, History und Rückgabe gehören in
  `Dialog`.

## Abläufe

### Erststart

```
Laden (IndexedDB) ──► Onboarding 1 (So funktioniert es)
                         │ Weiter
                         ▼
                      Onboarding 2 (Becken, Strecke, Schwimmart)
                         │ Weiter
                         ▼
                      Onboarding 3 (Bahnen, Namen)
                         │ Los geht’s / Überspringen
                         ▼
                      Timer · Bereit
```

- Kein Konto, kein Netz, keine Anmeldung.
- „Überspringen“ setzt Standardwerte (25 m, 6 Bahnen, Freistil), legt keine Schwimmer an.
- Bestehende Installationen mit Läufen oder Schwimmern sehen das Onboarding nicht.

### Eine Messung

```
Timer · Bereit
   │ Start
   ▼
Startübersicht (Sheet) ── Ändern ──► Konfiguration (Sheet)
   │ Jetzt starten
   ▼
Timer · Lauf läuft ◄── Tap = Anschlag, lang = Undo
   │ letzter Anschlag / Alle beenden
   ▼
Timer · Lauf beendet (Ergebnisübersicht)
   │ Neuer Lauf                    │ Tab wechseln
   ▼                               ▼
Startübersicht                  Verlauf ──► Lauf-Detail (Vollbild)
```

- Ohne Bestätigung entsteht kein Startzeitstempel. Jeder Startweg führt über die Startübersicht.
- Ein beendeter Lauf bleibt im Timer sichtbar, bis „Neuer Lauf“ oder „Schließen“ gewählt wird.
- Verwerfen ist nur während eines offenen Laufs möglich und fragt nach.

### Weitere Läufe parallel

```
Timer · Lauf A läuft
   │ Plus in der Laufleiste
   ▼
Timer · Lauf B bereit (Leiste zeigt A und B)
   │ Start alle
   ▼
Beide laufen; Tipp auf Leiste wechselt die Ansicht
```

- Die Leiste erscheint ab dem ersten offenen Lauf und bleibt auch bei einem Eintrag, weil dort das
  Plus sitzt.
- Ein Wechsel ändert nur die Ansicht, nie die Zeit.

### Serie

```
Trainingssatz / Lauf mit Plan (n > 1)
   │ Jetzt starten
   ▼
Serienansicht: eine Zeile pro Schwimmer, Runden R1…Rn
   │ Tap schließt die älteste offene Runde
   ▼
alle Runden vollständig → Ergebnis / Fußzeile „Serie beendet“
```

- Die nächste Runde startet nach Takt, auch wenn jemand noch unterwegs ist. Die offene Runde wird
  als überfällig markiert, nicht versteckt.

### Training und Wettkampf

```
Training · Liste ──► Training · Detail ──► Startübersicht ──► Timer (Satz läuft)
Wettkampf · Liste ──► Disziplinen ──► Heat ──► Startübersicht ──► Heat läuft
```

- Beide Bereiche benutzen dieselben Bausteine wie der Timer: `Startuebersicht`, `Sheet`,
  `Bestaetigung`, dieselbe Aktionsleiste.
- Der Wettkampf hat keine Längen-Splits. Ein Tap ist die Zielzeit, ein Stift korrigiert sie.

## Zustandsbesitz

| Zustand | Ort | Lebensdauer |
| --- | --- | --- |
| Fachliche Daten (Läufe, Sätze, Schwimmer, Wettkämpfe) | `AppProvider` + IndexedDB | dauerhaft |
| Einstellungen, Theme | `localStorage` + `AppProvider` | dauerhaft |
| Aktiver Tab | lokaler State in `App.tsx` | Sitzung, beginnt bei Timer |
| Onboarding erledigt | `localStorage` `beckenrand.onboarding` | dauerhaft |
| Offene Sheets/Dialoge | lokaler Screen-State | Screen-Lebensdauer |
| Ausgewähltes Training | `localStorage` `beckenrand.training` | dauerhaft |
| Aktiver Lauf | `AppProvider` | bis geschlossen/verworfen |
| Timer-Anzeige | `useNow` + abgeleitete Werte | laufend, nie gespeichert |

**Regel:** Ein Screen hält keinen fachlichen Zustand „neben“ dem Provider. Was einen Tab-Wechsel
überleben muss, gehört in den Provider. Lokale Formularstände dürfen beim Wechsel verloren gehen.

## Navigation und Geschichte

- Es gibt **keine URLs pro Screen**. Der aktive Tab steht nicht in der URL.
- Ein offener Dialog legt genau einen History-Eintrag an. Die System-Zurück-Geste schließt den
  obersten Dialog; danach ist der History-Eintrag wieder weg.
- `Escape` schließt nur den obersten Dialog. Ein Klick auf den Hintergrund schließt ihn ebenfalls,
  außer bei destruktiven Dialogen, wo „Abbrechen“ vorfokussiert ist (Klick bricht ab).
- Das Lauf-Detail ist kein Dialog, sondern ein Screen mit eigenem Zurück. `Escape` schließt es
  zusätzlich, weil es über dem Verlauf liegt.

## Leere Zustände als Teil der IA

Jeder Bereich ohne Daten erklärt, was als Nächstes zu tun ist, und bietet die passende Aktion an.
Kein Bereich zeigt eine leere Fläche mit nur einem Strich.

| Bereich | Leertext | Aktion |
| --- | --- | --- |
| Timer | „Nächster Lauf“ mit Bedienhinweisen | `Start` |
| Training | „Noch kein Training vorbereitet“ | `Neues Training` |
| Wettkampf | „Noch kein Wettkampf“ | `Neuer Wettkampf` / Import |
| Verlauf | „Noch keine Messungen.“ | Hinweis auf Timer |
| Schwimmer | „Noch keine Schwimmer.“ | `Schwimmer anlegen` |

## Was die IA bewusst nicht hat

- Keine Startseite mit Kacheln oder Kennzahlen.
- Keine globale Suche, keine Filterleiste, keine Sortier-Popovers.
- Keine Benachrichtigungen, kein Konto, keine Cloud.
- Keine vierte Ebene. Wenn ein Inhalt nicht in Screen, Sheet oder Dialog passt, ist er zu groß
  geschnitten.
