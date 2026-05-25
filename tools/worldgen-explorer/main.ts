import { GalaxyMapView } from './galaxyMap';
import {
  canRunStep,
  findNextRunnableStepId,
  runPipeline,
  runSingleStep
} from './pipelineRunner';
import { apiKeySourceLabel, isAnthropicApiKeyConfigured } from './apiKey';
import { bindConfigForm } from './stepConfigForm';
import { bindOutputViewTabs, renderStepOutput } from './stepOutputView';
import { ExplorerState } from './state';
import type { WorldFileSlice } from './types';
import { DEFAULT_LAYERS } from './types';

const state = new ExplorerState();

const canvas = document.getElementById('galaxyCanvas') as HTMLCanvasElement;
const stepList = document.getElementById('stepList') as HTMLUListElement;
const sectorInspect = document.getElementById('sectorInspect') as HTMLDivElement;
const stepJson = document.getElementById('stepJson') as HTMLPreElement;
const logView = document.getElementById('logView') as HTMLDivElement;

const map = new GalaxyMapView(canvas, () => state.layers);

const LAYER_LABELS: Record<keyof typeof DEFAULT_LAYERS, string> = {
  grid: 'Grid',
  coords: 'Coords',
  structure: 'Structure',
  factions: 'Factions',
  radiation: 'Radiation',
  nebula: 'Nebula',
  ruins: 'Ruins',
  shimmer: 'Shimmer',
  landables: 'Landables'
};

function renderLayerToggles(): void {
  const layerRoot = document.getElementById('layerToggles');
  if (!layerRoot) return;
  layerRoot.innerHTML = (Object.keys(LAYER_LABELS) as (keyof typeof DEFAULT_LAYERS)[])
    .map(
      (key) =>
        `<label><input type="checkbox" data-layer="${key}" ${state.layers[key] ? 'checked' : ''} /> ${LAYER_LABELS[key]}</label>`
    )
    .join('');
}

function initLayerControls(): void {
  document.getElementById('configPanel')?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.layer) return;
    const key = target.dataset.layer as keyof typeof DEFAULT_LAYERS;
    if (!(key in DEFAULT_LAYERS)) return;
    state.layers = { ...state.layers, [key]: target.checked };
    updateMapLegend();
  });
}

function setupConfigForm(): void {
  bindConfigForm(
    state,
    refresh,
    () => {
      if (state.selectedStepId && !state.generating) {
        void runSingleStep(state, state.selectedStepId);
      }
    },
    {
      renderLayerToggles,
      updateMapLegend,
      updatePanelTitle: (title) => {
        const el = document.getElementById('configPanelTitle');
        if (el) el.textContent = title;
      }
    }
  );
}

function renderSteps(): void {
  stepList.innerHTML = '';
  for (const step of state.steps) {
    const li = document.createElement('li');
    li.className = `step-item${state.selectedStepId === step.def.id ? ' selected' : ''}`;
    li.innerHTML = `
      <span class="step-dot ${step.status}"></span>
      <div class="step-meta">
        <div class="step-name">${step.def.index}. ${step.def.name}</div>
        <div class="step-type">${step.def.type}${step.def.canParallel ? ' · parallel' : ''}</div>
        ${step.error ? `<div class="step-error">${escapeHtml(step.error)}</div>` : ''}
      </div>
    `;
    li.addEventListener('click', () => {
      state.selectedStepId = step.def.id;
      setupConfigForm();
      refresh();
    });
    li.addEventListener('dblclick', (ev) => {
      ev.preventDefault();
      if (!state.generating) {
        void runSingleStep(state, step.def.id);
      }
    });
    stepList.appendChild(li);
  }
  updateRunButtons();
}

function resolveRunStepTarget(): string | null {
  if (state.selectedStepId) {
    return state.selectedStepId;
  }
  return findNextRunnableStepId(state);
}

