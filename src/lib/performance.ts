/** Hardware hints are optional; unknown devices use the conservative cache limit too. */
export function mapBudget(hints: { cores?: number; memoryGB?: number; saveData?: boolean; reducedMotion?: boolean }) {
  const light = !!hints.saveData || (hints.cores != null && hints.cores <= 4) || (hints.memoryGB != null && hints.memoryGB <= 4)
  return {
    light,
    maxTileCacheSize: light ? 64 : 128,
    fadeDuration: light || hints.reducedMotion ? 0 : 150,
    cameraDuration: hints.reducedMotion ? 0 : light ? 180 : 600,
  }
}

export function browserMapBudget() {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
  return mapBudget({ cores: nav.hardwareConcurrency, memoryGB: nav.deviceMemory, saveData: nav.connection?.saveData,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches })
}
