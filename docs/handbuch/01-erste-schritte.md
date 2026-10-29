# Erste Schritte

## Was Beckenrand ist

Beckenrand ist eine installierbare Web-App (PWA) für die Zeitmessung am Beckenrand. Sie läuft im
Browser, braucht kein Konto und speichert alle Daten lokal auf dem Gerät. Nach dem ersten Laden
funktioniert sie offline.

**Live-Adresse:** <https://hemki96.github.io/StopWatch/>

Die App ist für ein Handy in einer Hand gebaut: große Touchziele, hoher Kontrast, keine
verschachtelten Menüs während der Messung.

## Installieren

Die Installation ist optional, aber empfohlen:

- Die App startet ohne Browserleiste und nutzt den ganzen Bildschirm.
- Auf dem iPhone schützt erst die Installation den lokalen Speicher davor, nach längerer
  Nichtnutzung verworfen zu werden.
- Der Service Worker kann die App offline aus dem Cache laden.

### iPhone und iPad

1. Die Adresse in **Safari** öffnen (nicht in einer In-App-Browseransicht).
2. Auf **Teilen** tippen.
3. **„Zum Home-Bildschirm“** wählen und bestätigen.
4. Die App über das neue Symbol starten.

### Android

1. Die Adresse in **Chrome** öffnen.
2. Das Browsermenü öffnen und **„App installieren“** wählen. Je nach Version steht die Aktion auch
   als Symbol in der Adressleiste.
3. Bestätigen und die App über das Symbol starten.

### Desktop

In Chrome oder Edge erscheint rechts in der Adressleiste ein Installationssymbol. Alternativ steht
„App installieren“ im Browsermenü. Nach der Installation öffnet sich die App in einem eigenen
Fenster.

Unter **Mehr → Installation** zeigt die App, ob sie bereits installiert ist. Wenn der Browser keinen
Installationsdialog anbietet, steht dort eine kurze Anleitung.

> **Wichtig:** Die App funktioniert auch ohne Installation. Nur der Speicherschutz und das
> Vollbildverhalten sind auf dem iPhone schlechter. Sichere trotzdem regelmäßig ein Backup — siehe
> [Daten und Backup](07-daten-und-backup.md).

## Der erste Start: Onboarding

Beim ersten Start führt ein Onboarding in drei Schritten durch die wichtigsten Einstellungen. Es
erscheint nur einmal pro Gerät und Browser.

### Schritt 1 — So funktioniert es

Eine kurze Erklärung von **Lauf**, **Bahn** und **Anschlag**:

- Ein Lauf ist eine Messung über eine feste Strecke.
- Er besteht aus mehreren Bahnen, eine pro Schwimmer:in.
- Jeder Anschlag wird angetippt; der letzte Anschlag ist das Ziel.
- Langes Drücken nimmt die letzte Aktion zurück.

### Schritt 2 — Becken und Strecke

| Feld | Bedeutung |
| --- | --- |
| **Einheit** | **Meter** oder **Yards**. Steuert Anzeige und Eingabe; intern wird immer in Metern gespeichert. |
| **Beckenlänge** | 25 m oder 50 m; bei Yards nur **25 yd** (22,86 m). Bestimmt, wie viele Längen eine Strecke hat. |
| **Strecke** | 50, 100, 200, 400, 800 oder 1.500 in der Einheit — oder **Offene Strecke**. |
| **Schwimmart** | Freistil, Brust, Rücken, Schmetterling, Lagen oder Beliebig. |

Die Strecke muss ein Vielfaches der Beckenlänge sein. Bei einem Wechsel der Beckenlänge oder Einheit
korrigiert die App eine unpassende Strecke automatisch auf zwei Bahnlängen. Ein Wechsel von Meter
auf Yards behält die angezeigte Zahl: Aus 100 m wird 100 yd (91,44 m).

**Offene Strecke** bedeutet: Es gibt keine feste Längenanzahl. Jeder Anschlag ist ein Split; das
Ziel wird mit einem eigenen **Ziel**-Knopf gesetzt. Das passt für Technik- und Ausdauereinheiten
ohne feste Distanz.

### Schritt 3 — Bahnen und Namen

- **Bahnen:** 1 bis 10. Die Zahl gilt für den nächsten Lauf.
- **Schwimmer:** optional. Namen können leer bleiben und später im Tab **Schwimmer** ergänzt oder
  im Konfigurations-Sheet zugeordnet werden.

