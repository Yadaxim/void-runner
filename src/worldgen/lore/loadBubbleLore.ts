import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let cached: string | null = null;

/** Read canonical bubble lore from plan/worldgen/lore.md (Node / Vitest only). */
export function loadBubbleLore(): string {
  if (cached) {
    return cached;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, '../../../plan/worldgen/lore.md');
  cached = readFileSync(path, 'utf8');
  return cached;
}
