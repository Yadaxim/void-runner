import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as worldRegistry from '../core/worldRegistry';
import { buildStarterShipState, WorldState } from '../core/worldState';
import { WorldFileValidationError } from './validation';
import { makeShipState } from '../test/fixtures';
import type { ShipState, WorldFile } from '../types';
import { exportValidatedWorldFile } from './worldFileExport';
import { parseAndValidateWorldFileForImport } from './worldImport';

function loadWorld(): WorldFile {
  const raw = readFileSync(join(process.cwd(), 'public/testWorld.json'), 'utf-8');
  return JSON.parse(raw) as WorldFile;
}

function invalidWorldMissingHullSlots(): WorldFile {
  const w = structuredClone(loadWorld());
  const hull = w.hullSpecs[0];
  hull.slotCounts = { ...hull.slotCounts, thruster_forward: 0 };
  return w;
}

describe('validation boundaries', () => {
  describe('export', () => {
    it('does not invoke the writer when the world fails validation', () => {
      const writer = vi.fn();
      const r = exportValidatedWorldFile(invalidWorldMissingHullSlots(), writer);
      expect(r.ok).toBe(false);
      expect(writer).not.toHaveBeenCalled();
    });

    it('invokes the writer exactly once with serialised JSON when the world is valid', () => {
      const writer = vi.fn();
      const w = loadWorld();
      const r = exportValidatedWorldFile(w, writer);
      expect(r.ok).toBe(true);
      expect(writer).toHaveBeenCalledTimes(1);
      const json = writer.mock.calls[0][0] as string;
      expect(JSON.parse(json).metadata.seed).toBe(w.metadata.seed);
    });
  });

  describe('import', () => {
    it('does not persist when JSON parses but validation fails', () => {
      const store: Record<string, string> = {};
      const ls = {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
        key: (i: number) => Object.keys(store)[i] ?? null,
        get length() {
          return Object.keys(store).length;
        }
      };
      vi.stubGlobal('localStorage', ls as Storage);
      const bad = invalidWorldMissingHullSlots();
      const raw = JSON.stringify(bad);
      const outcome = worldRegistry.tryCommitImportedWorldFromJson(raw);
      expect(outcome.ok).toBe(false);
      const prefix = 'voidrunner_world_';
      expect(Object.keys(store).some((k) => k.startsWith(prefix))).toBe(false);
      vi.unstubAllGlobals();
    });

    it('treats invalid JSON separately from validation failures', () => {
      const badJson = parseAndValidateWorldFileForImport('{ not json');
      expect(badJson.ok).toBe(false);
      if (!badJson.ok) {
        expect(badJson.kind).toBe('invalid_json');
      }

      const badWorld = parseAndValidateWorldFileForImport(JSON.stringify(invalidWorldMissingHullSlots()));
      expect(badWorld.ok).toBe(false);
      if (!badWorld.ok) {
        expect(badWorld.kind).toBe('validation');
      }
    });
  });

  describe('load / WorldState', () => {
    it('does not construct WorldState when the world file fails validation', () => {
      const wf = invalidWorldMissingHullSlots();
      expect(() => WorldState.loadFromLocalStorage(wf, 'any-slot')).toThrow(WorldFileValidationError);
    });

    it('initialises WorldState from localStorage when the world file is valid', () => {
      const store: Record<string, string> = {};
      const ls = {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
        key: (i: number) => Object.keys(store)[i] ?? null,
        get length() {
          return Object.keys(store).length;
        }
      };
      vi.stubGlobal('localStorage', ls as Storage);
      const wf = loadWorld();
      const ws = new WorldState(wf, wf.startingConditions.sectorCoord, makeShipState({ id: 'player' }) as ShipState);
      ws.updatePlayerShipState(buildStarterShipState(ws));
      ws.saveToLocalStorage();
      const loaded = WorldState.loadFromLocalStorage(wf, ws.getActiveSaveId());
      expect(loaded).not.toBeNull();
      vi.unstubAllGlobals();
    });
  });
});
