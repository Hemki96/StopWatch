# Domänenreferenz

Diese Seite beschreibt die exportierten Funktionen aus `src/domain/`. Die Fachlogik ist frei von
React, DOM und Persistenz. Die Messlogik bekommt ihre Zeit als Argument; nur Erzeuger von Metadaten
nutzen `newId()` und `Date.now()` für IDs und `erstelltAm`. Wo nichts anderes steht, wird das
Eingabeobjekt nicht mutiert.

Die Referenz ist nach Modulen sortiert und nennt nur das Verhalten, das für Aufrufer relevant ist.
Die vollständigen Typen stehen in [Datenmodell](datenmodell.md).

## `lauf.ts`

### Konstanten und Konfiguration

```ts
const STANDARD_KONFIGURATION = {
  beckenlaengeM: 50,
  streckeM: 100,
  schwimmart: 'freistil',
}
```

Wird beim Onboarding und als Fallback verwendet.

### `lengthCount(konfiguration): number | null`

Anzahl der Längen. `null` bei offener Strecke. Rechnet `Math.round(streckeM / beckenlaengeM)`.

```ts
lengthCount({ beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' }) // 2
```

### `validateKonfiguration(konfiguration): string | null`

Prüft:

- offene Strecke (`null`) ist gültig,
- Strecke endlich und größer 0,
- Strecke ist ein Vielfaches der Beckenlänge.

Gibt eine deutsche Fehlermeldung oder `null` zurück. Prüft **nicht**, ob `beckenlaengeM` 25/50 ist;
das ist über den Typ abgesichert.

### `createLauf(konfiguration, bahnen, satzId = null, optionen = {}): Lauf`

Erzeugt einen neuen Lauf mit neuen IDs:

```ts
const lauf = createLauf(
  { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' },
  [
    { nummer: 1, reihe: 1 },
    { nummer: 1, reihe: 2 },
  ],
  satzId,
  { startversatzMs: 10_000, wiederholung: 1, modus: 'training' },
)
```

- `startversatzMs` wird auf ≥ 0 gerundet.
- `reihe` fehlt oder ist unbrauchbar → 1.
- `wiederholung` ist `null`, wenn nicht angegeben.
- `modus` ist `training`, wenn nicht angegeben.
- Alle Bahnen starten mit `startMs: null` und leeren Anschlägen.

### Statusabfragen

| Funktion | Rückgabe |
| --- | --- |
| `isFinished(bahn)` | true, wenn ein Anschlag `istFinish` hat |
| `laneStatus(bahn)` | `bereit`, `laeuft` oder `beendet` — ohne Zeitbezug, kennt kein „geplant“ |
| `laneStatusAt(bahn, now)` | zusätzlich `geplant`, wenn `startMs > now` |
| `elapsedMs(bahn, now)` | `max(0, now - startMs)`, sonst 0 |
| `finishMs(bahn)` | `splitMs` des Finish-Anschlags oder `null` |
| `lastSplit(bahn)` | letzter Anschlag oder `null` |
| `isComplete(lauf)` | true, wenn **alle** Bahnen ein Finish haben |
| `hasStarted(lauf)` | true, sobald irgendeine Bahn `startMs !== null` hat |
| `hatLaufendeBahn(lauf)` | true, solange eine gestartete Bahn nicht im Ziel ist |
| `hatBegonnen(lauf, wallNow?)` | true, wenn der Lauf im Verlauf erscheinen soll |

`hatLaufendeBahn` zählt auch **geplante** Bahnen mit, weil ihr Countdown sonst einfrieren würde.

`hatBegonnen` ist bewusst wanduhrbasiert:

```ts
// Anschläge vorhanden → immer begonnen
// sonst: startWallMs <= jetzt und (wiederholung === null || wiederholung === 1)
```

Spätere Wiederholungen einer Serie erscheinen erst mit dem ersten Anschlag im Verlauf.

### Starten

#### `startLane(lauf, bahnId, now, wallNow): Lauf`

Startet genau eine Bahn, wenn sie noch nicht gestartet ist. Setzt `startWallMs`, falls der Lauf noch
keinen Anker hat. Eine bereits gestartete oder beendete Bahn bleibt unverändert.

