import { apiKeySourceLabel, isAnthropicApiKeyConfigured } from './apiKey';
import type { ExplorerState } from './state';
import {
  type ExplorerConfig,
  type StepConfigId,
  stepConfigTitle
} from './stepConfigs';
import type { GalaxyShape } from './types';

export type ConfigFormRefresh = () => void;

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}

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

function bindIds(ids: string[], sync: () => void, skipCheckboxInput = true): void {
  for (const id of ids) {
    const el = document.getElementById(id);
    el?.addEventListener('change', sync);
    if (skipCheckboxInput && el instanceof HTMLInputElement && el.type !== 'checkbox') {
      el.addEventListener('input', sync);
    }
  }
}

function renderStep1Fields(c: ExplorerConfig): string {
  const p = c.steps['01_galaxy_structure'];
  return `
    <div class="field-row">
      <div class="field">
        <label>Size X</label>
        <input type="number" id="s1SizeX" min="10" max="80" value="${p.sizeX}" />
      </div>
      <div class="field">
        <label>Size Y</label>
        <input type="number" id="s1SizeY" min="10" max="80" value="${p.sizeY}" />
      </div>
    </div>
    <div class="field">
      <label>Sector size (world units)</label>
      <input type="number" id="s1SectorSize" min="1000" max="50000" step="500" value="${p.sectorSize}" />
    </div>
    <div class="field">
      <label>Shape</label>
      <select id="s1Shape">
        ${(['disc', 'ring', 'spiral', 'heterogeneous'] as GalaxyShape[])
          .map((s) => `<option value="${s}"${s === p.shape ? ' selected' : ''}>${s}</option>`)
          .join('')}
      </select>
    </div>
    <div class="field">
      <label>Planet density (0–1)</label>
      <input type="number" id="s1Density" min="0" max="1" step="0.05" value="${p.planetDensity}" />
    </div>
    <div class="field">
      <label>Moon probability (0–1)</label>
      <input type="number" id="s1MoonProb" min="0" max="1" step="0.05" value="${p.moonProbability}" />
    </div>
    <div class="field-row">
      <div class="field">
        <label>Moons min</label>
        <input type="number" id="s1MoonMin" min="0" max="8" value="${p.moonsPerPlanetRange[0]}" />
      </div>
      <div class="field">
        <label>Moons max</label>
        <input type="number" id="s1MoonMax" min="0" max="8" value="${p.moonsPerPlanetRange[1]}" />
      </div>
    </div>
  `;
}

function renderStep2Fields(c: ExplorerConfig): string {
  const p = c.steps['02_special_sectors'];
  return `
    <p class="field-hint">Uses master seed. Radiation follows galaxy geometry.</p>
    <div class="field-row">
      <div class="field">
        <label>Nebula clusters min</label>
        <input type="number" id="s2NebCountMin" min="1" max="20" value="${p.nebulaClusterCountMin}" />
      </div>
      <div class="field">
        <label>Nebula clusters max</label>
        <input type="number" id="s2NebCountMax" min="1" max="20" value="${p.nebulaClusterCountMax}" />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Cluster size min (sectors)</label>
        <input type="number" id="s2NebSizeMin" min="3" max="40" value="${p.nebulaClusterSizeMin}" />
      </div>
      <div class="field">
        <label>Cluster size max</label>
        <input type="number" id="s2NebSizeMax" min="3" max="40" value="${p.nebulaClusterSizeMax}" />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Shimmer fraction min</label>
        <input type="number" id="s2ShimMin" min="0" max="0.2" step="0.005" value="${p.shimmerFractionMin}" />
      </div>
      <div class="field">
        <label>Shimmer fraction max</label>
        <input type="number" id="s2ShimMax" min="0" max="0.2" step="0.005" value="${p.shimmerFractionMax}" />
      </div>
    </div>
  `;
}

