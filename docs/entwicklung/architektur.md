# Architektur

## Systemüberblick

Beckenrand ist eine **statische Single-Page-App**. Es gibt keinen Anwendungsserver, keine
Datenbank im Netz und keine Anmeldung. Der gesamte Zustand liegt im Browser:

```
┌────────────────────────────────────────────────────────────┐
│ Browser                                                    │
│                                                            │
│  React-Oberfläche  ──►  AppProvider (globaler Zustand)     │
│         │                       │                          │
│         │                       ├──► domain/  (reine Logik)│
│         │                       ├──► storage/ (IndexedDB)  │
│         │                       └──► export/  (CSV, Datei) │
│         │                                                  │
│  Service Worker (Cache) ◄── statische Dateien von GitHub   │
└────────────────────────────────────────────────────────────┘
```

Die App wird als statischer Build über GitHub Pages ausgeliefert. Der Service Worker cached die
Dateien für den Offline-Betrieb. Messdaten verlassen das Gerät nicht.

## Schichten und Abhängigkeiten

```
src/
  domain/      reine Fachlogik          keine Imports aus app/, ui/, storage/, export/
  export/      CSV und Dateiausgabe     nutzt domain/
  storage/     IndexedDB und Backup     nutzt domain/, kein React
  app/         React-Kontext, Fachmodule  nutzt domain/, storage/, export/
  ui/          Screens und Dialoge      nutzt app/, domain/, export/
  App.tsx      Navigation               nutzt app/ und ui/
```

Die wichtigste Regel: **`domain/` bleibt frei von React, DOM und Persistenz.** Zeit für Messungen
wird als Parameter übergeben. Die zweite Regel: **`ui/` importiert nichts aus `storage/`** —
Lesen, Prüfen und Typen laufen über `app/` (etwa `app/daten.ts`), Schreiben über die
Provider-Aktionen. ESLint prüft das mit `no-restricted-imports` in `src/ui/**`.
Die einzigen Zeit- und Zufallszugriffe sind `newId()` (mit
`crypto.randomUUID()` und einem Fallback) sowie `Date.now()` für Metadaten wie `erstelltAm`.
Dadurch laufen die Unit-Tests in einer Node-Umgebung ohne DOM.

`domain/` kennt auch keine Persistenz. Ein `Lauf` ist ein Wert, kein Objekt mit Methoden. Die
Speicherung kopiert diese Werte in IndexedDB.

## Der Zeitkern

### Zwei Uhren, zwei Zwecke

| Uhr | Verwendung | Warum |
| --- | --- | --- |
| `performance.now()` | Start und Anschläge, laufende Anzeige | monoton, unbeeinflusst von Systemzeit-Sprüngen |
| `Date.now()` | `startWallMs`, `erfasstAt`, Historie, Datum | vergleichbar zwischen Tabs und nach einem Reload |

Eine Messzeit ist immer eine Differenz aus zwei `performance.now()`-Werten. `Date.now()` liefert
nur den Anker für „wann war das?“ und die Sortierung im Verlauf. Die Begründung steht in
[ADR-0002](../adr/0002-zeitmessung-aus-zeitstempeln.md).

### Zustand wird berechnet

Es gibt keinen Zähler und keinen `setInterval`, der eine laufende Zeit fortschreibt. Beim Rendern
gilt:

```ts
status = laneStatusAt(bahn, now)
zeit   = status === 'geplant'
  ? bahn.startMs - now
  : now - bahn.startMs
```

`useNow(aktiv)` liefert `performance.now()` per `requestAnimationFrame`, aber nur solange
`brauchtTakt` wahr ist. Ohne laufende oder geplante Bahn gibt es keine Animationsschleife und keine
ständigen Renders.

### Ein Lauf besteht aus unabhängigen Bahnen

