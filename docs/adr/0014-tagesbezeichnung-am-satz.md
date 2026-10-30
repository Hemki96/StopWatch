# Die Tagesbezeichnung liegt an den Sätzen des Tages

Im **Verlauf** lässt sich ein Trainingstag benennen, z. B. „Kader A“. Der Name erscheint an der
Tagesüberschrift und in der Analyse. Ein Tag ist im Datenmodell kein eigenes Objekt: Er ist die
Menge der **Sätze** mit demselben `datum`. Deshalb liegt der Name als optionales Feld
`tagesbezeichnung` an jedem Satz dieses Datums.

## Considered Options

- **Eigener `Tag`-Store mit `datum` und `bezeichnung`**: Sauber normalisiert, aber ein fünfter
  Store, eine neue Datenbankversion, ein neues Backup-Format und eigene Konfliktbehandlung im
  Import. Der Nutzen steht für ein einzelnes Textfeld in keinem Verhältnis zum Risiko.
- **Tagesname in den Einstellungen oder im `localStorage`**: Kein Schema, aber der Name wäre nicht
  Teil des Backups und ginge bei einem Gerätewechsel oder einer Wiederherstellung verloren.
- **Feld an `Trainings`**: Deckt nur gemessene Sätze ab, die aus einem Trainingsplan stammen.
  Freie Läufe aus dem Timer haben kein Training, brauchen aber ebenfalls einen Tagesnamen.
- **Optionales Feld an jedem Satz (gewählt)**: Nutzt den bestehenden Satz-Store, das vorhandene
  Backup und die Konfliktprüfung. Ältere Backups ohne das Feld bleiben lesbar.

## Consequences

- `Satz.tagesbezeichnung` ist optional. Fehlt der Wert, hat der Tag keinen Namen. Ein leerer Wert
  entfernt den Namen.
- `setzeTagesnamen` schreibt den getrimmten Namen auf **alle** Sätze des Datums. `tagesnamen` liest
  beim Anzeigen den ersten nicht-leeren Wert. Ein später angelegter Satz ohne Feld erbt den Namen
  damit weiterhin.
- Der Name wird mit den Sätzen exportiert, importiert und bei Konflikten wie jeder andere
  Satzinhalt verglichen. Es gibt keine zusätzliche Migration und keine neue Datenbankversion.
- Wird der letzte Satz eines Tages gelöscht, verschwindet mit ihm der Tagesname. Das ist
  beabsichtigt: Ohne Messungen gibt es im Verlauf keinen Tag, der benannt werden müsste.
- Die Oberfläche bietet die Bearbeitung im Verlauf an; die Analyse zeigt den Namen nur lesend.
