# Produktreferenzen

Fünf reale Produkte, die die Richtung tragen. Für jedes steht, **was genau** entlehnt wird und was
bewusst nicht. Die Referenzen ersetzen keine eigenen Entscheidungen; sie belegen, dass die
Muster in echten Produkten funktionieren.

---

## 1. WHOOP — dunkle Messfläche, ein Wert im Zentrum

**Was es ist:** Trainings- und Erholungs-App mit dunklem Dashboard, einem dominanten Tageswert
(Recovery/Strain) und wenigen Sekundärmetriken.

**Was geborgt wird:**

- **Flächenhierarchie in zwei Stufen:** fast schwarzer Grund, eine Stufe hellere Karte, keine
  Glasflächen. Genau das ist `--bg` → `--surface` → `--surface-2`.
- **Ein Wert ist der Held seiner Fläche.** Bei WHOOP ist es der Recovery-Prozentwert; bei uns die
  Zeit. Kein Diagramm, kein Ring und kein Label darf daneben größer sein.
- **Statusfarbe sparsam:** Grün/Gelb/Rot nur für den Zustand, nicht für die Marke. Bei uns
  Akzent/Grün/Amber/Rot.
- **Kleine, gesperrte Captions** über größeren Werten. Wir übernehmen die 11-px-Versalien, aber
  nicht die niedrige Deckkraft.

**Was nicht geborgt wird:**

- Die dense Dashboard-Ansicht mit vielen Kacheln und Trends. Wir haben genau eine Messfläche pro
  Bahn.
- Ringe, Sparklines und Verlaufsgraphen. Der Verlauf ist bei uns eine Liste, die Analyse eine
  Tabelle.
- Abo-Onboarding und erklärende Overlays. Unser Onboarding ist in 60 Sekunden vorbei.
- Sehr kleine, kontrastarme Mikrotexte. Bei Sonne unlesbar.

**Konkrete Übernahme:** Timer, Lauf läuft; Farbkapitel 6; Typografie `digit-lane`.

---

## 2. Strava — Splits, Bestleistungen, Delta

**Was es ist:** Trainings- und Wettkampf-App mit Aktivitätsdetail, Splits pro Kilometer, „Best
Efforts“ und Segment-Bestlisten.

**Was geborgt wird:**

- **Split-Zeile als Tabelle:** Strecke links, Zeit rechts, tabellarisch, ohne Dekoration. Genau
  die Anatomie des Lauf-Details (Länge, Split, Badge).
- **PB-/Best-Effort-Badge:** eine kleine, grüne Markierung mit Wort, kein Pokal, kein Konfetti.
  Bei uns „Bestzeit“ / „PB“.
- **Delta zum Bestwert:** `+1,20` / `-0,40` mit Vorzeichen, direkt unter der Zeit. Keine zweite
  Spalte, kein Pfeil.
- **Gruppierte Aktivitätsliste:** Datum/Gruppe, dann Zeilen mit Name, Zeit und Chevron. Das ist
  der Verlauf.
- **Eine Zeile, eine Entscheidung:** Tippen öffnet das Detail; keine Aktionen in der Zeile außer
  der benannten.

**Was nicht geborgt wird:**

- Social Feed, Kudos, Kommentare, Fotos, Karten. Die App ist ein Werkzeug, kein Netzwerk.
- Farbige Aktivitätskarten und Hero-Bilder. Bei uns ist die Zeit die Grafik.
- Segment-Ranglisten und Leistungsvergleiche gegen Fremde. Wir vergleichen nur mit dem eigenen PB.
- Verschachtelte Filter und Suche. Der Verlauf ist nach Satz gruppiert, fertig.

**Konkrete Übernahme:** Lauf beendet, Lauf-Detail, Verlauf, Schwimmer-Bestzeiten.

---

## 3. Apple Watch Workout — der laufende Zustand

**Was es ist:** Trainings-App auf der Uhr. Während eines Workouts zeigt sie wenige, sehr große
Werte (Zeit, Distanz, Pace, Herzfrequenz) und genau die Aktionen, die jetzt zählen: Pause und
Ende.

**Was geborgt wird:**

- **Der laufende Zustand ist der Screen.** Keine Navigation, keine Kacheln, keine Werbung für
  andere Funktionen, solange gemessen wird. Bei uns: Kachelfeld, Statuszeile, eine Aktion.
