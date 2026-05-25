import type { FactionType } from '../../src/types/faction';
import type { Species } from '../../src/types/species';
import type { FactionSkeletonOutput } from '../../src/worldgen/types/factionSkeleton';
import type { SpeciesGenerationOutput } from '../../src/worldgen/types/speciesGeneration';
import type { ExplorerState } from './state';

export type OutputViewMode = 'preview' | 'json';

let viewMode: OutputViewMode = 'preview';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function techBadgeClass(tech: string): string {
  return `species-tech species-tech-${tech.replace(/[^a-z0-9]/gi, '')}`;
}

const ROLE_LABEL: Record<string, string> = {
  human: 'Human (player)',
  playable: 'Playable',
  npc: 'NPC only',
  wildlife: 'Wildlife'
};

function renderSpeciesCards(species: Species[]): string {
  if (species.length === 0) {
    return '<p class="output-empty">No species in output.</p>';
  }
  return `<div class="species-list">${species
    .map(
      (sp) => `
    <article class="species-card">
      <header class="species-card-head">
        <h3 class="species-name">${escapeHtml(sp.name)}</h3>
        <span class="species-id">${escapeHtml(sp.id)}</span>
      </header>
      <div class="species-tags">
        <span class="species-role species-role-${escapeHtml(sp.speciesRole)}">${escapeHtml(ROLE_LABEL[sp.speciesRole] ?? sp.speciesRole)}</span>
        <span class="species-archetype">${escapeHtml(sp.archetype)}</span>
        <span class="${techBadgeClass(sp.techArchetype)}">${escapeHtml(sp.techArchetype)}</span>
        ${
          sp.preferredHabitat
            ? `<span class="species-habitat">${escapeHtml(sp.preferredHabitat)}</span>`
            : ''
        }
      </div>
      <dl class="species-dl">
        <dt>Physiology</dt>
        <dd>${escapeHtml(sp.physiology)}</dd>
        <dt>Ethos</dt>
        <dd>${escapeHtml(sp.ethos)}</dd>
        <dt>Codex</dt>
        <dd class="species-long">${escapeHtml(sp.codex)}</dd>
        <dt>Worldgen brief</dt>
        <dd class="species-long">${escapeHtml(sp.worldgenBrief)}</dd>
      </dl>
    </article>`
    )
    .join('')}</div>`;
}

const FACTION_TYPE_LABEL: Record<FactionType, string> = {
  major_nation: 'Major nation',
  minor_nation: 'Minor nation',
  independent: 'Independent'
};

function renderFactionSkeletonPreview(output: FactionSkeletonOutput, species: Species[]): string {
  const nameById = new Map(species.map((s) => [s.id, s.name]));
  const majors = output.factionSkeletons.filter((f) => f.type === 'major_nation');
  const minors = output.factionSkeletons.filter((f) => f.type === 'minor_nation');
  const independents = output.factionSkeletons.filter((f) => f.type === 'independent');

  const rows = (factions: FactionSkeletonOutput['factionSkeletons']) =>
    factions
      .map((f) => {
        const comp = f.speciesComposition
          .map((e) => {
            const label = nameById.get(e.speciesId) ?? e.speciesId;
            return `${escapeHtml(label)} ${e.percentage}%`;
          })
          .join(' · ');
        return `<li><span class="faction-type">${escapeHtml(FACTION_TYPE_LABEL[f.type])}</span> <code>${escapeHtml(f.id)}</code><br /><span class="faction-comp">${comp}</span></li>`;
      })
      .join('');

  return `
    <div class="step-summary">
      <p><strong>${output.galaxyLandableCount}</strong> landables → <strong>${output.factionSkeletons.length}</strong> factions</p>
      <p>${majors.length} major · ${minors.length} minor · ${independents.length} independent</p>
    </div>
    <ul class="faction-preview-list">${rows(output.factionSkeletons)}</ul>
  `;
}

