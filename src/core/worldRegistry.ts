import type { WorldFile } from '../types';
import type { ValidationResult } from '../world/validation';
import { throwIfWorldFileInvalidForGame } from '../world/validation';
import { parseAndValidateWorldFileForImport } from '../world/worldImport';

const IMPORTED_WORLD_KEY_PREFIX = 'voidrunner_world_';

export interface WorldEntry {
  id: string;
  name: string;
  filePath: string;
  description: string;
  seed: number;
  imported?: boolean;
}

const AVAILABLE_WORLDS: WorldEntry[] = [
  {
    id: 'test_world',
    name: 'Test Galaxy',
    filePath: '/testWorld.json',
    description:
      'A hand-crafted test galaxy spanning Federation, Frontier Clans, Veth Collective and Pirate space.',
    seed: 42
  }
];

export function getAvailableWorlds(): WorldEntry[] {
  const imported: WorldEntry[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith(IMPORTED_WORLD_KEY_PREFIX)) {
      continue;
    }
    const raw = localStorage.getItem(key);
    if (!raw) {
      continue;
    }
    try {
      const world = JSON.parse(raw) as WorldFile;
      imported.push({
        id: key,
        name: world.metadata.name,
        filePath: '',
        description: `Seed: ${world.metadata.seed} - Generated ${new Date(world.metadata.generatedAt).toLocaleDateString()}`,
        seed: world.metadata.seed,
        imported: true
      });
    } catch {
      // Skip corrupted worlds.
    }
  }
  return [...AVAILABLE_WORLDS, ...imported];
}

export function getWorldBySeed(seed: number): WorldEntry | null {
  return getAvailableWorlds().find((world) => world.seed === seed) ?? null;
}

export async function loadWorldForEntry(entry: WorldEntry): Promise<WorldFile> {
  let world: WorldFile;
  if (entry.imported || !entry.filePath) {
    const raw = localStorage.getItem(`${IMPORTED_WORLD_KEY_PREFIX}${entry.seed}`);
    if (!raw) {
      throw new Error(`Imported world not found for seed ${entry.seed}`);
    }
    world = JSON.parse(raw) as WorldFile;
  } else {
    const response = await fetch(new URL(entry.filePath, window.location.href));
    if (!response.ok) {
      throw new Error(`Failed to load world file (${response.status})`);
    }
    world = (await response.json()) as WorldFile;
  }

  throwIfWorldFileInvalidForGame(world, { bundledTestEntry: entry });
  return world;
}

export type TryCommitImportedWorldResult =
  | { ok: true; entry: WorldEntry }
  | { ok: false; kind: 'invalid_json' }
  | { ok: false; kind: 'validation'; result: ValidationResult }
  | { ok: false; kind: 'shape'; message: string };

/**
 * Parse, validate, and persist an uploaded world JSON (New Game import path).
 */
export function tryCommitImportedWorldFromJson(raw: string): TryCommitImportedWorldResult {
  const parsed = parseAndValidateWorldFileForImport(raw);
  if (!parsed.ok) {
    return parsed.kind === 'invalid_json' ? { ok: false, kind: 'invalid_json' } : { ok: false, kind: 'validation', result: parsed.result };
  }
  const world = parsed.world;
  if (!world?.metadata?.seed || !world?.sectors || !world?.factions) {
    return { ok: false, kind: 'shape', message: 'Invalid world file format.' };
  }
  return { ok: true, entry: saveImportedWorld(world) };
}

export function saveImportedWorld(worldFile: WorldFile): WorldEntry {
  localStorage.setItem(`${IMPORTED_WORLD_KEY_PREFIX}${worldFile.metadata.seed}`, JSON.stringify(worldFile));
  return {
    id: `${IMPORTED_WORLD_KEY_PREFIX}${worldFile.metadata.seed}`,
    name: worldFile.metadata.name,
    filePath: '',
    description: `Seed: ${worldFile.metadata.seed} - Generated ${new Date(worldFile.metadata.generatedAt).toLocaleDateString()}`,
    seed: worldFile.metadata.seed,
    imported: true
  };
}
