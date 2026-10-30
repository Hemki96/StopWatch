# Screens aus dem Brief

Die zehn Screens aus [`brief.md`](../brief.md), abgebildet auf den Bestand. Maße, Farben und
Komponenten sind in den Kapiteln 4–8 definiert; hier steht die Anordnung.

Legende: **K** = fester Kopf, **I** = flexibler Inhalt, **A** = verankerte Aktionsleiste.

---

## 1. Onboarding, drei Schritte

**Datei:** `src/ui/Onboarding.tsx` · **Zustand:** Erststart, kein Konto, offline

**Aufgabe:** In unter einer Minute erklären, was ein Lauf ist, und die erste Konfiguration setzen.
Kein Marketing, keine Bilder, keine Tour mit Overlays.

### Anatomie

```
K  Schritt 1 von 3            (11 px, Akzent, Versalien)
   So funktioniert es          (18 px, 600)
   ─────────────────────────── 1-px-Haarlinie
I  Fließtext 14/1,5, max. 65 Zeichen je Zeile
   Lauf · Bahn · Anschlag      (fett im Fließtext, Farbe --fg)
A  [Überspringen]      [Weiter →]
   40 px, Textbutton    56 px, Akzent, 2/3 Breite
```

- Der Fortschritt ist **Text plus drei 2-px-Segmente** unter dem Kopf: aktiv `--accent`, inaktiv
  `--line`. Keine Punkte, keine Zahlenpyramide.
- Schritt 1: drei Absätze — was ein Lauf ist, wie der Anschlag funktioniert, dass alles lokal
  bleibt.
- Schritt 2: `Beckenlänge` (25/50 m), `Strecke` (50/100/200/400/800/1500 m).
  Chips 44 px, `aria-pressed`. Unter der Strecke steht die Folge: „4 Längen“ oder
  „offene Strecke“.
- Schritt 3: Bahnenzahl 1–10 mit `−`/`+` (48 × 48 px), darunter ein Namensfeld je Bahn
  (48 px, `inputMode="text"`, `autocomplete="off"`). Leere Felder bleiben leer.
- Die Fußzeile ist fest. „Zurück“ gibt es ab Schritt 2; auf Schritt 1 steht links
  „Überspringen“.
- Die primäre Aktion heißt auf Schritt 3 **„Los geht’s“**.

### Zustände

| Zustand | Darstellung |
| --- | --- |
| Gültig | Primärknopf aktiv, Akzentfüllung |
| Ungültige Kombination (z. B. Strecke kein Vielfaches) | Primärknopf `disabled`, 40 % Deckkraft, darunter `role="alert"`-Hinweis mit Grund |
| Kein `localStorage` | Abschluss funktioniert, Merker fehlt; Onboarding erscheint beim nächsten Start erneut (kein Fehlertext) |
| Bestandsdaten vorhanden | Onboarding wird übersprungen |

### Regeln

- Keine Schwimmer-Duplikate: Namen werden ohne Groß-/Kleinschreibung verglichen.
- „Überspringen“ legt **keine** Schwimmer an und setzt 25 m / 6 Bahnen / automatische Zwischenzeiten.
- Kein Autofokus auf Schritt 1. Auf Schritt 3 kein automatisches Öffnen der Tastatur.

---

## 2. Bereit (Idle)

**Datei:** `src/ui/TimerScreen.tsx`, Zweig `!lauf` · **Zustand:** kein aktiver Lauf

**Aufgabe:** Den nächsten Lauf in einem Blick zeigen und den Start in Daumenreichweite legen.

### Anatomie

```
K  Laufleiste (nur wenn andere Läufe offen)         40 px
I  NÄCHSTER LAUF                                    11 px, Versalien
   ┌────────────────────────────────────────┐
   │ 25 m · 100 m · 4 Bahnen    │      18 px, 600
   │ Ändern                                 │      14 px, Akzent
   └────────────────────────────────────────┘      16 px Radius, 1-px-Rahmen
   Drei Bedienhinweise, 14/1,5, --muted, Abstand 40 px
   (Beckenmuster: 1-px-Linien, 3 % Weiß, 64 px Raster)
A  [             Start              ]               80 px, 16 px Radius, Akzent
```

- Die Zusammenfassung ist **ein** Knopf über die volle Breite; die ganze Karte öffnet das
  Konfigurations-Sheet. „Ändern“ ist der sichtbare Hinweis, kein eigener kleiner Link.
