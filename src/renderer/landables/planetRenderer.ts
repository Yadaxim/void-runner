import { SplitMix64 } from '../../core/prng';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace('#', '').trim();
  const normalized = value.length === 3 ? value.split('').map((ch) => `${ch}${ch}`).join('') : value;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mixRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number
): { r: number; g: number; b: number } {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t)
  };
}

function rgbToCss(rgb: { r: number; g: number; b: number }, alpha = 1): string {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function lighten(hex: string, amount: number): string {
  const base = hexToRgb(hex);
  const mixed = mixRgb(base, { r: 255, g: 255, b: 255 }, clamp01(amount));
  return rgbToCss(mixed);
}

function darken(hex: string, amount: number): string {
  const base = hexToRgb(hex);
  const mixed = mixRgb(base, { r: 0, g: 0, b: 0 }, clamp01(amount));
  return rgbToCss(mixed);
}

export function drawPlanet(
  ctx: CanvasRenderingContext2D,
  centreX: number,
  centreY: number,
  radius: number,
  seed: number,
  colourHint?: string
): void {
  const palettes = ['#3a6ea8', '#8a5a3a', '#4a8a4a', '#7a4a8a', '#8a7a3a'];
  colourHint = colourHint ?? palettes[Math.abs(seed) % palettes.length];
  const prng = new SplitMix64(seed >>> 0);
  const rand = (): number => prng.next();
  const base = hexToRgb(colourHint);
  const lighter = lighten(colourHint, 0.45);
  const darker = darken(colourHint, 0.45);

  const glow = ctx.createRadialGradient(centreX, centreY, radius * 0.9, centreX, centreY, radius * 1.15);
  glow.addColorStop(0, rgbToCss(base, 0.08));
  glow.addColorStop(1, rgbToCss(base, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius * 1.15, 0, Math.PI * 2);
  ctx.fill();

  const fill = ctx.createRadialGradient(
    centreX - radius * 0.28,
    centreY - radius * 0.28,
    radius * 0.2,
    centreX,
    centreY,
    radius
  );
  fill.addColorStop(0, lighter);
  fill.addColorStop(1, darker);

  ctx.save();
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = fill;
  ctx.fillRect(centreX - radius, centreY - radius, radius * 2, radius * 2);

  const detailCount = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < detailCount; i += 1) {
    const dx = (rand() * 1.2 - 0.6) * radius;
    const dy = (rand() * 1.2 - 0.6) * radius;
    const rx = (0.32 + rand() * 0.34) * radius;
    const ry = (0.18 + rand() * 0.2) * radius;
    const angle = rand() * Math.PI * 2;
    const tintShift = (rand() - 0.5) * 0.2;
    const detailColour = mixRgb(base, { r: tintShift > 0 ? 255 : 0, g: tintShift > 0 ? 255 : 0, b: tintShift > 0 ? 255 : 0 }, Math.abs(tintShift));
    ctx.fillStyle = rgbToCss(detailColour, 0.15 + rand() * 0.1);
    ctx.beginPath();
    ctx.ellipse(centreX + dx, centreY + dy, rx, ry, angle, 0, Math.PI * 2);
    ctx.fill();
  }

  const crescentDirection = rand() > 0.5 ? 1 : -1;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(
    centreX + crescentDirection * radius * 0.42,
    centreY,
    radius * 0.95,
    radius * 1.05,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();
}
