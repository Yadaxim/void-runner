/**
 * One-off live step 3 check (uses .env, never prints the API key).
 * Usage: npx vite-node scripts/worldgen-live-step3.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { generateSpecies } from '../src/worldgen/steps/03_species.ts';

const repoRoot = resolve(import.meta.dirname, '..');
const env = loadEnv('development', repoRoot, ['VITE_', 'ANTHROPIC_']);
const apiKey = (env.VITE_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY || '').trim();

if (!apiKey) {
  console.error('No API key in .env — set ANTHROPIC_API_KEY or VITE_ANTHROPIC_API_KEY');
  process.exit(1);
}

const bubbleLore = readFileSync(resolve(repoRoot, 'plan/worldgen/lore.md'), 'utf8');
const count = Number.parseInt(process.argv[2] ?? '5', 10);

console.log(`Calling Anthropic for ${count} species…`);

const started = Date.now();
const result = await generateSpecies({
  count,
  seed: 424242,
  useMock: false,
  apiKey,
  maxRetries: 3,
  bubbleLore
});

console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
for (const sp of result.species) {
  console.log(`- ${sp.id}: ${sp.name}`);
  console.log(`  ${sp.archetype} · ${sp.techArchetype}${sp.preferredHabitat ? ` · ${sp.preferredHabitat}` : ''}`);
  console.log(`  physiology (${sp.physiology.length}): ${sp.physiology.slice(0, 80)}…`);
  console.log(`  ethos (${sp.ethos.length}): ${sp.ethos.slice(0, 80)}…`);
  console.log(`  codex (${sp.codex.length}): ${sp.codex.slice(0, 80)}…`);
  console.log(`  worldgenBrief (${sp.worldgenBrief.length}): ${sp.worldgenBrief.slice(0, 80)}…`);
  console.log('');
}
console.log(`Wildlife (${result.wildlife.length}):`);
for (const w of result.wildlife) {
  console.log(`- ${w.id}: ${w.name}`);
}
