# Beitragen

Dieses Kapitel beschreibt, wie Änderungen im Repository aussehen sollen. Es ergänzt die
[Definition of Done](README.md#definition-of-done) um konkrete Regeln und typische Fallen.

## Arbeitsweise

### 1. Issue oder klares Ziel

Für größere Änderungen zuerst ein Issue im Repository anlegen:

```bash
gh issue create --title "Titel" --body "..."
```

Die Triage-Labels stehen in [`docs/agents/triage-labels.md`](../agents/triage-labels.md):
`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.

Ein kleiner Bugfix oder eine reine Dokumentationskorrektur braucht kein Issue. Bei einer Änderung,
die eine bestehende ADR infrage stellt, das im PR ausdrücklich sagen.

### 2. Klein und nachvollziehbar committen

Der Verlauf nutzt Bereichspräfixe, keine strikte Conventional-Commits-Syntax:

```
PWA: Service Worker übernimmt den ersten Besuch sofort
e2e: auf persistierte Schwimmerzuordnung warten
Oberfläche: Onboarding, Dialoge und Bestzeiten
Messung: Tabs, Korrekturen und ruhiger Long-Press
Dokumentation: Glossar und Architekturentscheidungen
```

Muster: **Bereich: was und warum**, deutsch, kein Punkt am Ende. Ein Commit sollte für sich
verständlich sein.

### 3. Reihenfolge der Änderung

1. **Domain** — Typen und reine Funktionen, mit Tests.
2. **Persistenz** — Normalisierung, Backup, Schema, falls nötig.
3. **Provider** — Aktion und Zustand.
4. **Oberfläche** — Screen, Sheet, Dialog.
5. **E2E** — der sichtbare Ablauf.
6. **Dokumentation** — Handbuch, Glossar, ADR.

Diese Reihenfolge hält die Tests schnell und verhindert, dass UI-Verhalten die Fachlogik definiert.

## Stil

Der Code folgt dem vorhandenen Stil:

- 2 Leerzeichen Einrückung,
- einfache Anführungszeichen,
- **keine Semikolons** am Zeilenende,
- trailing commas in mehrzeiligen Literalen und Parameterlisten,
- `const`/`let`, kein `var`,
- benannte Exporte, keine Default-Exporte außer `App`,
- keine `any`, kein `@ts-ignore`, kein `as unknown as` ohne guten Grund.

TypeScript ist strikt:

- `strict: true`
- `noUnusedLocals`, `noUnusedParameters`
- `noUncheckedIndexedAccess` — Array-Zugriffe sind `T | undefined`
- `verbatimModuleSyntax` — Typimporte mit `import type`

Bei `noUncheckedIndexedAccess` nicht pauschal `!` setzen. Erst prüfen, dann zugreifen; oder eine
Hilfsvariable mit Guard verwenden.

## Sprache

- **UI, Tests und Dokumentation:** Deutsch.
- **Domänenbegriffe:** exakt nach [`GLOSSARY.md`](../../GLOSSARY.md).
- **Funktionsnamen:** dem Modul folgen. `createLauf`, `startAll`, `tapLane` sind englisch;
  `pruefeTraining`, `berechnePbs`, `beschreibeTrainingsSatz` sind deutsch. Neue Namen sollen sich
  nicht gegen die Nachbarschaft stellen.
- **Fehlermeldungen:** deutsch, konkret, mit erwartetem Bereich.
- **Kommentare:** erklären das Warum, nicht das Was. Keine ausgekommentierten Codeblöcke.

Beispiele für Begriffe:

| Richtig | Falsch |
| --- | --- |
| Lauf | Session, Run |
| Bahn | Lane, Timer |
| Anschlag | Touch |
| Split | Zwischenzeit (im Fließtext erklärend erlaubt) |
| Satz | Set |
| Serie | Intervall, Kurs |
| Training | Workout, Einheit |
| Wettkampf | Meet, Event |
| Disziplin | Bewerb |
| Meldeliste | Startliste (als Erklärung erlaubt) |

## Zeit und Zustand

### Zeit niemals intern lesen

Die Messlogik bekommt `now` und `wallNow` als Parameter:

```ts
// richtig
export function startAll(lauf: Lauf, now: number, wallNow: number): Lauf

// falsch
export function startAll(lauf: Lauf): Lauf {
  const now = performance.now()
  // ...
}
```

`Date.now()` ist nur für Metadaten erlaubt (`erstelltAm`, `erfasstAt`, `startWallMs`) und für
Erzeuger, die keine Messung berechnen. `performance.now()` gehört in die UI-Schicht oder in den
Aufrufer.

### Keine Timer für Runden

Eine Serie plant alle Startzeiten voraus. Ein `setTimeout`, `setInterval` oder
`requestAnimationFrame`, das eine Runde „startet“, ist falsch: Im Hintergrund wird er gedrosselt,
und die Startzeit wäre nicht reproduzierbar.

### Zustand ableiten

Kein gespeichertes `status`-Feld, das neben den Daten gepflegt wird. Der Status ergibt sich aus
`startMs`, `anschlaege`, `istFinish` und `now`. Alles andere läuft früher oder später aus dem Takt.

### Kein Mutieren

Domain-Funktionen geben neue Objekte zurück:

```ts
return { ...lauf, bahnen: lauf.bahnen.map(...) }
```

Wenn nichts passiert, **dasselbe** Objekt zurückgeben. Der Provider prüft `naechster === aktuell`
und spart das Speichern.

### Tab-Rolle prüfen

Jede schreibende Aktion im Provider beginnt mit:

```ts
if (!tabAktivRef.current) return
```

Ohne diese Prüfung kann ein lesender Tab Daten überschreiben.

## Persistenz und Kompatibilität

### Neue Felder

Neue Felder sollen **optional** sein oder in `normalizeOnLoad` einen Default bekommen. Sonst
scheitert das Laden älterer Datenbestände.

### Backup-Schema

Ändert sich das Backup-Schema:

1. `BACKUP_VERSION` erhöhen,
2. die neue Version in `BACKUP_VERSIONEN` aufnehmen,
3. ältere Versionen weiterhin lesen,
4. `pruefeBackup` um die neuen Regeln erweitern,
5. Tests für alt und neu schreiben,
6. `docs/handbuch/07-daten-und-backup.md` und `docs/entwicklung/datenmodell.md` aktualisieren.

Ein Feld ohne Versionierung ist ein stiller Bruch für bestehende Backups.

### IndexedDB

Ein neuer Store oder Index braucht:

- eine Erhöhung von `DB_VERSION`,
- einen `if (alteVersion < n)`-Block im `upgrade`,
- eine Normalisierung in `repository.ts`,
- einen Eintrag in `loadAll`, `clearAll`, `exportBackup`, `importBackup`,
- Tests mit `fake-indexeddb`.

### Löschen

Beim Löschen einer Entität die Referenzen mitdenken:

- Schwimmer löschen → Bahnen, Trainings und Einstellungen entkoppeln.
- Satz löschen → Läufe mitlöschen; Trainingsverweis darf verwaisen.
- Wettkampf löschen → Disziplinen und Läufe mitlöschen.

## Oberfläche

### Dialoge

Immer `Dialog` oder `Sheet` verwenden. Kein eigenes `position: fixed`, keine eigene Fokusfalle,
kein eigener Scroll-Lock.

### Labels

Jede interaktive Fläche braucht einen verständlichen Namen:

```tsx
<button aria-label={`Zeit für ${name ?? `Bahn ${nummer}`} eingeben`}>
```

Die E2E-Tests hängen an diesen Labels. Ein Label zu ändern ist eine bewusste Änderung an Test und
Dokumentation.

### Touch und Tastatur

- Touchziel mindestens 40–44 px, primäre Aktion 56–80 px.
- `touch-action: pan-y` für scrollbare Messflächen.
- Enter/Leertaste auf Messflächen.
- Eingebettete Knöpfe stoppen die Propagation.
- Safe-Area unten beachten.
- Farbe nie als einziges StatusSignal.

### Reduced Motion

Neue Animationen müssen bei `prefers-reduced-motion` abschaltbar sein. Der Long-Press-Balken ist
das Vorbild: Text bleibt, Animation entfällt.

## Tests

### Domain

Jede neue Regel bekommt einen Test in der gleichnamigen Datei. Prüfe:

- den Normalfall,
- die Grenze (0, Maximum, negativ),
- den No-Op-Fall,
- die Fehlermeldung, wenn sie für die UI relevant ist.

### E2E

Ein E2E-Test gehört zu jedem neuen sichtbaren Ablauf. Verwende:

- `oeffneApp` für den Start,
- Rollen und Labels,
- `warteAuf…`-Helfer statt fester Wartezeiten,
- keine Implementierungsdetails.

### Was ein Test nicht tun soll

- echte Netzwerkabhängigkeiten,
- echte Zeit ohne Kontrolle,
- mehrere voneinander abhängige Tests,
- Farben oder Pixel prüfen,
- `page.waitForTimeout` als Ersatz für eine Bedingung.

## Dokumentation

### Handbuch

Änderst du ein Label, einen Ablauf, eine Grenze oder eine Fehlermeldung, die im Handbuch steht,
aktualisiere die betroffene Seite. Die Handbuchseiten sind nach Aufgaben sortiert, nicht nach
Screens.

### Glossar

Ein neuer Domänenbegriff gehört in `GLOSSARY.md`, bevor er im Code auftaucht. Kein Begriff ohne
Definition, keine zwei Wörter für dieselbe Sache.

### ADR

Eine ADR ist sinnvoll, wenn:

- eine bewusste Alternative verworfen wird,
- eine Grenze überraschend ist,
- eine Entscheidung später schwer rückgängig zu machen ist,
- ein Datenformat oder eine Architekturgrenze betroffen ist.

Format: kurzer Titel, Kontext, Entscheidung, Alternativen, Folgen. Beispiele:
[`docs/adr/`](../adr/).

## Typische Fallen

| Falle | Besser |
| --- | --- |
| `Date.now()` in der Messlogik | `now`/`wallNow` übergeben |
| `setTimeout` für die nächste Serienrunde | alle Startzeiten vorausberechnen |
| `status` zusätzlich speichern | aus Bahnen und `now` ableiten |
| Array in place sortieren | kopieren und sortieren |
| Ein Feld speichern, aber nicht normalisieren | `normalizeOnLoad` ergänzen |
| Backup-Feld ohne Versionssprung | Version erhöhen und alte lesen |
| Schreibende Aktion ohne Tab-Prüfung | `tabAktivRef` prüfen |
| Eigenes Modal bauen | `Dialog`/`Sheet` |
| `any` oder `!` als Abkürzung | Guard oder Hilfsvariable |
| Nur Farbe als Status | Text, Badge, ARIA |
| E2E mit CSS-Klasse | Rolle und Label |
| Dokumentation vergessen | gleicher PR wie der Code |

## Pull Request

Ein PR sollte enthalten:

- eine kurze Beschreibung des Problems und der Lösung,
- die betroffenen Bereiche,
- wie getestet wurde (`npm run verify`, `npm run test:e2e`),
- Screenshots oder eine kurze Beschreibung bei UI-Änderungen,
- Hinweise auf Schema-, Backup- oder ADR-Änderungen,
- Aktualisierungen von Handbuch, Glossar und ADR.

### Checkliste

- [ ] `npm run verify` grün
- [ ] `npm run test:e2e` grün
- [ ] Neue Domain-Regel getestet
- [ ] Sichtbarer Ablauf in E2E
- [ ] Keine `any`/`@ts-ignore`
- [ ] Keine neuen Timer für Messlogik
- [ ] Tab-Rolle bei Schreibaktionen geprüft
- [ ] Persistenz und Normalisierung ergänzt
- [ ] Backup-Kompatibilität bedacht
- [ ] Handbuch aktualisiert
- [ ] Glossar bei neuen Begriffen
- [ ] ADR bei bewusster Entscheidung
- [ ] Keine Debug-Ausgaben oder `.scratch`-Dateien im Commit

## Abhängigkeiten

Die App hat nur zwei Laufzeitabhängigkeiten: `react`, `react-dom` und `idb`. Neue Laufzeitpakete
sind eine bewusste Entscheidung:

- Ist die Funktion klein genug für eigenes Modul?
- Braucht sie wirklich Laufzeitcode, oder reicht ein Build-Werkzeug?
- Wie groß ist der Einfluss auf den Offline-Cache?
- Ist die Lizenz kompatibel?
- Wird sie gepflegt?

Für Test- und Build-Werkzeuge ist die Hürde niedriger, aber auch dort gilt: nicht mehrere Pakete
für dieselbe Aufgabe.

## Weiterlesen

- [Architektur](architektur.md)
- [Datenmodell](datenmodell.md)
- [Testen](testen.md)
- [Bauen und Veröffentlichen](bauen-und-veroeffentlichen.md)
- [`AGENTS.md`](../../AGENTS.md)
