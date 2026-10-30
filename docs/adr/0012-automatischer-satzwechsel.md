# Sätze können automatisch nacheinander starten

Ein **Training** kann seine **Trainingssätze** optional automatisch starten: Sobald der aktuelle
Satz vollständig im Ziel ist, legt die App den nächsten noch offenen Satz an und startet ihn. Das
ist eine Einstellung am Training (`autostart`) und standardmäßig für neue Trainings aktiv; ältere
Trainings bleiben beim bewussten Start des nächsten Satzes.

## Considered Options

- **Immer manuell starten**: Bewahrt die volle Kontrolle über die Pause, zwingt aber nach jedem Satz
  zum Wechsel in den Training-Tab. Für Einheiten mit kurzen Übergängen ist das unnötige Reibung.
- **Immer automatisch starten**: Nimmt dem Trainer die Kontrolle über die Pause und überrascht bei
  langen Sätzen oder einer unerwartet frühen Zielzeit.
- **Fester Timer im Hintergrund**: Würde im gedrosselten Browser unzuverlässig laufen und eine
  Pause erzwingen, die nicht im Plan steht. Die App berechnet Startzeiten deshalb weiterhin aus
  Zeitstempeln und startet nur auf einen auslösenden Zustandswechsel.
- **Opt-in pro Training (gewählt)**: Der Trainer entscheidet vor der Einheit, ob die Sätze
  durchlaufen sollen. Der automatische Wechsel greift nur beim Übergang „läuft → fertig“; ein
  bereits fertiger Satz beim Öffnen des Tabs startet nichts.

## Consequences

- `Training.autostart` ist optional. Fehlt das Feld, gilt `false` (ältere Trainings und Backups
  bleiben unverändert). `neuesTraining` setzt standardmäßig `true`.
- Der automatische Wechsel läuft im Timer: Nach dem letzten Ziel sucht die App über
  `trainingsFortschritt` und `naechsterSatz` den nächsten Satz und ruft `starteTrainingsSatz` auf.
- Ein bereits angelegter, aber noch nicht gestarteter Satz (`bereit`) wird ausgewählt und seine
  fehlenden Starts werden nachgeholt. Ein laufender Satz wird nur ausgewählt, nicht neu gestartet.
- Der vorige Satz bleibt in der Laufleiste und im Verlauf erreichbar; sein Ergebnis geht durch den
  Wechsel nicht verloren.
- Der Schalter „Sätze automatisch starten“ im Training ist die einzige Bedienstelle. Er wirkt nur
  auf noch nicht gestartete Sätze; gemessene Läufe bleiben unberührt.
- ADR 0007 bleibt für die Datenhaltung gültig. Die dort verworfene „automatisch zum nächsten Satz
  springen“-Variante wird durch diese optionale, ausdrücklich eingeschaltete Variante ersetzt.