function renderStep2Summary(output: { sectorOverrides?: unknown[] }): string {
  const overrides = output.sectorOverrides ?? [];
  let nebula = 0;
  let shimmer = 0;
  let radiation = 0;
  for (const row of overrides) {
    const props = (row as { properties?: Record<string, unknown> }).properties ?? {};
    if (props.nebula) nebula += 1;
    if (props.shimmer) shimmer += 1;
    if (props.radiation) radiation += 1;
  }
  return `
    <div class="step-summary">
      <p><strong>${overrides.length}</strong> sector overrides</p>
      <ul>
        <li>Radiation sectors: ${radiation}</li>
        <li>Nebula sectors: ${nebula}</li>
        <li>Shimmer sectors: ${shimmer}</li>
      </ul>
      <p class="field-hint">Toggle nebula / shimmer / radiation on the map.</p>
    </div>`;
}

function renderStep1Summary(output: {
  sectors?: { landables: unknown[] }[];
  galaxy?: { sectorSize: number };
}): string {
  const sectors = output.sectors ?? [];
  const landables = sectors.reduce((n, s) => n + s.landables.length, 0);
  return `
    <div class="step-summary">
      <p><strong>${sectors.length}</strong> sectors · <strong>${landables}</strong> landables</p>
      <p class="field-hint">Sector size ${output.galaxy?.sectorSize ?? '—'} world units.</p>
    </div>`;
}

export function setOutputViewMode(mode: OutputViewMode): void {
  viewMode = mode;
  document.querySelectorAll('[data-output-mode]').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-output-mode') === mode);
  });
  const preview = document.getElementById('stepOutputPreview');
  const json = document.getElementById('stepJson');
  if (preview) preview.hidden = mode !== 'preview';
  if (json) json.hidden = mode !== 'json';
}

export function bindOutputViewTabs(): void {
  document.querySelectorAll('[data-output-mode]').forEach((el) => {
    el.addEventListener('click', () => {
      const mode = el.getAttribute('data-output-mode') as OutputViewMode;
      setOutputViewMode(mode);
    });
  });
  setOutputViewMode(viewMode);
}

export function renderStepOutput(state: ExplorerState): void {
  const preview = document.getElementById('stepOutputPreview');
  const json = document.getElementById('stepJson');
  if (!preview || !json) return;

  const id = state.selectedStepId;
  if (!id) {
    preview.innerHTML = '<p class="output-empty">Select a pipeline step.</p>';
    json.textContent = 'Select a pipeline step';
    return;
  }

  const output = state.stepOutputs[id] ?? state.steps.find((s) => s.def.id === id)?.output;
  json.textContent = output !== undefined ? JSON.stringify(output, null, 2) : '(no output yet)';

  if (output === undefined) {
    preview.innerHTML = '<p class="output-empty">No output yet — run this step.</p>';
    return;
  }

  if (id === '03_species') {
    const out = output as SpeciesGenerationOutput;
    const nation = out.species ?? [];
    const wildlife = out.wildlife ?? [];
    preview.innerHTML =
      nation.length > 0
        ? `${renderSpeciesCards(nation)}${
            wildlife.length > 0
              ? `<section class="wildlife-section"><h3 class="output-subhead">Wildlife (${wildlife.length}) — not nations</h3>${renderSpeciesCards(wildlife)}</section>`
              : ''
          }`
        : '<p class="output-empty">Invalid species output.</p>';
    return;
  }

  if (id === '04_faction_skeleton') {
    const skel = output as FactionSkeletonOutput;
    const speciesOut = state.stepOutputs['03_species'] as SpeciesGenerationOutput | undefined;
    const species = speciesOut?.species ?? [];
    preview.innerHTML =
      skel.factionSkeletons && species.length > 0
        ? renderFactionSkeletonPreview(skel, species)
        : '<p class="output-empty">Invalid faction skeleton output.</p>';
    return;
  }

  if (id === '02_special_sectors') {
    preview.innerHTML = renderStep2Summary(output as { sectorOverrides?: unknown[] });
    return;
  }

  if (id === '01_galaxy_structure') {
    preview.innerHTML = renderStep1Summary(
      output as { sectors?: { landables: unknown[] }[]; galaxy?: { sectorSize: number } }
    );
    return;
  }

  preview.innerHTML =
    '<p class="field-hint">No preview for this step — use Raw JSON.</p>';
  setOutputViewMode('json');
}
