# Datenmodell

Das Datenmodell ist bewusst klein und besteht aus wenigen Werttypen. Die zentrale Idee:
**`Satz` ist der Container, `Lauf` ist die Messung, `Bahn` ist der Timer.** Alles andere sind
Rahmen oder Pläne.

## Typen im Überblick

Alle Typen liegen in `src/domain/types.ts`.

```ts
type Schwimmart =
  | 'freistil' | 'brust' | 'ruecken'
  | 'schmetterling' | 'lagen' | 'beliebig'

type Beckenlaenge = 25 | 50
type LaufModus = 'training' | 'wettkampf'

interface LaufKonfiguration {
  beckenlaengeM: Beckenlaenge  // 25 | 50 | 22.86 (25 yd), kanonisch in Metern
  streckeM: number | null      // null = offene Strecke, kanonisch in Metern
  schwimmart: Schwimmart
  einheit?: 'm' | 'yd'         // Anzeige-Einheit; fehlt = 'm'
}
```

### Anschlag

```ts
interface Anschlag {
  laengeNr: number      // 1-basiert
  splitMs: number       // kumuliert ab Start der Bahn
  erfasstAt: number     // Date.now
  istFinish: boolean
  manuell?: boolean
}
```

Ein Anschlag ist unveränderlich gedacht; Korrekturen erzeugen ein neues Array mit einem geänderten
Eintrag.

### Bahn

```ts
interface Bahn {
  id: string
  nummer: number                 // 1..10, innerhalb der Reihe eindeutig
  reihe: number                  // 1..5, Startgruppe; fehlt = 1
  schwimmerId: string | null
  startMs: number | null         // performance.now, null = nicht gestartet
  anschlaege: Anschlag[]
  status?: 'dns' | 'dnf'         // nur Wettkampf, endgültig ohne Zeit
}
```

### Lauf

```ts
interface Lauf {
  id: string
  satzId: string | null
  konfiguration: LaufKonfiguration
  startWallMs: number | null     // Date.now-Anker
  startversatzMs: number         // 0..120000, Abstand zwischen Reihen
  wiederholung: number | null    // 1-basiert bei Serie/Heat
  modus?: LaufModus              // fehlt = 'training'
  bahnen: Bahn[]
}
```

### Satz

```ts
interface Satz {
  id: string
  datum: string                  // YYYY-MM-DD
  bezeichnung: string
  konfiguration: LaufKonfiguration
  plan: SatzPlan | null          // gesetzt bei einer Serie
  wettkampfId?: string | null    // gesetzt bei einer Disziplin
  erstelltAm: number
}

interface SatzPlan {
  wiederholungen: number         // 2..20
  taktSek: number                // > 0, <= 3600
  startversatzMs: number         // 0..120000
}
```

Ein `Satz` ist **entweder** ein freier Trainingssatz, **oder** eine Serie (`plan !== null`),
**oder** eine Wettkampfdisziplin (`wettkampfId` gesetzt). Die drei Fälle schließen sich in der
Praxis aus; die Domain prüft das nicht hart, die Erzeuger halten es ein.

### Wettkampf

```ts
interface Wettkampf {
  id: string
  name: string
  datum: string                  // YYYY-MM-DD
  beckenlaengeM: Beckenlaenge   // kanonisch in Metern
  einheit?: 'm' | 'yd'          // Anzeige-Einheit; fehlt = 'm'
  erstelltAm: number
}
```

### Schwimmer

```ts
interface Schwimmer {
  id: string
  name: string
  jahrgang: number | null
  notiz: string
  erstelltAm: number
}
```

### Training

```ts
interface TrainingsSatz {
  id: string
  bezeichnung: string
  konfiguration: LaufKonfiguration
  wiederholungen: number         // 1..20
  taktSek: number
  startversatzMs: number
}

interface Training {
  id: string
  datum: string
  bezeichnung: string
  bahnen: number                 // 1..10, je Reihe
  reihen: number                 // 1..5
  aktive: (string | null)[]      // Länge = bahnen × reihen, Reihe für Reihe
  saetze: TrainingsSatz[]        // 1..20
  gestartet: Record<string, string> // TrainingsSatz.id -> Satz.id
  erstelltAm: number
}
```

`TrainingsSatz` ist ein **Plan**, kein Messobjekt. Erst beim Start wird daraus ein `Satz` plus
`Lauf`-Wiederholungen.

## Beziehungen