- **Riesige Ziffern, kleine Einheiten.** Die Zahl dominiert, die Einheit ist Nebensache. Bei uns
  steht die Konfiguration im Kopf, nicht in der Kachel.
- **Angehängte End-Aktion:** Beenden ist immer erreichbar, aber nicht der erste Treffer. Bei uns
  „Alle beenden“ bzw. der Papierkorb mit Rückfrage.
- **Haptik als zweite Rückmeldung:** ein kurzer Impuls pro Eingabe, nie die einzige. Bei uns
  `haptic(8)` und `haptic([16,40,16])`.
- **Hoher Kontrast, wenig Chrom:** schwarzer Grund, weiße Zahl, eine Akzentfarbe.

**Was nicht geborgt wird:**

- Digital-Crown-Bedienung und seitenweises Wischen durch Metriken. Am Beckenrand müssen alle
  Bahnen gleichzeitig sichtbar sein, nicht nacheinander.
- Ringe, Konfetti und „Workout beendet“-Feiern. Die Zahl ist die Belohnung.
- Always-on-Dimming als eigenes Design. Wir halten den Bildschirm per Wake-Lock an und warnen,
  wenn das nicht gelingt.
- Kleine „Pause“-Ziele oben rechts. Unsere primäre Aktion ist unten und groß.

**Konkrete Übernahme:** Timer, Lauf läuft; Startübersicht; Statuszeile; Haptik.

---

## 4. Teenage Engineering OP-1 field — das Instrumentenbrett

**Was es ist:** Tragbarer Synthesizer mit flacher Metallfläche, farbcodierten Tasten, klaren
Beschriftungen und einem kleinen Display. Ein Gerät, das man ohne Handbuch bedienen kann, wenn man
die Farben und Gruppen einmal kennt.

**Was geborgt wird:**

- **Jede Taste ist eine Fläche, kein Link.** Tasten haben eine sichtbare Kante, eine klare
  Beschriftung und einen eigenen Druckzustand. Bei uns: 2-px-Rahmen an Messflächen, flache
  Füllungen, kein Schatten.
- **Farbe gruppiert Funktionen.** Bei OP-1 sind Tasten nach Aufgabe eingefärbt; bei uns nach
  Zustand. Nie beides gleichzeitig.
- **Versalien-Mikrolabels** auf den Tasten, mit weiter Laufweite. Bei uns `caption`/`micro`.
- **Kein dekorativer Schatten.** Die Fläche ist die Form. Schatten gibt es nur, wo etwas wirklich
  schwebt (Sheet, Dialog, primäre Aktion).
- **Ein Gerät, das man mit einer Hand und ohne Hinsehen bedient.** Die Anordnung ist stabil; die
  gleiche Taste macht immer dasselbe.

**Was nicht geborgt wird:**

- Kryptische, unlabeled Symbole und „lerne die Farben auswendig“. Jede Fläche bei uns trägt ein
  deutsches Wort.
- Sehr kleine Beschriftungen unter 10 px und enge Tastenabstände. Am Beckenrand ist beides Gift.
- Verspielte Grafiken, Siebdruck-Ornamente, Premium-Materialinszenierung.
- Ein Display als einzige Rückmeldung. Bei uns ist der Zustand immer auch Text.

**Konkrete Übernahme:** Kachel- und Knopf-Form, Captions, Sheet-Kopf, Einstellungen.

---

## 5. Schwimm-Scoreboard (Colorado Time Systems / Daktronics) — die Anzeigetafel

**Was es ist:** Die Anzeigetafel am Beckenrand: Bahnnummern links, Zeiten rechts, Platzierungen,
alles bei Sonne und aus 20 Metern lesbar.

**Was geborgt wird:**

- **Bahnnummer immer links, Zeit immer rechts.** Die Position ist über alle Screens gleich; man
  muss nicht suchen.
- **Reinweiße Ziffern auf near-black.** Kein Grau, kein Grün, kein Verlauf. Das ist die Grundlage
  für `--digit: #ffffff`.
- **Feste Ziffernbreite und feste Hundertstel.** `tabular-nums` plus rechtsbündige Zeiten; das
  Komma sitzt immer an derselben Stelle.