function renderAnthropicKeyBlock(state: ExplorerState): string {
  const p = state.config.steps['03_species'];
  const source = state.anthropicApiKeySource;
  const configured = isAnthropicApiKeyConfigured(source, p.anthropicApiKey);
  const external = source === 'env' || source === 'secrets-file';

  if (configured && external) {
    const where = source === 'env' ? '.env' : '.secrets/anthropic-api-key';
    return `
    <div class="field">
      <label>Anthropic API key</label>
      <div class="api-key-card configured">
        <span class="api-key-card-mark" aria-hidden="true">✓</span>
        <div>
          <strong>Key is set</strong>
          <p>Loaded from <code>${where}</code>. It is not shown in the browser (only used when you run step 3).</p>
          <p class="field-hint">Restart <code>npm run dev:worldgen</code> after editing <code>.env</code>.</p>
        </div>
      </div>
      <button type="button" class="api-key-override-btn" id="btnApiKeyOverride">Override with a key in this tab</button>
      <div class="api-key-override-field" id="apiKeyOverrideField" hidden>
        <input type="password" id="s3ApiKey" value="" autocomplete="off" placeholder="sk-ant-…" />
      </div>
    </div>`;
  }

  if (configured && source === 'manual') {
    return `
    <div class="field">
      <label>Anthropic API key (typed in this tab)</label>
      <input type="password" id="s3ApiKey" value="${escapeAttr(p.anthropicApiKey)}" autocomplete="off" placeholder="sk-ant-…" />
      <p class="field-hint api-key-status">${escapeAttr(apiKeySourceLabel(source))}</p>
    </div>`;
  }

  return `
    <div class="field">
      <label>Anthropic API key</label>
      <input type="password" id="s3ApiKey" value="" autocomplete="off" placeholder="sk-ant-…" />
      <p class="field-hint">Or set <code>ANTHROPIC_API_KEY</code> / <code>VITE_ANTHROPIC_API_KEY</code> in <code>.env</code> and restart the dev server.</p>
    </div>`;
}

function renderStep4Fields(c: ExplorerConfig): string {
  const p = c.steps['04_faction_skeleton'];
  return `
    <p class="field-hint">Uses step 1 landable count and step 3 species roster. First major is always 100% human.</p>
    <div class="field">
      <label>Major factions per landable</label>
      <input type="number" id="s4MajorRate" min="0.001" max="0.1" step="0.001" value="${p.majorPerLandables}" />
    </div>
    <p class="field-hint">Major count = round(landables × rate), clamped 2–5.</p>
    <div class="field-row">
      <div class="field">
        <label>Minors per major (min)</label>
        <input type="number" id="s4MinorMin" min="0" max="6" value="${p.minorPerMajorMin}" />
      </div>
      <div class="field">
        <label>Minors per major (max)</label>
        <input type="number" id="s4MinorMax" min="0" max="6" value="${p.minorPerMajorMax}" />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Independents (min)</label>
        <input type="number" id="s4IndMin" min="0" max="20" value="${p.independentCountMin}" />
      </div>
      <div class="field">
        <label>Independents (max)</label>
        <input type="number" id="s4IndMax" min="0" max="20" value="${p.independentCountMax}" />
      </div>
    </div>
  `;
}

function syncStep4(state: ExplorerState): void {
  const p = state.config.steps['04_faction_skeleton'];
  p.majorPerLandables = clampFloat(
    (document.getElementById('s4MajorRate') as HTMLInputElement).value,
    0.001,
    0.1
  );
  const minorMin = clampInt((document.getElementById('s4MinorMin') as HTMLInputElement).value, 0, 6);
  const minorMax = clampInt((document.getElementById('s4MinorMax') as HTMLInputElement).value, 0, 6);
  p.minorPerMajorMin = Math.min(minorMin, minorMax);
  p.minorPerMajorMax = Math.max(minorMin, minorMax);
  const indMin = clampInt((document.getElementById('s4IndMin') as HTMLInputElement).value, 0, 20);
  const indMax = clampInt((document.getElementById('s4IndMax') as HTMLInputElement).value, 0, 20);
  p.independentCountMin = Math.min(indMin, indMax);
  p.independentCountMax = Math.max(indMin, indMax);
}