#### `planeLauf(lauf, startMs, wallStartMs, versatzMs = lauf.startversatzMs): Lauf`

Setzt **allen** Bahnen eine Startzeit:

```ts
startMs = startMs + (reihe - 1) * versatzMs
```

Alle Bahnen einer Reihe starten gemeinsam; jede weitere Reihe folgt um den Versatz. Setzt zusätzlich
`startWallMs` und `startversatzMs`. Wird für unberührte Serienrunden verwendet; bereits gestartete
Bahnen werden dabei überschrieben. Aufrufer müssen sicherstellen, dass die Bahnen unberührt sind.

#### `startAll(lauf, now, wallNow): Lauf`

Startet alle Bahnen, die weder gestartet noch beendet sind, gestaffelt nach ihrer Reihe. Setzt
`startWallMs` nur, wenn noch keiner existiert. Ist nichts zu tun, wird dasselbe Objekt
zurückgegeben.

### Bedienen

#### `tapLane(lauf, bahnId, now, wallNow): Lauf`

Der zentrale Schritt:

1. Bahn nicht gefunden → unverändert.
2. `startMs === null` → `startLane`.
3. `now < startMs` → unverändert (geplante Bahn).
4. bereits Finish → unverändert.
5. `modus === 'wettkampf'` → `finishLane`.
6. sonst Anschlag anhängen:
   - `laengeNr = anschlaege.length + 1`
   - `splitMs = max(0, now - startMs)`
   - `istFinish = lengthCount !== null && laengeNr >= lengthCount`

#### `finishLane(lauf, bahnId, now, wallNow): Lauf`

Beendet eine Bahn explizit. Nur erlaubt bei:

- offener Strecke, **oder**
- Wettkampfmodus.

Bei fester Trainingsstrecke ist es ein No-Op; dort beendet der letzte Anschlag. Verlangt eine
gestartete, nicht beendete Bahn und `now >= startMs`.

#### `setzeZielzeit(lauf, bahnId, splitMs, erfasstAt = Date.now()): Lauf`

Nur im Wettkampf. Truncates auf ganze Millisekunden.

- Vorhandenes Finish → `splitMs`, `erfasstAt` und `manuell: true` werden ersetzt; `laengeNr` und
  `istFinish` bleiben.
- Kein Finish → neuer Finish-Anschlag mit der nächsten LängenNr und `manuell: true`.
- Keine Startzeit nötig: Eine manuell erfasste Zeit kann eine nie gestartete Bahn beenden.

Ungültige Werte (`NaN`, negativ) oder ein Nicht-Wettkampf-Lauf geben den Lauf unverändert zurück.

#### `undoLane(lauf, bahnId): Lauf`

- Letzter Anschlag vorhanden → letzten entfernen.
- Sonst Start vorhanden → `startMs: null`.
- Sonst unverändert.

`startWallMs` wird nicht zurückgesetzt.

### Zuordnung und Konfiguration

#### `setSchwimmer(lauf, bahnId, schwimmerId): Lauf`

Setzt oder entfernt die Schwimmerzuordnung einer Bahn. Keine Wirkung, wenn sie bereits gleich ist.

#### `setSchwimmart(lauf, schwimmart): Lauf`

Ändert die Schwimmart des Laufs. Der zugehörige `Satz` wird **nicht** mitgeschrieben; die
Konfiguration im Lauf ist für die Anzeige maßgeblich.

#### `updateStrecke(lauf, konfiguration): Lauf`

Ändert Beckenlänge, Strecke und Schwimmart, aber nur wenn:

- `isStreckeLocked(lauf) === false` (kein Anschlag vorhanden), und
- `validateKonfiguration` keinen Fehler liefert.

#### `isStreckeLocked(lauf)` / `isStartLocked(lauf)`

- `isStreckeLocked`: true, sobald irgendeine Bahn einen Anschlag hat.
- `isStartLocked`: true, sobald irgendeine Bahn gestartet ist oder einen Anschlag hat.

### Korrekturen

