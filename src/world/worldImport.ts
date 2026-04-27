import type { WorldFile } from '../types';
import type { ValidationResult } from './validation';
import { validateWorldFile } from './validation';

export type ParsedWorldImport =
  | { ok: true; world: WorldFile }
  | { ok: false; kind: 'invalid_json' }
  | { ok: false; kind: 'validation'; result: ValidationResult };

/**
 * Parse raw JSON and validate as a `WorldFile` (import / upload path).
 * Invalid JSON is reported separately from schema validation failures.
 */
export function parseAndValidateWorldFileForImport(raw: string): ParsedWorldImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, kind: 'invalid_json' };
  }
  const world = parsed as WorldFile;
  // VALIDATION BOUNDARY (import): user uploads must pass before localStorage / world list
  const result = validateWorldFile(world);
  if (!result.ok) {
    return { ok: false, kind: 'validation', result };
  }
  return { ok: true, world };
}