```
Wettkampf 1 ─── n Satz          (Satz.wettkampfId)
Satz      1 ─── n Lauf          (Lauf.satzId)
Lauf      1 ─── n Bahn
Bahn      0 ─── n Anschlag
Schwimmer 1 ─── n Bahn          (Bahn.schwimmerId)
Schwimmer 1 ─── n Training      (Training.aktive, nur Referenz)
Training  1 ─── n TrainingsSatz (eingebettet)
Training  n ─── n Satz          (Training.gestartet, TrainingsSatz.id -> Satz.id)
```

### Die drei Satz-Arten

| Art | `plan` | `wettkampfId` | Läufe |
| --- | --- | --- | --- |
| Freier Satz / einzelner Lauf | `null` | `null` | ein Lauf, `wiederholung: null` |
| Serie | gesetzt | `null` | `wiederholungen` Läufe, `wiederholung: 1..n` |
| Wettkampfdisziplin | `null` | gesetzt | ein Lauf pro Heat, `wiederholung: Heatnummer` |

Ein einzelner Lauf aus dem **Timer** am selben Tag mit derselben Konfiguration landet im selben
Satz. Eine Serie bekommt immer einen eigenen Satz, auch wenn die Konfiguration identisch ist. Ein
gestarteter Trainingssatz erzeugt ebenfalls immer einen eigenen Satz.

## Invarianten

Diese Regeln werden von den Erzeugern und Domain-Funktionen eingehalten. Die Datenbank erzwingt sie
nicht; das Backup validiert einen Teil davon.

**Nicht gespeichert:** Längenzeiten, Abweichungen, Rundenmittel und die Referenz „zuletzt“ werden
bei jeder Anzeige aus den Splits abgeleitet (`domain/analyse.ts`). Die Analyse führt deshalb keine
eigene Tabelle und keine Migrationsschritte.

### Bahn und Anschlag

- `bahn.nummer` liegt zwischen 1 und 10 und ist innerhalb ihrer Reihe eindeutig.
- `bahn.reihe` liegt zwischen 1 und 5; eine fehlende Reihe gilt als 1.
- `startMs` ist entweder `null` oder eine monotone Zeit derselben Seitensitzung.
- `anschlaege` sind nach `laengeNr` aufsteigend.
- `splitMs` ist monoton steigend; ein Anschlag liegt zeitlich nach dem vorherigen.
- Höchstens der letzte Anschlag hat `istFinish === true`. Ein Finish beendet die Bahn.
- Ein nachträglich korrigierter Anschlag trägt `manuell: true`.
- Eine Bahn mit Finish ist beendet; weitere Tipps ändern nichts.
- `status` ist optional und nur im Wettkampf erlaubt: `dns` (nicht gestartet) oder `dnf` (nicht
  beendet). Markierte Bahnen haben keine Zielzeit und nehmen keinen Start und keinen Anschlag mehr
  an; sie zählen als beendet, aber nicht in Platzierung und Rückstand. Beim Laden wird `startMs`
  auf `null` gesetzt.

### Lauf

- 1 bis 50 Bahnen (10 Bahnen × 5 Reihen).
- `startversatzMs` ist eine ganze Zahl zwischen 0 und 120.000. Er staffelt die Reihen, nicht die
  einzelnen Bahnen: Alle Bahnen einer Reihe starten gemeinsam.
- `wiederholung` ist `null` oder eine ganze Zahl ab 1.
- `modus` ist `training` oder `wettkampf`; fehlt es, gilt `training`.
- `startWallMs` ist der Wanduhr-Anker des Laufs. Er wird beim ersten Start gesetzt.
- Bei einer Serie ist `startWallMs` pro Runde um den Takt versetzt, damit der Verlauf die richtige
  Startzeit zeigt.

### Satz und Plan

- `datum` entspricht `^\d{4}-\d{2}-\d{2}$`.
- `streckeM` ist `null` oder eine positive Zahl, die ein Vielfaches der Beckenlänge ist.
- Ein `SatzPlan` hat 2 bis 20 Wiederholungen, einen Takt größer 0 und höchstens 3.600 s sowie einen
  Startversatz bis 120.000 ms.
- Ein Seriensatz und seine Läufe teilen sich `satzId`; die Läufe tragen `wiederholung: 1..n`.

### Training

- 1 bis 10 Bahnen je Reihe und 1 bis 5 Reihen.
- `aktive.length === bahnen × reihen`; die Liste ist Reihe für Reihe geordnet.
- 1 bis 20 Trainingssätze.
- Jeder Trainingssatz hat gültige Konfiguration, 1 bis 20 Wiederholungen und gültigen Takt.
- `gestartet` enthält nur `TrainingsSatz.id -> Satz.id`-Paare.
- Eine verwaiste Zuordnung (Satz gelöscht) ist erlaubt und wird als „offen“ behandelt.

