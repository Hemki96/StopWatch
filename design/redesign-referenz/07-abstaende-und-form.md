# Abstände und Form

## Abstandslogik

Abstand hat drei Aufgaben. Sie werden nicht vermischt:

| Abstand | Wert | Regel |
| --- | --- | --- |
| **Innenabstand** (Polster) | 12/16/20/24 px | gehört zur Fläche; wächst mit der Geräteklasse |
| **Zwischen Elementen** | 4/8/12 px | kleine Gruppe; nie größer als der Innenabstand |
| **Zwischen Abschnitten** | 20/24/32 px | neue Überschrift, neue Aufgabe |

- Auf dem Handy: Screen-Polster **16 px**, Karten-Polster **16 px**, Kachel-Polster **12 px**.
- Auf dem Tablet: Screen-Polster **24 px**, Karten-Polster **20 px**, Kachel-Polster **16 px**.
- Ein Abstand ist entweder 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64 oder 80 px. Keine 6, 10, 14,
  18, 22 px.
- Zwischen zwei Karten liegt **8 px**; zwischen Karte und Abschnittsüberschrift **8 px**; zwischen
  zwei Abschnitten **24 px**.
- Ein Screen beginnt nie mit einem zusätzlichen Abstand über dem Kopf. Der Kopf ist die erste
  Fläche.

## Radien

| Token | Wert | Verwendung |
| --- | --- | --- |
| `radius-sm` | 8 px | Badge, kleiner Icon-Knopf, Fortschrittssegment |
| `radius-md` | 12 px | Eingabefeld, Chip, sekundärer Knopf |
| `radius-lg` | 16 px | Karte, Kachel (Handy), Primärknopf, Dialog |
| `radius-xl` | 24 px | Kachel (`rail`), Sheet, großes Panel |
| `radius-full` | 9999 px | Punkt, Pill, runder Icon-Knopf |

- Ein Knopf ist nie stärker gerundet als die Karte, in der er liegt.
- Ein Sheet hat oben 24 px, unten 0 auf dem Handy; auf `rail` rundum 24 px.
- Keine „organischen“ Radien, keine unterschiedlichen Ecken pro Seite außer beim Sheet.

## Rahmen

| Rahmen | Wert | Verwendung |
| --- | --- | --- |
| Struktur | **1 px** `--line` | Karten, Zeilen, Kopfzeilen, Trenner |
| Interaktive Grenze | **1 px** `--line-strong` | Eingabefelder, ungefüllte Knöpfe |
| Status | **2 px** Signalfarbe | Bahn-Kachel, ausgewählte Fläche |
| Fokus | **2 px** `--accent`, Offset 2 px | jedes fokussierbare Element |
| Unterbrochen | **2 px** `--warn`, gestrichelt | Bahn ohne Startzeit mit Anschlägen |

- Statusrahmen liegen **innen** auf der Fläche (`border`), nicht als Outline, damit die Kachelgröße
  stabil bleibt.
- Ein 1-px-Trenner sitzt zwischen Zeilen, nie um eine ganze Karte.
- Keine doppelten Rahmen (Karte im Rahmen im Rahmen).

## Schatten

Es gibt genau drei Schatten. Alles andere ist flach.

| Token | Wert (dunkel) | Verwendung |
| --- | --- | --- |
| `shadow-action` | `0 12px 32px -12px rgba(0,0,0,0.55)` | primäre Aktion am unteren Rand |
| `shadow-overlay` | `0 24px 64px -24px rgba(0,0,0,0.65)` | Sheet, Dialog, Toast |
| — | keiner | Karten, Zeilen, Chips, Badges, Banner, Kacheln |

Im hellen Theme werden die Alphas auf **0,18** (Aktion) und **0,24** (Overlay) reduziert. Kein
Schatten auf der Navigation, kein Schatten auf einer Karte, kein `drop-shadow` an Icons.

## Touchziele

Das ist die wichtigste Tabelle des Kapitels. Am Beckenrand wird mit nassen Fingern und ohne
Hinsehen getippt.

| Element | Sichtbar | Trefferfläche | Status |
| --- | --- | --- | --- |
| Startknopf (Leerzustand) | 80 px | 80 px, volle Breite | ✅ |
| Primärknopf (Lauf) | 64 px | 64 px, volle Breite | ✅ |
| Primärknopf (Formular) | 56 px | 56 px, volle Breite | ✅ |
| Sekundärknopf | 48 px | 48 px | ✅ |
| Chip | 44 px | 44 × 44 px | ✅ |
| Zahlenstepper | 48 px | 48 × 48 px | ✅ |
| Eingabefeld | 48 px | 48 px | ✅ |
| Listenzeile | ≥ 48 px | ganze Zeile | ✅ |
| Tab | 56 px (48 quer, 64 `rail`) | ganze Spalte | ✅ |
| Bahn-Kachel | ≥ 96 px | ganze Kachel | ✅ |
| Sheet-Schließen | 40 px sichtbar | **44 × 44 px** | ⚠️ Bestand 36 px (**E5**) |
| Kopfzeilen-Icon | 40 px sichtbar | **44 × 44 px** | ⚠️ Bestand 40 px (**E5**) |
| Korrektur-Stift | 28 px sichtbar | **44 × 44 px** | ⚠️ Bestand 28 px |
| „Zurück“ in Ergebniszeile | 28 px sichtbar | **44 px hoch** | ⚠️ Bestand 28 px |
| Schließen im Banner | 28 px sichtbar | **44 × 44 px** | ⚠️ Bestand 28 px |

