export type NukeMode = 'nuke' | 'filter' | 'highlight' | 'off';

export interface NukeSettings {
  mode: NukeMode;
  nukeCount: number;
  defaultActive: boolean;
  excludedSites: string[];
  includedSites: string[];
}

export const DEFAULT_SETTINGS: NukeSettings = {
  mode: 'nuke',
  nukeCount: 0,
  defaultActive: true,
  excludedSites: [],
  includedSites: [],
};

export function loadSettings(): Promise<NukeSettings> {
  return browser.storage.local
    .get(DEFAULT_SETTINGS as unknown as Record<string, unknown>)
    .then((s) => s as unknown as NukeSettings);
}

export function isSiteActive(s: NukeSettings, hostname: string): boolean {
  if (s.includedSites.includes(hostname)) return true;
  if (s.excludedSites.includes(hostname)) return false;
  return s.defaultActive;
}
