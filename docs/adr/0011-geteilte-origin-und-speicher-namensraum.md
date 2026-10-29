# Geteilte GitHub-Pages-Origin und Speicher-Namensraum

## Kontext

Die Live-App liegt unter `https://hemki96.github.io/StopWatch/`. GitHub Pages liefert alle
Projektseiten eines Accounts unter derselben **Origin** aus. Der Service-Worker-Scope ist zwar
pfadbegrenzt, aber IndexedDB und `localStorage` sind es nicht: Jedes JavaScript einer anderen
Projektseite unter `hemki96.github.io` kann `indexedDB.open('beckenrand')` aufrufen, alle Stores
lesen und über `BroadcastChannel('beckenrand.tabs')` Rollen beanspruchen. Die Aussage „Daten bleiben
auf diesem Gerät“ bleibt richtig, „nur diese App kann sie lesen“ aber nicht.

Die bisherigen Namen (`beckenrand`, `beckenrand.*`) waren nur eine Konvention. Ein anderes Projekt
konnte sie versehentlich oder absichtlich verwenden. Ein akuter Angriff ist nicht bekannt.

## Entscheidung

1. **Bedrohungsmodell dokumentieren.** Handbuch, Architektur und diese ADR nennen die geteilte
   Origin ausdrücklich. Namensräume werden nicht als Sicherheitsgrenze dargestellt.
2. **Persistente Daten namespacen.** Ein zentrales Modul `src/storage/namensraum.ts` leitet alle
   Namen aus der stabilen App-Kennung `beckenrand` ab:
   - IndexedDB: `beckenrand.v2`
   - `localStorage`: `beckenrand.v2.<logischer-schluessel>`
   - `BroadcastChannel`: bleibt `beckenrand.tabs`
   Die Kennung hängt bewusst **nicht** vom Auslieferungspfad ab: Ein Wechsel zwischen `/StopWatch/`,
   `/` oder einem Lesezeichen auf `index.html` darf keine zweite, scheinbar leere Datenbank öffnen.
   Der Kanal speichert keine Daten; sein bisheriger Name lässt einen noch offenen Tab der alten
   Version und die neue Version weiter koordinieren, statt gleichzeitig in zwei Datenbanken zu
   schreiben.
3. **Nicht destruktiv übernehmen.** Beim ersten Start mit leerer neuer Datenbank wird der Bestand
   aus `beckenrand` einmalig hineinkopiert. Die alte Datenbank bleibt unverändert. Ist die neue
   Datenbank bereits gefüllt, wird nichts überschrieben. Schlägt die Übernahme fehl, rollt die
   Transaktion zurück und die App arbeitet vorerst mit der alten Datenbank weiter, statt einen
   leeren Bestand zu zeigen.
4. **`localStorage` nur lesend übernehmen.** Neue Werte gehen immer in den namespaced Schlüssel.
   Fehlt er, wird der frühere Schlüssel (`beckenrand.<name>`) gelesen. Löschen entfernt beide
   Stellen, damit kein alter Wert zurückkehrt.
5. **Öffentliches Verhalten unverändert.** Backup-Format (`beckenrand-backup`), CSV-Dateinamen und
   alle Storage-Funktionen bleiben gleich.

## Alternativen

- **Eigene Domain/Origin sofort.** Das ist die einzige echte Isolationsgrenze und bleibt die
  empfohlene mittelfristige Lösung. Sie ist eine menschliche Entscheidung (DNS, Hosting,
  Zertifikat) und nicht Teil dieses Codes.
- **Nichts tun.** Billig, lässt aber die dokumentierte Lücke und Kollisionen mit anderen Projekten
  bestehen.
- **Namensraum aus dem Basispfad ableiten.** Trennt Deployments, ist aber instabil: Schon ein
  Lesezeichen auf `index.html` oder ein geänderter Basispfad würde eine andere Datenbank öffnen.
- **Sensible Felder verschlüsseln.** Sinnvoll als langfristige Ergänzung, ersetzt die Origin-Trennung
  nicht und ändert Backup und Schlüsselverwaltung.

## Folgen

- Bestehende Installationen behalten ihre Daten; die Übernahme läuft höchstens einmal und ist
  idempotent. Ein Merker im `localStorage` verhindert, dass sie nach „Alle Daten löschen“ erneut
  läuft. Die alte Datenbank bleibt als Sicherheitsnetz liegen und kann Speicher belegen.
- **Rollout:** Beim ersten Start der neuen Version sollten andere Beckenrand-Tabs geschlossen sein.
  Ein noch offener Tab der alten Version schreibt weiter in `beckenrand`; diese Änderungen werden
  nach der einmaligen Übernahme nicht automatisch nachgezogen. Der geteilte Kanal verhindert
  wenigstens, dass beide Versionen gleichzeitig messen.
- Ein Fehler bei der Übernahme ist sichtbar (Konsole, Weiterarbeit mit der alten Datenbank) und
  zerstört nichts.
- Der Namensraum erschwert versehentliche Kollisionen, schützt aber **nicht** vor fremdem
  JavaScript auf derselben Origin. Wer diesen Schutz braucht, muss die App unter einer eigenen
  Origin betreiben.
- Backups bleiben unverändert gültig, weil sie fachliche Datensätze und keine Speichernamen
  enthalten.
