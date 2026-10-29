# 0004 — Splash-Farbe und Designwechsel beim Start

## Status

Angenommen (2026-10-29).

## Kontext

Das Web-App-Manifest hat genau ein `background_color` und ein `theme_color`. Der installierte
Start zeigt damit immer denselben Splash, unabhängig davon, ob die App hell oder dunkel
eingerichtet ist. Bisher war die Splash-Farbe `#070c15`, die App im hellen Design aber `#eef2f7`.
Beim Start wechselte das Bild dadurch sichtbar von dunkel nach hell.

Die App startet standardmäßig im dunklen Design, weil am Beckenrand die Messansicht gilt. Ein
heller Splash würde für diese Mehrheit einen hellen Blitz erzeugen. Zwei Manifeste (eines je
Design) sind keine verlässliche Lösung: `<link rel="manifest">` wird von den relevanten Browsern
nicht designabhängig ausgewertet, und die Designwahl kann die Systemeinstellung übersteuern.

## Entscheidung

1. Das Manifest behält die dunkle Messfarbe `#070c15` für Splash und Statusleiste. Das dunkle
   Design bleibt damit vollständig stimmig.
2. Im hellen Design bleibt der **erste Frame** ebenfalls `#070c15`. Ein deckender Layer in
   `index.html` zeigt die Splash-Farbe, bis React und CSS bereit sind. Danach blendet er in
   200 ms in das helle Design über.
3. Der Übergang ist eine gerichtete Überblendung, kein harter Wechsel: Splash und erster Frame
   sind identisch, der Wechsel zum hellen Design ist als Bewegung erkennbar und nicht als Blitz.
4. Die iOS-Statusleiste wird designabhängig auf `black` (dunkel) bzw. `default` (hell) gesetzt.
   `black-translucent` entfällt, weil es weiße Schrift erzwingt und den Inhalt unter die Uhr
   schiebt.

## Konsequenzen

- Ein künftiges drittes Design muss entweder auf der dunklen Boot-Farbe aufsetzen oder den
  Boot-Ablauf in `index.html` erweitern. Die Manifest-Farbe allein reicht nicht.
- `theme_color` bleibt dynamisch (Meta-Tag), `background_color` ist statisch. Das ist eine
  Grenze der Plattform, keine Nachlässigkeit.
- Wer das helle Design als Standard einführen will, muss Splash-Farbe und Boot-Layer gemeinsam
  ändern; sonst kehrt der Blitz zurück.
