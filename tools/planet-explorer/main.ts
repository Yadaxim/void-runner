import { renderPlanet } from '../../src/renderer/planets/renderPlanet';
import type { PlanetRenderOpts } from '../../src/renderer/planets/types';
import {
  SURFACE_ROWS,
  classifySurface,
  defaultOptsForSurface,
  normalizeOpts,
  sampleOptsForSurface,
  surfaceLabel,
  type SurfaceType
} from './surfaceTypes';

const EDITOR_CANVAS_SIZE = 280;
const EDITOR_RADIUS = 108;
const GALLERY_CELL = 112;
const GALLERY_PREVIEW_RADIUS = 42;
const GALLERY_ROW_LABEL_W = 88;
const GALLERY_COL_GAP = 12;
const GALLERY_ROW_GAP = 10;

const GALLERY_CELL_W = GALLERY_CELL + GALLERY_COL_GAP;

let editorOpts: PlanetRenderOpts = defaultOptsForSurface('continental', EDITOR_RADIUS);
let editorSurfacePreset: SurfaceType = 'continental';

const editorCanvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
const galleryCanvas = document.getElementById('gallery-canvas') as HTMLCanvasElement;
const controlsEl = document.getElementById('controls') as HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'className') {
        node.className = v;
      } else if (k === 'textContent') {
        node.textContent = v;
      } else {
        node.setAttribute(k, v);
      }
    });
  }
  children.forEach((c) => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return node;
}

function sliderDecimals(step: number): number {
  if (step >= 1) return 0;
  if (step >= 0.1) return 1;
  return 2;
}

function formatVal(val: number, step: number): string {
  return Number(val).toFixed(sliderDecimals(step));
}

function applyNormalizedOpts(): void {
  Object.assign(editorOpts, normalizeOpts(editorOpts, EDITOR_RADIUS));
}

function bindSlider(
  key: keyof PlanetRenderOpts,
  def: { label: string; min: number; max: number; step: number },
  onChange: () => void
): HTMLLabelElement {
  const wrap = el('label', { 'data-param': String(key) });
  wrap.appendChild(document.createTextNode(def.label));
  const valSpan = el('span', { className: 'val' });
  valSpan.textContent = formatVal(Number(editorOpts[key]), def.step);
  wrap.appendChild(valSpan);

  const input = el('input', {
    type: 'range',
    min: String(def.min),
    max: String(def.max),
    step: String(def.step),
    value: String(editorOpts[key])
  });
  input.addEventListener('input', () => {
    const decimals = sliderDecimals(def.step);
    const n = Number(Number(input.value).toFixed(decimals));
    (editorOpts as Record<string, number | boolean>)[key] = n;
    applyNormalizedOpts();
    valSpan.textContent = formatVal(Number(editorOpts[key]), def.step);
    onChange();
  });
  wrap.insertBefore(input, valSpan);
  return wrap;
}

function renderToCanvas(canvas: HTMLCanvasElement, opts: PlanetRenderOpts): void {
  renderPlanet(canvas, opts);
}

function updateClassified(): void {
  const classifiedEl = document.getElementById('classified-type');
  if (!classifiedEl) return;
  const type = classifySurface(editorOpts);
  const label = surfaceLabel(type);
  const preset = surfaceLabel(editorSurfacePreset);
  if (type === editorSurfacePreset) {
    classifiedEl.textContent = `Surface: ${label}`;
  } else {
    classifiedEl.textContent = `Surface: ${label} (preset: ${preset})`;
  }
}

function redrawEditor(): void {
  applyNormalizedOpts();
  renderToCanvas(editorCanvas, editorOpts);
  updateClassified();
  updateRingCheckbox();
  const jsonTa = document.getElementById('config-json') as HTMLTextAreaElement | null;
  if (jsonTa && document.activeElement !== jsonTa) {
    jsonTa.value = JSON.stringify(editorOpts, null, 2);
  }
}

function updateRingCheckbox(): void {
  const ringCb = document.getElementById('force-ring-cb') as HTMLInputElement | null;
  if (!ringCb) return;
  ringCb.checked = editorOpts.forceRing;
  ringCb.disabled = classifySurface(editorOpts) === 'moon';
}

const PARAM_DEFS: { key: keyof PlanetRenderOpts; label: string; min: number; max: number; step: number }[] = [
  { key: 'radius', label: 'Radius (preview)', min: 24, max: EDITOR_RADIUS, step: 1 },
  { key: 'noiseScale', label: 'Noise scale', min: 1, max: 7, step: 0.1 },
  { key: 'rocky', label: 'Rocky', min: 0, max: 1, step: 0.01 },
  { key: 'chaos', label: 'Chaos (storms)', min: 0, max: 1, step: 0.01 },
  { key: 'cloudDensity', label: 'Cloud density', min: 0, max: 1, step: 0.01 },
  { key: 'atmoThickness', label: 'Atmosphere', min: 0, max: 1, step: 0.01 }
];

function galleryVariantCount(): number {
  const input = document.getElementById('gallery-variants') as HTMLInputElement;
  return Math.min(24, Math.max(4, Number(input?.value) || 12));
}

