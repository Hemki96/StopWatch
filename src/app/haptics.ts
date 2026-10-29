/**
 * Kurzes haptisches Feedback auf Geräten, die die Vibration-API unterstützen.
 *
 * Der Aufruf ist bewusst fehlertolerant: iOS-Safari und Desktop-Browser bieten
 * `navigator.vibrate` nicht an. Ein fehlendes Feedback darf die Bedienung am
 * Beckenrand nicht blockieren, deshalb wird die Fähigkeit geprüft statt die
 * API vorauszusetzen. `muster` ist entweder eine Dauer in Millisekunden oder
 * eine Abfolge aus Vibrations- und Pausenlängen.
 */
export function haptic(muster: number | number[] = 8): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(muster)
  }
}
