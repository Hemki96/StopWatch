# Zeitmessung aus Zeitstempeln, nie aus Zählern

Jeder Anschlag wird als `performance.now()`-Zeitstempel im Moment des `pointerdown` erfasst. Angezeigte Zeiten sind immer eine Differenz zweier Zeitstempel, berechnet beim Rendern. Es gibt keinen Zähler, der pro Frame oder pro Intervall hochgezählt wird. Dadurch ist die Messung unabhängig von Renderfrequenz, gedrosselten Tabs und ausgelassenen Frames.

## Considered Options

- **`Date.now()`**: falsch bei Systemzeit-Sprüngen (NTP, Zeitzonenwechsel, manuelle Korrektur).
- **`setInterval`/`requestAnimationFrame`-Zähler**: driftet und friert bei Hintergrundtabs ein.

## Consequences

- `performance.now()` hat keinen Bezug zur Wanduhr. Für Historie und Anzeige des Startzeitpunkts wird zusätzlich ein `Date.now()`-Anker pro Lauf gespeichert.
- `performance.now()` ist nur innerhalb einer Seiten-Session gültig. Nach einem Reload werden gespeicherte Zeiten als fertige Dauerwerte gelesen, nicht neu berechnet.
- Der Zeitkern muss als reines Modul mit injizierbarer Uhr gebaut werden, damit er ohne Browser testbar ist.