#### `pruefeAnschlagKorrektur(lauf, bahnId, laengeNr, splitMs): string | null`

Prüft:

- Bahn und Anschlag existieren,
- `splitMs` ist endlich und ≥ 0,
- der Wert liegt **nach** dem vorherigen Anschlag,
- der Wert liegt **vor** dem nächsten Anschlag.

Gibt eine deutsche Meldung oder `null` zurück. Es gibt keine Kaskade.

#### `korrigiereAnschlag(lauf, bahnId, laengeNr, splitMs): Lauf`

Wendet die Korrektur an, wenn die Prüfung erfolgreich ist. Der Wert wird auf ganze Millisekunden
abgeschnitten, der Anschlag wird `manuell: true`. Das `istFinish`-Flag bleibt erhalten. Bei einem
Fehler wird der Lauf unverändert zurückgegeben.

### Hilfen

#### `findBahn(lauf, bahnId)`

Liefert die Bahn oder `undefined`.

#### `istWettkampfLauf(lauf)`

`lauf.modus === 'wettkampf'`.

## `serie.ts`

### `istSerie(satz): boolean`

True, wenn `satz.plan.wiederholungen > 1`. Ein fehlender Plan oder eine Wiederholung bedeutet
„keine Serie“.

### `runden(laeufe, satzId): Lauf[]`

Filtert nach `satzId` und sortiert nach `wiederholung` (fehlend = 0). Leere `satzId` liefert `[]`.

### `bahnZeile(laeufe, index, now): BahnZeile`

Verdichtet die Runden einer Bahn zu einer Zeile:

```ts
interface BahnZeile {
  index: number
  offen: BahnRunde | null       // älteste gestartete, offene Runde
  offene: BahnRunde[]           // alle offenen Runden
  naechste: BahnRunde | null    // erste Runde mit Start in der Zukunft
  letzte: BahnRunde | null      // letzte beendete Runde
  anzeigeRunde: number | null
  status: 'bereit' | 'geplant' | 'laeuft' | 'ueberfaellig' | 'fertig'
}
```

Statuspriorität:

1. mehr als eine offene Runde → `ueberfaellig`
2. genau eine offene → `laeuft`
3. eine geplante → `geplant`
4. eine beendete → `fertig`
5. sonst `bereit`

`anzeigeRunde` ist die älteste offene, sonst die nächste geplante, sonst die letzte beendete Runde.

### `zeilenZeit(zeile, now): number`

- offene Runde → verstrichene Zeit
- sonst nächste → Countdown
- sonst letzte → Zielzeit
- sonst 0

### `serieFortschritt(laeufe): { fertig, gesamt }`

Zählt vollständige Läufe (`isComplete`) gegen die Gesamtzahl.

### `aktuelleRunde(laeufe, now): number`

Höchste Rundennummer, in der zum Zeitpunkt `now` irgendeine Bahn gestartet ist. `0`, wenn keine.
Wird für die Kopfzeile `Serie · Runde 2/5` verwendet.

### `letzterAnschlag(laeufe, index): BahnRunde | null`

Der Anschlag mit dem jüngsten `erfasstAt` über alle Runden dieser Bahn. Grundlage für das
Long-Press-Undo in der Serienansicht.

### `naechsteWiederholung(laeufe): number`

Höchste vorhandene Rundennummer + 1. Wird beim Anlegen weiterer Runden verwendet.

### `pruefeSeriePlan(plan, bahnen): string | null`

| Regel | Meldung |
| --- | --- |
| ganze Zahl 2..20 | „Eine Serie braucht mindestens zwei Wiederholungen.“ / „Höchstens 20 …“ |
| Takt endlich, > 0, ≤ 3600 | „Der Takt muss größer als 0 s sein.“ / „… höchstens 60 Minuten“ |
| Versatz endlich, ≥ 0, ≤ 120.000 | „Der Startversatz darf nicht negativ sein.“ / „… höchstens 120 s“ |
| Bahnen ≥ 1 | „Eine Serie braucht mindestens eine Bahn.“ |

### `warnungSeriePlan(plan, reihen): string | null`

Kein Fehler, sondern ein Hinweis, wenn:

