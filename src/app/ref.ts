/**
 * Minimaler Ref-Spiegel.
 *
 * Die Aktionsmodule brauchen nur `current`; diese Form erfüllt `useRef` und
 * hält die Fabriken frei von React-Typen.
 */
export interface Ref<T> {
  current: T
}
