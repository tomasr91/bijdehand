// Bestanden aan de gebruiker geven: delen (Android-deelmenu) of downloaden.

export function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function canShareFiles(): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File(['x'], 'x.json', { type: 'application/json' })] });
  } catch {
    return false;
  }
}

/** Deelt het bestand als dat kan (bijv. naar de Claude-app), anders download. Geeft 'gedeeld', 'gedownload' of 'geannuleerd'. */
export async function shareOrDownload(file: File, title: string): Promise<'gedeeld' | 'gedownload' | 'geannuleerd'> {
  if (canShareFiles()) {
    try {
      await navigator.share({ files: [file], title });
      return 'gedeeld';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'geannuleerd';
    }
  }
  download(file);
  return 'gedownload';
}
