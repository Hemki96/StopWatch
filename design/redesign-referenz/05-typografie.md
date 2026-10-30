# Typografie

## Haltung

Die Typografie hat zwei Aufgaben, die sich nicht vermischen dürfen:

1. **Zeit lesen.** Die Zahl ist das größte Element ihrer Zeile, tabellarisch, ohne Springen.
2. **Bedienung erklären.** Labels sind klein, ruhig und sekundär. Sie konkurrieren nie mit der
   Zeit.

Alles ist Systemschrift. Es gibt keine dekorative Schrift, keine zweite Markenstimme und keine
Webfont-Abhängigkeit.

## Schriftfamilie

```css
font-family:
  ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto,
  'Helvetica Neue', sans-serif;
font-variant-numeric: tabular-nums;
font-feature-settings: 'tnum' 1;
```

- **Labels und Fließtext:** System-Sans. Sie ist auf jedem Zielgerät vorhanden, optimiert für
  Bildschirme und braucht keine Ladezeit.
- **Ziffern:** dieselbe Familie mit `tabular-nums`. Dadurch bleiben Hundertstel und Minuten an
  derselben Stelle, auch wenn die Zahl wächst.
- **Keine Condensed-Schrift bündeln** (Entscheidung **E3**). Eine zusätzliche Datei kostet
  Offline-Größe, erzeugt einen Ladezustand und löst das Problem nicht: Die System-Sans ist bei
  `font-weight: 600` und enger Laufweite aus zwei Metern ausreichend schmal.
- Falls die Gestaltung später eine Condensed-Schrift verlangt: nur eine Datei, nur Ziffern,
  `font-display: optional`, OFL-Lizenz, Subset `0-9 : , . + - m s`, und ein sichtbarer Fallback
  ohne Layoutsprung.

## Skala

| Token | Größe / Zeilenhöhe | Gewicht | Laufweite | Verwendung |
| --- | --- | --- | --- | --- |
| `digit-lane` | `clamp(1.375rem, 15cqw, 3.25rem)` / 0.9 | 600 | −0.02em | Zeit in der Bahn-Kachel (22–52 px) |
| `digit-result` | 24 px / 1.1 | 600 | −0.01em | Zielzeit in Ergebnis und Detail |
| `digit-row` | 20 px / 1.1 | 600 | −0.01em | Zeit in Verlaufszeile, Splitzeile |
| `digit-meta` | 12 px / 1.3 | 400 | 0 | Zwischenzeit, Delta, Pace |
| `title-detail` | 24 px / 1.2 | 600 | −0.01em | Lauf-Detail-Kopf |
| `title-screen` | 18 px / 1.25 | 600 | 0 | Screen-Titel („Verlauf“, „Training“) |
| `title-section` | 14 px / 1.35 | 600 | 0 | Karten- und Zeilentitel |
| `body` | 14 px / 1.5 | 400 | 0 | Fließtext, Hinweise, Formulare |
| `meta` | 12 px / 1.4 | 400 | 0 | Metazeilen, Untertitel, Fehler |
| `caption` | 11 px / 1.2 | 700 | 0.08em, Versalien | Abschnitts- und Feldlabels |
| `micro` | 10 px / 1.2 | 700 | 0.06em, Versalien | Badges, Reihenüberschrift, Status |
| `button` | 14 px / 1 | 600 | 0 | sekundäre Aktion |
| `button-primary` | 20 px / 1 | 700 | 0 | „Start alle“, „Neuer Lauf“ |
| `button-start` | 24 px / 1 | 700 | 0 | „Start“ im Leerzustand |
| `tab` | 10–11 px / 1.15 | 500 | 0 | untere Navigation |

### Harte Grenzen

- **Kein Text unter 10 px.** Die bestehende 9-px-Beschriftung in der Laufleiste wird auf 10 px
  angehoben. 10 px ist ausschließlich für Badges und Status erlaubt.
- **Keine Ziffer ohne `tabular-nums`.** Auch nicht in Badges, Deltas oder Datumszeilen.
- **Keine Zeit in Fließtextgröße.** Eine Messzeit ist immer mindestens `digit-row`.
- **Kein Label größer als 14 px**, außer Screen- und Detailtitel.
- **Keine Schriftstärke unter 400**, keine künstliche Fettschrift.
- **Keine Großschreibung ganzer Sätze.** Versalien nur für Captions und Badges.
- **Kein Blocksatz, keine Silbentrennung** in Zeiten, Namen oder Labels.

## Ziffern und Formate

Die Formatierung kommt ausschließlich aus `src/domain/format.ts`. Kein `toFixed`, kein
`toLocaleString` für Zeiten, keine eigene Rundung.

| Fall | Format | Beispiel | Regel |
| --- | --- | --- | --- |
| Messzeit | `mm:ss,hh` | `01:12,45` | Minuten laufen über 60 hinaus: `61:01,99` |
| Hundertstel | immer zwei Stellen | `00:09,04` | abgeschnitten, nie gerundet |
| Countdown | `s,z` oder `m:ss,z` | `7,4` · `1:07,4` | Zehntel, gröber als die Messzeit |
| Delta | Vorzeichen + Zeit | `+1,20` · `-0,40` | `formatDelta`; negatives Vorzeichen bleibt ASCII-Hyphen |
| Takt | `mm:ss` | `02:00` | gerundet, weil keine Messzeit |
| Strecke | deutsche Tausendertrennung | `1.500 m` · `100 yd` | Einheit mit normalem Leerzeichen |
| Becken | Zahl + Einheit | `25-m-Becken` | im Satz mit Bindestrichen |
| Pace | Zeit + `/ 100 m` | `01:12,45 / 100 m` | nur bei fester Strecke |
| Datum | `Mo., 27.10.2026` | — | `Intl.DateTimeFormat('de-DE')` |
| Uhrzeit | `18:42 Uhr` | — | ohne Sekunden |
| Kurzdatum | `27.10.` | — | in Zeitentwicklungen |