- **Keine Dekoration im Messbereich.** Keine Logos, keine Rahmen, keine Bilder. Nur Nummer, Name,
  Zeit, Status.
- **Status als Wort plus Position**, nicht als Blinken. „Ziel“ steht da, wo die Zeit steht.

**Was nicht geborgt wird:**

- Sieben-Segment-Typografie. Sie ist bei Buchstaben (DNS, DNF, „läuft“) unlesbar; wir nutzen eine
  groteske Systemschrift.
- Blinkende Zeiten, laufende Lichtleisten, laute Rot/Grün-Wechsel.
- Die volle Scoreboard-Dichte (Platz, Rückstand, Reaktion, Zwischenzeiten gleichzeitig). Auf dem
  Handy bleibt eine Kachel bei Bahn, Name, Zeit, Länge, Split.
- Hardware-Größen und -Kontraste ungeprüft auf ein 390-px-Display übertragen.

**Konkrete Übernahme:** LaneTile, LaufErgebnis, LaufDetail, Farbkapitel, Typografie.

---

## Referenzmatrix

| Screen / Baustein | Hauptreferenz | Zweitreferenz | Was konkret |
| --- | --- | --- | --- |
| Timer, Bereit | OP-1 field | Apple Watch | Fläche, Captions, eine Aktion |
| Timer, Lauf läuft | Scoreboard | Apple Watch | Nummer links, weiße Ziffern, Statuszeile |
| Bahn-Kachel | Scoreboard | WHOOP | 2-px-Rahmen, ein Wert, Statusfarbe |
| Lauf beendet | Strava | Scoreboard | PB-Badge, Delta, Zeilenliste |
| Lauf-Detail | Strava | Scoreboard | Splits-Tabelle, PB, Korrektur |
| Verlauf | Strava | — | Gruppierung, Zeile, Chevron |
| Schwimmer & Bestzeiten | Strava | — | PB pro Gruppe, Zeitentwicklung |
| Einstellungen | OP-1 field | — | Karten, Zeilen, flache Flächen |
| Onboarding | OP-1 field | Apple Watch | ruhige Schritte, eine Aktion |
| Konfigurations-Sheet | OP-1 field | — | Chips, Stepper, sofortige Wirkung |
| Verwerfen-Dialog | Apple Watch | — | eindeutige End-Aktion, sichere Wahl |
| Farben | WHOOP | Scoreboard | dunkle Stufen, sparsame Signale |
| Typografie | Scoreboard | Strava | tabellarische Ziffern, Splits |

## Was keine Referenz ist

Diese Muster tauchen in Fitness-Apps häufig auf und werden bewusst **nicht** übernommen:

| Muster | Warum nicht |
| --- | --- |
| Hero mit Foto und Motivationssatz | Kein Inhalt, kostet Platz, bei Sonne unlesbar |
| Ringe, Kreise, Sparklines | Dekoration; eine Zahl ist präziser |
| Gradienten und Glas | Zerstören Kontrast und Flächenhierarchie |
| Konfetti, Trophäen, „Streak“-Feiern | Ablenkung während der Messung |
| Unendlicher Feed | Der Verlauf ist endlich und gruppiert |
| Versteckte Gesten ohne sichtbaren Hinweis | Nasse Finger, keine Entdeckbarkeit |
| Microcopy unter 10 px | Bei Sonne nicht lesbar |
| Rot/Grün als einziger Unterschied | Farbschwäche, Sonne, Screenreader |
| Diagramme für Splits | Eine Tabelle ist schneller und genauer |
| „Dark Mode“ als bloße Umkehrung | Zwei Themes brauchen eigene Kontrastprüfung |

## Quellen

- WHOOP: <https://www.whoop.com>
- Strava: <https://www.strava.com>
- Apple Watch Workout: <https://www.apple.com/apple-watch/>
- Teenage Engineering OP-1 field: <https://teenage.engineering/products/op-1/field>
- Colorado Time Systems: <https://www.coloradotime.com>
- Daktronics Scoreboards: <https://www.daktronics.com/en-us/products/scoreboards>

Die Referenzen wurden als Produktmuster ausgewertet, nicht als Pixelvorlagen kopiert. Keine
Marken-, Farb- oder Layoutübernahme.
