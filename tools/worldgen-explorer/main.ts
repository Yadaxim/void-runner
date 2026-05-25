import { GalaxyMapView } from './galaxyMap';
import { runPipeline, retryStep } from './pipelineRunner';
import { ExplorerState } from './state';
import type { GalaxyShape, WorldFileSlice } from './types';
import { DEFAULT_LAYERS } from './types';

const state = new ExplorerState();

const canvas = document.getElementById('galaxyCanvas') as HTMLCanvasElement;
const configForm = document.getElementById('configForm') as HTMLDivElement;
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

function bindConfigForm(): void {
  const c = state.config;
  configForm.innerHTML = `
    <div class="field">
      <label>World name</label>
      <input type="text" id="cfgName" value="${escapeAttr(c.worldName)}" maxlength="48" />
    </div>
    <div class="field-row">
      <div class="field">
        <label>Size X</label>
        <input type="number" id="cfgSizeX" min="10" max="80" value="${c.sizeX}" />
      </div>
      <div class="field">
        <label>Size Y</label>
        <input type="number" id="cfgSizeY" min="10" max="80" value="${c.sizeY}" />
      </div>
    </div>
    <div class="field">
      <label>Sector size (world units)</label>
      <input type="number" id="cfgSectorSize" min="1000" max="50000" step="500" value="${c.sectorSize}" />
    </div>
    <div class="field">
      <label>Shape</label>
      <select id="cfgShape">
        ${(['disc', 'ring', 'spiral', 'heterogeneous'] as GalaxyShape[])
          .map((s) => `<option value="${s}"${s === c.shape ? ' selected' : ''}>${s}</option>`)
          .join('')}
      </select>
    </div>
    <div class="field">
      <label>Planet density (0–1)</label>
      <input type="number" id="cfgDensity" min="0" max="1" step="0.05" value="${c.planetDensity}" />
    </div>
    <div class="field">
      <label>Moon probability (0–1)</label>
      <input type="number" id="cfgMoonProb" min="0" max="1" step="0.05" value="${c.moonProbability}" />
    </div>
    <div class="field-row">
      <div class="field">
        <label>Moons min</label>
        <input type="number" id="cfgMoonMin" min="0" max="8" value="${c.moonsPerPlanetRange[0]}" />
      </div>
      <div class="field">
        <label>Moons max</label>
        <input type="number" id="cfgMoonMax" min="0" max="8" value="${c.moonsPerPlanetRange[1]}" />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Seed</label>
        <input type="number" id="cfgSeed" value="${c.seed}" />
      </div>
      <div class="field">
        <label>Species count</label>
        <input type="number" id="cfgSpecies" min="1" max="12" value="${c.speciesCount}" />
      </div>
    </div>
    <div class="panel-header" style="margin: 12px -12px 8px; padding-left: 12px">Map layers</div>
    <div class="layer-toggles" id="layerToggles"></div>
    <hr class="panel-divider" />
    <div class="panel-header panel-header-sub">Map key</div>
    <div class="map-legend panel-legend" id="mapLegend"></div>
    <div class="btn-row">
      <button type="button" id="btnRetryStep" disabled>Retry selected step</button>
    </div>
  `;

  const sync = (): void => {
    state.config.worldName = (document.getElementById('cfgName') as HTMLInputElement).value;
    state.config.sizeX = clampInt((document.getElementById('cfgSizeX') as HTMLInputElement).value, 10, 80);
    state.config.sizeY = clampInt((document.getElementById('cfgSizeY') as HTMLInputElement).value, 10, 80);
    state.config.sectorSize = clampInt((document.getElementById('cfgSectorSize') as HTMLInputElement).value, 1000, 50000);
    state.config.shape = (document.getElementById('cfgShape') as HTMLSelectElement).value as GalaxyShape;
    state.config.planetDensity = clampFloat((document.getElementById('cfgDensity') as HTMLInputElement).value, 0, 1);
    state.config.moonProbability = clampFloat((document.getElementById('cfgMoonProb') as HTMLInputElement).value, 0, 1);
    const moonMin = clampInt((document.getElementById('cfgMoonMin') as HTMLInputElement).value, 0, 8);
    const moonMax = clampInt((document.getElementById('cfgMoonMax') as HTMLInputElement).value, 0, 8);
    state.config.moonsPerPlanetRange = [Math.min(moonMin, moonMax), Math.max(moonMin, moonMax)];
    state.config.seed = Number.parseInt((document.getElementById('cfgSeed') as HTMLInputElement).value, 10) || 0;
    state.config.speciesCount = clampInt((document.getElementById('cfgSpecies') as HTMLInputElement).value, 1, 12);
    refresh();
  };

  for (const id of [
    'cfgName',
    'cfgSizeX',
    'cfgSizeY',
    'cfgSectorSize',
    'cfgShape',
    'cfgDensity',
    'cfgMoonProb',
    'cfgMoonMin',
    'cfgMoonMax',
    'cfgSeed',
    'cfgSpecies'
  ]) {
    document.getElementById(id)?.addEventListener('change', sync);
    document.getElementById(id)?.addEventListener('input', sync);
  }

  renderLayerToggles();
  updateMapLegend();

  document.getElementById('btnRetryStep')?.addEventListener('click', () => {
    if (state.selectedStepId && !state.generating) {
      void retryStep(state, state.selectedStepId);
    }
  });
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
      renderStepJson();
      renderSteps();
      updateRetryButton();
    });
    stepList.appendChild(li);
  }
  updateRetryButton();
}

function updateRetryButton(): void {
  const btn = document.getElementById('btnRetryStep') as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = !state.selectedStepId || state.generating;
  }
}

function renderStepJson(): void {
  const id = state.selectedStepId;
  if (!id) {
    stepJson.textContent = 'Select a pipeline step';
    return;
  }
  const output = state.stepOutputs[id] ?? state.steps.find((s) => s.def.id === id)?.output;
  stepJson.textContent = output !== undefined ? JSON.stringify(output, null, 2) : '(no output yet)';
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
  renderStepJson();
  renderSectorInspect();
  renderLog();
  updateToolbarButtons();
  updateMapLegend();
}

function updateToolbarButtons(): void {
  const gen = document.getElementById('btnGenerate') as HTMLButtonElement;
  const prev = document.getElementById('btnPreview') as HTMLButtonElement;
  if (gen) {
    gen.disabled = state.generating;
    gen.textContent = state.generating ? 'Generating…' : 'Generate pipeline';
  }
  if (prev) prev.disabled = state.generating;
}

document.getElementById('btnPreview')?.addEventListener('click', () => {
  state.applyPreview();
  refresh();
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
  a.download = `worldgen_checkpoint_${state.config.seed}.json`;
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
    bindConfigForm();
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

bindConfigForm();
initLayerControls();
state.appendLog('info', 'Worldgen explorer ready — load testWorld.json or run step 1');
refresh();
requestAnimationFrame(loop);

function clampInt(v: string, min: number, max: number): number {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function clampFloat(v: string, min: number, max: number): number {
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