**Regel:** Sichtbare Größe und Trefferfläche dürfen auseinanderliegen. Die Trefferfläche wird über
Polster oder ein unsichtbares Pseudo-Element vergrößert, nicht über ein größeres Icon. Zwei Ziele
liegen mindestens **8 px** auseinander.

## Komponentenmaße

| Komponente | Höhe / Größe | Radius | Innenabstand | Schrift |
| --- | --- | --- | --- | --- |
| Bahn-Kachel | min. 120 px (96 quer, 128 `rail`) | 16/24 px | 12/16 px | `digit-lane` |
| Karte | Inhalt + 32 px | 16 px | 16/20 px | `body` |
| Listenzeile | min. 48 px | 0 (in Karte) | 16 px | 14 px |
| Primärknopf | 56/64/80 px | 16 px | 16 px | 14–24 px, 700 |
| Sekundärknopf | 48 px | 12 px | 16 px | 14 px, 600 |
| Icon-Knopf | 40 px sichtbar / 44 px Ziel | full | 0 | 20–24 px Icon |
| Chip | 44 px | 12 px | 12 px | 14 px, 600 |
| Eingabefeld | 48 px | 12 px | 12 px | 16 px (iOS kein Zoom) |
| Zahlenfeld | 48 px | 12 px | 12 px | 16 px tabellarisch |
| Badge | 20 px | 6 px | 4/6 px | 10 px, 700 |
| Fortschritt (Liste) | 4 px | full | — | — |
| Fortschritt (Kachel) | 6 px | 2 px | — | — |
| Sheet-Griff | 40 × 4 px | full | — | — |
| Toast | 36 px | full | 16 px | 14 px |
| Dialog | Inhalt + 40 px | 16 px | 20 px | — |
| Tab | 56 px | 0/full | 4 px | 10–11 px |

### Eingabefelder

```
LABEL                       11 px, 700, Versalien, --muted
┌──────────────────────────┐
│ 01:23,45                 │  48 px, --surface-2, 1-px --line-strong
└──────────────────────────┘
Hinweis                     12 px, --muted
Fehler                      12 px, --danger, role="alert"
```

- Das Label steht **über** dem Feld, nicht als Placeholder. Ein Placeholder ist nie die einzige
  Beschriftung.
- Der Fokus ersetzt den 1-px-Rahmen durch 2 px `--accent` plus 2 px Offset; das Feld springt nicht.
- Zahlenfelder tragen `inputMode="decimal"` bzw. `"numeric"` und `tabular-nums`.
- Fehler stehen direkt unter dem Feld, nicht am Screen-Ende. Das Feld behält seinen Wert.
- Ein Feld ist 48 px hoch, damit die Zifferntastatur es nicht verdeckt und der Daumen es trifft.

### Knöpfe

| Typ | Fläche | Text | Rahmen | Einsatz |
| --- | --- | --- | --- | --- |
| Primär | `--accent` | `--on-accent` | keiner | eine pro Screen |
| Sekundär | `--surface-2` | `--fg` | 1 px `--line` | „Abbrechen“, „Ändern“ |
| Ruhig | transparent | `--accent` | keiner | „Bearbeiten“, „Zurück“ |
| Destruktiv | `--danger-fill` | `--on-danger` | keiner | nur Bestätigung |
| Gesperrt | `--surface-2` 40 % | `--muted` | 1 px `--line` | nicht fokussierbar |

- Primärknöpfe sind **volle Breite** in der Aktionsleiste, nie schwebend.
- Kein Knopf ist kleiner als 44 px hoch; die primäre Aktion ist mindestens 56 px.
- Text bricht nie um. Bei Platzmangel wird das Label gekürzt, nicht die Höhe.
- Zwei Knöpfe nebeneinander haben **8 px** Abstand und gleiche Höhe.

## Dichte

- Eine Karte enthält **eine** Aufgabe. Zwei Karten mit unterschiedlichen Aktionen werden nicht
  verschachtelt.
- Eine Zeile enthält **eine** Aktion. Gibt es zwei (z. B. Umbenennen und Löschen), ist eine die
  Zeilenaktion, die andere ein separater 44-px-Knopf.
- Maximal **drei** Informationsebenen pro Zeile: Titel, Metazeile, Badge. Mehr wird zu einem
  eigenen Screen oder Sheet.
- Leerraum ist erlaubt, aber nie als „Hero“. Der erste Inhalt beginnt direkt unter dem Kopf.

## Ausrichtung und Optik

- Links ausgerichtet ist der Standard. Nur Zeiten in Tabellen und die Kachelzeit sind rechts bzw.
  zentriert.
- Icons stehen **vor** dem Text, nie danach, außer bei Chevron/Pfeil.
- Ein Chevron bedeutet „öffnet eine tiefere Ebene“. Ein Stift bedeutet „bearbeitet inline“. Ein
  Papierkorb bedeutet „löscht“. Keine anderen Metaphern.
- Die Aktionsleiste hat immer eine 1-px-Oberlinie und den Hintergrund `--bg`, damit sie sich vom
  Inhalt absetzt, ohne eine Karte zu sein.

## Prüfsteine

- Ist jeder Abstand ein Vielfaches von 4 px?
- Hat jedes interaktive Element mindestens 44 × 44 px Trefferfläche?
- Liegen zwei Ziele mindestens 8 px auseinander?
- Gibt es mehr als einen Schatten pro Screen? Wenn ja, entfernen.
- Hat die primäre Aktion 56–80 px und volle Breite?
- Ist der Abstand zwischen Karte und Abschnitt kleiner als der Innenabstand der Karte? Wenn nicht,
  wirkt die Karte zerrissen.
- Gibt es ein Feld ohne sichtbares Label? Wenn ja, ergänzen.