```ts
plan.taktSek * 1000 <= (reihen - 1) * plan.startversatzMs
```

Dann beginnt die nächste Runde, bevor alle Reihen der vorigen gestartet sind.

## `training.ts`

### Konstanten

```ts
MAX_TRAININGS_SAETZE = 20
MAX_WIEDERHOLUNGEN = 20
MAX_BAHNEN = 10   // je Reihe
MAX_REIHEN = 5
```

### `neuerTrainingsSatz(teil?: Partial<TrainingsSatz>): TrainingsSatz`

Erzeugt einen Plan mit Defaults:

- neue ID,
- leere Bezeichnung,
- 50 m-Becken, 100 m, Freistil (oder `teil.konfiguration`),
- 1 Wiederholung,
- Takt 120 s,
- Startversatz 0.

### `neuesTraining(daten): Training`

- klemmt `bahnen` auf 1..10 je Reihe und `reihen` auf 1..5,
- füllt `aktive` auf genau `bahnen × reihen` Plätze,
- legt mindestens einen Trainingssatz an,
- `gestartet` ist leer,
- `erstelltAm` ist `Date.now()`.

### `ordneAktiveUm(aktive, alt, neu): (string | null)[]`

Ordnet die reihenweise Aktivenliste nach einer geänderten Aufteilung neu. Eine Person bleibt in
ihrer Reihe an ihrer Bahn; neue Plätze werden `null`, entfallende Reihen und Bahnen fallen weg.
Verhindert, dass „Reihe 1, Bahn 3“ beim Verkleinern zu „Reihe 2, Bahn 1“ wird.

### Beschreibungen

#### `beschreibeTrainingsSatz(satz): string`

```ts
`${wiederholungen > 1 ? `${n}×` : ''}${formatStrecke(streckeM)} · ${artLabel}`
// "4×100 m · Freistil"
// "100 m · Freistil"
```

#### `trainingsSatzTitel(satz): string`

Eigene Bezeichnung, getrimmt; sonst `beschreibeTrainingsSatz`.

#### `trainingsSatzMeta(satz): string`

`"50 m-Becken"` plus optional `"Takt 02:00"` und `"10 s Reihenversatz"`, getrennt durch ` · `.

### `pruefeTrainingsSatz(satz): string | null`

- Konfiguration gültig,
- Wiederholungen ganze Zahl 1..20,
- Takt endlich, > 0, ≤ 3600,
- Startversatz endlich, ≥ 0, ≤ 120.000.

### `pruefeTraining(training): string | null`

Zusätzlich:

- ID vorhanden,
- Datum `YYYY-MM-DD`,
- Bahnen 1..10 je Reihe und Reihen 1..5,
- `aktive.length === bahnen × reihen`, Einträge `string | null`,
- 1..20 Sätze,
- jeder Satz gültig.

Prüft **nicht** auf doppelte Satz-IDs oder unbekannte `gestartet`-Werte.

### `ohneTrainingsSatz(training, satzId): Training`

Filtert den Satz heraus. Die Mindestanzahl von einem Satz wird hier nicht erzwungen; das macht die
Oberfläche.

### `verschiebeTrainingsSatz(training, satzId, richtung): Training`

Verschiebt um `-1` oder `+1`. Am Rand oder bei unbekannter ID bleibt die Reihenfolge gleich.

### `ersetzeTrainingsSatz(training, satz): Training`

Ersetzt den Satz mit gleicher ID. Eine unbekannte ID fügt **nichts** hinzu.

### `trainingsFortschritt(training, satze, laeufe): TrainingsSatzFortschritt[]`

Für jeden Trainingssatz:

1. `satzId = training.gestartet[eintrag.id]`
2. Satz aus `satze` suchen
3. Läufe mit `lauf.satzId === satz.id`
4. Status ableiten:
   - keine Läufe → `offen`
   - alle Läufe vollständig → `fertig`
   - irgendeine Bahn gestartet oder mit Anschlag → `laeuft`
   - sonst → `bereit`
5. `fertigeRunden` zählen

Der Fortschritt ist damit vollständig abgeleitet und kann nicht „hängen“.

