# Design

Design-Artefakte für Beckenrand. Sie beschreiben die visuelle Richtung und die Sollwerte der
Oberfläche, unabhängig von einzelnen Implementierungen.

| Datei | Inhalt | Status |
| --- | --- | --- |
| [`brief.md`](brief.md) | Design-Brief „Beckenrand — mobile App-Screens“: Richtung, Screens, Constraints | Ausgangsbasis |
| [`redesign-referenz/`](redesign-referenz/README.md) | Umsetzbare Design-Referenz: Informationsarchitektur, Screens, Raster, Typografie, Tokens, Komponenten, Bewegung, Barrierefreiheit, Produktreferenzen | Entwurf zur Abnahme |

## Was hier (noch) nicht liegt

Issue [#14](https://github.com/Hemki96/StopWatch/issues/14) verlangt einen Sleek-Designlauf mit
Projekt-ID, Nutzer- und Review-Screenshots sowie Component-HTML je Screen. Dieser Lauf ist in der
Umgebung nicht möglich, weil `SLEEK_API_KEY` fehlt und der Device-Flow eine menschliche Bestätigung
braucht. Die Markdown-Referenz ersetzt das Artefakt inhaltlich, **nicht** formal: Screenshots und
Component-HTML fehlen weiterhin. Die Abweichung ist im
[Referenz-README](redesign-referenz/README.md#abweichungen-von-issue-14) festgehalten.

## Verbindlichkeit

- Der Brief beschreibt die **Absicht**. Die Referenz beschreibt die **Sollwerte**.
- `docs/entwicklung/oberflaeche.md` beschreibt den **aktuellen Code**. Weicht der Code von der
  Referenz ab, ist das eine offene Umsetzung, kein Freibrief.
- Änderungen an der visuellen Sprache werden zuerst hier geändert und danach implementiert.