### Wettkampf

- `name` ist nicht leer.
- `datum` ist ein ISO-Datum.
- `beckenlaengeM` ist 25, 50 oder 22,86 (25-Yard-Becken). Kanonisch gespeichert wird immer in
  Metern; `einheit` steuert nur Anzeige und Eingabe (ADR 0009).
- Eine Yard-Konfiguration speichert 100 yd als `streckeM: 91.44`; die Längenprüfung arbeitet mit
  einer kleinen Toleranz, weil `91.44 / 22.86` in Gleitkomma nicht exakt 4 ergibt.

### Referenzielle Integrität

Die App erzwingt keine Fremdschlüssel. Stattdessen werden fehlende Referenzen defensiv behandelt:

- Wird eine Schwimmerin gelöscht, werden `Bahn.schwimmerId`, `Training.aktive` und
  `Einstellungen.schwimmerProBahn` auf `null` gesetzt.
- Wird ein Satz gelöscht, fällt ein Trainingssatz auf „offen“ zurück.
- Ein unbekannter Schwimmer in einer Bahn wird als „Ohne Namen“ angezeigt.

## IDs

`newId()` nutzt `crypto.randomUUID()`, wenn verfügbar, sonst eine Kombination aus Zeitstempel und
Zufall. IDs sind opak und werden nie angezeigt. Sie verbinden:

- `Bahn.schwimmerId` → `Schwimmer.id`
- `Lauf.satzId` → `Satz.id`
- `Satz.wettkampfId` → `Wettkampf.id`
- `Training.aktive[]` → `Schwimmer.id`
- `Training.gestartet` → `Satz.id`

Ein Import aus einem Backup kann IDs aus einem anderen Gerät übernehmen. Deshalb ist der Import eine
Zusammenführung und kein Ersetzen.

## Normalisierung beim Laden

`src/storage/repository.ts` repariert ältere oder unvollständige Datensätze:

### `normalizeOnLoad(lauf)`

- `startversatzMs`: fehlt/ungültig → 0; sonst gerundet, nicht negativ.
- `wiederholung`: nur positive ganze Zahl, sonst `null`.
- `bahnen[].reihe`: fehlt/ungültig → 1; sonst gerundet, nicht kleiner als 1.
- `modus`: nur `wettkampf` bleibt, sonst `training`.
- Laufende oder geplante Bahnen ohne Finish: `startMs = null`.
  Das ist die Reload-Regel; bereits erfasste Anschläge bleiben.

### `normalizeSatzOnLoad(satz)`

- `plan` fehlt → `null`.
- `wettkampfId` fehlt → `null`.

### `normalizeWettkampfOnLoad(wettkampf)`

- Beckenlänge: nur 25 bleibt 25, sonst 50.

### `normalizeTrainingOnLoad(training)`

- `bezeichnung` fehlt → leer.
- `bahnen` auf 1..10 je Reihe begrenzt, `reihen` auf 1..5; fehlende Reihen → 1.
- `aktive` auf genau `bahnen × reihen` Plätze aufgefüllt/gekürzt.
- `saetze` fehlt → leeres Array; `gestartet` fehlt → leeres Objekt.

## IndexedDB

`src/storage/db.ts` definiert das Schema:

```ts
interface BeckenrandDB extends DBSchema {
  schwimmer: { key: string; value: Schwimmer; indexes: { 'by-name': string } }
  satz:      { key: string; value: Satz;      indexes: { 'by-datum': string; 'by-wettkampf': string } }
  lauf:      { key: string; value: Lauf;      indexes: { 'by-satz': string } }
  wettkampf: { key: string; value: Wettkampf; indexes: { 'by-datum': string } }
  training:  { key: string; value: Training;  indexes: { 'by-datum': string } }
}
```

| Eigenschaft | Wert |
| --- | --- |
| Datenbankname | `beckenrand` |
| Version | 3 |
| Primärschlüssel | jeweils `id` |
| Upgrade v1 | `schwimmer`, `satz`, `lauf` |
| Upgrade v2 | `wettkampf`, Index `by-wettkampf` auf `satz` |
| Upgrade v3 | `training` |