### `trainingZusammenfassung(fortschritt)`

`{ fertig, gesamt }` über alle Sätze.

### `naechsterSatz(fortschritt)`

1. erster Satz mit Status `laeuft` oder `bereit`,
2. sonst erster `offen`,
3. sonst `null`.

## `wettkampf.ts`

### `createWettkampf(daten): Wettkampf`

Trimmt den Namen, erzeugt ID und `erstelltAm`. Datum und Beckenlänge werden unverändert übernommen.

### `disziplinBezeichnung(streckeM, schwimmart): string`

`"100 m Freistil"`; unbekannte Schwimmart fällt auf „Freistil“ zurück.

### `createWettkampfSatz(wettkampf, disziplin, erstelltAm?): Satz`

- Bezeichnung: `disziplin.bezeichnung` oder generiert,
- Konfiguration aus Wettkampf-Beckenlänge, Strecke und Schwimmart,
- `plan: null`,
- `wettkampfId: wettkampf.id`.

### `createWettkampfLauf(satz, laufPlan, schwimmerFuer): Lauf`

- `modus: 'wettkampf'`,
- `startversatzMs: 0`,
- `wiederholung: laufPlan.nummer`,
- Bahnen nach Bahnnummer sortiert,
- `schwimmerFuer(start)` löst den Namen in eine ID auf (`null` erlaubt).

### `wettkampfErgebnis(lauf): WettkampfErgebnisZeile[]`

```ts
interface WettkampfErgebnisZeile {
  bahn: Bahn
  zeitMs: number | null
  platz: number | null
  rueckstandMs: number | null
  manuell: boolean
}
```

- Gewertete Bahnen nach `truncateToHundredths(zeitMs)`, dann Bahnnummer.
- Offene Bahnen danach nach Bahnnummer.
- Zeitgleiche auf Hundertstel teilen den Platz: `1, 1, 3`.
- `rueckstandMs` bezieht sich auf die schnellste **rohe** Zeit.
- `manuell` ist true, wenn der Finish-Anschlag `manuell` ist.

### `wettkampfFortschritt(laeufe): { fertig, gesamt }`

Summiert Bahnen und Finish-Bahnen über alle übergebenen Läufe.

### `istWettkampfSatz(satz)`

True, wenn `wettkampfId` ein nicht leerer String ist.

## `meldeliste.ts`

### `parseMeldeliste(text, vorgabe): MeldelisteErgebnis`

```ts
type MeldelisteErgebnis =
  | { ok: true; meldeliste: Meldeliste }
  | { ok: false; fehler: string }
```

Ablauf:

1. BOM entfernen, Zeilen splittern, trimmen, Leerzeilen und `#`-Kommentare verwerfen.
2. Auf höchstens 2.000 Zeilen prüfen.
3. Trennzeichen aus der ersten Zeile raten (`;`, Tab, `,`).
4. Kopfzeile erkennen; sonst nur 1 oder 2 Spalten erlauben.
5. Jede Datenzeile parsen:
   - Name aus `name` oder `vorname` + `nachname`,
   - Strecke aus `strecke` oder Disziplintext oder Vorgabe,
   - Schwimmart aus `schwimmart` oder Disziplintext oder Vorgabe,
   - Lauf aus `lauf` oder Vorgabe (Default 1),
   - Bahn aus `bahn` oder nächste freie 1..10,
   - Jahrgang optional.
6. Nach Disziplin (Name|Strecke|Art) und Lauf gruppieren.
7. Disziplinen in Dateireihenfolge, Heats und Bahnen sortiert zurückgeben.

Fehler nennen die Zeilennummer. Warnungen (z. B. unbekannte Schwimmart) landen in
`meldeliste.warnungen` und blockieren nicht.

### `meldelisteVorlage(): string`

UTF-8-BOM, Semikolon, CRLF, Beispielzeilen. Wird von „Vorlage laden“ verwendet.

### `meldelisteZusammenfassung(meldeliste): string`

`"2 Disziplinen, 3 Läufe, 4 Starts"` mit korrekten Singularformen.

### `istSchwimmart(wert): wert is Schwimmart`