Ein `Lauf` ist keine Uhr mit vielen Zwischenzeiten, sondern eine Menge von `Bahn`-Werten. Jede Bahn
hat ihren eigenen `startMs`. „Start alle“ ist nur ein Schreibvorgang über alle Bahnen. Siehe
[ADR-0003](../adr/0003-lauf-aus-unabhaengigen-bahnen.md).

### Start, Reihen und Startversatz

```ts
// domain/lauf.ts
startAll(lauf, now, wallNow)
// Alle Bahnen einer Reihe starten gemeinsam:
// startMs = now + (reihe - 1) * startversatzMs
```

`planeLauf` setzt Startzeiten für eine unberührte Bahnfolge. Der Versatz staffelt **Reihen**, nicht
einzelne Bahnen; innerhalb einer Reihe starten alle mit demselben Zeitstempel. Der Versatz wird am
Lauf gespeichert, damit ein Neustart derselben Bahnen dieselbe Staffelung ergibt. Siehe
[ADR-0008](../adr/0008-reihen-als-startgruppen.md).

Eine Bahn mit `startMs > now` ist **geplant**. `tapLane` ignoriert Tipps, bis der Startzeitpunkt
erreicht ist. Der Countdown wird aus derselben Differenz gerendert, nicht aus einem Timer.

### Anschlag, Finish und Wettkampf

`tapLane` ist der zentrale Bedienschritt:

| Zustand | Aktion |
| --- | --- |
| `startMs === null` | Bahn starten |
| `now < startMs` | ignorieren |
| bereits Finish | ignorieren |
| `modus === 'wettkampf'` | `finishLane` — ein Tipp ist das Ziel |
| sonst | Anschlag anhängen; bei fester Strecke ist der letzte Anschlag das Finish |

`finishLane` beendet eine Bahn explizit. Das ist bei offener Strecke nötig und im Wettkampf immer
erlaubt. Bei fester Trainingsstrecke ergibt sich das Finish aus der Längenanzahl.

Ein `Anschlag` speichert:

```ts
{
  laengeNr,      // 1-basiert
  splitMs,       // kumuliert ab Start der Bahn
  erfasstAt,     // Date.now für Undo und Sortierung
  istFinish,
  manuell?       // nach Korrektur
}
```

Splits sind **kumulativ**. Eine Korrektur ändert genau einen Wert; sie verschiebt keine folgenden
Werte. `pruefeAnschlagKorrektur` stellt sicher, dass die Reihenfolge erhalten bleibt.

### Serien ohne Timer

Eine Serie plant **alle** Wiederholungen beim Start voraus. Für Runde `k`, Bahn `i`:

```
start = t0 + (k - 1) * takt + (i - 1) * startversatz
```

Es gibt keinen `setTimeout`, der eine Runde „nachholt“. Überlappende Runden sind erlaubt: Ein Tipp
schließt die älteste offene Runde. Ein zweiter Tipp auf derselben Zeile innerhalb von 300 ms wird
als Doppeltipp verworfen (`tippeSerie`/`beendeSerie` in `src/app/laufAktionen.ts`), damit nicht die
nächste, bereits laufende Runde mitgeschlossen wird. Die Sperre gilt je Serie, Bahnindex und Art
(Tap oder Ziel), also nicht für eine andere Bahn; nach dem Fenster schließt der nächste Tipp die
nächste Runde. Die Serien-Ansicht verdichtet die Läufe zu einer Zeile pro Bahn. Siehe
[ADR-0005](../adr/0005-serie-mit-festem-takt.md).

### Reload

`performance.now()` ist nach einem Reload wertlos. `normalizeOnLoad` in `src/storage/repository.ts`
setzt deshalb jede Bahn mit `startMs !== null` und ohne Finish auf `startMs: null` zurück. Bereits
erfasste Anschläge bleiben. Eine Serie kann unberührte Runden mit `Weiter` neu planen; bei einem
einzelnen Lauf erscheint „Weiter“, sobald einzelne Bahnen noch auf ihren Start warten.

