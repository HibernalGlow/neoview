export type PanelViewMode = 'list' | 'grid' | 'thumbnails';

function getStorageKey(panelId: string) {
  return `neoview-panel-viewmode-${panelId}`;
}

export function loadPanelViewMode(panelId: string, fallback: PanelViewMode): PanelViewMode {
  try {
    const raw = localStorage.getItem(getStorageKey(panelId));
    if (!raw) return fallback;
    if (raw === 'list' || raw === 'grid' || raw === 'thumbnails') return raw;
    return fallback;
  } catch {
    return fallback;
  }
}

export function savePanelViewMode(panelId: string, mode: PanelViewMode): void {
  try {
    localStorage.setItem(getStorageKey(panelId), mode);
  } catch {
    // ignore
  }
}
