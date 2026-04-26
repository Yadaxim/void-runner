import type { WorldFile } from '../types';

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
  if (entry.imported || !entry.filePath) {
    const raw = localStorage.getItem(`${IMPORTED_WORLD_KEY_PREFIX}${entry.seed}`);
    if (!raw) {
      throw new Error(`Imported world not found for seed ${entry.seed}`);
    }
    return JSON.parse(raw) as WorldFile;
  }

  const response = await fetch(new URL(entry.filePath, window.location.href));
  if (!response.ok) {
    throw new Error(`Failed to load world file (${response.status})`);
  }
  return response.json() as Promise<WorldFile>;
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