function updateRunButtons(): void {
  const selectedBtn = document.getElementById('btnRunSelected') as HTMLButtonElement | null;
  const runBtn = document.getElementById('btnRunStep') as HTMLButtonElement | null;
  const targetId = resolveRunStepTarget();
  const step = targetId ? state.steps.find((s) => s.def.id === targetId) : undefined;
  const check = targetId ? canRunStep(state, targetId) : { ok: false, reason: 'No runnable step' };

  if (selectedBtn) {
    const selCheck = state.selectedStepId ? canRunStep(state, state.selectedStepId) : { ok: false };
    selectedBtn.disabled = !state.selectedStepId || state.generating || !selCheck.ok;
    if (state.selectedStepId) {
      const sel = state.steps.find((s) => s.def.id === state.selectedStepId);
      const n = sel?.def.index ?? '?';
      selectedBtn.textContent =
        sel?.status === 'succeeded' ? `Re-run step ${n}` : `Run step ${n}`;
      selectedBtn.title = selCheck.reason ?? '';
    } else {
      selectedBtn.textContent = 'Run selected step';
      selectedBtn.title = 'Select a step in the pipeline list';
    }
  }

  if (runBtn) {
    runBtn.disabled = state.generating || !check.ok;
    if (step && check.ok) {
      runBtn.textContent = `Run step ${step.def.index}`;
      runBtn.title = step.def.name;
    } else {
      runBtn.textContent = 'Run step';
      runBtn.title = check.reason ?? '';
    }
  }
}

function renderSectorInspect(): void {
  const sector = map.getSelectedSector();
  const c = map.cursor;
  if (!sector) {
    sectorInspect.innerHTML = `
      <div class="inspect-coord">${c.x} : ${c.y}</div>
      <p style="color: var(--muted); font-size: 0.78rem">Outside galaxy or no data.</p>
    `;
    return;
  }
  const landableLines = sector.landables
    .slice(0, 12)
    .map((l) => {
      const pos = `[${l.position[0].toFixed(0)}, ${l.position[1].toFixed(0)}]`;
      return `<li>${l.type} ${l.id}${l.name ? ` — ${l.name}` : ''} @ ${pos}</li>`;
    })
    .join('');
  sectorInspect.innerHTML = `
    <div class="inspect-coord">${c.x} : ${c.y}</div>
    <dl class="inspect-dl">
      <dt>In galaxy</dt><dd>${sector.inGalaxy ? 'yes' : 'no'}</dd>
      <dt>Faction</dt><dd>${sector.factionId ?? '—'}</dd>
      <dt>Shape weight</dt><dd>${(sector.shapeWeight ?? 0).toFixed(2)}</dd>
      <dt>Region</dt><dd>${sector.regionType ?? '—'}</dd>
      <dt>Landables</dt><dd>${sector.landableCount}</dd>
      <dt>Radiation</dt><dd>${sector.radiation.toFixed(2)}</dd>
      <dt>Nebula</dt><dd>${sector.hasNebula ? 'yes' : 'no'}</dd>
      <dt>Ruins</dt><dd>${sector.hasRuins ? 'yes' : 'no'}</dd>
      <dt>Shimmer</dt><dd>${sector.hasShimmer ? 'yes' : 'no'}</dd>
    </dl>
    ${sector.landableCount > 0 ? `<ul style="margin:0;padding-left:18px;font-size:0.75rem;font-family:monospace">${landableLines}</ul>` : ''}
  `;
}

function renderLog(): void {
  logView.innerHTML = state.log
    .slice()
    .reverse()
    .slice(0, 80)
    .map((e) => {
      const t = new Date(e.ts).toLocaleTimeString();
      const step = e.stepId ? ` [${e.stepId}]` : '';
      return `<div class="log-line ${e.level}">${t}${step} ${escapeHtml(e.message)}</div>`;
    })
    .join('');
}

function updateMapLegend(): void {
  const root = document.getElementById('mapLegend');
  if (!root) return;
  const items: { key: keyof typeof DEFAULT_LAYERS; label: string; colour: string }[] = [
    { key: 'structure', label: 'Shape mask', colour: 'rgb(90, 118, 150)' },
    { key: 'landables', label: 'Landables', colour: 'rgb(220, 235, 255)' },
    { key: 'grid', label: 'Grid', colour: 'rgba(255,255,255,0.3)' },
    { key: 'coords', label: 'Coords', colour: 'rgba(255,255,255,0.5)' },
    { key: 'factions', label: 'Factions', colour: 'rgb(100, 180, 255)' },
    { key: 'radiation', label: 'Radiation', colour: 'rgb(255, 90, 40)' },
    { key: 'nebula', label: 'Nebula', colour: 'rgba(160, 110, 255, 0.85)' },
    { key: 'ruins', label: 'Ruins', colour: 'rgb(200, 160, 80)' },
    { key: 'shimmer', label: 'Shimmer', colour: 'rgb(180, 255, 220)' }
  ];
  root.innerHTML = items
    .map(
      (item) =>
        `<span class="map-legend-item${state.layers[item.key] ? '' : ' off'}"><span class="swatch" style="background:${item.colour}"></span>${item.label}</span>`
    )
    .join('');
}