Das Upgrade läuft in `upgrade(db, alteVersion, …)` schrittweise. Ein alter Tab mit Version 1 oder 2
kann ein Upgrade blockieren; dann wartet `openDB`, bis der Tab geschlossen ist. `blocked`,
`blocking` und `terminated` sind mit Konsolenhinweisen belegt.

### Snapshot und Sortierung von `loadAll`

`loadAll` liest alle fünf Stores in genau einer `readonly`-Transaktion und wartet
`tx.done` ab. IndexedDB legt den Snapshot beim Öffnen der Transaktion fest: Ein
Import oder eine Tab-Übergabe ist damit entweder vollständig sichtbar oder gar
nicht, nie als halber Stand zwischen zwei Stores. Sortiert wird anschließend im
Speicher:

- Schwimmer: nach Name, deutsch.
- Sätze: nach Datum absteigend.
- Wettkämpfe: nach Datum, dann `erstelltAm`, absteigend.
- Trainings: nach Datum, dann `erstelltAm`, absteigend.
- Läufe: keine Sortierung; die Oberfläche sortiert nach Bedarf.

## Backup-Schema

`src/storage/backup.ts`:

```ts
const BACKUP_FORMAT = 'beckenrand-backup'
const BACKUP_VERSION = 3
const BACKUP_VERSIONEN = [1, 2, 3]
```

```ts
interface Backup {
  format: 'beckenrand-backup'
  version: 1 | 2 | 3
  exportiertAm: string          // ISO
  schwimmer: Schwimmer[]
  satze: Satz[]
  laeufe: Lauf[]
  wettkampfe: Wettkampf[]       // ab Version 2
  trainings: Training[]         // ab Version 3
}
```

### Prüfung

`pruefeBackup(roh)` validiert:

- Formatkennung und Version,
- `exportiertAm` als parsebares Datum,
- Listenfelder,
- jeden Schwimmer, Satz, Lauf, Wettkampf und jedes Training,
- Konfiguration, Datumsformat, IDs,
- Anschläge inklusive `laengeNr`, `splitMs`, `erfasstAt`, `istFinish`, `manuell`,
- Bahnnummern 1..10 und Reihen 1..5,
- Satzpläne 2..20 Wiederholungen,
- Trainingsgrenzen inklusive `bahnen × reihen`.

Bei einem Fehler wird das erste Problem mit Pfad zurückgegeben, z. B.
`Training 2, Satz 3: Feld "wiederholungen" muss ...`.

Die Prüfung ist **strenger** als die Laufzeit-Normalisierung: Ein Backup muss vollständig sein, ein
älterer Datenbestand darf unvollständig sein und wird beim Laden repariert.

### Import

`importBackup` prüft erneut und schreibt in einer Transaktion über alle fünf Stores. `put` bedeutet:

- gleiche ID → überschreiben,
- neue ID → ergänzen,
- kein Löschen vorhandener Datensätze.

Ein Fehler bricht die Transaktion ab; es wird nichts teilweise geschrieben.

## CSV-Abbildung

Der Trainings-CSV-Export ist eine **Denormalisierung** des Modells:

- eine Zeile pro `Anschlag`,
- `satz`, `reihe`, `bahn`, `schwimmer` und die Konfiguration werden aufgelöst,
- die Runde steckt in `wiederholung`,
- Serienmetadaten (`wiederholung`, `wiederholungen`, `takt_s`, `startversatz_ms`) werden pro Zeile
  wiederholt.

Damit ist die Datei flach und in Excel auswertbar, ohne Joins. Der Preis ist Redundanz.

Der Wettkampf-CSV-Export ist eine Zeile pro **Start** und enthält bereits Platz, Zeit und Status;
er ist eine Ergebnisliste, kein Rohdatenexport.

## Was NICHT im Modell steht

- Keine Stammdaten wie Verein, Geburtsdatum oder Geschlecht.
- Keine Saison, keine Wertung, keine Rekorde.
- Keine Wettkampf-Anmeldung oder Startgeld.
- Keine Benutzerkonten oder Berechtigungen.
- Keine Synchronisationsmetadaten wie `updatedAt` oder Konfliktversionen.

Neue Felder sollten additiv und optional sein, damit ältere Backups und Datenbestände weiter
laden. Ein Pflichtfeld ohne Normalisierung bricht sonst das Laden.

## Weiterlesen

- [Domänenreferenz](domain-referenz.md) — Funktionen, die diese Typen verändern
- [Architektur](architektur.md) — Zeitkern und Datenfluss
- [ADRs](../adr/) — Entscheidungen hinter Satz, Serie, Training und Wettkampf