Eine Bahn mit Anschlägen, aber ohne Startzeit ist **unterbrochen**. Sie wird nicht neu gestartet,
weil der neue Start sonst einen Split vor den bereits erfassten legen würde. Langes Drücken nimmt
die Anschläge schrittweise zurück; danach ist die Bahn wieder startbar.

### Tab-Übergabe

Anders als ein Reload ist die Übergabe an einen anderen Tab: Die Messung läuft weiter. Der neue Tab
lädt mit `behalteLaufende: true` und verschiebt jede gestartete Bahn über `rebaseLauf` auf seine
eigene monotone Uhr. Grundlage ist der Wanduhr-Anker `startWallMs`; Einzelheiten und Alternativen
stehen in [ADR-0010](../adr/0010-zeitbasis-bei-tab-uebergabe.md).

## Globaler Zustand

`AppProvider` hält den gesamten fachlichen Zustand:

```ts
schwimmer, satze, laeufe, wettkampfe, trainings
```

Zusätzlich:

- `einstellungen` (localStorage),
- `themeEinstellung` (localStorage),
- `aktiveIds` (Liste der aktiven Läufe, localStorage),
- `aktiverLaufId` (aktuell sichtbarer Lauf),
- `toast`, `speicherFehler`, `tabRolle`.

### Fachmodule

Der Provider ist Kontext-Assembly, Tab-Rolle, Laden und Toast. Die Fachlogik liegt
in kleinen Modulen unter `src/app/`:

| Modul | Verantwortung |
| --- | --- |
| `einstellungen.ts` | Vorbelegung lesen, begrenzen, schreiben |
| `theme.ts` | Designwahl lesen und schreiben, Systemauflösung, DOM- und Browser-Chrome-Spiegelung (`useTheme`) |
| `daten.ts` | Backup erzeugen und prüfen, Speicherschutz lesen und anfordern (Fassade zu `storage/`) |
| `aktiveLaeufe.ts` | Leiste, Migration der Einzel-ID, Bereinigung und abgeleitete Anzeige |
| `schreibpfad.ts` | Tab-Tor, Warteschlange offener Schreibvorgänge, Wiederholung, Fehlerbanner (`useSchreibpfad`) |
| `laufAktionen.ts` | Messen, Anlegen, Auswählen und Löschen von Läufen und Serien |
| `wettkampfAktionen.ts` | Meldeliste, Disziplinen, Heats und Löschen von Wettkämpfen |
| `trainingsAktionen.ts` | Trainingspläne speichern und Sätze starten |
| `schwimmerAktionen.ts` | Schwimmer anlegen, ändern, löschen und Verweise räumen |
| `schwimmer.ts` | Namensauflösung aus Meldelisten, stabile Sortierung |

Die Aktionsmodule sind Fabriken: Sie bekommen die Ref-Spiegel und die
`set...Safe`-Funktionen des Providers und geben stabile Aktionen zurück. So bleibt
die Tab-Rolle an einer Stelle geprüft, und die Module importieren nichts aus `ui/`.

### Refs als aktuelle Sicht

Callbacks wie `tippe`, `startAlle` oder `speichereTraining` lesen den neuesten Zustand aus Refs
(`laeufeRef`, `satzeRef`, …), nicht aus dem Render-Closure. Das verhindert, dass ein schneller
Doppeltipp auf einer veralteten Kopie arbeitet. Nach jeder Änderung werden Ref und React-State
gemeinsam aktualisiert. Die Aktionsmodule bekommen dieselben Refs und Setter von `AppProvider`
übergeben; sie halten keinen eigenen Zustand.

### Optimistische Oberfläche

Der Ablauf einer Bedienung ist:

1. Domain-Funktion berechnet den neuen Wert.
2. React-State wird sofort aktualisiert.
3. Die Persistenz läuft asynchron (`saveLauf`, `saveSatz`, …).
4. Schreibvorgänge werden im Schreibpfad (`useSchreibpfad`) verfolgt.
5. Vorübergehende Fehler werden mit kurzem Backoff erneut versucht. Erst ein dauerhafter
   Fehler oder der letzte Versuch setzt `speicherFehler` und zeigt das Banner; ein späterer
   erfolgreicher Schreibvorgang nimmt es zurück.

