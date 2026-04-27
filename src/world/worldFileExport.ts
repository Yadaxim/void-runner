import type { WorldFile } from '../types';
import type { ValidationResult } from './validation';
import { validateWorldFile } from './validation';

export interface WorldExportStats {
  landableCount: number;
  factionCount: number;
  equipmentCount: number;
}

export function countWorldExportStats(world: WorldFile): WorldExportStats {
  const landableCount = world.sectors.reduce((n, s) => n + s.landables.length, 0);
  return {
    landableCount,
    factionCount: world.factions.length,
    equipmentCount: world.equipmentCatalog.length
  };
}

export function formatExportSuccessLine(stats: WorldExportStats): string {
  return `Validation passed — ${stats.landableCount} landables, ${stats.factionCount} factions, ${stats.equipmentCount} equipment items`;
}

/**
 * Serialises a world for download or disk only after validation succeeds.
 * @param writeJson — invoked once with the JSON string when validation passes (e.g. Blob download or test spy).
 */
export function exportValidatedWorldFile(world: WorldFile, writeJson: (json: string) => void): ValidationResult {
  // VALIDATION BOUNDARY (export): never emit an unvalidated WorldFile from the world generator / export path
  const result = validateWorldFile(world);
  console.log('[world file export]', result.ok ? 'validation passed' : 'validation failed', result);
  if (!result.ok) {
    return result;
  }
  const json = JSON.stringify(world);
  writeJson(json);
  return result;
}