function refresh(): void {
  map.setMapData(state.getMapData());
  renderSteps();
  renderStepOutput(state);
  renderSectorInspect();
  renderLog();
  updateToolbarButtons();
  updateMapLegend();
}

function updateToolbarButtons(): void {
  const gen = document.getElementById('btnGenerate') as HTMLButtonElement;
  if (gen) {
    gen.disabled = state.generating;
    gen.textContent = state.generating ? 'Generating…' : 'Continue pipeline';
  }
  updateRunButtons();
}

document.getElementById('btnRunStep')?.addEventListener('click', () => {
  const targetId = resolveRunStepTarget();
  if (!targetId) {
    state.applyPreview();
    refresh();
    return;
  }
  const check = canRunStep(state, targetId);
  if (check.ok) {
    void runSingleStep(state, targetId);
  } else if (targetId === '01_galaxy_structure') {
    state.applyPreview();
    refresh();
  } else {
    state.appendLog('warn', check.reason ?? 'Cannot run step', targetId);
    refresh();
  }
});

document.getElementById('btnGenerate')?.addEventListener('click', () => {
  void runPipeline(state);
});

document.getElementById('btnReset')?.addEventListener('click', () => {
  state.resetPipeline();
  state.appendLog('info', 'Reset all state');
  refresh();
});

document.getElementById('btnExportCheckpoint')?.addEventListener('click', () => {
  const blob = new Blob([state.exportCheckpoint()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `worldgen_checkpoint_${state.config.global.seed}.json`;
  a.click();
  URL.revokeObjectURL(url);
  state.appendLog('info', 'Exported checkpoint');
});

document.getElementById('fileWorld')?.addEventListener('change', async (ev) => {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const world = JSON.parse(await file.text()) as WorldFileSlice;
    if (!world.galaxy?.gridWidth || !world.sectors) {
      throw new Error('Invalid world file: missing galaxy or sectors');
    }
    state.loadWorld(world);
    refresh();
  } catch (e) {
    state.appendLog('error', e instanceof Error ? e.message : 'Failed to load world');
    refresh();
  }
  (ev.target as HTMLInputElement).value = '';
});

document.getElementById('fileCheckpoint')?.addEventListener('change', async (ev) => {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!state.importCheckpoint(data)) {
      throw new Error('Invalid checkpoint format');
    }
    setupConfigForm();
    refresh();
  } catch (e) {
    state.appendLog('error', e instanceof Error ? e.message : 'Failed to load checkpoint');
    refresh();
  }
  (ev.target as HTMLInputElement).value = '';
});

canvas.addEventListener('mousedown', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const cell = map.pickCell(ev.clientX - rect.left, ev.clientY - rect.top);
  if (cell) {
    map.cursor = cell;
    map.render();
    renderSectorInspect();
  }
});

window.addEventListener('keydown', (ev) => {
  if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) {
    return;
  }
  let dx = 0;
  let dy = 0;
  if (ev.code === 'ArrowLeft') dx = -1;
  else if (ev.code === 'ArrowRight') dx = 1;
  else if (ev.code === 'ArrowUp') dy = 1;
  else if (ev.code === 'ArrowDown') dy = -1;
  if (dx !== 0 || dy !== 0) {
    ev.preventDefault();
    map.moveCursor(dx, dy);
    map.render();
    renderSectorInspect();
  }
});

state.subscribe(() => refresh());

window.addEventListener('resize', () => {
  map.resize();
  map.render();
});

let last = performance.now();
function loop(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  map.tick(dt);
  map.render();
  requestAnimationFrame(loop);
}

setupConfigForm();
initLayerControls();
bindOutputViewTabs();
state.appendLog('info', 'Worldgen explorer ready — select a step to edit its parameters');
if (
  isAnthropicApiKeyConfigured(
    state.anthropicApiKeySource,
    state.config.steps['03_species'].anthropicApiKey
  )
) {
  state.appendLog('info', apiKeySourceLabel(state.anthropicApiKeySource));
}
refresh();
requestAnimationFrame(loop);

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
