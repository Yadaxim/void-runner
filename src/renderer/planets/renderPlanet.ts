import { SplitMix64 } from '../../core/prng';
import { clamp, hsl2rgb, lerpRGB, smoothstep, type Rgb } from './colour';
import { makeNoise } from './noise';
import { drawRings } from './rings';
import type { PlanetRenderOpts } from './types';

export function renderPlanet(canvas: HTMLCanvasElement, opts: PlanetRenderOpts): void {
  const { seed, radius, noiseScale, rocky, chaos, cloudDensity, atmoThickness, forceRing } = opts;

  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, W, H);

  const rng = new SplitMix64(seed >>> 0);
  const next = (): number => rng.next();
  const SN = makeNoise(seed + 1);
  const LN = makeNoise(seed + 44);
  const CN = makeNoise(seed + 99);
  const StN = makeNoise(seed + 777);

  const isMoon = atmoThickness < 0.05 || rocky > 0.85;
  const isOcean = rocky < 0.25 && atmoThickness > 0.1;
  const hasContinents = rocky >= 0.25 && rocky < 0.75;

  let hue1: number;
  let hue2: number;
  let hue3: number;
  let sat: number;
  let baseL: number;

  if (isMoon || rocky > 0.75) {
    const mp = Math.floor(next() * 5);
    if (mp === 0) {
      hue1 = 20;
      hue2 = 35;
      hue3 = 50;
      sat = 18 + next() * 22;
      baseL = 30 + next() * 18;
    } else if (mp === 1) {
      hue1 = 200;
      hue2 = 215;
      hue3 = 225;
      sat = 10 + next() * 20;
      baseL = 28 + next() * 16;
    } else if (mp === 2) {
      hue1 = 5;
      hue2 = 18;
      hue3 = 30;
      sat = 22 + next() * 28;
      baseL = 25 + next() * 18;
    } else if (mp === 3) {
      hue1 = 40;
      hue2 = 55;
      hue3 = 65;
      sat = 8 + next() * 14;
      baseL = 32 + next() * 20;
    } else {
      hue1 = 260;
      hue2 = 275;
      hue3 = 285;
      sat = 8 + next() * 18;
      baseL = 22 + next() * 18;
    }
  } else {
    hue1 = next() * 360;
    hue2 = hue1 + 30 + next() * 100 * (next() < 0.5 ? 1 : -1);
    hue3 = hue2 + 25 + next() * 70;
    sat = 50 + next() * 45;
    baseL = 30 + next() * 22;
  }

  const oceanHue = isOcean ? 170 + next() * 60 : 190 + next() * 40;
  const oceanSat = 55 + next() * 35;
  const oceanLit = 25 + next() * 18;
  const landHue = isOcean ? (next() < 0.4 ? 100 + next() * 60 : 20 + next() * 60) : 30 + next() * 80;
  const landSat = isOcean ? 30 + next() * 40 : 28 + next() * 45;
  const landLit = isOcean ? 30 + next() * 18 : 30 + next() * 22;
  const landThreshold = 0.28 + next() * 0.38;

  const cO1 = hsl2rgb(oceanHue, oceanSat, oceanLit);
  const cO2 = hsl2rgb(oceanHue + 18, oceanSat * 0.65, oceanLit + 12);
  const cL1 = hsl2rgb(landHue, landSat, landLit);
  const cL2 = hsl2rgb(landHue + 25, landSat * 0.7, landLit + 14);

  const hasRing = !isMoon && (forceRing || next() < 0.32);
  const ringTiltY = 0.08 + next() * 0.32;
  const ringTiltAngle = (next() - 0.5) * 0.7;
  const atmoHue = isOcean ? oceanHue + (next() - 0.5) * 25 : hue1 + (next() - 0.5) * 55;
  const warpStr = isMoon ? 0.3 + next() * 0.5 : 0.8 + next() * 2.0;
  const lac = 1.9 + next() * 0.7;
  const gain = 0.44 + next() * 0.1;
  const stormLac = 2.8 + next() * 1.2;
  const stormWarp = 0.8 + chaos * 3.5;

  const r2 = radius * radius;
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const oc = off.getContext('2d');
  if (!oc) {
    return;
  }
  const imgd = oc.createImageData(W, H);
  const dd = imgd.data;

  const c1 = hsl2rgb(hue1, sat, baseL);
  const c2 = hsl2rgb(hue2, isMoon ? sat : sat * 0.85, baseL + 10);
  const c3 = hsl2rgb(hue3, isMoon ? sat * 0.8 : sat * 0.7, baseL + 20);

  for (let py = 0; py < H; py += 1) {
    for (let px = 0; px < W; px += 1) {
      const dx = px - cx;
      const dy = py - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) {
        continue;
      }
      const nz = Math.sqrt(1 - d2 / r2);
      const nx = dx / radius;
      const ny = dy / radius;
      const u = 0.5 + Math.atan2(nx, nz) / (Math.PI * 2);
      const v = 0.5 - Math.asin(clamp(ny, -1, 1)) / Math.PI;
      let rgb: Rgb;
      let t: number;

      if (isOcean || hasContinents) {
        const landN = LN.warp(u * 1.8, v * 1.8, 5, 2.0, 0.5, 2.2);
        const isLand = rocky < 0.25 ? landN > landThreshold + 0.22 : landN > landThreshold;
        const detail = SN.warp(u * noiseScale, v * noiseScale, 5, lac, gain, warpStr * 0.7);
        const fine = SN.n2(u * noiseScale * 5 + 22, v * noiseScale * 5 + 7);
        if (isLand) {
          t = Math.pow(detail, 1 + rocky * 0.6);
          rgb = lerpRGB(cL1, cL2, t < 0.5 ? t * 2 : (t - 0.5) * 2);
          const bmp = fine * rocky * 0.15;
          rgb = [rgb[0] * (0.88 + bmp * 2), rgb[1] * (0.88 + bmp * 2), rgb[2] * (0.88 + bmp * 2)];
        } else {
          rgb = lerpRGB(cO1, cO2, clamp(detail, 0, 1));
          const shal = smoothstep(landThreshold - 0.12, landThreshold, landN);
          const shallow = hsl2rgb(oceanHue + 10, oceanSat * 0.45, oceanLit + 24);
          rgb = lerpRGB(rgb, shallow, shal * 0.5);
        }
      } else if (rocky > 0.75 || isMoon) {
        const base = SN.warp(u * noiseScale, v * noiseScale, 6, lac, gain, warpStr);
        const fine2 = SN.fbm(u * noiseScale * 4.5 + 22, v * noiseScale * 4.5 + 7, 4, 2.1, 0.48);
        const rf = clamp((rocky - 0.75) / 0.25, 0, 1);
        t = Math.pow(clamp(base * (1 - rf * 0.55) + fine2 * rf * 0.55, 0, 1), 1 + rf * 3.0);
        rgb = t < 0.5 ? lerpRGB(c1, c2, t * 2) : lerpRGB(c2, c3, (t - 0.5) * 2);
        const bump2 = SN.n2(u * noiseScale * 9 + 33, v * noiseScale * 9 + 11);
        const bm = 0.82 + bump2 * 0.36;
        rgb = [rgb[0] * bm, rgb[1] * bm, rgb[2] * bm];
      } else {
        const base = SN.warp(u * noiseScale, v * noiseScale, 6, lac, gain, warpStr);
        const su = u * noiseScale * 2.2;
        const sv = v * noiseScale * 0.55;
        const sdx = StN.fbm(su + 1.3, sv * stormLac, 3, stormLac, 0.5);
        const sdy = StN.fbm(su + 9.1, sv * stormLac + 4.2, 3, stormLac, 0.5);
        const storm = StN.fbm(su + stormWarp * sdx, sv + stormWarp * sdy * 0.4, 5, stormLac, 0.48);
        t = clamp(base * (1 - chaos * 0.7) + storm * chaos * 0.7, 0, 1);
        rgb = t < 0.5 ? lerpRGB(c1, c2, t * 2) : lerpRGB(c2, c3, (t - 0.5) * 2);
      }

      const light = clamp(nx * -0.55 + ny * -0.45 + nz * 0.82, 0, 1);
      const limb = Math.pow(nz, 0.4);
      const shading = (0.18 + light * 0.82) * limb;
      const idx = (py * W + px) * 4;
      dd[idx] = Math.round(clamp(rgb[0] * shading, 0, 255));
      dd[idx + 1] = Math.round(clamp(rgb[1] * shading, 0, 255));
      dd[idx + 2] = Math.round(clamp(rgb[2] * shading, 0, 255));
      dd[idx + 3] = 255;
    }
  }
  oc.putImageData(imgd, 0, 0);

  if (hasRing) {
    drawRings(ctx, cx, cy, radius, isOcean ? oceanHue : hue2, seed, ringTiltY, ringTiltAngle, 'back');
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(off, 0, 0);

  if (!isMoon && cloudDensity > 0.05 && rocky < 0.7) {
    const cid = oc.createImageData(W, H);
    const cd = cid.data;
    for (let py = 0; py < H; py += 1) {
      for (let px = 0; px < W; px += 1) {
        const dx = px - cx;
        const dy = py - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) {
          continue;
        }
        const nz2 = Math.sqrt(1 - d2 / r2);
        const nx2 = dx / radius;
        const ny2 = dy / radius;
        const u2 = 0.5 + Math.atan2(nx2, nz2) / (Math.PI * 2);
        const v2 = 0.5 - Math.asin(clamp(ny2, -1, 1)) / Math.PI;
        const cn = CN.warp(u2 * 3.8, v2 * 2.1 + chaos * 0.8, 4, 2.1, 0.5, 0.6 + chaos * 1.2);
        const alpha = Math.max(0, (cn - 0.52 + cloudDensity * 0.22) * 3.2) * 195;
        if (alpha < 3) {
          continue;
        }
        const ii = (py * W + px) * 4;
        cd[ii] = 238;
        cd[ii + 1] = 238;
        cd[ii + 2] = 238;
        cd[ii + 3] = Math.min(190, alpha);
      }
    }
    oc.putImageData(cid, 0, 0);
    ctx.drawImage(off, 0, 0);
  }
  ctx.restore();

  if (!isMoon) {
    const atmoR = radius * (1.06 + atmoThickness * 0.2);
    const ag = ctx.createRadialGradient(cx, cy, radius * 0.9, cx, cy, atmoR);
    ag.addColorStop(
      0,
      `hsla(${Math.round(atmoHue)},${Math.round(sat * 0.55)}%,${Math.min(Math.round(baseL + 32), 88)}%,${(0.07 + atmoThickness * 0.4).toFixed(2)})`
    );
    ag.addColorStop(
      0.45,
      `hsla(${Math.round(atmoHue)},${Math.round(sat * 0.35)}%,${Math.min(Math.round(baseL + 18), 78)}%,${(0.03 + atmoThickness * 0.15).toFixed(2)})`
    );
    ag.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(cx, cy, atmoR, 0, Math.PI * 2);
    ctx.fillStyle = ag;
    ctx.fill();
  }

  if (hasRing) {
    drawRings(ctx, cx, cy, radius, isOcean ? oceanHue : hue2, seed, ringTiltY, ringTiltAngle, 'front');
  }
}