function gallerySeed(): number {
  const input = document.getElementById('gallery-seed') as HTMLInputElement;
  return (Number(input?.value) || 42) >>> 0;
}

function galleryColCenterX(variantIdx: number): number {
  return GALLERY_ROW_LABEL_W + variantIdx * GALLERY_CELL_W + GALLERY_CELL / 2;
}

function redrawGallery(): void {
  const seed = gallerySeed();
  const variants = galleryVariantCount();
  const variantsInput = document.getElementById('gallery-variants') as HTMLInputElement;
  if (variantsInput) variantsInput.value = String(variants);

  const rowStride = GALLERY_CELL + GALLERY_ROW_GAP;
  const gridW = variants * GALLERY_CELL_W - GALLERY_COL_GAP;
  const W = GALLERY_ROW_LABEL_W + gridW;
  const H = SURFACE_ROWS.length * rowStride - GALLERY_ROW_GAP;

  galleryCanvas.width = W;
  galleryCanvas.height = H;
  galleryCanvas.style.width = `${W}px`;
  galleryCanvas.style.height = `${H}px`;

  const ctx = galleryCanvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, W, H);
  ctx.font = '11px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#6060a0';
  ctx.textBaseline = 'middle';

  const scratch = document.createElement('canvas');
  scratch.width = GALLERY_CELL;
  scratch.height = GALLERY_CELL;

  SURFACE_ROWS.forEach((row, typeIdx) => {
    const rowY = typeIdx * rowStride;
    const rowMidY = rowY + GALLERY_CELL / 2;

    if (typeIdx > 0) {
      ctx.strokeStyle = '#1e1e30';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, rowY - GALLERY_ROW_GAP / 2);
      ctx.lineTo(W, rowY - GALLERY_ROW_GAP / 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#6060a0';
    ctx.fillText(row.label, 8, rowMidY);

    for (let v = 0; v < variants; v += 1) {
      const opts = sampleOptsForSurface(row.id, seed, v, GALLERY_PREVIEW_RADIUS);
      renderToCanvas(scratch, opts);
      const x = GALLERY_ROW_LABEL_W + v * GALLERY_CELL_W;
      ctx.drawImage(scratch, x, rowY);
    }
  });
}

function galleryHitTest(canvasX: number, canvasY: number): { type: SurfaceType; variant: number } | null {
  const variants = galleryVariantCount();
  const rowStride = GALLERY_CELL + GALLERY_ROW_GAP;
  if (canvasX < GALLERY_ROW_LABEL_W) return null;
  const col = Math.floor((canvasX - GALLERY_ROW_LABEL_W) / GALLERY_CELL_W);
  if (col < 0 || col >= variants) return null;
  const cellX0 = GALLERY_ROW_LABEL_W + col * GALLERY_CELL_W;
  if (canvasX >= cellX0 + GALLERY_CELL) return null;
  const row = Math.floor(canvasY / rowStride);
  if (row < 0 || row >= SURFACE_ROWS.length) return null;
  const rowY = row * rowStride;
  if (canvasY >= rowY + GALLERY_CELL) return null;
  return { type: SURFACE_ROWS[row].id, variant: col };
}

function openGalleryCell(hit: { type: SurfaceType; variant: number }): void {
  const seed = gallerySeed();
  editorSurfacePreset = hit.type;
  Object.assign(
    editorOpts,
    sampleOptsForSurface(hit.type, seed, hit.variant, EDITOR_RADIUS)
  );
  const editorTab = document.querySelector('[data-tab="editor"]') as HTMLButtonElement | null;
  editorTab?.click();
  syncControlValues();
  redrawEditor();
}

function syncControlValues(): void {
  const seedInput = document.getElementById('seed-input') as HTMLInputElement | null;
  if (seedInput) seedInput.value = String(editorOpts.seed);

  const presetSel = document.getElementById('surface-preset-sel') as HTMLSelectElement | null;
  if (presetSel) presetSel.value = editorSurfacePreset;

  PARAM_DEFS.forEach((def) => {
    const wrap = document.querySelector(`[data-param="${def.key}"]`);
    if (!wrap) return;
    const input = wrap.querySelector('input[type="range"]') as HTMLInputElement | null;
    const valSpan = wrap.querySelector('.val');
    const val = Number(editorOpts[def.key]);
    if (input) input.value = String(val);
    if (valSpan) valSpan.textContent = formatVal(val, def.step);
  });

  updateRingCheckbox();
}

