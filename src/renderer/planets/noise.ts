import { SplitMix64 } from '../../core/prng';

export interface Noise2D {
  n2(x: number, y: number): number;
  fbm(x: number, y: number, oct: number, lac: number, gain: number): number;
  warp(x: number, y: number, oct: number, lac: number, gain: number, ws: number): number;
}

export function makeNoise(seed: number): Noise2D {
  const rng = new SplitMix64(seed >>> 0);
  const perm = new Uint8Array(512);
  const gx = new Float32Array(256);
  const gy = new Float32Array(256);

  for (let i = 0; i < 256; i += 1) {
    const a = rng.next() * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
    perm[i] = i;
  }
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = perm[i]!;
    perm[i] = perm[j]!;
    perm[j] = tmp;
  }
  for (let i = 0; i < 256; i += 1) {
    perm[i + 256] = perm[i]!;
  }

  function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  function mix(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  function n2(x: number, y: number): number {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[xi]! + yi]!;
    const ab = perm[perm[xi]! + yi + 1]!;
    const ba = perm[perm[xi + 1]! + yi]!;
    const bb = perm[perm[xi + 1]! + yi + 1]!;
    return (
      mix(
        mix(gx[aa]! * xf + gy[aa]! * yf, gx[ba]! * (xf - 1) + gy[ba]! * yf, u),
        mix(gx[ab]! * xf + gy[ab]! * (yf - 1), gx[bb]! * (xf - 1) + gy[bb]! * (yf - 1), u),
        v
      ) *
        0.5 +
      0.5
    );
  }

  function fbm(x: number, y: number, oct: number, lac: number, gain: number): number {
    let v = 0;
    let amp = 0.5;
    let f = 1;
    let mx = 0;
    for (let k = 0; k < oct; k += 1) {
      v += n2(x * f, y * f) * amp;
      mx += amp;
      amp *= gain;
      f *= lac;
    }
    return v / mx;
  }

  function warp(x: number, y: number, oct: number, lac: number, gain: number, ws: number): number {
    const dx = fbm(x + 3.7, y + 1.3, 3, lac, gain);
    const dy = fbm(x + 8.2, y + 5.1, 3, lac, gain);
    return fbm(x + ws * dx, y + ws * dy, oct, lac, gain);
  }

  return { n2, fbm, warp };
}