Mit **„Überspringen und Standardwerte verwenden“** startet die App mit 50 m-Becken, 100 m
Freistil, 6 Bahnen und ohne Namen. Diese Werte lassen sich jederzeit unter **Mehr** ändern.

## Die App nach dem Onboarding

```
┌─────────────────────────────────────┐
│  Timer · Training · Wettkampf       │  Bereiche wechseln
│  Verlauf · Schwimmer · Mehr         │
├─────────────────────────────────────┤
│                                     │
│  Inhalt des gewählten Bereichs      │
│                                     │
├─────────────────────────────────────┤
│  Timer  Training  Wettkampf  ...    │  untere Leiste
└─────────────────────────────────────┘
```

Beim Start steht der **Timer** im Vordergrund. Dort liegt die Karte **„Nächster Lauf“** mit der
aktuellen Konfiguration, z. B.:

> `50 m · 100 m · Freistil · 6 Bahnen`

Ein Tipp auf die Karte öffnet das Konfigurations-Sheet. Der große **Start**-Knopf öffnet zuerst die
**Startübersicht** mit allen Werten; erst **Jetzt starten** beginnt die Messung.

## Die erste Messung in fünf Minuten

1. **App öffnen** und das Onboarding abschließen oder überspringen.
2. Im Tab **Timer** auf die Karte **„Nächster Lauf“** tippen.
3. Beckenlänge, Strecke und Schwimmart prüfen. Für den ersten Test passen 50 m, 100 m und Freistil.
4. Unter **Bahnen** die Anzahl einstellen, z. B. 4.
5. Optional unter **Schwimmer für den nächsten Lauf** Namen zuordnen.
6. Das Sheet schließen, **Start** tippen und in der Startübersicht **Jetzt starten** bestätigen. Alle
   Bahnen starten gemeinsam.
7. Bei jeder Wandberührung die Kachel der Bahn antippen.
   - 100 m im 50 m-Becken: zwei Tipps (50 m und Ziel).
   - 100 m im 25 m-Becken: vier Tipps.
8. Der letzte Anschlag markiert die Bahn als **im Ziel** und zeigt die Zielzeit.
9. Wenn alle Bahnen im Ziel sind, erscheint **„Neuer Lauf“**. Die Messung steht jetzt im Tab
   **Verlauf**.

### Was du dabei siehst

| Anzeige | Bedeutung |
| --- | --- |
| **Bereit** | Die Bahn wurde noch nicht gestartet. |
| **Start in 7,4** | Die Bahn ist geplant und startet nach dem Countdown (nur mit Startversatz). |
| **Länge 2/4** | Die nächste Berührung wäre die zweite von vier Längen. |
| **1/3 Zwischenzeiten** | Eine von drei Zwischenzeiten ist erfasst; das Ziel ist keine Zwischenzeit. |
| **läuft** | Die Bahn misst gerade. |
| **im Ziel** / **Ziel** | Die Bahn hat ihren letzten Anschlag. |
| Fortschrittslinie unten | Gefüllte Segmente stehen für abgeschlossene Längen. |

Die Farbe unterstützt die Bedeutung: laufende Bahnen sind mit der Akzentfarbe markiert, beendete
grün, geplante und überfällige gelb/amber.

## Standardwerte ändern

Unter **Mehr** lassen sich die Werte für den nächsten Lauf dauerhaft ändern:

- **Design:** System, Hell oder Dunkel.
- **Nächster Lauf:** Beckenlänge, Strecke, Schwimmart, Startversatz, Wiederholungen, Takt, Bahnen
  und Schwimmerzuordnung.
- **Daten:** CSV-Export, Backup, Speicherschutz, alles löschen.
- **Installation:** Installationsstatus und Anleitung.

Die Einstellungen gelten für neu angelegte Läufe. Ein bereits angelegter Lauf behält seine Werte;
nur die Schwimmerzuordnung und — solange noch kein Anschlag erfasst wurde — Beckenlänge, Strecke
und Schwimmart lassen sich dort noch ändern. Bei einer Serie ist die Konfiguration sofort gesperrt.

## Nächste Schritte

- Mehrere Bahnen und Startversatz: [Timer und Bahnen](02-timer.md)
- Wiederholungen im Takt: [Serien](03-serien.md)
- Eine ganze Einheit planen: [Training](04-training.md)
- Einen Wettkampftag begleiten: [Wettkampf](05-wettkampf.md)