Die Oberfläche wartet nicht auf IndexedDB. Das ist am Beckenrand wichtig: Ein Tap muss sofort
sichtbar werden. Die Kehrseite ist, dass ein Speicherfehler erst kurz danach auffällt — deshalb das
Banner.

### Aktive Läufe

`aktiveIds` ist eine Liste von **Anker-Läufen**:

- Ein einzelner Lauf ist sein eigener Anker.
- Eine Serie erscheint als ein Eintrag; Anker ist die erste Wiederholung.
- Wettkampf-Läufe sind nie in der Liste.
- `bereinigeAktiveIds` entfernt verwaiste und vollständig beendete Einträge.
- Gibt es keinen gültigen Eintrag, wählt `ladeDaten` den jüngsten unvollständigen
  Nicht-Wettkampf-Lauf.

### Abgeleitete Werte

| Wert | Berechnung |
| --- | --- |
| `aktiverSatz` | Satz zum aktiven Lauf |
| `aktiveRunden` | alle Läufe des aktiven Seriensatzes |
| `aktiveEintraege` | ein Eintrag pro Lauf oder Serie |
| `brauchtTakt` | irgendeine aktive Bahn läuft/plant, inkl. Wettkampf |
| `tabGesperrt` | Tab-Koordinator meldet eine andere Rolle als `aktiv` |

Es gibt keinen separaten „Lauf-Status“, der gespeichert wird. Alles ergibt sich aus Bahnen,
Anschlägen und Zeit.

## Tab-Koordination

Genau ein Tab darf schreiben. Das Protokoll in `src/app/tabKoordinator.ts` nutzt
`BroadcastChannel`:

| Nachricht | Bedeutung |
| --- | --- |
| `claim` | „Ich möchte die Messung halten“ |
| `held` | „Ich halte sie“ (mit Ziel-Tab) |
| `heartbeat` | „Ich lebe noch“ |
| `release` | „Ich gebe frei“ |
| `takeover` | „Übergib mir auf Wunsch“ |
| `yield` | „Ich habe übergeben“ |

Zeiten:

- Claim-Fenster: **300 ms**
- Heartbeat: alle **1,5 s**
- Ausfall nach **4 s** ohne Lebenszeichen
- Takeover-Timeout: **600 ms**, danach eigener Claim

Bei gleichzeitigem Start gewinnt die **kleinere Tab-ID** (String-Vergleich). Ein aktiver Tab, der
ein `takeover` erhält, wird sofort lesend, schließt das Schreibtor und wartet, bis keine offenen
Schreibvorgänge mehr übrig sind (`warteAufOffene`); erst dann sendet er `yield`. Das
Schließen vor dem Warten verhindert, dass ein Tap während der Übergabe noch einen Schreibvorgang
startet, den der neue Tab nicht mehr sieht. Der neue Tab rechnet laufende Startzeiten anschließend
auf seine eigene Uhr um (siehe oben).

Ohne `BroadcastChannel` wird der Tab sofort aktiv. Die App bleibt bedienbar, verliert aber den
Schutz gegen zwei schreibende Tabs.

## PWA und Lebenszyklus

### Service Worker

`vite-plugin-pwa` erzeugt den Service Worker. Die Konfiguration in `vite.config.ts`:

- `registerType: 'prompt'` — kein automatisches Neuladen mitten im Lauf.
- `injectRegister: null` — Registrierung erfolgt in `src/app/pwa.ts`.
- `clientsClaim: true` — der erste Besuch wird sofort kontrolliert, damit ein Neuladen ohne Server
  aus dem Cache funktioniert.
- `navigateFallback: 'index.html'`.
- `globPatterns: ['**/*.{js,css,html,png,svg,woff2}']`.

