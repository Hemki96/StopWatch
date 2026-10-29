# Bewegung

## Prinzip

Bewegung ist **Rückmeldung**, nicht Atmosphäre. Sie zeigt, dass ein Tipp angekommen ist, dass ein
Sheet schließt oder dass ein Wert sich geändert hat. Sie erklärt nie, was die Oberfläche ohnehin
sagt, und sie läuft nie dauerhaft.

Drei Regeln:

1. **Unter 200 ms.** Alles außer dem bewussten 450-ms-Long-Press ist nach 200 ms vorbei.
2. **Nur `transform` und `opacity`.** Keine Animation von `width`, `height`, `top`, `left` oder
   `box-shadow`; das ruckelt auf kleinen Geräten und kostet Layout.
3. **Die Zahl bewegt sich nie.** Eine tickende Zeit wird ersetzt, nicht animiert. Kein Zählen,
   kein Rollen, kein Einblenden pro Hundertstel.

## Tokens

| Token | Wert | Verwendung |
| --- | --- | --- |
| `duration-press` | 75 ms | Knopf-/Kachel-Pressed |
| `duration-state` | 120 ms | Farbe, Rahmen, Statuswechsel |
| `duration-overlay-in` | 180 ms | Sheet, Backdrop |
| `duration-overlay-out` | 150 ms | Sheet schließen, zurückfedern |
| `duration-dialog-in` | 120 ms | Dialog |
| `duration-dialog-out` | 100 ms | Dialog schließen |
| `duration-toast` | 160 ms | Toast ein/aus |
| `duration-progress` | 300 ms | Fortschrittsbalken bei echter Änderung |
| `duration-longpress` | 450 ms | Undo-Geste, linear |
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Einblenden, Zustandswechsel |
| `ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Ausblenden |
| `ease-linear` | `linear` | nur Long-Press-Balken |

## Bewegungsinventar

| Element | Auslöser | Eigenschaft | Dauer | Easing | Reduzierte Bewegung |
| --- | --- | --- | --- | --- | --- |
| Primärknopf | Press | Hintergrund dunkler | 75 ms | standard | sofort |
| Bahn-Kachel | Press | Fläche 80 %, Helligkeit +5 % | 75 ms | standard | sofort |
| Chip | Auswahl | Fläche/Rahmen | 120 ms | standard | sofort |
| Tab | Wechsel | Textfarbe, Fläche | 120 ms | standard | sofort |
| Statuswechsel Kachel | Zustand | Rahmen, Fläche | 120 ms | standard | sofort |
| Fortschrittssegment | Anschlag | Breite/Füllung | 300 ms | standard | sofort |
| Sheet | Öffnen | `translateY(100%) → 0`, Backdrop 0 → 0.6 | 180 ms | standard | sofort |
| Sheet | Schließen | `translateY(0) → 100%`, Backdrop aus | 150 ms | exit | sofort |
| Sheet | Ziehen | `translateY` folgt Finger | 1:1 | keine | 1:1 |
| Sheet | Zurückfedern | `translateY → 0` | 150 ms | standard | sofort |
| Dialog | Öffnen | Opacity 0 → 1, Scale 0.98 → 1 | 120 ms | standard | sofort |
| Dialog | Schließen | Opacity 1 → 0 | 100 ms | exit | sofort |
| Toast | Ein | Opacity 0 → 1, 8 px nach oben | 160 ms | standard | sofort |
| Toast | Aus | Opacity 1 → 0 | 120 ms | exit | sofort |
| Long-Press | 450 ms halten | Balken 0 → 100 % | 450 ms | linear | Balken entfällt, Text bleibt |
| Fokusring | Tastatur | keiner | 0 ms | — | 0 ms |

### Nicht bewegt

- Messzeiten, Splits, Deltas, Badges.
- Der laufende Status (kein Pulsieren, kein Blinken).
- Die Display-Sperre-Warnung (steady amber, kein Flash).
- Icons beim Wechsel.
- Der Inhalt beim Tab-Wechsel (kein Slide, kein Fade).
- Scrollen (nativ, `scroll-behavior: auto`; kein Smooth-Scroll während der Messung).

## Press-Rückmeldung

- **Fläche dimmen, nicht verkleinern.** Der Bestand nutzt `active:scale-[0.99]`; das entfällt.
- Auf gefüllten Flächen: `background-color` 12 % dunkler oder `opacity: 0.8` auf der Fläche.
- Auf Kacheln: `opacity: 0.8` plus `filter: brightness(1.05)`; der Text bleibt lesbar.
- Dauer 75 ms; beim Loslassen zurück mit 120 ms.
- Haptik: `haptic(8)` bei Tap, `haptic([16, 40, 16])` bei Undo. Sie ist **nie** die einzige
  Rückmeldung und auf iPhone-Safari wirkungslos.

## Long-Press

- Schwelle: **450 ms**. Vorher ist es ein Tap, danach ein Undo.
- Ab dem Drücken erscheint das Overlay sofort (nicht erst nach 450 ms), damit die Absicht sichtbar
  ist: „Halten: Anschlag zurücknehmen“.
- Der Balken läuft 450 ms linear. Wird losgelassen, verschwindet das Overlay, der Tap wird
  ausgeführt.
- Bei `prefers-reduced-motion` entfällt der Balken; der Text und die 450-ms-Schwelle bleiben.
- Der Timer wird beim Unmount abgebrochen; ein Tab-Wechsel darf keinen Undo auslösen.

## Sheets und Dialoge

- Das Sheet fährt von unten ein, der Backdrop blendet gleichzeitig auf 60 % Schwarz.
- Beim Ziehen folgt es dem Finger ohne Übergang; beim Zurückfedern 150 ms.
- Ab 90 px Zug schließt es; ein `pointercancel` schließt nie.
- Auf `rail` erscheint das Sheet als zentriertes Fenster: 120 ms Opacity, kein Translate.
- Der Dialog skaliert von 0,98 auf 1; das ist die einzige Skalierung der Oberfläche.
- Kein Spring, kein Bounce, kein Overshoot.

## Status und Farbe

- Ein Statuswechsel (bereit → läuft → Ziel) blendet Rahmen und Fläche in 120 ms.
- Kein Aufblitzen, kein kurzes Grün vor dem Ziel.
- Die Display-Sperre-Warnung erscheint sofort und bleibt steady; sie blinkt nicht.
- Ein Bestzeit-Badge erscheint ohne Animation. Die Zahl ist die Belohnung.

## Reduced Motion

`src/index.css` setzt bereits global:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Zusätzlich gilt:

- `useReducedMotion` entfernt den Long-Press-Balken; der Text bleibt.
- Sheets und Dialoge erscheinen sofort, ohne Fahrt.
- Fortschrittsbalken springen auf den neuen Wert.
- Kein Smooth-Scroll, keine automatische Bewegung.
- **Keine Information darf nur in der Bewegung liegen.** Wer die Animation nicht sieht, muss den
  Zustand trotzdem erkennen (Text, Badge, Farbe).

## Leistung

- Nur `transform` und `opacity` animieren; Farbe ist erlaubt, weil sie keinen Layoutlauf auslöst.
- `will-change` nur während einer laufenden Geste, nicht dauerhaft.
- Keine Animation auf großen Listen oder dem gesamten Screen.
- Der Timer rendert während der Messung regelmäßig; Animationen dürfen keine zusätzlichen
  Reflows erzeugen.

## Prüfsteine

- Ist irgendeine Animation länger als 200 ms außer dem Long-Press? Wenn ja, begründen oder
  entfernen.
- Bewegt sich eine Zahl? Wenn ja, entfernen.
- Gibt es eine Dauer-Schleife (Puls, Blinken, Shimmer)? Wenn ja, entfernen.
- Bleibt bei `prefers-reduced-motion` jede Information sichtbar?
- Wird ein Knopf beim Drücken kleiner? Wenn ja, auf Flächendimmen umstellen.
- Löst ein Tab-Wechsel während des Haltens einen Undo aus? Wenn ja, Cleanup fehlt.
