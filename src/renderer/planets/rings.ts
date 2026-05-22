import { SplitMix64 } from '../../core/prng';

export function drawRings(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  basehue: number,
  seed: number,
  tiltY: number,
  tiltAngle: number,
  half: 'back' | 'front'
): void {
  const rng = new SplitMix64((seed + 333) >>> 0);
  const bandCount = 1 + Math.floor(rng.next() * 4);
  const innerStart = r * (1.15 + rng.next() * 0.12);
  const totalWidth = r * (0.12 + rng.next() * 0.9);
  const spacing = totalWidth / bandCount;
  const bands: { inner: number; outer: number; h: number; s: number; l: number; a: number }[] = [];
  let cursor = innerStart;
  for (let i = 0; i < bandCount; i += 1) {
    const gap = i === 0 ? 0 : spacing * (0.05 + rng.next() * 0.25);
    const bw = spacing * (0.3 + rng.next() * 0.6);
    bands.push({
      inner: cursor + gap,
      outer: Math.min(cursor + gap + bw, innerStart + totalWidth),
      h: basehue + (rng.next() - 0.5) * 120,
      s: 30 + rng.next() * 60,
      l: 40 + rng.next() * 35,
      a: 0.3 + rng.next() * 0.55
    });
    cursor += spacing;
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tiltAngle);
  ctx.scale(1, tiltY);
  const s0 = half === 'back' ? Math.PI : 0;
  const e0 = half === 'back' ? Math.PI * 2 : Math.PI;
  for (const b of bands) {
    if (b.outer <= b.inner) {
      continue;
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, b.outer, b.outer, 0, s0, e0, false);
    ctx.ellipse(0, 0, b.inner, b.inner, 0, e0, s0, true);
    const grad = ctx.createRadialGradient(0, 0, b.inner, 0, 0, b.outer);
    grad.addColorStop(
      0,
      `hsla(${Math.round(b.h)},${Math.round(b.s)}%,${Math.round(b.l + 8)}%,${b.a.toFixed(2)})`
    );
    grad.addColorStop(
      1,
      `hsla(${Math.round(b.h)},${Math.round(b.s)}%,${Math.round(b.l - 8)}%,${(b.a * 0.5).toFixed(2)})`
    );
    ctx.fillStyle = grad;
    ctx.fill();
  }
  ctx.restore();
}