function buildControls(): void {
  controlsEl.innerHTML = '';

  const seedSec = el('div', { className: 'section' });
  seedSec.appendChild(el('h2', { textContent: 'Seed' }));
  const seedRow = el('div', { className: 'row' });
  const seedInput = el('input', { type: 'number', id: 'seed-input', value: String(editorOpts.seed) });
  seedRow.appendChild(seedInput);
  const applyBtn = el('button', { type: 'button', textContent: 'Apply seed' });
  applyBtn.addEventListener('click', () => {
    editorOpts.seed = (Number(seedInput.value) || 1) >>> 0;
    redrawEditor();
  });
  seedRow.appendChild(applyBtn);
  const randomBtn = el('button', { type: 'button', textContent: 'Random' });
  randomBtn.addEventListener('click', () => {
    editorOpts.seed = Math.floor(Math.random() * 1_000_000) >>> 0;
    seedInput.value = String(editorOpts.seed);
    redrawEditor();
  });
  seedRow.appendChild(randomBtn);
  seedSec.appendChild(seedRow);
  controlsEl.appendChild(seedSec);

  const typeSec = el('div', { className: 'section' });
  typeSec.appendChild(el('h2', { textContent: 'Surface preset' }));
  typeSec.appendChild(el('p', { className: 'classified', id: 'classified-type' }));
  const presetSel = el('select', { id: 'surface-preset-sel' });
  SURFACE_ROWS.forEach((row) => {
    const opt = el('option', { value: row.id, textContent: row.label });
    if (row.id === editorSurfacePreset) opt.selected = true;
    presetSel.appendChild(opt);
  });
  presetSel.addEventListener('change', () => {
    editorSurfacePreset = presetSel.value as SurfaceType;
    const next = defaultOptsForSurface(editorSurfacePreset, EDITOR_RADIUS);
    next.seed = editorOpts.seed;
    Object.assign(editorOpts, next);
    syncControlValues();
    redrawEditor();
  });
  typeSec.appendChild(presetSel);
  typeSec.appendChild(
    el('p', { className: 'hint' }, [
      'Type is derived from rocky + atmosphere (see void_runner_planets.md). Preset loads typical params; sliders can push across bands.'
    ])
  );
  controlsEl.appendChild(typeSec);

  const paramSec = el('div', { className: 'section', id: 'param-section' });
  paramSec.appendChild(el('h2', { textContent: 'Parameters' }));
  const ringLb = el('label');
  const ringCb = el('input', { type: 'checkbox', id: 'force-ring-cb' });
  ringCb.checked = editorOpts.forceRing;
  ringCb.addEventListener('change', () => {
    editorOpts.forceRing = ringCb.checked;
    applyNormalizedOpts();
    redrawEditor();
  });
  ringLb.appendChild(ringCb);
  ringLb.appendChild(document.createTextNode(' Force ring'));
  paramSec.appendChild(ringLb);
  PARAM_DEFS.forEach((def) => {
    const node = bindSlider(def.key, def, redrawEditor);
    node.className = 'param';
    paramSec.appendChild(node);
  });
  controlsEl.appendChild(paramSec);

  const jsonSec = el('div', { className: 'section' });
  jsonSec.appendChild(el('h2', { textContent: 'Config JSON' }));
  const ta = el('textarea', { id: 'config-json' });
  jsonSec.appendChild(ta);
  const jsonRow = el('div', { className: 'row' });
  const copyBtn = el('button', { type: 'button', textContent: 'Copy' });
  copyBtn.addEventListener('click', () => {
    ta.value = JSON.stringify(editorOpts, null, 2);
    void navigator.clipboard?.writeText(ta.value);
  });
  jsonRow.appendChild(copyBtn);
  const loadBtn = el('button', { type: 'button', textContent: 'Load' });
  loadBtn.addEventListener('click', () => {
    try {
      Object.assign(
        editorOpts,
        normalizeOpts(JSON.parse(ta.value) as Partial<PlanetRenderOpts>, EDITOR_RADIUS)
      );
      editorSurfacePreset = classifySurface(editorOpts);
      syncControlValues();
      redrawEditor();
    } catch (e) {
      alert(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  jsonRow.appendChild(loadBtn);
  jsonSec.appendChild(jsonRow);
  controlsEl.appendChild(jsonSec);

  syncControlValues();
}

function initTabs(): void {
  document.querySelectorAll('.tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      document.querySelectorAll('.tabs button').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`${tab}-view`)?.classList.add('active');
      if (tab === 'gallery') redrawGallery();
      else redrawEditor();
    });
  });
}

function initGallery(): void {
  document.getElementById('gallery-random')?.addEventListener('click', () => {
    const input = document.getElementById('gallery-seed') as HTMLInputElement;
    input.value = String(Math.floor(Math.random() * 100_000));
    redrawGallery();
  });
  document.getElementById('gallery-seed')?.addEventListener('change', redrawGallery);
  document.getElementById('gallery-variants')?.addEventListener('change', redrawGallery);
  document.getElementById('gallery-open-editor')?.addEventListener('click', () => {
    document.querySelector('[data-tab="editor"]')?.dispatchEvent(new Event('click'));
    syncControlValues();
    redrawEditor();
  });

  galleryCanvas.addEventListener('click', (e) => {
    const rect = galleryCanvas.getBoundingClientRect();
    const scaleX = galleryCanvas.width / rect.width;
    const scaleY = galleryCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const hit = galleryHitTest(x, y);
    if (hit) openGalleryCell(hit);
  });
}

editorCanvas.width = EDITOR_CANVAS_SIZE;
editorCanvas.height = EDITOR_CANVAS_SIZE;

buildControls();
initTabs();
initGallery();
redrawEditor();
redrawGallery();
