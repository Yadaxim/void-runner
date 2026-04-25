import { SAVE_KEY } from '../constants';

export interface SaveStateData {
  playerId: string;
  visitedSectors: string[];
}

export function saveState(data: SaveStateData): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function loadState(): SaveStateData | null {
  const raw = localStorage.getItem(SAVE_KEY);
  return raw ? (JSON.parse(raw) as SaveStateData) : null;
}