- Die Reihenfolge der Zusammenfassung ist fest: Beckenlänge · Strecke (bei Serie `n×Strecke`) ·
  Personen/Bahnen · ggf. Reihenversatz · ggf. Takt. Trennzeichen ist ` · `.
- Die drei Hinweise sind keine Feature-Liste, sondern die drei Gesten: Start prüft zuerst,
  Tippen ist der Anschlag, langes Drücken nimmt zurück.
- Der Startknopf ist 80 px hoch, 24 px Schrift, `shadow-lg`, volle Breite bis `max-w-2xl`.
- Leerraum unter den Hinweisen ist erlaubt; die Aktionsleiste bleibt unten verankert.

### Zustände

| Zustand | Darstellung |
| --- | --- |
| Standard | Karte, Hinweise, Start |
| Andere Läufe offen | Laufleiste über dem Inhalt; „Start“ legt einen weiteren Lauf an |
| Tab gesperrt | Statt Inhalt: zentrierter Hinweis „Messung läuft in einem anderen Tab“, keine Startaktion |
| Speicherfehler | Globales Banner über dem Kopf; Start bleibt möglich, wenn Daten im Speicher liegen |
| Wake-Lock nicht verfügbar | Noch kein Hinweis; er erscheint erst, wenn etwas läuft |

### Regeln

- Kein Hero, keine Illustration, kein Fortschrittsring.
- Das Beckenmuster liegt **hinter** dem Inhalt, nie hinter der Startbeschriftung, und ist
  `aria-hidden`. Es ist nur im Leerzustand sichtbar.
- Der Start öffnet immer die Startübersicht. Kein direkter Start aus der Karte.

---

## 3. Lauf läuft

**Datei:** `src/ui/TimerScreen.tsx` + `src/ui/LaneTile.tsx` · **Zustand:** mindestens eine Bahn
gestartet, nicht alle im Ziel

**Aufgabe:** Für jede Bahn genau eine Fläche, die man blind trifft. Status und Zeit sind aus zwei
Metern lesbar.

### Anatomie

```
K  Laufleiste (40 px, horizontal scrollbar)                optional
   Lauf-Kopf (48 px):                                        antippbar → Sheet
     LAUF / SERIE · RUNDE 2/5        10 px Versalien
     25 m · 100 m · 4 Bahnen   14 px, max. 2 Zeilen
     [Papierkorb] oder [X]          44 px Trefferfläche
I  Reihe 1                                   (nur bei > 1 Reihe)
   25 m · 100 m · 4 Bahnen        10 px, Status rechts
   ┌──────────────┐ ┌──────────────┐
   │ 1   Anna     │ │ 2   Ben      │         2-px-Rahmen, 16 px Radius
   │   01:23,45   │ │   01:19,02   │         52 px, tabellarisch
   │ Länge 2/4    │ │ Länge 1/4    │         11 px
   │ 00:41,10     │ │ 00:38,90     │
   │ ▬▬▬▬▬░░░░░░ │ │ ▬▬░░░░░░░░░ │         6 px Fortschritt
   └──────────────┘ └──────────────┘
   … bis 10 Kacheln je Reihe
A  2 von 4 im Ziel · Laufzeit 03:12,44     14 px, tabellarisch
   Display-Sperre nicht aktiv …            12 px, amber
   [Weiter] / [Alle beenden]               48 px, optional
```

- **Reihen** sind Startgruppen. Jede Reihe bekommt einen Abschnitt mit Überschrift `REIHE n` und
  rechts dem Zustand: Versatz (`+10 s`), Countdown (`Start in 00:04,20`), `läuft` oder `Ziel`.
  Die Überschrift klebt beim Scrollen oben.
- **Kopfzeile** zeigt zuerst die Art (`Bereit`, `Lauf`, `Serie · Runde n/m`), dann die
  Zusammenfassung. Der Papierkorb erscheint, solange nicht alle im Ziel sind; danach `X`
  (Schließen, löscht nichts).
- **Statuszeile** ist dauerhaft: Fortschritt (`2 von 4 im Ziel` bzw. `3 von 5 Runden
  vollständig`) plus ` · Laufzeit m:ss,hh`. Bei fehlendem Wake-Lock wird der Hinweis amber und der
  Fortschritt übernimmt die Warnfarbe **nur als Text**, nicht als Fläche.