- **Keine Tausendertrennung in Zeiten.** `1:12,45`, nicht `1:12,45 min`.
- **Keine Einheit in der Kachel.** Die Konfiguration steht im Kopf; die Kachel zeigt nur die Zahl.
- **Kein führendes Plus bei Zeiten.** Nur Deltas tragen ein Vorzeichen.
- **Minus ist `-` (U+002D)**, damit Anzeige, CSV und Eingabe identisch bleiben. Kein U+2212.
- **Komma ist das Dezimaltrennzeichen**, auch in Eingabefeldern. `parseTime` akzeptiert zusätzlich
  den Punkt, die Anzeige normalisiert auf Komma.

## Ausrichtung

- **Zeiten rechtsbündig** in Tabellen und Ergebniszeilen, mit fester Breite. Dadurch stehen
  Hundertstel unter Hundertstel.
- **In der Kachel zentriert.** Die Zeit ist das einzige zentrierte Element; alles andere ist
  links oder rechts.
- **Labels links, Werte rechts** in der Startübersicht und in Einstellungszeilen.
- **Namen links, Zeit rechts.** Ein langer Name wird mit Ellipse gekürzt; der vollständige Name
  steht im `aria-label` der Kachel.
- **Keine zentrierten Fließtexte** außer Leerzuständen und Dialogen.

## Umgang mit Platz

| Situation | Regel |
| --- | --- |
| Name zu lang | eine Zeile, `truncate`, vollständiger Name im `aria-label` |
| Zusammenfassung im Laufkopf | max. 2 Zeilen, `line-clamp-2` |
| Hinweis in der Aktionsleiste | max. 2 Zeilen, 12 px, danach kürzen statt scrollen |
| Badge neben Zeit | Badge darf schrumpfen, Zeit nie |
| Zwei Zahlen nebeneinander | mindestens 8 px Abstand, nie überlappen |
| Sehr große Zahl | `clamp` begrenzt; nie die Kachelbreite überschreiten |

## Deutsche Oberflächentexte

### Begriffe

Ausschließlich die Begriffe aus [`GLOSSARY.md`](../../GLOSSARY.md):

`Lauf` · `Satz` · `Serie` · `Training` · `Aktive` · `Bahn` · `Reihe` · `Schwimmer` · `Länge` ·
`Split` · `Anschlag` · `Tap` · `Strecke` · `offene Strecke` · `Bestzeit (PB)` · `Training` ·
`Trainingssatz`

Keine Synonyme wie „Session“, „Event“, „Workout“, „Timer-Session“ oder „Runde“ für einen Lauf.
„Runde“ ist ausschließlich eine Wiederholung einer Serie.

### Schreibweisen

| Richtig | Falsch |
| --- | --- |
| `2 von 4 im Ziel` | `2/4 fertig` |
| `Länge 3/4` | `Lap 3 of 4` |
| `Start in 00:04,2` | `Startet in 4.2s` |
| `Bestzeit` | `PB!` (einzelnes Badge darf `PB` heißen, aber nie allein stehen) |
| `+1,20 zum PB` | `+1.20s` |
| `25-m-Becken` | `25m Becken` |
| `freie Bahn` / `frei` | `leer`, `unbesetzt` |
| `Display-Sperre nicht aktiv` | `Wake Lock failed` |
| `Verwerfen` | `Löschen` (nur bei gespeicherten Läufen) |

- Anrede: **du**, nicht „Sie“. Die App spricht den Trainer direkt an.
- Aktionen sind Verben im Infinitiv oder Imperativ: „Start“, „Weiter“, „Verwerfen“, „Jetzt
  starten“.
- Dialoge stellen eine konkrete Frage und nennen die Folge: „Lauf verwerfen?“ + „Alle Zeiten
  dieses Laufs werden gelöscht.“
- Keine Ausrufezeichen, keine Emojis, kein Humor in Fehlermeldungen.
- Anführungszeichen: „deutsch“ und ‚einfach‘. Trennzeichen: ` · ` mit Leerzeichen.
- Multiplikation: `×` (U+00D7), z. B. `4×100 m`.
- Zurück-Pfeil: `‹` (U+2039), nicht `<`.

## Prüfsteine

- Sieht man aus 2 m Entfernung nur die Zahl und den Status? Wenn nein, ist die Hierarchie falsch.
- Springt die Zeit beim Ticken? Wenn ja, fehlt `tabular-nums` oder die feste Breite.
- Ist die wichtigste Zahl einer Zeile größer als jedes Label daneben? Wenn nein, ist es keine
  Messfläche.
- Steht irgendwo Text unter 10 px? Wenn ja, entfernen oder vergrößern.
- Wird ein Name abgeschnitten, ohne dass der vollständige Name vorlesbar ist? Wenn ja, `aria-label`
  ergänzen.