`useServiceWorkerUpdate` registriert den Worker einmalig, meldet `onNeedRefresh` und sucht beim
Zurückkehren in den Vordergrund aktiv nach einer neuen Version. Der Ladehinweis bleibt deaktiviert,
solange `brauchtTakt` wahr ist.

### Boot und Theme

`index.html` setzt das Theme **vor dem ersten Paint** per Inline-Skript. Im hellen Design deckt ein
Layer in der Splash-Farbe den ersten Frame ab und blendet weich über. Das verhindert den harten
Farbblitz zwischen dunklem Splash und heller App. Siehe
[ADR-0004](../adr/0004-splash-farbe-und-designwechsel.md).

### Installation

`useInstallPrompt` verarbeitet `beforeinstallprompt`, `appinstalled` und
`display-mode: standalone`. Für iOS und iPadOS gibt es keine Prompt-API; dort zeigt die App eine
Anleitung. `istAppleMobil` erkennt auch das iPad, das sich als Mac ausgibt.

### Offline-Anzeige

`useOnlineStatus` hört auf `online`/`offline` und zeigt einen Hinweis. Die Messung funktioniert
offline weiter, weil alle Daten lokal liegen.

## Oberfläche

`App.tsx` hält den aktiven Tab als lokalen State. Die sechs Bereiche sind fest verdrahtet:

```
Timer | Training | Wettkampf | Verlauf | Schwimmer | Mehr
```

Jeder Screen verwaltet seinen lokalen UI-Zustand (offene Sheets, Auswahl, Dialoge) selbst. Nur
fachliche Daten und Aktionen liegen im `AppProvider`.

Gemeinsame Bausteine:

- `Dialog` — Fokusfalle, Scroll-Sperre, Escape, History-Eintrag für die Zurück-Geste, Fokus-Rückgabe.
- `Sheet` — Bottom Sheet auf Basis von `Dialog`, mit Zieh-Geste.
- `Bestaetigung` — `alertdialog` für destruktive Aktionen, initialer Fokus auf „Abbrechen“.
- `LaneTile`, `SerieAnsicht`, `WettkampfLane` — die drei Messoberflächen.

Details: [Oberfläche](oberflaeche.md).

## Fehlerbehandlung

| Fehler | Reaktion |
| --- | --- |
| Render-Ausnahme | `ErrorBoundary` zeigt „Etwas ist schiefgelaufen“ und einen Neuladen-Knopf |
| IndexedDB-Lesen/Schreiben scheitert | dauerhaftes rotes `SpeicherBanner` |
| Service-Worker-Registrierung scheitert | Konsolenfehler; App bleibt online nutzbar |
| `BroadcastChannel` nicht verfügbar | Tab wird sofort aktiv |
| `localStorage` wirft (privater Modus) | App läuft ohne gemerkte Auswahl weiter |
| Ungültiges Backup | Meldung mit Pfad; nichts wird geschrieben |
| Backup-Konflikt (gleiche ID, abweichender Inhalt) | Vorschau nennt Zahl und Art; ohne ausdrückliche Entscheidung bleibt der lokale Stand |
| Übernahme aus alter Datenbank scheitert | Konsolenwarnung; App arbeitet mit `beckenrand` weiter, nächster Start versucht es erneut |
| Ungültige Konfiguration | Domain-Funktion gibt den alten Lauf zurück; UI zeigt den Fehler |

## Performance

- Kein Render-Loop ohne aktive Bahn.
- Zeitstrings werden beim Rendern berechnet; es gibt keine gespeicherten Anzeigewerte.
- Serien mit 20 Runden und 10 Bahnen erzeugen 200 Läufe, aber nur eine Zeile pro Bahn in der
  Ansicht.
- Der Verlauf rendert nur Gruppen mit begonnenen Läufen.
- CSV und Backup arbeiten auf den vorhandenen Arrays; es gibt keine Streaming-Pipeline.

