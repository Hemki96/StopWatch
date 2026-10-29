/**
 * Erzeugt eine eindeutige ID für neue Domänenobjekte (Lauf, Bahn, Satz …).
 *
 * Bevorzugt `crypto.randomUUID()`, weil das im Browser und in Node ohne
 * Zusatzbibliothek verfügbar ist. In Umgebungen ohne diese API (ältere Browser,
 * einige Testumgebungen) wird ein Fallback aus Zeitstempel und Zufallsanteil
 * gebildet. Beide Varianten sind für lokale Daten ausreichend; die IDs werden
 * nie über ein Netzwerk hinweg kollisionsfrei zusammengeführt.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
