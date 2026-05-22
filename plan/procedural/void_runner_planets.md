# Void Runner — Procedural Planet Rendering

A complete reference for the planet renderer. Every planet is deterministic: the same `seed` + parameters always produce the same image. All randomness flows from a single seeded PRNG.

**Void Runner runtime:** implements this spec in `src/renderer/planets/` using **`SplitMix64`** (`src/core/prng.ts`), not mulberry32. Textures are cached per landable; flight draws via `drawImage`. No faction tint on bodies. Minimap unchanged (dot size from `radius` only). Stations use the legacy station renderer until Phase 6 station doc.

---

## Parameters

```js
{
  seed:           Number,   // integer, drives all randomness
  radius:         Number,   // pixels
  noiseScale:     Number,   // 1–7, controls feature size (low=continents, high=fine texture)
  rocky:          Number,   // 0–1 (0=ocean world, 0.25–0.75=continental, 0.85+=moon)
  chaos:          Number,   // 0–1, storm band intensity (gas giants)
  cloudDensity:   Number,   // 0–1
  atmoThickness:  Number,   // 0–1 (0 = moon: no atmosphere, no clouds)
  forceRing:      Boolean
}
```

**Planet type is implicit** — derived from `rocky` and `atmoThickness`:

| Condition | Type |
|---|---|
| `atmoThickness < 0.05` or `rocky > 0.85` | Moon |
| `rocky < 0.25` and `atmoThickness > 0.1` | Ocean world |
| `rocky >= 0.25` and `rocky < 0.75` | Continental |
| `rocky > 0.75` | Dry/barren rock |
| otherwise | Gas giant |

---

## Architecture

Rendering happens in **two phases**: a pixel-level offscreen pass that fills a `ImageData` buffer directly, then a Canvas 2D compositing pass for rings and atmosphere.

### Phase 1 — Pixel pass (offscreen ImageData)

For every pixel inside the sphere:

1. Compute the **sphere surface normal** from pixel coordinates:
```js
const nz = Math.sqrt(1 - (dx*dx + dy*dy) / r2);
const nx = dx / radius;
const ny = dy / radius;
```

2. Project to **spherical UV** so noise wraps correctly around the sphere:
```js
const u = 0.5 + Math.atan2(nx, nz) / (Math.PI * 2);
const v = 0.5 - Math.asin(clamp(ny, -1, 1)) / Math.PI;
```
This is the key step — sampling noise in UV space means all surface features curve with the sphere geometry rather than projecting flat.

3. Sample **noise** (see below) to get a value `t ∈ [0, 1]`.

4. **Map `t` to colour** using a 3-stop gradient: `c1 → c2 → c3`, all derived from seed.

5. Apply **diffuse lighting** with a light source from upper-left + limb darkening:
```js
const light  = clamp(nx*(-0.55) + ny*(-0.45) + nz*0.82, 0, 1);
const limb   = Math.pow(nz, 0.4);
const shading = (0.18 + light * 0.82) * limb;
```

### Phase 2 — Canvas compositing

In order (back to front):

1. Ring back half (if present)
2. `ctx.clip()` to sphere circle
3. Draw offscreen pixel buffer
4. Cloud pass (second pixel buffer, drawn on top inside clip)
5. Restore clip
6. Atmosphere glow (unclipped radial gradient)
7. Ring front half

---

## Noise System

### PRNG — mulberry32

All randomness uses a single fast integer hash. Every call advances the state:

```js
function mkrng(seed) {
  var s = seed >>> 0;
  return function() {
    s = s + 0x6D2B79F5 | 0;
    var t = Math.imul(s ^ s>>>15, 1|s);
    t = t + Math.imul(t ^ t>>>7, 61|t) ^ t;
    return ((t ^ t>>>14) >>> 0) / 4294967296;
  };
}
```

**Important:** RNG calls are in a fixed sequence per code path. Adding or removing calls shifts all subsequent values. Drain the same number of RNG calls per branch even if unused, or your seed→planet mapping will break.

### Gradient noise (Perlin-style)

Standard 2D gradient noise. Permutation table shuffled with the seed so each `makeNoise(seed)` instance is independent:

```js
function makeNoise(seed) {
  // builds perm[512] and gradient table gx/gy[256]
  // exposes: n2(x,y), fbm(x,y,oct,lac,gain), warp(x,y,oct,lac,gain,ws)
}
```

Multiple independent noise instances are used per planet:
- `SN = makeNoise(seed+1)` — surface detail
- `LN = makeNoise(seed+44)` — large-scale landmass shapes
- `CN = makeNoise(seed+99)` — cloud layer
- `StN = makeNoise(seed+777)` — storm bands

### fBm (fractal Brownian motion)

Layered octaves of noise. Higher octaves add fine detail:

```js
function fbm(x, y, oct, lac, gain) {
  // oct: number of octaves (6 = detailed)
  // lac: lacunarity, frequency multiplier per octave (1.9–2.6)
  // gain: amplitude multiplier per octave (0.44–0.54)
}
```

### Domain warping

The main technique for organic shapes. Displaces the sample coordinates with a second noise pass before the final sample:

```js
function warp(x, y, oct, lac, gain, ws) {
  var dx = fbm(x+3.7, y+1.3, 3, lac, gain);
  var dy = fbm(x+8.2, y+5.1, 3, lac, gain);
  return fbm(x + ws*dx, y + ws*dy, oct, lac, gain);
}
// ws (warp strength): 0.3 (subtle) to 2.5 (violent turbulence)
```

---

## Surface Modes

### Gas giant

```js
// Base warped noise
const base = SN.warp(u*noiseScale, v*noiseScale, 6, lac, gain, warpStr);

// Storm layer: U stretched 2.2×, V compressed 0.55× → horizontal bands
const su = u * noiseScale * 2.2;
const sv = v * noiseScale * 0.55;
const sdx = StN.fbm(su+1.3, sv*stormLac, 3, stormLac, 0.5);
const sdy = StN.fbm(su+9.1, sv*stormLac+4.2, 3, stormLac, 0.5);
const storm = StN.fbm(su + stormWarp*sdx, sv + stormWarp*sdy*0.4, 5, stormLac, 0.48);

// chaos blends between calm and stormy
t = base*(1 - chaos*0.7) + storm*chaos*0.7;
```

The asymmetric warp (full X, 40% Y) is what creates Jupiter-style vortex curling at band edges.

### Ocean / Continental

Uses a separate low-frequency noise pass for continent shapes:

```js
// Large slow noise → continent mask
const landN = LN.warp(u*1.8, v*1.8, 5, 2.0, 0.5, 2.2);
const isLand = landN > landThreshold; // threshold seeded: 0.28–0.66

// Ocean: smooth gradient + shallow-water brightening near coasts
const shallowness = smoothstep(landThreshold-0.12, landThreshold, landN);

// Land: detail noise + fine bump texture
const detail = SN.warp(u*noiseScale, v*noiseScale, 5, lac, gain, warpStr*0.7);
const fine   = SN.n2(u*noiseScale*5+22, v*noiseScale*5+7);
```

Ocean and land each have independent 2-colour gradients derived from seed. Land colour can be green, tan, ochre, or alien depending on seed.

### Rocky / Moon

High-frequency multi-octave blend for gritty texture:

```js
const base  = SN.warp(u*noiseScale, v*noiseScale, 6, lac, gain, warpStr);
const fine2 = SN.fbm(u*noiseScale*4.5+22, v*noiseScale*4.5+7, 4, 2.1, 0.48);
// rf = how rocky (0–1)
t = base*(1 - rf*0.55) + fine2*rf*0.55;
t = Math.pow(t, 1 + rf*3.0); // contrast boost

// Per-pixel luminance bump at ~9× scale for pitted/dusty feel
const bump = SN.n2(u*noiseScale*9+33, v*noiseScale*9+11);
rgb = rgb.map(ch => ch * (0.82 + bump*0.36));
```

---

## Colour Palettes

### Planet palette (gas, ocean, continental)

Three hues derived from seed, pushed apart for contrast:

```js
hue1 = rng() * 360;
hue2 = hue1 + 30 + rng()*100 * (rng()<0.5 ? 1 : -1);
hue3 = hue2 + 25 + rng()*70;
sat  = 50 + rng()*45;   // saturated
baseL = 30 + rng()*22;
```