## Sicherheit und Datenschutz

- Keine Netzwerkaufrufe mit Messdaten.
- Kein `dangerouslySetInnerHTML`; Namen werden als Text gerendert.
- Eine Content-Security-Policy im gebauten `index.html` begrenzt die Folgen einer XSS-Lücke:
  Skripte nur von der eigenen Origin (plus Hash des Theme-Boots), Netzwerk nur zur eigenen
  Origin. Der Dev-Server bleibt davon ausgenommen. Siehe
  [Bauen und Veröffentlichen](bauen-und-veroeffentlichen.md#content-security-policy).
- CSV schützt vor Formel-Injection durch ein führendes Apostroph.
- Das Backup wird vollständig validiert und in einer Transaktion geschrieben. Kollidierende IDs
  werden dabei erkannt; ohne ausdrückliche Ersetzen-Entscheidung bleibt der lokale Stand.
- Lokale Daten sind nicht verschlüsselt. Wer Gerätezugriff hat, hat Datenzugriff.

### Geteilte GitHub-Pages-Origin

GitHub Pages liefert alle Projektseiten eines Accounts unter derselben **Origin** aus, z. B.
`https://hemki96.github.io`. IndexedDB und `localStorage` sind originweit und **nicht** durch den
Pfad `/StopWatch/` getrennt; der Service-Worker-Scope schon. Anderes JavaScript auf derselben Origin
könnte die Datenbank also öffnen und lesen.

Deshalb tragen alle persistenten Namen einen Speicher-Namensraum aus
`src/storage/namensraum.ts`:

| Zweck | Name |
| --- | --- |
| IndexedDB | `beckenrand.v2` |
| `localStorage` | `beckenrand.v2.<schlüssel>` |
| `BroadcastChannel` | `beckenrand.tabs` (bewusst ohne neuen Namensraum) |

Der Kanal speichert keine Daten. Sein bisheriger Name lässt einen noch offenen Tab der alten
App-Version und die neue Version weiter koordinieren, statt gleichzeitig in zwei getrennte
Datenbanken zu schreiben.

Der Namensraum verhindert versehentliche Kollisionen mit anderen Projekten, ist aber **keine
Sicherheitsgrenze**. Diese schafft nur eine eigene Origin (eigene Domain). Siehe
[ADR-0011](../adr/0011-geteilte-origin-und-speicher-namensraum.md).

Die Übernahme aus der früheren Datenbank `beckenrand` ist nicht destruktiv: Sie läuft nur, wenn die
neue Datenbank leer ist, kopiert in einer Transaktion und lässt die alte Datenbank unverändert.
Schlägt sie fehl, arbeitet die App mit der alten Datenbank weiter. `localStorage` liest den früheren
Schlüssel als Rückfall und schreibt immer den neuen; Löschen entfernt beide.

## Bewusste Grenzen

| Grenze | Grund |
| --- | --- |
| Kein Hintergrundbetrieb mit Eingaben | Plattformgrenze der PWA; siehe [ADR-0001](../adr/0001-pwa-statt-native.md) |
| Kein Sync | kein Konto, keine Cloud, keine Konfliktauflösung |
| Ein schreibender Tab | verhindert doppelte Anschläge |
| Keine Splits im Wettkampf | ein Tap pro Bahn ist am Beckenrand robuster |
| Gestartete Trainingssätze sind fest | gemessene Zeiten dürfen nicht umgeschrieben werden |
| Kein Fortsetzen nach Reload | `performance.now()` ist seitenspezifisch; eine Tab-Übergabe wird dagegen umgerechnet (ADR-0010) |
| Maximal 10 Bahnen je Reihe, 5 Reihen, 20 Runden, 20 Sätze | lesbare Oberfläche und beherrschbare Datenmengen |

## Weiterlesen

- [Datenmodell](datenmodell.md)
- [Domänenreferenz](domain-referenz.md)
- [Testen](testen.md)
- [ADRs](../adr/)
