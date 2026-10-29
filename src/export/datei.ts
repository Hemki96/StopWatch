/** Teilt oder lädt eine Datei. Auf iOS führt das über das Share-Sheet. */
export async function speichereDatei(
  dateiname: string,
  inhalt: string,
  mime: string,
): Promise<void> {
  const blob = new Blob([inhalt], { type: mime })
  const datei = new File([blob], dateiname, { type: mime })

  if (navigator.canShare?.({ files: [datei] })) {
    try {
      await navigator.share({ files: [datei], title: dateiname })
      return
    } catch (fehler) {
      if (fehler instanceof DOMException && fehler.name === 'AbortError') return
    }
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = dateiname
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function waehleDatei(akzeptiert: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = akzeptiert
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}