### Moon palette

Picks from 5 mood presets:

| Preset | Description | Hue range | Sat |
|---|---|---|---|
| 0 | Ochre / tan | 20–50 | 18–40 |
| 1 | Cold blue-grey | 200–225 | 10–30 |
| 2 | Rust red | 5–30 | 22–50 |
| 3 | Pale sand | 40–65 | 8–22 |
| 4 | Dark purple-grey | 260–285 | 8–26 |

### Ocean / land colours

Ocean hue is seeded in the blue-teal range (170–250). Land hue is either warm (20–80) or, at lower rocky values, can be green (100–160) — alien jungle worlds.

---

## Cloud Layer

A second pixel pass rendered into a separate `ImageData` and drawn on top inside the sphere clip:

```js
const cn = CN.warp(u*3.8, v*2.1 + chaos*0.8, 4, 2.1, 0.5, 0.6 + chaos*1.2);
const alpha = Math.max(0, (cn - 0.52 + cloudDensity*0.22) * 3.2) * 195;
// RGB: 238,238,238 (off-white)
```

Higher `chaos` shifts the cloud warp offset, making cloud patterns align with storm bands.

Clouds are skipped when `isMoon` or `rocky > 0.7`.

---

## Atmosphere Glow

Unclipped radial gradient, drawn after restoring the sphere clip:

```js
const atmoR = radius * (1.06 + atmoThickness * 0.2);
const ag = ctx.createRadialGradient(cx, cy, radius*0.9, cx, cy, atmoR);
ag.addColorStop(0,   `hsla(${atmoHue}, ..., ${0.07 + atmoThickness*0.4})`);
ag.addColorStop(0.45,`hsla(${atmoHue}, ..., ${0.03 + atmoThickness*0.15})`);
ag.addColorStop(1,   'transparent');
```

`atmoHue` is derived from `hue1` ± 55° (or from `oceanHue` for ocean worlds).

---

## Ring System

Rings are drawn **twice**: back half before the sphere, front half after. This gives correct occlusion with no depth sorting needed.

```js
// back: Math.PI → 2*Math.PI
// front: 0 → Math.PI
ctx.ellipse(0, 0, outerR, outerR, 0, startAngle, endAngle, false);
ctx.ellipse(0, 0, innerR, innerR, 0, endAngle, startAngle, true); // cutout
```

Tilt is applied with rotate + scale:
```js
ctx.rotate(tiltAngle);  // ±0.35 rad — left/right lean
ctx.scale(1, tiltY);    // 0.08–0.40 — vertical squash
```

Band generation (1–4 bands, seeded):
```js
const innerStart = r * (1.15 + rng()*0.12);
const totalWidth = r * (0.12 + rng()*0.9);  // razor-thin to very wide
// each band: independent hue (basehue ± 120°), saturation, alpha
// with a radial gradient from inner to outer edge
```

---

## Full Implementation