Type Guard gegen `SCHWIMMARTEN`.

## `format.ts`

### `truncateToHundredths(ms): number`

```ts
Math.trunc(ms / 10) * 10
```

Schneidet ab, rundet nicht. `1239 → 1230`.

### `formatTime(ms): string`

`mm:ss,hh`, mit führenden Nullen. Negative Werte werden als 0 behandelt.

```ts
formatTime(83_450)   // "01:23,45"
formatTime(3_600_000) // "60:00,00"
```

### `formatDelta(ms): string`

Vorzeichen und gekürzte Minuten:

```ts
formatDelta(1230)   // "+01,23"
formatDelta(-450)   // "-00,45"
formatDelta(65_000) // "+01:05,00"
```

### `formatCountdown(ms): string`

Grob auf Zehntel, ohne führende Null bei Minuten:

```ts
formatCountdown(7400)  // "7,4"
formatCountdown(67_400) // "1:07,4"
```

### `formatTakt(sekunden): string`

`mm:ss`, gerundet:

```ts
formatTakt(120) // "02:00"
```

### `parseTime(eingabe): number | null`

Akzeptiert:

- `01:23,45`
- `1:23,45`
- `1:23.45`
- `83,45`
- `1:02:03,50`

Lehnt ab:

- negative Werte,
- Buchstaben,
- Sekunden ≥ 60, wenn Minuten angegeben sind,
- Minuten ≥ 60, wenn Stunden angegeben sind.

Rundet nicht; fehlende Hundertstel werden mit `0` aufgefüllt.

### `formatTimeInput(ms): string`

Alias für `formatTime`; für Eingabefelder gedacht.

### `formatStrecke(streckeM): string`

`null` → `"offene Strecke"`; sonst `"1.500 m"` mit deutschem Tausenderpunkt.

### `lokalesDatum(ms): string`

`YYYY-MM-DD` in der lokalen Zeitzone, nicht UTC. Wichtig für Wettkampf- und CSV-Daten.

## `analyse.ts`

### `pbKey(konfiguration, schwimmerId): string`

```ts
`${schwimmerId}|${streckeM ?? 'offen'}|${schwimmart}|${beckenlaengeM}`
```

### `berechnePbs(laeufe): Map<string, PbEintrag>`

- überspringt offene Strecken,
- überspringt Bahnen ohne Schwimmer oder ohne Finish,
- nimmt die kleinste `splitMs` pro Key,
- bei Gleichstand gewinnt der zuerst gesehene Lauf (strikt `<`).

`PbEintrag` enthält `ms`, `laufId`, `bahnId`, `startWallMs`.

### `pbDelta(pbs, lauf, bahn)`

`null`, wenn:

- keine Schwimmerzuordnung,
- offene Strecke,
- kein Finish,
- keine PB für den Key.

Sonst `{ deltaMs: ms - pb.ms, istPb: pb.bahnId === bahn.id }`.

### `pacePro100(ms, streckeM): number`

`(ms / streckeM) * 100`. Keine Division durch 0; Aufrufer prüfen `streckeM`.

### `schnellsteZeit(lauf): number | null`

Kleinste Finish-Zeit aller Bahnen oder `null`.

## `id.ts`

### `newId(): string`

`crypto.randomUUID()` wenn verfügbar, sonst `Date.now().toString(36)` plus Zufallssuffix.

## Konventionen für neue Domänenlogik

- Neue Funktionen geben neue Werte zurück, statt zu mutieren.
- Wenn nichts passiert, wird **dasselbe Objekt** zurückgegeben. Die Oberfläche prüft
  `naechster === aktuell` und spart so ein Speichern.
- Zeit wird immer als Parameter übergeben, nie intern gelesen.
- Fehlermeldungen sind deutsch, konkret und nennen den erwarteten Bereich.
- Grenzen gehören in die Domain, nicht nur in die UI.
- Jede neue Regel braucht einen Test in der gleichnamigen `.test.ts`.

## Weiterlesen

- [Datenmodell](datenmodell.md)
- [Architektur](architektur.md)
- [Testen](testen.md)