function renderStep3Fields(c: ExplorerConfig, state: ExplorerState): string {
  const p = c.steps['03_species'];
  return `
    <p class="field-hint">Independent of galaxy shape. Lore loaded from plan/worldgen/lore.md.</p>
    <div class="field">
      <label>Species count</label>
      <input type="number" id="s3Count" min="3" max="9" value="${p.speciesCount}" />
    </div>
    <div class="field">
      <label><input type="checkbox" id="s3Mock" ${p.useLlmMock ? 'checked' : ''} /> Mock LLM (fixture roster)</label>
    </div>
    ${renderAnthropicKeyBlock(state)}
    <div class="field">
      <label>Max retries (live LLM)</label>
      <input type="number" id="s3Retries" min="1" max="6" value="${p.maxRetries}" />
    </div>
  `;
}

function renderUnknownStep(stepId: string): string {
  return `<p class="field-hint">No parameters for <code>${stepId}</code> yet.</p>`;
}

function syncGlobal(state: ExplorerState): void {
  state.config.global.worldName = (document.getElementById('cfgName') as HTMLInputElement).value;
  state.config.global.seed =
    Number.parseInt((document.getElementById('cfgSeed') as HTMLInputElement).value, 10) || 0;
}

function syncStep1(state: ExplorerState): void {
  const p = state.config.steps['01_galaxy_structure'];
  p.sizeX = clampInt((document.getElementById('s1SizeX') as HTMLInputElement).value, 10, 80);
  p.sizeY = clampInt((document.getElementById('s1SizeY') as HTMLInputElement).value, 10, 80);
  p.sectorSize = clampInt((document.getElementById('s1SectorSize') as HTMLInputElement).value, 1000, 50000);
  p.shape = (document.getElementById('s1Shape') as HTMLSelectElement).value as GalaxyShape;
  p.planetDensity = clampFloat((document.getElementById('s1Density') as HTMLInputElement).value, 0, 1);
  p.moonProbability = clampFloat((document.getElementById('s1MoonProb') as HTMLInputElement).value, 0, 1);
  const moonMin = clampInt((document.getElementById('s1MoonMin') as HTMLInputElement).value, 0, 8);
  const moonMax = clampInt((document.getElementById('s1MoonMax') as HTMLInputElement).value, 0, 8);
  p.moonsPerPlanetRange = [Math.min(moonMin, moonMax), Math.max(moonMin, moonMax)];
}

function syncStep2(state: ExplorerState): void {
  const p = state.config.steps['02_special_sectors'];
  p.nebulaClusterCountMin = clampInt(
    (document.getElementById('s2NebCountMin') as HTMLInputElement).value,
    1,
    20
  );
  p.nebulaClusterCountMax = clampInt(
    (document.getElementById('s2NebCountMax') as HTMLInputElement).value,
    1,
    20
  );
  p.nebulaClusterSizeMin = clampInt(
    (document.getElementById('s2NebSizeMin') as HTMLInputElement).value,
    3,
    40
  );
  p.nebulaClusterSizeMax = clampInt(
    (document.getElementById('s2NebSizeMax') as HTMLInputElement).value,
    3,
    40
  );
  p.shimmerFractionMin = clampFloat(
    (document.getElementById('s2ShimMin') as HTMLInputElement).value,
    0,
    0.2
  );
  p.shimmerFractionMax = clampFloat(
    (document.getElementById('s2ShimMax') as HTMLInputElement).value,
    0,
    0.2
  );
}

function syncStep3(state: ExplorerState): void {
  const p = state.config.steps['03_species'];
  p.speciesCount = clampInt((document.getElementById('s3Count') as HTMLInputElement).value, 3, 9);
  p.useLlmMock = (document.getElementById('s3Mock') as HTMLInputElement).checked;
  const keyInput = document.getElementById('s3ApiKey') as HTMLInputElement | null;
  if (keyInput) {
    state.setAnthropicApiKey(keyInput.value);
  }
  p.maxRetries = clampInt((document.getElementById('s3Retries') as HTMLInputElement).value, 1, 6);
}