```js
// ---- PRNG ----
function mkrng(seed) {
  var s = seed >>> 0;
  return function() {
    s = s + 0x6D2B79F5 | 0;
    var t = Math.imul(s ^ s>>>15, 1|s);
    t = t + Math.imul(t ^ t>>>7, 61|t) ^ t;
    return ((t ^ t>>>14) >>> 0) / 4294967296;
  };
}

// ---- Perlin noise ----
function makeNoise(seed) {
  var rng = mkrng(seed);
  var perm = new Uint8Array(512);
  var gx = new Float32Array(256), gy = new Float32Array(256);
  var i, j, tmp, a;
  for (i = 0; i < 256; i++) {
    a = rng() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); perm[i] = i;
  }
  for (i = 255; i > 0; i--) {
    j = Math.floor(rng() * (i+1)); tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
  }
  for (i = 0; i < 256; i++) perm[i+256] = perm[i];

  function fade(t) { return t*t*t*(t*(t*6-15)+10); }
  function mix(a, b, t) { return a + (b-a)*t; }

  function n2(x, y) {
    var xi = Math.floor(x)&255, yi = Math.floor(y)&255;
    var xf = x-Math.floor(x), yf = y-Math.floor(y);
    var u = fade(xf), v = fade(yf);
    var aa = perm[perm[xi]+yi],   ab = perm[perm[xi]+yi+1];
    var ba = perm[perm[xi+1]+yi], bb = perm[perm[xi+1]+yi+1];
    return mix(
      mix(gx[aa]*xf + gy[aa]*yf,       gx[ba]*(xf-1) + gy[ba]*yf,       u),
      mix(gx[ab]*xf + gy[ab]*(yf-1),   gx[bb]*(xf-1) + gy[bb]*(yf-1),   u), v
    ) * 0.5 + 0.5;
  }

  function fbm(x, y, oct, lac, gain) {
    var v = 0, amp = 0.5, f = 1, mx = 0, k;
    for (k = 0; k < oct; k++) { v += n2(x*f, y*f)*amp; mx += amp; amp *= gain; f *= lac; }
    return v / mx;
  }

  function warp(x, y, oct, lac, gain, ws) {
    var dx = fbm(x+3.7, y+1.3, 3, lac, gain);
    var dy = fbm(x+8.2, y+5.1, 3, lac, gain);
    return fbm(x + ws*dx, y + ws*dy, oct, lac, gain);
  }

  return { n2: n2, fbm: fbm, warp: warp };
}

// ---- Colour helpers ----
function hsl2rgb(h, s, l) {
  h = ((h%360)+360)%360; s /= 100; l /= 100;
  var c = (1-Math.abs(2*l-1))*s, x = c*(1-Math.abs((h/60)%2-1)), m = l-c/2;
  var r=0,g=0,b=0;
  if(h<60){r=c;g=x;}else if(h<120){r=x;g=c;}else if(h<180){g=c;b=x;}
  else if(h<240){g=x;b=c;}else if(h<300){r=x;b=c;}else{r=c;b=x;}
  return [(r+m)*255, (g+m)*255, (b+m)*255];
}
function lerpRGB(a, b, t) {
  return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
}
function smoothstep(e0, e1, x) {
  var t = Math.max(0, Math.min(1, (x-e0)/(e1-e0))); return t*t*(3-2*t);
}
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

// ---- Rings ----
function drawRings(ctx, cx, cy, r, basehue, sat, lit, seed, tiltY, tiltAngle, half) {
  var rng = mkrng(seed+333);
  var bandCount = 1 + Math.floor(rng()*4);
  var innerStart = r * (1.15 + rng()*0.12);
  var totalWidth = r * (0.12 + rng()*0.9);
  var spacing = totalWidth / bandCount;
  var bands = [], cursor = innerStart;
  for (var i = 0; i < bandCount; i++) {
    var gap = i===0 ? 0 : spacing*(0.05+rng()*0.25);
    var bw  = spacing * (0.3 + rng()*0.6);
    bands.push({
      inner: cursor+gap,
      outer: Math.min(cursor+gap+bw, innerStart+totalWidth),
      h: basehue + (rng()-0.5)*120,
      s: 30+rng()*60, l: 40+rng()*35, a: 0.3+rng()*0.55
    });
    cursor += spacing;
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tiltAngle);
  ctx.scale(1, tiltY);
  var s0 = half==='back' ? Math.PI : 0;
  var e0 = half==='back' ? Math.PI*2 : Math.PI;
  for (var i = 0; i < bands.length; i++) {
    var b = bands[i];
    if (b.outer <= b.inner) continue;
    ctx.beginPath();
    ctx.ellipse(0,0,b.outer,b.outer,0,s0,e0,false);
    ctx.ellipse(0,0,b.inner,b.inner,0,e0,s0,true);
    var grad = ctx.createRadialGradient(0,0,b.inner,0,0,b.outer);
    grad.addColorStop(0, 'hsla('+Math.round(b.h)+','+Math.round(b.s)+'%,'+Math.round(b.l+8)+'%,'+b.a.toFixed(2)+')');
    grad.addColorStop(1, 'hsla('+Math.round(b.h)+','+Math.round(b.s)+'%,'+Math.round(b.l-8)+'%,'+(b.a*0.5).toFixed(2)+')');
    ctx.fillStyle = grad;
    ctx.fill();
  }
  ctx.restore();
}

// ---- Main render function ----
// canvas: HTMLCanvasElement (square, e.g. 256×256)
// opts: see parameters table above
function renderPlanet(canvas, opts) {
  var seed = opts.seed, radius = opts.radius, noiseScale = opts.noiseScale;
  var rocky = opts.rocky, chaos = opts.chaos, cloudDensity = opts.cloudDensity;
  var atmoThickness = opts.atmoThickness, forceRing = opts.forceRing;

  var W = canvas.width, H = canvas.height, cx = W/2, cy = H/2;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  var rng  = mkrng(seed);
  var SN   = makeNoise(seed+1);
  var LN   = makeNoise(seed+44);
  var CN   = makeNoise(seed+99);
  var StN  = makeNoise(seed+777);

  var isMoon       = atmoThickness < 0.05 || rocky > 0.85;
  var isOcean      = rocky < 0.25 && atmoThickness > 0.1;
  var hasContinents = rocky >= 0.25 && rocky < 0.75;

  // Palette
  var hue1, hue2, hue3, sat, baseL;
  if (isMoon || rocky > 0.75) {
    var mp = Math.floor(rng()*5);
    if      (mp===0) { hue1=20;  hue2=35;  hue3=50;  sat=18+rng()*22; baseL=30+rng()*18; }
    else if (mp===1) { hue1=200; hue2=215; hue3=225; sat=10+rng()*20; baseL=28+rng()*16; }
    else if (mp===2) { hue1=5;   hue2=18;  hue3=30;  sat=22+rng()*28; baseL=25+rng()*18; }
    else if (mp===3) { hue1=40;  hue2=55;  hue3=65;  sat=8+rng()*14;  baseL=32+rng()*20; }
    else             { hue1=260; hue2=275; hue3=285; sat=8+rng()*18;  baseL=22+rng()*18; }
  } else {
    hue1  = rng()*360;
    hue2  = hue1 + 30 + rng()*100 * (rng()<0.5 ? 1 : -1);
    hue3  = hue2 + 25 + rng()*70;
    sat   = 50 + rng()*45;
    baseL = 30 + rng()*22;
  }

  var oceanHue = isOcean ? (170+rng()*60) : (190+rng()*40);
  var oceanSat = 55 + rng()*35;
  var oceanLit = 25 + rng()*18;
  var landHue  = isOcean ? (rng()<0.4 ? 100+rng()*60 : 20+rng()*60) : (30+rng()*80);
  var landSat  = isOcean ? (30+rng()*40) : (28+rng()*45);
  var landLit  = isOcean ? (30+rng()*18) : (30+rng()*22);
  var landThreshold = 0.28 + rng()*0.38;

  var cO1 = hsl2rgb(oceanHue,    oceanSat,      oceanLit);
  var cO2 = hsl2rgb(oceanHue+18, oceanSat*0.65, oceanLit+12);
  var cL1 = hsl2rgb(landHue,     landSat,       landLit);
  var cL2 = hsl2rgb(landHue+25,  landSat*0.7,   landLit+14);

  var hasRing      = !isMoon && (forceRing || rng() < 0.32);
  var ringTiltY    = 0.08 + rng()*0.32;
  var ringTiltAngle = (rng()-0.5) * 0.7;
  var atmoHue      = isOcean ? oceanHue+(rng()-0.5)*25 : hue1+(rng()-0.5)*55;
  var warpStr      = isMoon ? 0.3+rng()*0.5 : 0.8+rng()*2.0;
  var lac          = 1.9 + rng()*0.7;
  var gain         = 0.44 + rng()*0.1;
  var stormLac     = 2.8 + rng()*1.2;
  var stormWarp    = 0.8 + chaos*3.5;

  var r2   = radius * radius;
  var off  = document.createElement('canvas'); off.width = W; off.height = H;
  var oc   = off.getContext('2d');
  var imgd = oc.createImageData(W, H);
  var dd   = imgd.data;

  var c1 = hsl2rgb(hue1, sat,        baseL);
  var c2 = hsl2rgb(hue2, isMoon?sat:sat*0.85,  baseL+10);
  var c3 = hsl2rgb(hue3, isMoon?sat*0.8:sat*0.7, baseL+20);

  for (var py = 0; py < H; py++) {
    for (var px = 0; px < W; px++) {
      var dx = px-cx, dy = py-cy, d2 = dx*dx+dy*dy;
      if (d2 > r2) continue;
      var nz = Math.sqrt(1 - d2/r2);
      var nx = dx/radius, ny = dy/radius;
      var u = 0.5 + Math.atan2(nx, nz) / (Math.PI*2);
      var v = 0.5 - Math.asin(clamp(ny, -1, 1)) / Math.PI;
      var rgb, t;

      if (isOcean || hasContinents) {
        var landN  = LN.warp(u*1.8, v*1.8, 5, 2.0, 0.5, 2.2);
        var isLand = rocky < 0.25 ? (landN > landThreshold+0.22) : (landN > landThreshold);
        var detail = SN.warp(u*noiseScale, v*noiseScale, 5, lac, gain, warpStr*0.7);
        var fine   = SN.n2(u*noiseScale*5+22, v*noiseScale*5+7);
        if (isLand) {
          t = Math.pow(detail, 1+rocky*0.6);
          rgb = lerpRGB(cL1, cL2, t < 0.5 ? t*2 : (t-0.5)*2);
          var bmp = fine*rocky*0.15;
          rgb = [rgb[0]*(0.88+bmp*2), rgb[1]*(0.88+bmp*2), rgb[2]*(0.88+bmp*2)];
        } else {
          rgb = lerpRGB(cO1, cO2, clamp(detail, 0, 1));
          var shal    = smoothstep(landThreshold-0.12, landThreshold, landN);
          var shallow = hsl2rgb(oceanHue+10, oceanSat*0.45, oceanLit+24);
          rgb = lerpRGB(rgb, shallow, shal*0.5);
        }
      } else if (rocky > 0.75 || isMoon) {
        var base  = SN.warp(u*noiseScale, v*noiseScale, 6, lac, gain, warpStr);
        var fine2 = SN.fbm(u*noiseScale*4.5+22, v*noiseScale*4.5+7, 4, 2.1, 0.48);
        var rf    = clamp((rocky-0.75)/0.25, 0, 1);
        t = Math.pow(clamp(base*(1-rf*0.55) + fine2*rf*0.55, 0, 1), 1+rf*3.0);
        rgb = t < 0.5 ? lerpRGB(c1,c2,t*2) : lerpRGB(c2,c3,(t-0.5)*2);
        var bump2 = SN.n2(u*noiseScale*9+33, v*noiseScale*9+11);
        var bm = 0.82 + bump2*0.36;
        rgb = [rgb[0]*bm, rgb[1]*bm, rgb[2]*bm];
      } else {
        var base = SN.warp(u*noiseScale, v*noiseScale, 6, lac, gain, warpStr);
        var su = u*noiseScale*2.2, sv = v*noiseScale*0.55;
        var sdx = StN.fbm(su+1.3, sv*stormLac, 3, stormLac, 0.5);
        var sdy = StN.fbm(su+9.1, sv*stormLac+4.2, 3, stormLac, 0.5);
        var storm = StN.fbm(su+stormWarp*sdx, sv+stormWarp*sdy*0.4, 5, stormLac, 0.48);
        t = clamp(base*(1-chaos*0.7) + storm*chaos*0.7, 0, 1);
        rgb = t < 0.5 ? lerpRGB(c1,c2,t*2) : lerpRGB(c2,c3,(t-0.5)*2);
      }

      var light   = clamp(nx*(-0.55) + ny*(-0.45) + nz*0.82, 0, 1);
      var limb    = Math.pow(nz, 0.4);
      var shading = (0.18 + light*0.82) * limb;
      var idx = (py*W+px)*4;
      dd[idx]   = Math.round(clamp(rgb[0]*shading, 0, 255));
      dd[idx+1] = Math.round(clamp(rgb[1]*shading, 0, 255));
      dd[idx+2] = Math.round(clamp(rgb[2]*shading, 0, 255));
      dd[idx+3] = 255;
    }
  }
  oc.putImageData(imgd, 0, 0);

  // Rings (back)
  if (hasRing) drawRings(ctx, cx, cy, radius, isOcean?oceanHue:hue2, sat, baseL, seed, ringTiltY, ringTiltAngle, 'back');

  // Sphere clip
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI*2); ctx.clip();
  ctx.drawImage(off, 0, 0);

  // Cloud pass
  if (!isMoon && cloudDensity > 0.05 && rocky < 0.7) {
    var cid = oc.createImageData(W, H); var cd = cid.data;
    for (var py = 0; py < H; py++) {
      for (var px = 0; px < W; px++) {
        var dx = px-cx, dy = py-cy, d2 = dx*dx+dy*dy;
        if (d2 > r2) continue;
        var nz2 = Math.sqrt(1-d2/r2);
        var nx2 = dx/radius, ny2 = dy/radius;
        var u2  = 0.5 + Math.atan2(nx2, nz2) / (Math.PI*2);
        var v2  = 0.5 - Math.asin(clamp(ny2,-1,1)) / Math.PI;
        var cn  = CN.warp(u2*3.8, v2*2.1+chaos*0.8, 4, 2.1, 0.5, 0.6+chaos*1.2);
        var alpha = Math.max(0, (cn-0.52+cloudDensity*0.22)*3.2) * 195;
        if (alpha < 3) continue;
        var ii = (py*W+px)*4;
        cd[ii]=cd[ii+1]=cd[ii+2]=238; cd[ii+3]=Math.min(190,alpha);
      }
    }
    oc.putImageData(cid, 0, 0); ctx.drawImage(off, 0, 0);
  }
  ctx.restore();

  // Atmosphere
  if (!isMoon) {
    var atmoR = radius * (1.06 + atmoThickness*0.2);
    var ag = ctx.createRadialGradient(cx, cy, radius*0.9, cx, cy, atmoR);
    ag.addColorStop(0,    'hsla('+Math.round(atmoHue)+','+Math.round(sat*0.55)+'%,'+Math.min(Math.round(baseL+32),88)+'%,'+(0.07+atmoThickness*0.4).toFixed(2)+')');
    ag.addColorStop(0.45, 'hsla('+Math.round(atmoHue)+','+Math.round(sat*0.35)+'%,'+Math.min(Math.round(baseL+18),78)+'%,'+(0.03+atmoThickness*0.15).toFixed(2)+')');
    ag.addColorStop(1, 'transparent');
    ctx.beginPath(); ctx.arc(cx, cy, atmoR, 0, Math.PI*2);
    ctx.fillStyle = ag; ctx.fill();
  }

  // Rings (front)
  if (hasRing) drawRings(ctx, cx, cy, radius, isOcean?oceanHue:hue2, sat, baseL, seed, ringTiltY, ringTiltAngle, 'front');
}
```

---

## Usage in Void Runner

```js
// Render a planet onto any canvas element
const canvas = document.getElementById('my-canvas'); // must be square
renderPlanet(canvas, {
  seed:          12345,
  radius:        80,       // should be canvas.width/2 minus some padding
  noiseScale:    3.0,
  rocky:         0.3,      // continental world
  chaos:         0.2,
  cloudDensity:  0.5,
  atmoThickness: 0.4,
  forceRing:     false
});

// For a moon orbiting the above planet — same seed offset, no atmosphere
renderPlanet(moonCanvas, {
  seed:          12345 + 1,
  radius:        30,
  noiseScale:    4.0,
  rocky:         0.9,
  chaos:         0.0,
  cloudDensity:  0.0,
  atmoThickness: 0.0,
  forceRing:     false
});
```

### Performance notes

- The pixel loop is O(radius²) — at radius 80 on a 256×256 canvas it runs in ~10–30ms depending on device.
- Pre-render planets to offscreen canvases at game load and cache them as textures. Don't re-render every frame.
- The cloud pass is a second full pixel loop — skip it (`cloudDensity = 0`) for background/distant planets.
- For very small planets (radius < 20px) the noise detail is lost; consider reducing octave count.
