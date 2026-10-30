# Design-Brief: Beckenrand — mobile App-Screens

Quelle: bestehende PWA `~/StopWatch` (Schwimm-Stoppuhr für Trainer am Beckenrand).
Ziel dieses Runs: vollständige visuelle Richtung inklusive Onboarding, nicht nur der Timer.

## Style Direction (an Sleek übergeben)

Instrument-panel meets poolside equipment: calm, precise, unglamorous, built to be read at arm's
length in direct sunlight. Colour strategy: a deep-water near-black base (graphite with a faint blue
cast) for anything in measurement, one saturated signal colour per state — electric cyan for a
running lane, chlorine green for a finished lane, warm amber for warnings — while the digits that
must never be ambiguous stay pure white; secondary surfaces sit exactly one step above the base and
are never glassy or translucent. Typography: a tight condensed grotesque for the clock digits,
tabular and monospaced so hundredths do not jitter while ticking, set at display scale; a plain
humanist sans for German labels and body copy at small sizes, with wide letter-spacing on uppercase
captions; a number is always the largest thing in its own row. Layout philosophy: every screen is a
control surface, not a page — fixed top status strip, flexible equal-weight content area, one
anchored action bar at the bottom that is thumb-reachable and never scrolls away; no hero areas, no
decorative headers, no empty scroll space. Component style: heavy 2 px state borders, 18–20 px radii,
no drop shadows except one wide soft shadow under the primary button, full-surface press states that
dim the fill instead of shrinking the element, and bottom sheets with a grabber and dimmed backdrop
for configuration. Imagery: none — no photos, no illustrations, no decorative gradients; the only
graphics are the numbers, hairline rules, and a single very-low-contrast pool-lane line pattern on
the idle screen. Two distinctive details: a hairline progress line across the bottom edge of each
lane tile that fills as the swimmer completes Längen, and a persistent micro-status row (wake-lock
state, elapsed Lauf time) that turns amber the instant the screen lock is no longer held.

## Screens

1. **Onboarding, 3 Schritte** — was die App tut; Beckenlänge/Strecke; Bahnenzahl und
   Schwimmernamen. Erststart, ohne Konto, offline.
2. **Bereit (Idle)** — Zusammenfassung des nächsten Laufs (z. B. „25 m · 100 m · 4
   Bahnen") mit großem Start-Button; kurze Bedienhinweise.
3. **Lauf läuft** — Raster aus bis zu 10 gleichgewichtigen Bahn-Kacheln; jede zeigt Bahnnummer,
   Schwimmername, laufende Zeit auf Hundertstel, aktuelle Länge (z. B. „Länge 3/4") und letzten
   Split. Tippen = Anschlag, langes Drücken = letzte Aktion rückgängig. Statuszeile „2 von 4 im
   Ziel", Hinweis wenn Wake-Lock nicht aktiv.
4. **Lauf beendet** — alle Bahnen im Ziel, Ergebnisübersicht mit Bestzeit-Markierung, direkter
   Einstieg in „Neuer Lauf".
5. **Lauf-Detail** — Datum/Uhrzeit, Konfiguration, pro Bahn Zielzeit, Splits je Länge, Pace/100 m,
   Delta zur Bestzeit bzw. „Bestzeit"-Badge, Warnung bei unvollständigem Lauf, Export/Teilen.
6. **Verlauf** — Läufe gruppiert nach Satz (Datum + Bezeichnung, umbenennbar), pro Lauf Bahnenzahl,
   Strecke, Uhrzeit und schnellste Zeit, Badge „unvollständig", leerer Zustand.
7. **Schwimmer & Bestzeiten** — Liste der Schwimmer, je Schwimmer PB pro Strecke/
   Beckenlänge, Verlauf der Zeiten.
8. **Einstellungen** — Standard-Konfiguration, Dark/Light, Datenexport (CSV/JSON),
   Backup, App-Info.
9. **Konfigurations-Sheet** — Bottom Sheet: Bahnenzahl (1–10), Beckenlänge (25/50), Strecke
   (50/100/…/offene Strecke), Zwischenzeiten, Schwimmerzuordnung.
10. **Verwerfen-Bestätigung** — destruktiver Dialog „Lauf verwerfen?".

## Constraints

- Deutsch als UI-Sprache, deutsche Zeit-/Datumsformate, Hundertstel abgeschnitten.
- Einhandbedienung mit nassen Fingern, direkte Sonne, Handy in einer Hand am Beckenrand.
- Touchziele groß, keine Fehlbedienung bei Nässe, kein Scrollen während der Messung.
- Bestehende Fachbegriffe: Lauf, Satz, Bahn, Schwimmer, Länge, Split, Anschlag, Tap, Strecke,
  Offene Strecke, Bestzeit (PB).
