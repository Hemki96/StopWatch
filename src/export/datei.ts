/**
 * Dateiausgabe und Dateiauswahl im Browser.
 *
 * `speichereDatei` versucht zuerst das Teilen über die Web-Share-API (auf iOS
 * der übliche Weg in „Dateien“ oder zu einer anderen App) und fällt sonst auf
 * einen klassischen Download zurück. `waehleDatei` öffnet den Dateidialog über
 * ein temporäres `<input type="file">` und liefert die Auswahl als `File`.
 *
 * Beide Funktionen sind UI-nah und werden nur aus Screens aufgerufen; sie
 * kennen keine Domänentypen. Fehler beim Teilen werden abgefangen, damit ein
 * Export nie die App blockiert. Der Download-Pfad ist still: Er kann vom
 * Browser verweigert werden, ohne dass hier ein Fehler entsteht.
 */

/**
 * Teilt oder lädt eine Datei. Auf iOS führt das über das Share-Sheet.
 *
 * @param dateiname Sichtbarer Dateiname inklusive Endung.
 * @param inhalt Vollständiger Dateiinhalt als Text (CSV oder JSON).
 * @param mime MIME-Typ, z. B. `text/csv;charset=utf-8`.
 *
 * Ablauf: Zuerst wird geprüft, ob der Browser genau diese Datei teilen kann.
 * Wenn ja, öffnet `navigator.share` das Share-Sheet. Ein Abbruch durch den
 * Nutzer (`AbortError`) wird still beendet; jeder andere Fehler führt zum
 * Download. Ohne Share-Unterstützung wird ebenfalls heruntergeladen.
 */
export async function speichereDatei(
  dateiname: string,
  inhalt: string,
  mime: string,
): Promise<void> {
  // `File` trägt den Namen und wird von der Share-API verlangt; `Blob` dient
  // als Inhalt für die Objekt-URL des Download-Fallbacks.
  const blob = new Blob([inhalt], { type: mime })
  const datei = new File([blob], dateiname, { type: mime })

  let kannTeilen = false
  try {
    kannTeilen = navigator.canShare?.({ files: [datei] }) ?? false
  } catch {
    // Manche Browser werfen bei Dateien, die sie nicht teilen können.
    kannTeilen = false
  }

  if (kannTeilen) {
    try {
      await navigator.share({ files: [datei], title: dateiname })
      return
    } catch (fehler) {
      // Ein bewusst abgebrochenes Teilen soll keinen Download auslösen.
      if (fehler instanceof DOMException && fehler.name === 'AbortError') return
      // Andere Fehler (z. B. fehlende Berechtigung) fallen zum Download durch.
    }
  }

  // Download-Fallback: Der Anker muss kurz im DOM hängen, damit Firefox den
  // Klick ausführt. Die Objekt-URL wird erst nach kurzer Zeit freigegeben,
  // damit der Browser den Download noch starten kann.
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = dateiname
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * Öffnet den Dateidialog und liefert die gewählte Datei.
 *
 * @param akzeptiert Wert für `accept`, z. B. `.csv` oder
 *   `text/csv,text/plain,.csv,.txt`.
 * @returns Die erste gewählte Datei oder `null`, wenn der Dialog abgebrochen
 *   wird bzw. ohne Auswahl schließt.
 *
 * Das Eingabefeld bleibt unsichtbar und wird nach der Auswahl entfernt, damit
 * keine Reste im DOM bleiben. Es wird vor dem Klick eingehängt, weil Safari
 * den Klick auf ein nicht eingehängtes Feld in manchen Versionen verweigert.
 */
export function waehleDatei(akzeptiert: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = akzeptiert
    input.style.display = 'none'

    // Genau einmal auflösen und dabei aufräumen; beide Ereignisse können je
    // nach Browser auch ausbleiben, dann bleibt die Promise offen.
    const fertig = (datei: File | null) => {
      input.remove()
      resolve(datei)
    }

    input.onchange = () => fertig(input.files?.[0] ?? null)
    // `cancel` meldet den Abbruch; nicht jeder Browser unterstützt es.
    input.oncancel = () => fertig(null)

    // Ein nicht eingehängtes Input verweigert Safari in manchen Versionen
    // den Klick. Nach dem Auswählen wird es wieder entfernt.
    document.body.append(input)
    input.click()
  })
}
