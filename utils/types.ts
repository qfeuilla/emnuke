export type NukeMode = 'nuke' | 'filter' | 'highlight' | 'off';

export interface NukeSettings {
  mode: NukeMode;
  nukeCount: number;
}

export const DEFAULT_SETTINGS: NukeSettings = {
  mode: 'nuke',
  nukeCount: 0,
};