- **Aktionsleiste:** vor dem Start `Start alle` (64 px); während des Laufs Fortschritt + Hinweis
  + optionaler Sekundärknopf; nach dem Ziel `Alle n im Ziel · Laufzeit` + `Neuer Lauf` (64 px).
- Der Bereich zwischen Kopf und Leiste ist das einzige scrollende Element. Kopf, Status und
  Aktionsleiste stehen fest.

### Zustände der Messfläche

Die vollständige Matrix steht in [Kapitel 8](08-komponenten-und-zustaende.md#bahn-kachel-lanetile). Kurz:

| Bahnzustand | Rahmen | Zeit | Statuswort | Fortschritt |
| --- | --- | --- | --- | --- |
| bereit | `--line` | `--digit` | `Bereit` | leer |
| geplant | `--warn` 60 % | `--digit` | `Start in 00:04,20` | leer |
| läuft | `--accent` 70 % | `--digit` | `Länge 2/4` | gefüllt bis Anschläge |
| im Ziel | `--ok` 50 % | `--digit` | `Ziel` | voll |
| unterbrochen | `--warn` 60 %, gestrichelt | `--digit` | `Unterbrochen` | eingefroren |

### Regeln

- **Tippen = Anschlag**, **langes Drücken = Undo**. Der Zeitstempel entsteht beim `pointerdown`,
  nicht beim Loslassen.
- Während des Haltens erscheint ein amber Overlay mit Text („Halten: Anschlag zurücknehmen“) und
  einem 450-ms-Balken. Bei reduzierter Bewegung bleibt der Text, der Balken entfällt.
- Kein Scrollen der Seite. Bei zu vielen Kacheln scrollt nur das Raster; die Aktionsleiste bleibt
  erreichbar.
- Kein Dialog während der Messung außer „Lauf verwerfen“.
- Die Statuszeile ist keine Live-Region. Ein hundertstelgenauer Ticker würde Screenreader
  ununterbrochen unterbrechen.

---

## 4. Lauf beendet

**Datei:** `src/ui/LaufErgebnis.tsx` · **Zustand:** alle Bahnen im Ziel, Lauf war gestartet

**Aufgabe:** Ergebnis in Zielreihenfolge zeigen, Bestzeit markieren, direkt in den nächsten Lauf.

### Anatomie

```
I  Ergebnis                       14 px, 600
   4 Bahnen · 100 m               11 px, --muted
   ┌──────────────────────────────────────────────┐
   │ [1] Anna        Bestzeit       01:12,45  Zurück │
   │ [2] Ben         +1,20 zum PB   01:13,65  Zurück │
   │ [3] Clara       kein PB        01:15,02  Zurück │
   └──────────────────────────────────────────────┘
   Bahnnummer 36 px · Name 14 px · Badge 10 px · Zeit 24 px
A  Alle 4 im Ziel · Laufzeit 03:12,44        12 px, --ok
   [              Neuer Lauf              ]    64 px, Akzent
```

- Sortierung nach Zielzeit aufsteigend; Bahnen ohne Zeit stehen am Ende mit `—`.
- Pro Zeile: Bahnnummer in `surface-2`-Quadrat (36 px), Name, darunter Bestzeit-Badge **oder**
  Delta (`+1,20 zum PB`, `−0,40 zum PB`) **oder** `kein PB`, Zeit rechts, „Zurück“ als
  Korrekturweg.
- Die Zeit ist das größte Element der Zeile. Das Badge ist grün, aber immer mit dem Wort
  „Bestzeit“; nie nur ein grüner Punkt.
- Korrigierte Zielzeiten tragen zusätzlich `korrigiert`.
- Die Ergebnisliste ersetzt das Kachelraster, sie liegt nicht darüber.

### Zustände

| Zustand | Darstellung |
| --- | --- |
| Mit PB | Grünes `Bestzeit`-Badge, Zeit weiß |
| Ohne PB | Delta in `--muted`, positiv mit `+`, schneller als PB mit `−` |
| Kein Schwimmer | Name „Ohne Namen“, kein PB-Vergleich |
| Offene Bahn | Zeit `—`, Zeile bleibt sichtbar |
| Korrigiert | Zusatz `korrigiert` in der Metazeile |
| Undo | „Zurück“ nimmt das Ziel einer Bahn zurück; Ergebnis verlässt den Zustand |

### Regeln

- Kein Konfetti, kein Häkchen-Overlay, keine Animation beim Eintreffen. Die Zahl ist die Belohnung.
- „Neuer Lauf“ führt über die Startübersicht, nie direkt in die Messung.
- Das Ergebnis bleibt stehen, bis der Trainer weitergeht. Kein Auto-Close.

---

## 5. Lauf-Detail

**Datei:** `src/ui/LaufDetail.tsx` · **Zustand:** Vollbild über Verlauf oder Schwimmer

**Aufgabe:** Einen gespeicherten Lauf vollständig erklären: Konfiguration, Zielzeiten, Splits,
Pace, PB-Vergleich, Korrekturen, Export.

### Anatomie

```
K  [‹ Verlauf]                        44 px     [CSV] [Papierkorb] 44 px
I  Mo., 27.10.2026 · 18:42 Uhr        12 px, --muted
   4 Bahnen · 100 m                   24 px, 600
   25-m-Becken · 2 Reihen  14 px, --muted
   Runde 2 von 5 · Takt 2:00          12 px, Akzent
   [Hinweis unvollständig]            amber Fläche 10 %, Text 12 px
   ┌──────────────────────────────────────────────┐
   │ 1  [Anna ▾]              Bestzeit   01:12,45 │
   │    25 m   00:17,80  [Stift]                  │
   │    50 m   00:36,10  [Stift]                  │
   │   100 m   01:12,45  Ziel                     │
   │    Pace 01:12,45 / 100 m                     │
   └──────────────────────────────────────────────┘
   … zwei Spalten ab `rail`
```

- Kopf: Zurück, CSV-Export, Löschen. Alle Icon-Knöpfe haben `aria-label` und 44 px Trefferfläche.
- Die Bahnkarte enthält: Bahnnummer, Schwimmer-Auswahl, PB-Zeile, Zielzeit (24 px), alle
  Anschläge mit kumulierter Strecke und Split, Korrektur-Stift, Pace.
- Die Anschlagzeile ist eine Tabelle mit drei Spalten: Strecke (56 px), Zeit (flexibel),
  Status/Badge. Zeilen sind 32 px hoch; der Stift hat 44 px Trefferfläche.
- Korrektur wird **inline** in der Zeile bearbeitet: Eingabefeld (32 px sichtbar, 44 px Ziel),
  `OK`, `Abbrechen`. Fehler erscheinen direkt darunter mit `role="alert"`.
- Ab `rail` stehen die Bahnkarten zweispaltig; die Reihenfolge bleibt Bahn 1…n.

### Zustände

| Zustand | Darstellung |
| --- | --- |
| Vollständig | Zielzeiten, PB-Vergleich, Pace |
| Unvollständig | Amber Hinweis „Dieser Lauf ist unvollständig und zählt nicht als Bestzeit.“ |
| Nicht begonnen | Neutraler Hinweis „Diese Runde hat noch nicht begonnen.“ |
| Korrektur offen | Zeile wird zum Formular, Fokus im Feld, Escape verwirft |
| Korrekturfehler | `role="alert"` unter der Zeile, kein stilles Verwerfen |

| Lauf gelöscht | Zurück-Knopf statt leerer Seite |

### Regeln

- Kein Sheet für das Detail: zu viel Inhalt, zu viele Aktionen. Vollbild mit eigenem Zurück.
- Handkorrekturen bleiben sichtbar (`manuell`), damit eine Bestzeit nicht unbemerkt entsteht.
- Zahlen rechtsbündig, Labels links. Keine Spalte springt beim Korrigieren.

---

## 6. Verlauf

**Datei:** `src/ui/HistoryScreen.tsx` · **Zustand:** Liste, gruppiert nach Satz

**Aufgabe:** Messungen wiederfinden, Sätze umbenennen, in Detail und Analyse springen.

### Anatomie

```
K  Verlauf                            18 px, 600
   12 Läufe                           12 px, --muted
   [ Verlauf | Analyse ]              Segment-Control, 36 px
I  MO., 27.10.2026 · Kader A         11 px, Versalien + Tagesname
   100 m          [umbenennen] [Papierkorb]
   ┌──────────────────────────────────────────────┐
   │ 1  Anna        01:12,45   schnellste     ›   │
   │ 2  Ben         01:13,65                  ›   │
   └──────────────────────────────────────────────┘
   … Gruppen, ab `rail` zweispaltig
```

- Kopf: Titel, Anzahl, Segment-Control `Verlauf`/`Analyse` (36 px hoch, aktives Segment
  Akzentfüllung).
- Gruppe: Datum und optionaler Tagesname als Versalien-Zeile, darunter Titel und Aktionen. Der
  Tagesname gilt für alle Sätze desselben Datums und lässt sich über `Tag benennen` inline
  bearbeiten; daneben lässt sich die Satzbezeichnung umbenennen (Eingabefeld ersetzt den Titel,
  Enter/Blur speichert).
- Laufzeile: Bahnnummer, Name, Zeit (tabellarisch, 14 px), optionale Badges
  (`unvollständig`, `schnellste`), Chevron. Die ganze Zeile ist ein Knopf.
- Der Papierkorb löscht den ganzen Satz samt Läufen und fragt nach.
- Leerzustand: zentrierter Text „Noch keine Messungen.“ plus Verweis auf den Timer.

### Zustände

| Zustand | Darstellung |
| --- | --- |
| Gruppen vorhanden | Karten, neueste zuerst |
| Keine Läufe | Leerzustand, keine Aktionsleiste |
| Umbenennen | Titel wird zum Feld, Fokus, Enter speichert, Escape bricht ab |
| Löschen | `alertdialog` mit Anzahl der betroffenen Läufe |
| Analyse gewählt | Kopf bleibt, Inhalt wechselt zu `AnalyseScreen` |
| Unvollständig | Amber Badge `unvollständig`; Zeile bleibt antippbar |

### Regeln

- Keine Filter, keine Suche in Version 1. Die Gruppierung nach Satz ist die Ordnung.
- Zeiten sind der visuelle Anker; Datum und Titel sind Sekundärinformation.
- Zwei Spalten ab `rail`, eine Spalte auf dem Handy.

---

## 7. Schwimmer und Bestzeiten

**Datei:** `src/ui/SchwimmerScreen.tsx` · **Zustand:** Liste, Eintrag aufgeklappt, Formular-Sheet

**Aufgabe:** Personen verwalten und ihre Entwicklung je Strecke/Becken sehen.

### Anatomie

```
K  Schwimmer                        18 px        [+] 44 px
   6 Personen · 14 Bestzeiten        12 px
I  ┌──────────────────────────────────────────────┐
   │ Anna Muster            Jahrgang 2010      ▾  │
   │ 3 Bestzeiten                    Bearbeiten  │
   ├──────────────────────────────────────────────┤
   │ 100 m · 50 m                01:12,45        │
   │ 12.10.  01:14,20   27.10.  01:12,45  PB     │
   └──────────────────────────────────────────────┘
```

- Kopf: Titel, Anzahl Personen und Bestzeiten, runder `+`-Knopf (44 px).
- Karte: Name (14 px, 600), Jahrgang (12 px), Anzahl PBs, Chevron. Die Kopfzeile klappt die
  Zeitentwicklung auf.
- Aufgeklappt: pro Gruppe (Strecke · Beckenlänge) der PB-Wert in `--ok` und die
  chronologische Liste der Zeiten, PB fett. Ein Tipp auf eine Zeit öffnet das Lauf-Detail.
- „Bearbeiten“ öffnet ein Sheet mit Name, Jahrgang, Notiz und Löschen (rot, mit Rückfrage).
- Leerzustand: „Noch keine Schwimmer.“ plus `Schwimmer anlegen`.

### Zustände

| Zustand | Darstellung |
| --- | --- |
| Liste | Karten, eine Spalte; ab `rail` zwei |
| Aufgeklappt | Zeitengruppen, Chevron gedreht |
| Keine PBs | „Noch keine Bestzeiten.“ in der Karte |
| Formular | Sheet, Speichern 56 px, Löschen als Textknopf rot |
| Löschen | `alertdialog`; Läufe bleiben erhalten, nur die Zuordnung entfällt |

### Regeln

- Ein PB ist immer mit `PB` oder „Bestzeit“ beschriftet, nie nur grün.
- Zeiten werden nicht gerundet; die Anzeige nutzt dieselbe Formatierung wie überall.
- Die Reihenfolge der Gruppen ist alphabetisch nach Titel, die Zeiten chronologisch.

---

## 8. Einstellungen

**Datei:** `src/ui/SettingsScreen.tsx` · **Zustand:** Karten mit Zeilen

**Aufgabe:** Darstellung, Vorgaben, Daten und Installation an einem ruhigen Ort bündeln.

### Anatomie

```
K  Einstellungen                     18 px
I  DARSTELLUNG                       11 px, Versalien
   ┌──────────────────────────────────────────────┐
   │ Design                                        │
   │ [ System ][ Hell ][ Dunkel ]                  │  drei 44-px-Segmente
   └──────────────────────────────────────────────┘
   NÄCHSTER LAUF
   ┌──────────────────────────────────────────────┐
   │ 25 m · 100 m · 6 Bahnen        ›  │
   └──────────────────────────────────────────────┘
   DATEN
   ┌ CSV exportieren / JSON-Backup / Import / … ┐
   INSTALLATION
   ┌ Als App installiert / Anleitung             ┐
   Version 0.1.0 · Alle Daten bleiben auf diesem Gerät.
```

- Karten sind 16 px gerundet, 1-px-Rahmen, Zeilen mit 1-px-Trennlinie, 14 px hoch, ganze Zeile
  antippbar (min. 48 px).
- Die Theme-Auswahl ist ein `radiogroup` mit drei Segmenten: `System`, `Hell`, `Dunkel`. Das active
  Segment ist gefüllt, nicht nur umrandet.
- `Nächster Lauf` öffnet das Konfigurations-Sheet im Modus `einstellungen`.
- Datenzeilen: CSV, JSON-Backup, Import, Speicherschutz, „Alles löschen“ (rot). Import und Löschen
  sind gesperrt, wenn dieser Tab nicht die Messung hält.
- Fußzeile: Version und Datenschutzhinweis, 11 px, zentriert.

### Zustände

| Zustand | Darstellung |
| --- | --- |
| Standard | Karten, Zeilen, Fußzeile |
| Tab gesperrt | Datenzeilen 40 % Deckkraft, `disabled`; Erklärung als Banner oben |
| Import läuft | Vorschau-Sheet mit Zusammenfassung; erst Bestätigen schreibt |
| Importfehler | Fehlerblock im Sheet mit Zeilennummer, Bestand unverändert |
| Speicher geschützt | Zeile zeigt Status, Aktion wird zum Hinweis |

### Regeln

- Keine Schalter ohne sofortige Wirkung. Jede Zeile erklärt ihren Wert in der Unterzeile.
- Destruktive Aktion ist die letzte Zeile der Datenkarte, nicht die primäre Aktion des Screens.
- Der Screen hat keine untere Aktionsleiste; die Karten scrollen bis zur Fußzeile.

---

## 9. Konfigurations-Sheet

**Datei:** `src/ui/KonfigurationSheet.tsx` · **Zustand:** Bottom Sheet, Modus `einstellungen` oder
`lauf`

**Aufgabe:** Becken, Strecke, Zwischenzeiten, Reihen, Bahnen, Startversatz, Serie und
Schwimmerzuordnung ändern. Gilt sofort, ohne Speichern-Knopf.

### Anatomie

```
┌──────────────────────────────────────────────┐
│                  ▬▬▬▬                        │  Griff 40 × 4 px
│  Nächster Lauf / Lauf              [×]       │  Titel 16 px, Schließen 44 px
├──────────────────────────────────────────────┤
│  BECKENLÄNGE                                 │
│  [25 m] [50 m]                               │
│  STRECKE                                     │
│  [50] [100] [200] [400] [800] [1500]         │
│  ZWISCHENZEITEN                              │
│  [−] [ 1 ] [+]  [Automatisch]                │  48 × 48 px, Feld tippbar
│  BAHNEN PRO REIHE / REIHEN                   │
│  [−] 4 [+]   [−] 2 [+]                       │  48 × 48 px
│  STARTVERSATZ                                │
│  [0 s] [5 s] [10 s] …                        │
│  SERIE (im Lauf gesperrt)                    │
│  Wiederholungen [−] 3 [+]   Takt [Chips] …   │
│  SCHWIMMER                                   │
│  Bahn 1 [Name ▾] …                          │
└──────────────────────────────────────────────┘
```

- Auf dem Handy: von unten, max. 88 dvh, Griff, Innenabstand 16 px, unten Safe-Area.
- Auf `rail`: zentriertes Fenster, max. 576 px, 24 px Radius, kein Griff.
- Abschnitte mit `Feld`: Label 11 px Versalien, Inhalt, optionaler Hinweis 12 px. Abstand
  zwischen Abschnitten 20 px.
- Chips: 44 px hoch, 12 px Radius, aktiv Akzentfüllung, inaktiv `surface-2` + 1-px-Rahmen.
  `aria-pressed`. Deaktiviert 40 % Deckkraft **und** ein erklärender Hinweis.
- Zahlenstepper: 48 × 48 px, Wert 20 px tabellarisch, Minus links, Plus rechts.
- Schwimmerzuordnung: pro Bahn ein `<select>` (48 px) oder ein Knopf, der ein Namens-Sheet
  öffnet; eine leere Bahn heißt ausdrücklich „frei“.
- Kein „Speichern“. Änderungen schreiben sofort in den Provider; Schließen verwirft nichts.

### Zustände

| Zustand | Darstellung |
| --- | --- |
| Einstellungen | Alle Felder offen; Überschrift „Nächster Lauf“ |
| Lauf, vor dem ersten Anschlag | Strecke/Becken/Zwischenzeiten änderbar; Überschrift „Lauf“ |
| Lauf, nach dem ersten Anschlag | Strecke, Becken, Zwischenzeiten gesperrt; Chips deaktiviert + Hinweis „Nach dem ersten Anschlag festgelegt.“ |
| Serie | Plan komplett gesperrt; Hinweis auf Takt und Runden |
| Ungültige Kombination | Änderung wird nicht übernommen; der gültige alte Wert bleibt sichtbar |
| Warnung Takt < Versatz | Amber Hinweisblock im Abschnitt „Serie“ |
| Ziehen | Sheet folgt dem Finger, ab 90 px schließt es; Abbruch federt zurück |

### Regeln

- Das Sheet ist die einzige Stelle für Konfiguration. Kein eigener Konfigurations-Screen.
- Die Reihenfolge ist stabil: Becken → Strecke → Zwischenzeiten → Bahnen pro Reihe →
  Reihen → Startversatz → Serie → Schwimmer.
- Ein Wert außerhalb der Schnellauswahl wird als zusätzlicher Chip ergänzt, nie stillschweigend
  ersetzt.

---

## 10. Verwerfen-Bestätigung

**Datei:** `src/ui/Bestaetigung.tsx` · **Zustand:** `alertdialog` über dem laufenden Screen

**Aufgabe:** Eine nicht umkehrbare Löschung verhindern, ohne den Ablauf zu blockieren.

### Anatomie

```
┌────────────────────────────────────┐
│ Lauf verwerfen?              16 px │
│ Alle Zeiten dieses Laufs werden     │
│ gelöscht. Das lässt sich nicht     │
│ rückgängig machen.           14 px │
│                                    │
│ [   Abbrechen   ] [   Verwerfen  ] │
│    48 px, hell       48 px, rot    │
└────────────────────────────────────┘
```

- Max. 384 px breit, 16 px Radius, 20 px Innenabstand, mittig.
- Titel `h2`, Text über `aria-describedby` verknüpft. `role="alertdialog"`, `aria-modal`.
- Initialer Fokus auf **Abbrechen**. Escape und Backdrop-Klick brechen ab.
- Bestätigung ist rot (`--danger-fill`), nie die Akzentfarbe.
- Bei einer Serie: „Serie abbrechen?“, Text nennt alle Wiederholungen und Zeiten.

### Zustände

| Zustand | Darstellung |
| --- | --- |
| Offen | Backdrop 60 % Schwarz, Panel erscheint in 120 ms |
| Bestätigen | Aktion läuft, Dialog schließt, Toast „Lauf verworfen.“ |
| Abbrechen | Nichts ändert sich, Fokus zurück auf den Papierkorb |
| Reduzierte Bewegung | Panel erscheint ohne Animation, Fokus identisch |

### Regeln

- Kein dritter Knopf, kein „Speichern“, kein Checkbox-„Nicht mehr fragen“.
- Der destruktive Knopf ist rechts, die sichere Wahl links und vorfokussiert.
- Der Dialog nennt die konkrete Folge, nicht „Sind Sie sicher?“.