export interface ConfigFormHooks {
  renderLayerToggles?: () => void;
  updateMapLegend?: () => void;
  updatePanelTitle?: (title: string) => void;
}

export function bindConfigForm(
  state: ExplorerState,
  refresh: ConfigFormRefresh,
  onRunSelected: () => void,
  hooks?: ConfigFormHooks
): void {
  const root = document.getElementById('configForm');
  if (!root) return;

  const stepId = (state.selectedStepId ?? '01_galaxy_structure') as StepConfigId;
  const step = state.steps.find((s) => s.def.id === stepId);
  const c = state.config;

  if (stepId === '03_species') {
    state.refreshAnthropicApiKeyDetection();
  }

  if (step) {
    hooks?.updatePanelTitle?.(stepConfigTitle(step.def.id, step.def.index, step.def.name));
  }

  let stepFields = renderUnknownStep(stepId);
  if (stepId === '01_galaxy_structure') stepFields = renderStep1Fields(c);
  else if (stepId === '02_special_sectors') stepFields = renderStep2Fields(c);
  else if (stepId === '03_species') stepFields = renderStep3Fields(c, state);
  else if (stepId === '04_faction_skeleton') stepFields = renderStep4Fields(c);

  root.innerHTML = `
    <div class="panel-header panel-header-sub">World</div>
    <div class="field">
      <label>World name</label>
      <input type="text" id="cfgName" value="${escapeAttr(c.global.worldName)}" maxlength="48" />
    </div>
    <div class="field">
      <label>Master seed</label>
      <input type="number" id="cfgSeed" value="${c.global.seed}" />
    </div>
    <hr class="panel-divider" />
    ${stepFields}
    <hr class="panel-divider" />
    <div class="panel-header panel-header-sub">Map layers</div>
    <div class="layer-toggles" id="layerToggles"></div>
    <hr class="panel-divider" />
    <div class="panel-header panel-header-sub">Map key</div>
    <div class="map-legend panel-legend" id="mapLegend"></div>
    <div class="btn-row">
      <button type="button" id="btnRunSelected" disabled>Run selected step</button>
    </div>
  `;

  const syncAll = (): void => {
    syncGlobal(state);
    if (stepId === '01_galaxy_structure') syncStep1(state);
    else if (stepId === '02_special_sectors') syncStep2(state);
    else if (stepId === '03_species') syncStep3(state);
    else if (stepId === '04_faction_skeleton') syncStep4(state);
    refresh();
  };

  bindIds(['cfgName', 'cfgSeed'], syncAll);
  if (stepId === '01_galaxy_structure') {
    bindIds(
      ['s1SizeX', 's1SizeY', 's1SectorSize', 's1Shape', 's1Density', 's1MoonProb', 's1MoonMin', 's1MoonMax'],
      syncAll
    );
  } else if (stepId === '02_special_sectors') {
    bindIds(
      ['s2NebCountMin', 's2NebCountMax', 's2NebSizeMin', 's2NebSizeMax', 's2ShimMin', 's2ShimMax'],
      syncAll
    );
  } else if (stepId === '03_species') {
    bindIds(['s3Count', 's3Retries'], syncAll);
    document.getElementById('s3Mock')?.addEventListener('change', syncAll);
    document.getElementById('s3ApiKey')?.addEventListener('change', syncAll);
    document.getElementById('s3ApiKey')?.addEventListener('input', syncAll);
    document.getElementById('btnApiKeyOverride')?.addEventListener('click', () => {
      const field = document.getElementById('apiKeyOverrideField');
      field?.removeAttribute('hidden');
      (document.getElementById('s3ApiKey') as HTMLInputElement | null)?.focus();
    });
  } else if (stepId === '04_faction_skeleton') {
    bindIds(['s4MajorRate', 's4MinorMin', 's4MinorMax', 's4IndMin', 's4IndMax'], syncAll);
  }

  document.getElementById('btnRunSelected')?.addEventListener('click', onRunSelected);
  hooks?.renderLayerToggles?.();
  hooks?.updateMapLegend?.();
}
