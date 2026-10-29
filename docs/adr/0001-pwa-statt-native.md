# PWA statt nativer App

Die App läuft als installierbare PWA im Browser und nimmt **keine** Eingaben an, während sie im Hintergrund ist oder das Display gesperrt ist. Die verstrichene Zeit bleibt trotzdem korrekt, weil sie aus Zeitstempeln rekonstruiert wird. Echte Hintergrundausführung mit Eingaben wäre nur nativ (Android Foreground Service, iOS Live Activity) möglich; sie ist nicht erforderlich, weil der Trainer am Beckenrand das Display ohnehin sichtbar braucht.

## Consequences

- Wake Lock hält den Bildschirm an, solange die App sichtbar ist.
- Die App muss sichtbar warnen, wenn der Screen schläft, statt stillschweigend Taps zu verlieren.
- Ein späterer Wechsel zu Capacitor/React Native wäre ein Neubau der Plattformschicht, nicht ein Refactoring.
