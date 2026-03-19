export type NukeMode = 'nuke' | 'filter' | 'highlight' | 'off';

export interface NukeSettings {
  mode: NukeMode;
  nukeCount: number;
  excludedSites: string[];
}

export const DEFAULT_SETTINGS: NukeSettings = {
  mode: 'nuke',
  nukeCount: 0,
  excludedSites: [],
};

export function loadSettings(): Promise<NukeSettings> {
  return browser.storage.local
    .get(DEFAULT_SETTINGS as unknown as Record<string, unknown>)
    .then((s) => s as unknown as NukeSettings);
}
