/**
 * Procedural ship silhouette generator — Small size tier.
 * Nose = −Y, tail = +Y. Vertically symmetric.
 * All hulls share one pipeline: halfWidth(y) → traced path + wing attach.
 * Same seed + bodyType + tier → same ShipConfig.
 */
(function (global) {
  const BODY_TYPES = ['lens', 'spade', 'facet', 'dart', 'rect', 'trapezoid', 'polygon', 'larva', 'orb'];

  /** Body style families are not mutually exclusive (hybrid = multiple flags). */
  const BODY_ORGANIC = new Set(['lens', 'polygon', 'larva']);
  const BODY_INORGANIC = new Set(['lens', 'spade', 'facet', 'dart', 'rect', 'trapezoid', 'polygon']);
  const BODY_ENERGY = new Set(['orb']);

  function isBodyOrganic(bodyType) {
    return BODY_ORGANIC.has(bodyType);
  }

  function isBodyInorganic(bodyType) {
    return BODY_INORGANIC.has(bodyType);
  }

  function isBodyEnergy(bodyType) {
    return BODY_ENERGY.has(bodyType);
  }

  function defaultStyleFilters() {
    return { organic: true, inorganic: true, energy: false };
  }

  function normalizeStyleFilters(filters) {
    const f = { ...defaultStyleFilters(), ...(filters || {}) };
    return { organic: !!f.organic, inorganic: !!f.inorganic, energy: !!f.energy };
  }

  function styleModeFromFilters(filters) {
    const f = normalizeStyleFilters(filters);
    const on = [];
    if (f.organic) on.push('organic');
    if (f.inorganic) on.push('inorganic');
    if (f.energy) on.push('energy');
    if (!on.length) return 'none';
    if (on.length > 1) return on.join('+');
    return on[0];
  }

  function bodyTypesForFilters(filters) {
    const f = normalizeStyleFilters(filters);
    if (!f.organic && !f.inorganic && !f.energy) return [];
    return BODY_TYPES.filter(
      (t) =>
        (f.organic && isBodyOrganic(t)) ||
        (f.inorganic && isBodyInorganic(t)) ||
        (f.energy && isBodyEnergy(t))
    );
  }

  function isBodyTypeAllowed(bodyType, filters) {
    return bodyTypesForFilters(filters).includes(bodyType);
  }

  /** Ray-cast horizontal line against starboard edge polyline. */
  function halfWidthRayCast(y, noseY, tailY, edgePts) {
    if (y < noseY || y > tailY) return 0;
    let maxX = 0;
    for (let i = 0; i < edgePts.length - 1; i++) {
      const a = edgePts[i];
      const b = edgePts[i + 1];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const t = (y - a[1]) / (b[1] - a[1]);
        maxX = Math.max(maxX, Math.abs(a[0] + t * (b[0] - a[0])));
      }
    }
    return maxX;
  }

  function sampleQuadraticEdge(x0, y0, cx, cy, x1, y1, steps = 20) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const m = 1 - t;
      pts.push([
        m * m * x0 + 2 * m * t * cx + t * t * x1,
        m * m * y0 + 2 * m * t * cy + t * t * y1,
      ]);
    }
    return pts;
  }

  /**
   * Half-width at Y for a sine envelope (lens profile).
   * bulge = 0..1 where the profile is widest along nose→tail.
   */
  function sineEnvelopeHalfWidth(y, noseY, tailY, bulgePeakY, w) {
    const totalLen = tailY - noseY;
    if (totalLen <= 0) return 0;
    const t = (y - noseY) / totalLen;
    if (t <= 0 || t >= 1) return 0;
    const peakT = (bulgePeakY - noseY) / totalLen;
    if (peakT <= 1e-6 || peakT >= 1 - 1e-6) return w * Math.sin(Math.PI * t);
    const u = t <= peakT ? (t / peakT) * 0.5 : 0.5 + ((t - peakT) / (1 - peakT)) * 0.5;
    return w * Math.sin(Math.PI * u);
  }

  function lensEnvelopeFromBody(body) {
    const { len, w, bulge } = body;
    const noseY = -len * 0.52;
    const tailY = len * 0.48;
    const bulgePeakY = noseY + (tailY - noseY) * bulge;
    return { len, w, bulge, noseY, tailY, bulgePeakY };
  }

  /** Flat-stern lens: quadratic sides + constant-width stern deck. bowl < 0 = concave waist. */
  function spadeProfileFromBody(body) {
    const { len, w, bulge, bowl, flatFrac } = body;
    const noseY = -len * 0.52;
    const tailY = len * 0.48;
    const yFlat = tailY - len * flatFrac;
    const cpy = noseY + bulge * (yFlat - noseY);
    const cpx = w * (1 + bowl);
    const curveEdge = sampleQuadraticEdge(0, noseY, cpx, cpy, w, yFlat, 28);
    const edge = curveEdge.slice();
    if (yFlat < tailY - 1e-6) edge.push([w, tailY]);
    return { len, w, bulge, bowl, flatFrac, noseY, tailY, yFlat, edge, midY: cpy };
  }

  /** Angular spade: straight facet edges, flat stern, tip nose. Two kinks → irregular polyhedron side. */
  function facetProfileFromBody(body) {
    const { len, w, bulge, bowl, bulge2, bowl2, flatFrac } = body;
    const noseY = -len * 0.52;
    const tailY = len * 0.48;
    const yFlat = tailY - len * flatFrac;
    const span = yFlat - noseY;
    const corners = [
      { b: bulge, bowl },
      { b: bulge2, bowl: bowl2 },
    ].sort((a, c) => a.b - c.b);
    const y1 = noseY + corners[0].b * span;
    const y2 = noseY + corners[1].b * span;
    const x1 = Math.max(0, w * (1 + corners[0].bowl));
    const x2 = Math.max(0, w * (1 + corners[1].bowl));
    const edge = [
      [0, noseY],
      [x1, y1],
      [x2, y2],
      [w, yFlat],
    ];
    if (yFlat < tailY - 1e-6) edge.push([w, tailY]);
    const maxW = Math.max(w, x1, x2);
    return { len, w, bulge, bowl, bulge2, bowl2, flatFrac, noseY, tailY, yFlat, edge, midY: y2, maxW };
  }

  /** Segmented tube: cosine lobes along length, rounded nose/tail caps. */
  function larvaHalfWidth(y, noseY, tailY, w, lobes, lobeDepth, taper, phase) {
    const totalLen = tailY - noseY;
    if (totalLen <= 0) return 0;
    const t = (y - noseY) / totalLen;
    if (t <= 0 || t >= 1) return 0;
    const ends = Math.pow(Math.sin(Math.PI * t), Math.max(0.35, taper));
    const ripple =
      1 - lobeDepth + lobeDepth * (0.5 + 0.5 * Math.cos(lobes * Math.PI * 2 * t + phase * Math.PI * 2));
    return w * ends * ripple;
  }

  function larvaProfileFromBody(body) {
    const { len, w, lobes, lobeDepth, taper, phase } = body;
    const noseY = -len * 0.5;
    const tailY = len * 0.5;
    return { len, w, lobes, lobeDepth, taper, phase, noseY, tailY };
  }

  function orbHalfWidth(y, noseY, tailY, w, rad, stretch) {
    const ry = rad * stretch;
    if (y < noseY || y > tailY) return 0;
    return w * Math.sqrt(Math.max(0, 1 - ((y / ry) * (y / ry))));
  }

  /** Closed path from a widthAt(y) profile (port side then starboard). */
  function traceWidthEnvelopePath(ctx, noseY, tailY, halfWidthFn, steps = 48) {
    const dy = (tailY - noseY) / steps;
    ctx.moveTo(0, noseY);
    for (let i = 1; i <= steps; i++) {
      const y = noseY + i * dy;
      ctx.lineTo(halfWidthFn(y), y);
    }
    for (let i = steps - 1; i >= 0; i--) {
      const y = noseY + i * dy;
      ctx.lineTo(-halfWidthFn(y), y);
    }
    ctx.closePath();
  }
  const WING_SHAPES = ['swept', 'delta', 'rect', 'blade', 'fin', 'insect', 'tentacle', 'lobe', 'node', 'halo'];
  const WING_ORGANIC = new Set(['fin', 'insect', 'tentacle', 'lobe']);
  const WING_INORGANIC = new Set(['swept', 'delta', 'rect', 'blade']);
  const WING_ENERGY = new Set(['node', 'halo']);
  const WING_SHAPES_INORGANIC = ['swept', 'swept', 'delta', 'rect', 'blade'];
  const WING_SHAPES_ORGANIC = ['fin', 'insect', 'tentacle', 'lobe'];
  const WING_SHAPES_ENERGY = ['node', 'halo'];

  function isWingOrganic(shape) {
    return WING_ORGANIC.has(shape);
  }

  function isWingInorganic(shape) {
    return WING_INORGANIC.has(shape);
  }

  function isWingEnergy(shape) {
    return WING_ENERGY.has(shape);
  }

  function wingShapePoolForFilters(filters) {
    const f = normalizeStyleFilters(filters);
    const pool = [];
    if (f.inorganic) pool.push(...WING_SHAPES_INORGANIC);
    if (f.organic) pool.push(...WING_SHAPES_ORGANIC);
    if (f.energy) pool.push(...WING_SHAPES_ENERGY);
    return pool.length ? pool : ['swept'];
  }

  function wingShapesForFilters(filters) {
    const f = normalizeStyleFilters(filters);
    if (!f.organic && !f.inorganic && !f.energy) return [];
    return WING_SHAPES.filter(
      (s) =>
        (f.organic && isWingOrganic(s)) ||
        (f.inorganic && isWingInorganic(s)) ||
        (f.energy && isWingEnergy(s))
    );
  }

  function defaultWingShapeForFilters(filters) {
    const allowed = wingShapesForFilters(filters);
    if (!allowed.length) return 'swept';
    if (allowed.includes('node')) return 'node';
    if (allowed.includes('halo')) return 'halo';
    if (allowed.includes('swept')) return 'swept';
    return allowed[0];
  }

  function applyPrimaryWingShape(wings, options = { allPairs: true, seed: 1, styleFilters: null }) {
    const filters = normalizeStyleFilters(options.styleFilters || defaultStyleFilters());
    const allowed = wingShapesForFilters(filters);
    if (!allowed.includes(wings.primaryShape)) {
      wings.primaryShape = allowed[0] || 'swept';
    }
    const r = new RNG((options.seed ?? 1) + 17);
    wings.pairs.forEach((pair, i) => {
      if (i === 0 || options.allPairs) {
        pair.shape = wings.primaryShape;
        pair.detail = sampleWingDetail(wings.primaryShape, r);
      }
    });
    if (!options.allPairs) applyWingCoherence(wings, options.seed ?? 1, filters);
  }

  function applyWingCoherence(wings, seed = 1, styleFilters) {
    const filters = normalizeStyleFilters(styleFilters || defaultStyleFilters());
    const pool = wingShapePoolForFilters(filters);
    const primary = wings.primaryShape;
    const coherence = wings.coherence ?? 0.75;
    const r = new RNG(seed + 991);
    wings.pairs.forEach((pair, i) => {
      if (i === 0) {
        pair.shape = primary;
      } else {
        pair.shape = r.chance(coherence) ? primary : r.pick(pool);
      }
      pair.detail = sampleWingDetail(pair.shape, r);
    });
  }
  const ZONES = [
    { id: 'front', label: 'Front', lo: 0.1, hi: 0.35 },
    { id: 'mid', label: 'Mid', lo: 0.38, hi: 0.62 },
    { id: 'rear', label: 'Rear', lo: 0.65, hi: 0.9 },
  ];

  /** Which zone an attach fraction falls in (0 = nose, 1 = tail). */
  function zoneFromAttachFrac(frac) {
    for (const z of ZONES) {
      if (frac >= z.lo && frac <= z.hi) return z;
    }
    let best = ZONES[0];
    let bestD = Infinity;
    for (const z of ZONES) {
      const d = Math.abs(frac - (z.lo + z.hi) / 2);
      if (d < bestD) {
        bestD = d;
        best = z;
      }
    }
    return best;
  }

  function attachFracForZone(zoneId) {
    const z = ZONES.find((x) => x.id === zoneId) || ZONES[1];
    return (z.lo + z.hi) / 2;
  }

  /** Game-facing hitbox for Tiny. Same body/wing families as Small, fewer wing pairs. */
  const SIZE_TIER_TINY = {
    id: 'tiny',
    label: 'Tiny',
    targetLength: 30,
    targetWidth: 18,
    geomScale: 0.885,
    wingCountWeights: [1, 2],
    primaryShapePool: ['swept', 'swept', 'delta', 'rect', 'blade', 'fin', 'insect', 'tentacle', 'lobe'],
  };

  /** Game-facing hitbox for Small. Aligns with art-guidelines Courier class. */
  const SIZE_TIER_SMALL = {
    id: 'small',
    label: 'Small',
    targetLength: 40,
    targetWidth: 24,
    /** Scales handout nominal coords (~34 length) to Small hitbox. */
    geomScale: 1.18,
    wingCountWeights: [2, 3],
    primaryShapePool: ['swept', 'swept', 'delta', 'rect', 'blade', 'fin', 'insect', 'tentacle', 'lobe'],
  };

  const SIZE_TIERS = [SIZE_TIER_TINY, SIZE_TIER_SMALL];

  function getSizeTier(id) {
    return id === 'tiny' ? SIZE_TIER_TINY : SIZE_TIER_SMALL;
  }

  /** Allowed wing pair counts for a tier (from sampling weights). */
  function wingCountOptionsForTier(tier) {
    return [...new Set(tier.wingCountWeights)].sort((a, b) => a - b);
  }

  function clampWingCount(count, tier) {
    const opts = wingCountOptionsForTier(tier);
    const n = Math.round(Number(count) || opts[0]);
    if (n <= opts[0]) return opts[0];
    if (n >= opts[opts.length - 1]) return opts[opts.length - 1];
    return opts.includes(n) ? n : opts[opts.length - 1];
  }

  function rng(s) {
    const x = Math.sin(s) * 99999;
    return x - Math.floor(x);
  }

  class RNG {
    constructor(s) {
      this.s = s;
    }
    next() {
      this.s += 1;
      return rng(this.s);
    }
    range(a, b) {
      return a + this.next() * (b - a);
    }
    pick(arr) {
      return arr[Math.floor(this.next() * arr.length)];
    }
    chance(p) {
      return this.next() < p;
    }
  }

  function scaled(range, tier) {
    const [a, b] = range;
    const s = tier.geomScale;
    return [a * s, b * s];
  }

  function makeRng(seed, bodyType, cellIndex = 0) {
    const typeIdx = BODY_TYPES.indexOf(bodyType);
    const i = typeIdx >= 0 ? typeIdx : 0;
    return new RNG(seed * 97 + i * 31 + cellIndex * 17);
  }

  function sampleWingDetail(shape, r) {
    switch (shape) {
      case 'swept':
        return { tipLead: r.range(0.05, 0.3), tipTrail: r.range(0.05, 0.2) };
      case 'rect':
        return { tipChord: r.range(0.6, 1) };
      case 'blade':
        return { bladeWidth: r.range(0.16, 0.32) };
      case 'insect':
        return {
          fSpan: r.range(0.72, 0.98),
          sizeRatio: r.range(0.42, 0.68),
          pitchF: r.range(0.12, 0.32),
          pitchR: r.range(0.14, 0.38),
          bulge: r.range(0.12, 0.55),
          bulgeX: r.range(0.35, 0.55),
        };
      case 'tentacle':
        return {
          waveAmp: r.range(0.28, 1.0),
          waves: r.range(1.5, 6),
          phase: r.chance(0.5) ? 0 : 1,
          decay: r.range(1.3, 3.2),
          w0: r.range(0.14, 0.48),
          w1Ratio: r.range(0.08, 1.35),
          bulb: r.range(0, 0.16),
        };
      case 'lobe':
        return {
          bulgeX: r.range(0.3, 0.6),
          bulgeTop: r.range(0.7, 1.3),
          bulgeBot: r.range(0.4, 0.8),
        };
      case 'node':
        return {
          count: r.chance(0.38) ? 1 : Math.round(r.range(2, 5)),
          nodeRad: r.range(0.22, 0.52),
          arcRadius: r.range(1.02, 1.55),
          arcSpread: r.range(0.5, 0.98),
        };
      case 'halo':
        return {
          count: r.chance(0.32) ? 1 : Math.round(r.range(2, 5)),
          baseRadius: r.range(1, 2),
          radiusStep: r.range(0.07, 0.17),
          lineThick: r.range(0.022, 0.065),
          arcSpan: r.range(0.5, 1.0),
          centerYOffset: r.range(-0.06, 0.06),
        };
      default:
        return {};
    }
  }

  function sampleWingPair(r, size, tier, shapePool, primaryShape, pairIndex, coherence) {
    const bodyLen = size.tailY - size.noseY;
    const shape =
      pairIndex === 0 || r.chance(coherence) ? primaryShape : r.pick(shapePool);
    const zone = r.pick(ZONES);
    const attachFrac = r.range(zone.lo, zone.hi);
    const attachY = size.noseY + bodyLen * attachFrac;
    let atEdge = r.chance(0.65);
    if (shape === 'tentacle') atEdge = true;
    if (isWingEnergy(shape)) atEdge = true;
    const minSpan = atEdge ? 0.5 : 1.1;
    const maxSpan = size.isRect ? (atEdge ? 2.8 : 3.2) : atEdge ? 1.8 : 2.4;
    const minChord = atEdge ? 0.1 : 0.18;
    const maxChord = size.isRect ? (atEdge ? 0.45 : 0.55) : atEdge ? 0.35 : 0.45;
    let spanScale = r.range(minSpan, maxSpan);
    let chordScale = r.range(minChord, maxChord);
    let sweep = r.range(-0.3, 0.7);
    if (shape === 'tentacle') {
      spanScale = r.range(1.5, 3.0);
      chordScale = r.range(0.06, 0.16);
      sweep = r.range(0.05, 0.55);
    } else if (shape === 'blade') {
      chordScale = r.range(Math.max(minChord, 0.16), Math.max(maxChord, 0.38));
    } else if (shape === 'insect') {
      chordScale = r.range(Math.max(minChord, 0.18), Math.max(maxChord, 0.58));
    } else if (isWingEnergy(shape)) {
      spanScale = r.range(0.75, 2.4);
      chordScale = r.range(0.08, 0.38);
      sweep = r.range(-0.15, 0.45);
    }
    return {
      shape,
      zoneId: zone.id,
      attachFrac,
      attachY,
      atEdge,
      spanScale,
      chordScale,
      sweep,
      detail: sampleWingDetail(shape, r),
    };
  }

  function defaultBodyParams(bodyType, tier) {
    const s = tier.geomScale;
    const mid = (a, b) => ((a + b) / 2) * s;
    switch (bodyType) {
      case 'lens':
        return { len: mid(26, 38), w: mid(10, 16), bulge: 0.42 };
      case 'spade':
        return { len: mid(26, 38), w: mid(10, 16), bulge: 0.55, bowl: 0.22, flatFrac: 0.14 };
      case 'facet':
        return {
          len: mid(26, 38),
          w: mid(10, 16),
          bulge: 0.32,
          bowl: 0.18,
          bulge2: 0.68,
          bowl2: -0.28,
          flatFrac: 0.14,
        };
      case 'dart':
        return {
          len: mid(30, 46),
          w: mid(5, 10),
          waistFrac: 0.42,
          waistRatio: 0.68,
        };
      case 'rect':
        return { w: mid(12, 22), h: mid(26, 42), rad: 4 * s, taper: 0.15 };
      case 'trapezoid':
        return { h: mid(20, 36), noseW: mid(6, 14), tailW: mid(20, 36) };
      case 'polygon':
        return { sides: 6, rad: mid(14, 22), stretch: 1.1 };
      case 'larva':
        return { len: mid(34, 48), w: mid(7, 11), lobes: 3, lobeDepth: 0.38, taper: 0.75, phase: 0 };
      case 'orb':
        return { rad: mid(14, 20), w: mid(10, 16), stretch: 1.05 };
      default:
        return {};
    }
  }

  function sampleBodyParams(bodyType, r, tier) {
    const g = tier.geomScale;
    switch (bodyType) {
      case 'lens': {
        const [la, lb] = scaled([26, 38], tier);
        const [wa, wb] = scaled([10, 16], tier);
        return {
          len: r.range(la, lb),
          w: r.range(wa, wb),
          bulge: r.range(0.2, 0.75),
        };
      }
      case 'spade': {
        const [la, lb] = scaled([26, 38], tier);
        const [wa, wb] = scaled([10, 16], tier);
        return {
          len: r.range(la, lb),
          w: r.range(wa, wb),
          bulge: r.range(0.25, 0.85),
          bowl: r.range(-0.9, 0.55),
          flatFrac: r.range(0, 0.22),
        };
      }
      case 'facet': {
        const [la, lb] = scaled([26, 38], tier);
        const [wa, wb] = scaled([10, 16], tier);
        const bulge = r.range(0.18, 0.52);
        const bulge2 = r.range(Math.min(0.88, bulge + 0.18), 0.92);
        return {
          len: r.range(la, lb),
          w: r.range(wa, wb),
          bulge,
          bowl: r.range(-0.9, 0.55),
          bulge2,
          bowl2: r.range(-0.9, 0.55),
          flatFrac: r.range(0, 0.22),
        };
      }
      case 'dart': {
        const [la, lb] = scaled([30, 46], tier);
        const [wa, wb] = scaled([5, 10], tier);
        const w = r.range(wa, wb);
        return {
          len: r.range(la, lb),
          w,
          waistFrac: r.range(0.3, 0.55),
          waistRatio: r.range(0.55, 0.8),
        };
      }
      case 'rect': {
        const [wa, wb] = scaled([12, 22], tier);
        const [ha, hb] = scaled([26, 42], tier);
        return {
          w: r.range(wa, wb),
          h: r.range(ha, hb),
          rad: r.range(2, 7) * g,
          taper: r.range(0, 0.3),
        };
      }
      case 'trapezoid': {
        const [ha, hb] = scaled([20, 36], tier);
        const [na, nb] = scaled([6, 14], tier);
        const [ta, tb] = scaled([20, 36], tier);
        return {
          h: r.range(ha, hb),
          noseW: r.range(na, nb),
          tailW: r.range(ta, tb),
        };
      }
      case 'polygon': {
        const [ra, rb] = scaled([14, 22], tier);
        return {
          sides: r.pick([4, 5, 6, 7, 8]),
          rad: r.range(ra, rb),
          stretch: r.range(0.85, 1.4),
        };
      }
      case 'larva': {
        const [la, lb] = scaled([32, 50], tier);
        const [wa, wb] = scaled([6, 13], tier);
        return {
          len: r.range(la, lb),
          w: r.range(wa, wb),
          lobes: r.range(2, 5.5),
          lobeDepth: r.range(0.2, 0.55),
          taper: r.range(0.55, 1.05),
          phase: r.range(0, 1),
        };
      }
      case 'orb': {
        const [ra, rb] = scaled([12, 22], tier);
        const [wa, wb] = scaled([8, 17], tier);
        return {
          rad: r.range(ra, rb),
          w: r.range(wa, wb),
          stretch: r.range(0.85, 1.25),
        };
      }
      default:
        return {};
    }
  }

  /** Single source of truth: halfWidth(y) defines hull geometry. */
  function createHullProfile(bodyType, body) {
    switch (bodyType) {
      case 'lens': {
        const env = lensEnvelopeFromBody(body);
        const { w, noseY, tailY, bulgePeakY } = env;
        return {
          noseY,
          tailY,
          midY: (noseY + tailY) * 0.5,
          w,
          isRect: false,
          halfWidth(y) {
            return sineEnvelopeHalfWidth(y, noseY, tailY, bulgePeakY, w);
          },
        };
      }
      case 'spade': {
        const sp = spadeProfileFromBody(body);
        const { w, noseY, tailY, yFlat, edge, midY } = sp;
        return {
          noseY,
          tailY,
          midY,
          w,
          isRect: false,
          halfWidth(y) {
            if (y < noseY || y > tailY) return 0;
            if (y >= yFlat) return w;
            return halfWidthRayCast(y, noseY, tailY, edge);
          },
        };
      }
      case 'facet': {
        const fc = facetProfileFromBody(body);
        const { w, maxW, noseY, tailY, yFlat, edge, midY } = fc;
        return {
          noseY,
          tailY,
          midY,
          w: maxW,
          isRect: false,
          halfWidth(y) {
            if (y < noseY || y > tailY) return 0;
            if (y >= yFlat) return w;
            return halfWidthRayCast(y, noseY, tailY, edge);
          },
        };
      }
      case 'dart': {
        const { len, w, waistFrac, waistRatio } = body;
        const noseY = -len * 0.54;
        const tailY = len * 0.46;
        const waistW = w * waistRatio;
        const midY = noseY + len * waistFrac;
        return {
          noseY,
          tailY,
          midY,
          w,
          isRect: false,
          halfWidth(y) {
            const t = (y - noseY) / (tailY - noseY);
            if (t <= 0 || t >= 1) return 0;
            if (t < waistFrac) return w * (t / waistFrac);
            return waistW + (w - waistW) * ((t - waistFrac) / (1 - waistFrac));
          },
        };
      }
      case 'rect': {
        const { w, h, rad, taper } = body;
        const hw = w / 2;
        const hh = h / 2;
        const noseW = hw * (1 - taper);
        const noseY = -hh;
        const tailY = hh;
        return {
          noseY,
          tailY,
          midY: 0,
          w: hw,
          isRect: true,
          halfWidth(y) {
            const t = (y + hh) / h;
            if (t < 0 || t > 1) return 0;
            if (t < rad / h) return noseW * (t / (rad / h));
            return hw;
          },
        };
      }
      case 'trapezoid': {
        const { h, noseW, tailW } = body;
        const hh = h / 2;
        const hn = noseW / 2;
        const ht = tailW / 2;
        const noseY = -hh;
        const tailY = hh;
        return {
          noseY,
          tailY,
          midY: hh * 0.3,
          w: ht,
          isRect: false,
          halfWidth(y) {
            const t = (y + hh) / h;
            if (t < 0 || t > 1) return 0;
            return hn + (ht - hn) * t;
          },
        };
      }
      case 'polygon': {
        const { sides, rad, stretch } = body;
        const verts = [];
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
          verts.push([Math.cos(a) * rad, Math.sin(a) * rad * stretch]);
        }
        const sRad = rad * stretch;
        const noseY = -sRad;
        const tailY = sRad;
        return {
          noseY,
          tailY,
          midY: 0,
          w: rad,
          isRect: false,
          halfWidth(y) {
            let maxX = 0;
            for (let i = 0; i < verts.length; i++) {
              const a = verts[i];
              const b = verts[(i + 1) % verts.length];
              if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
                const t = (y - a[1]) / (b[1] - a[1]);
                maxX = Math.max(maxX, Math.abs(a[0] + t * (b[0] - a[0])));
              }
            }
            return maxX;
          },
        };
      }
      case 'larva': {
        const lv = larvaProfileFromBody(body);
        const { w, noseY, tailY, lobes, lobeDepth, taper, phase } = lv;
        return {
          noseY,
          tailY,
          midY: (noseY + tailY) * 0.5,
          w,
          isRect: false,
          halfWidth(y) {
            return larvaHalfWidth(y, noseY, tailY, w, lobes, lobeDepth, taper, phase);
          },
        };
      }
      case 'orb': {
        const { rad, w, stretch } = body;
        const ry = rad * stretch;
        const noseY = -ry;
        const tailY = ry;
        return {
          noseY,
          tailY,
          midY: 0,
          w,
          isRect: false,
          halfWidth(y) {
            return orbHalfWidth(y, noseY, tailY, w, rad, stretch);
          },
        };
      }
      default: {
        const noseY = -20;
        const tailY = 20;
        return {
          noseY,
          tailY,
          midY: 0,
          w: 10,
          isRect: false,
          halfWidth: () => 10,
        };
      }
    }
  }

  function buildBodySize(bodyType, body) {
    const profile = createHullProfile(bodyType, body);
    return {
      w: profile.w,
      tailY: profile.tailY,
      noseY: profile.noseY,
      midY: profile.midY,
      isRect: profile.isRect,
      widthAt: profile.halfWidth,
    };
  }

  function traceBodyPath(ctx, bodyType, body, size) {
    traceWidthEnvelopePath(ctx, size.noseY, size.tailY, size.widthAt, 56);
  }

  /** Outward unit normal on the starboard hull edge at attachY (hull centerline x=0). */
  function computeHullOutwardNormal(size, attachY) {
    const bodyLen = size.tailY - size.noseY;
    const eps = Math.max(0.15, bodyLen * 0.002);
    const yLo = Math.max(size.noseY, attachY - eps);
    const yHi = Math.min(size.tailY, attachY + eps);
    const dy = yHi - yLo || eps;
    const wp = (size.widthAt(yHi) - size.widthAt(yLo)) / dy;
    const len = Math.hypot(1, wp) || 1;
    return { hullNormalX: 1 / len, hullNormalY: -wp / len };
  }

  function useHullWingAlign(pair, alignWingsToHull) {
    return alignWingsToHull && pair.atEdge && pair.shape !== 'halo' && pair.shape !== 'node';
  }

  function wingAlignAngle(pair, side) {
    const spine = pair.shape === 'tentacle' ? (pair.spineAngle ?? 0) : 0;
    if (side === 1) {
      return Math.atan2(pair.hullNormalY, pair.hullNormalX) - spine;
    }
    if (pair.shape === 'tentacle') {
      return Math.atan2(pair.hullNormalY, -pair.hullNormalX) + spine;
    }
    return Math.atan2(pair.hullNormalY, -pair.hullNormalX);
  }

  function wingLocalPair(pair) {
    const sweep = pair.sweep ?? 0;
    return {
      ...pair,
      attachX: 0,
      attachY: 0,
      tipX: pair.span,
      tipY: pair.span * sweep,
    };
  }

  function wingLocalToWorld(lx, ly, pair, side, alignToHull) {
    const wx = side * pair.attachX;
    const wy = pair.attachY;
    if (!alignToHull || !pair.atEdge) {
      return { x: wx + side * lx, y: wy + ly };
    }
    if (pair.shape === 'tentacle') {
      const a = wingAlignAngle(pair, side);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      if (side === 1) {
        return { x: wx + lx * cos - ly * sin, y: wy + lx * sin + ly * cos };
      }
      return { x: wx + lx * cos + ly * sin, y: wy + lx * sin - ly * cos };
    }
    const nx = pair.hullNormalX;
    const ny = pair.hullNormalY;
    if (side === 1) {
      return { x: wx + lx * nx - ly * ny, y: wy + lx * ny + ly * nx };
    }
    const flippedLy = -ly;
    return { x: wx + lx * -nx + flippedLy * -ny, y: wy + lx * ny + flippedLy * -nx };
  }

  function applyAlignedWingTransform(ctx, pair, side) {
    ctx.translate(side * pair.attachX, pair.attachY);
    if (pair.shape === 'tentacle') {
      ctx.rotate(wingAlignAngle(pair, side));
      if (side === -1) ctx.scale(1, -1);
      return;
    }
    const nx = pair.hullNormalX;
    const ny = pair.hullNormalY;
    if (side === 1) {
      ctx.rotate(Math.atan2(ny, nx));
    } else {
      ctx.rotate(Math.atan2(ny, -nx));
      ctx.scale(1, -1);
    }
  }

  function wingTipWorld(pair, side, alignToHull) {
    const sweep = pair.sweep ?? 0;
    if (pair.shape === 'tentacle') {
      return wingLocalToWorld(pair.tipX - pair.attachX, pair.tipY - pair.attachY, pair, side, alignToHull);
    }
    return wingLocalToWorld(pair.span, pair.span * sweep, pair, side, alignToHull);
  }

  function wingPairBoundsForSide(side, pair, alignToHull) {
    const ax = side * pair.attachX;
    const ay = pair.attachY;
    const chord = pair.chord;
    const span = pair.span;
    const sweep = pair.sweep ?? 0;

    if (pair.shape === 'node') {
      const orbs = nodeOrbCentersHull(pair);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const o of orbs) {
        const x = side * o.x;
        const y = o.y;
        minX = Math.min(minX, x - o.r);
        maxX = Math.max(maxX, x + o.r);
        minY = Math.min(minY, y - o.r);
        maxY = Math.max(maxY, y + o.r);
      }
      return { minX, maxX, minY, maxY };
    }

    if (pair.shape === 'halo') {
      const { cx, cy, a0, a1, bands } = haloArcSpec(pair);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      const steps = 12;
      for (const b of bands) {
        for (let ri = 0; ri <= 1; ri++) {
          const r = ri === 0 ? b.rInner : b.rOuter;
          for (let i = 0; i <= steps; i++) {
            const a = a0 + ((a1 - a0) * i) / steps;
            const x = side * (cx + Math.cos(a) * r);
            const y = cy + Math.sin(a) * r;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
      return { minX, maxX, minY, maxY };
    }

    if (!alignToHull || !pair.atEdge) {
      const tip = wingTipWorld(pair, side, false);
      return {
        minX: Math.min(ax, tip.x) - chord * 0.1,
        maxX: Math.max(ax, tip.x) + chord * 0.15,
        minY: Math.min(ay - chord * 0.5, tip.y - chord),
        maxY: Math.max(ay + chord * 0.5, tip.y + chord),
      };
    }

    const localPts = [
      [0, -chord * 0.5],
      [0, chord * 0.5],
      [span, span * sweep - chord * 0.5],
      [span, span * sweep + chord * 0.5],
      [span * 0.5, span * sweep - chord],
      [span * 0.5, span * sweep + chord],
    ];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [lx, ly] of localPts) {
      const w = wingLocalToWorld(lx, ly, pair, side, true);
      minX = Math.min(minX, w.x);
      maxX = Math.max(maxX, w.x);
      minY = Math.min(minY, w.y);
      maxY = Math.max(maxY, w.y);
    }
    return { minX, maxX, minY, maxY };
  }

  function tentacleEnvelope(t, decay) {
    return Math.pow(Math.max(0, 1 - t), decay * 0.55) * Math.exp(-decay * 0.45 * t);
  }

  function tentacleCenterAt(t, len, sb, amp, waves, phase, decay) {
    const env = tentacleEnvelope(t, decay);
    return {
      x: len * t,
      y: sb * t + amp * env * Math.sin(waves * Math.PI * t + phase),
      env,
    };
  }

  function tentacleParams(span, chord, sweep, d) {
    const len = span;
    const phase01 = (d.phase ?? 0) >= 0.5 ? 1 : 0;
    return {
      len,
      sb: len * sweep * 0.4,
      amp: chord * (d.waveAmp ?? 0.4),
      waves: d.waves ?? 2.2,
      phase: phase01 * Math.PI,
      phase01,
      decay: d.decay ?? 2,
      w0: chord * Math.min(d.w0 ?? 0.22, 0.5),
      w1Ratio: d.w1Ratio ?? 0.08,
      bulb: chord * (d.bulb ?? 0.08),
    };
  }

  function tentacleSpineTangentAngle(span, chord, sweep, d) {
    const p = tentacleParams(span, chord, sweep, d);
    const eps = 0.012;
    const c0 = tentacleCenterAt(0, p.len, p.sb, p.amp, p.waves, p.phase, p.decay);
    const c1 = tentacleCenterAt(eps, p.len, p.sb, p.amp, p.waves, p.phase, p.decay);
    return Math.atan2(c1.y - c0.y, c1.x - c0.x);
  }

  function traceTentacleWavePath(ctx, ax, ay, span, chord, sweep, d) {
    const p = tentacleParams(span, chord, sweep, d);
    const steps = 24;
    const upper = [];
    const lower = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const center = tentacleCenterAt(t, p.len, p.sb, p.amp, p.waves, p.phase, p.decay);
      const tPrev = Math.max(0, t - 1 / steps);
      const tNext = Math.min(1, t + 1 / steps);
      const prev = tentacleCenterAt(tPrev, p.len, p.sb, p.amp, p.waves, p.phase, p.decay);
      const next = tentacleCenterAt(tNext, p.len, p.sb, p.amp, p.waves, p.phase, p.decay);
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const tLen = Math.hypot(dx, dy) || 1;
      const nx = -dy / tLen;
      const ny = dx / tLen;
      const halfW =
        p.w0 * (p.w1Ratio + (1 - p.w1Ratio) * (1 - t)) * center.env + (i === steps ? p.bulb : 0);
      upper.push({ x: ax + center.x + nx * halfW, y: ay + center.y + ny * halfW });
      lower.push({ x: ax + center.x - nx * halfW, y: ay + center.y - ny * halfW });
    }

    ctx.moveTo(upper[0].x, upper[0].y);
    for (let i = 1; i < upper.length; i++) ctx.lineTo(upper[i].x, upper[i].y);
    for (let i = lower.length - 1; i >= 0; i--) ctx.lineTo(lower[i].x, lower[i].y);
    ctx.closePath();
  }

  /** Hull-space orb centers on a circular arc (body-centered, equal angles). */
  function nodeOrbCentersHull(pair) {
    const d = pair.detail || {};
    const count = Math.max(1, Math.min(6, Math.round(d.count ?? 1)));
    const bodyRefR = pair.bodyRefR ?? 16;
    const bodyMidY = pair.bodyMidY ?? 0;
    const chord = pair.chord ?? bodyRefR * 0.22;
    const orbR = chord * (d.nodeRad ?? 0.38);
    const arcR = bodyRefR * (d.arcRadius ?? 1.2);
    const halfArc = Math.PI * 0.5 * Math.max(0.28, Math.min(1.05, d.arcSpread ?? 0.72));
    const sizeScale = count === 1 ? 1 : 0.88;

    const orbs = [];
    for (let i = 0; i < count; i++) {
      const u = count === 1 ? 0.5 : i / (count - 1);
      const a = -halfArc + (2 * halfArc) * u;
      orbs.push({
        x: Math.cos(a) * arcR,
        y: bodyMidY + Math.sin(a) * arcR,
        r: orbR * sizeScale,
      });
    }
    return orbs;
  }

  function traceNodeClusterHull(ctx, pair) {
    const orbs = nodeOrbCentersHull(pair);
    for (const { x, y, r } of orbs) {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }

  /** Concentric arc bands centered on the hull (body centerline). */
  function haloArcSpec(pair) {
    const d = pair.detail || {};
    const bodyRefR = pair.bodyRefR ?? 16;
    const count = Math.max(1, Math.min(6, Math.round(d.count ?? 2)));
    const baseR = bodyRefR * (d.baseRadius ?? 1.25);
    const step = bodyRefR * (d.radiusStep ?? 0.12);
    const thick = bodyRefR * (d.lineThick ?? 0.04);
    const halfArc = Math.PI * 0.5 * Math.max(0.25, Math.min(1.05, d.arcSpan ?? 0.8));
    const cx = 0;
    const cy = (pair.bodyMidY ?? 0) + bodyRefR * (d.centerYOffset ?? 0);
    const bands = [];
    for (let i = 0; i < count; i++) {
      const rInner = baseR + i * step;
      bands.push({ rInner, rOuter: rInner + thick });
    }
    return { cx, cy, a0: -halfArc, a1: halfArc, bands };
  }

  function traceHaloArcBand(ctx, cx, cy, rInner, rOuter, a0, a1, steps = 18) {
    const da = a1 - a0;
    ctx.moveTo(cx + Math.cos(a0) * rOuter, cy + Math.sin(a0) * rOuter);
    for (let i = 1; i <= steps; i++) {
      const a = a0 + (da * i) / steps;
      ctx.lineTo(cx + Math.cos(a) * rOuter, cy + Math.sin(a) * rOuter);
    }
    for (let i = steps; i >= 0; i--) {
      const a = a0 + (da * i) / steps;
      ctx.lineTo(cx + Math.cos(a) * rInner, cy + Math.sin(a) * rInner);
    }
    ctx.closePath();
  }

  function traceHaloWingPath(ctx, pair) {
    const { cx, cy, a0, a1, bands } = haloArcSpec(pair);
    for (const b of bands) {
      traceHaloArcBand(ctx, cx, cy, b.rInner, b.rOuter, a0, a1);
    }
  }

  function traceWingPath(ctx, pair) {
    const { shape, attachX: ax, attachY: ay, span, chord, sweep, detail } = pair;
    const tipX = ax + span;
    const tipY = ay + span * sweep;
    const d = detail || {};

    if (shape === 'swept') {
      ctx.moveTo(ax, ay - chord * 0.5);
      ctx.lineTo(tipX, tipY - chord * (d.tipLead ?? 0.15));
      ctx.lineTo(tipX, tipY + chord * (d.tipTrail ?? 0.12));
      ctx.lineTo(ax, ay + chord * 0.5);
      ctx.closePath();
    } else if (shape === 'delta') {
      ctx.moveTo(ax, ay - chord * 0.5);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(ax, ay + chord * 0.5);
      ctx.closePath();
    } else if (shape === 'rect') {
      const tc = chord * (d.tipChord ?? 0.8);
      ctx.moveTo(ax, ay - chord * 0.5);
      ctx.lineTo(tipX, tipY - tc * 0.5);
      ctx.lineTo(tipX, tipY + tc * 0.5);
      ctx.lineTo(ax, ay + chord * 0.5);
      ctx.closePath();
    } else if (shape === 'blade') {
      const bw = chord * (d.bladeWidth ?? 0.22);
      ctx.moveTo(ax, ay - bw);
      ctx.lineTo(tipX, tipY - bw * 0.5);
      ctx.lineTo(tipX, tipY + bw * 0.5);
      ctx.lineTo(ax, ay + bw);
      ctx.closePath();
    } else if (shape === 'fin') {
      ctx.moveTo(ax, ay - chord * 0.4);
      ctx.bezierCurveTo(ax + span * 0.3, ay - chord * 0.8, ax + span * 0.7, tipY - chord * 0.2, tipX, tipY);
      ctx.lineTo(ax, ay + chord * 0.4);
      ctx.closePath();
    } else if (shape === 'insect') {
      const rootGap = chord * 0.06;
      const fSpanScale = d.fSpan ?? 0.88;
      const fSp = span * fSpanScale;
      const rSp = span * fSpanScale * (d.sizeRatio ?? 0.58);
      const pitchF = span * (d.pitchF ?? 0.22);
      const pitchR = span * (d.pitchR ?? 0.28);
      const bulge = span * (d.bulge ?? 0.25);
      const bulgeXF = fSp * (d.bulgeX ?? 0.48);
      const bulgeXR = rSp * (d.bulgeX ?? 0.48) * 0.72;
      const hinge = ay + rootGap * 0.35;

      ctx.moveTo(ax, ay - rootGap);
      ctx.lineTo(ax + fSp, ay - pitchF);
      ctx.quadraticCurveTo(ax + bulgeXF, ay - bulge, ax, hinge);
      ctx.closePath();

      ctx.moveTo(ax, hinge);
      ctx.lineTo(ax + rSp, ay + pitchR);
      ctx.quadraticCurveTo(ax + bulgeXR, ay + bulge * 0.78, ax, ay + rootGap);
      ctx.closePath();
    } else if (shape === 'tentacle') {
      traceTentacleWavePath(ctx, ax, ay, span, chord, sweep, d);
    } else if (shape === 'lobe') {
      const bulgeX = ax + span * (d.bulgeX ?? 0.45);
      const bulgeTop = ay - chord * (d.bulgeTop ?? 1);
      const bulgeBot = ay + chord * (d.bulgeBot ?? 0.6);
      ctx.moveTo(ax, ay - chord * 0.3);
      ctx.bezierCurveTo(bulgeX, bulgeTop, tipX, tipY - chord * 0.15, tipX, tipY);
      ctx.bezierCurveTo(tipX, tipY + chord * 0.1, bulgeX, bulgeBot, ax, ay + chord * 0.3);
      ctx.closePath();
    } else if (shape === 'node') {
      traceNodeClusterHull(ctx, pair);
    }
  }

  function resolveWingPairs(config, size, tier) {
    const bodyLen = size.tailY - size.noseY;
    const bodyRefR = Math.max(size.w, bodyLen * 0.42);
    return config.wings.pairs.map((raw) => {
      const attachFrac =
        raw.attachFrac ??
        (raw.zoneId != null ? attachFracForZone(raw.zoneId) : 0.5);
      const zone = zoneFromAttachFrac(attachFrac);
      const attachY = size.noseY + bodyLen * attachFrac;
      const bodyW = size.widthAt(attachY);
      const atEdge = raw.atEdge !== false;
      const attachX = atEdge ? bodyW : 0;
      const span = size.w * (raw.spanScale ?? 1.2);
      const chord = bodyLen * (raw.chordScale ?? 0.22);
      const sweep = raw.sweep ?? 0;
      const normal = atEdge ? computeHullOutwardNormal(size, attachY) : { hullNormalX: 1, hullNormalY: 0 };
      let tipX = attachX + span;
      let tipY = attachY + span * sweep;
      let spineAngle = 0;
      if (raw.shape === 'tentacle') {
        const td = raw.detail || {};
        const tp = tentacleParams(span, chord, sweep, td);
        const tip = tentacleCenterAt(1, tp.len, tp.sb, tp.amp, tp.waves, tp.phase, tp.decay);
        tipX = attachX + tip.x;
        tipY = attachY + tip.y;
        spineAngle = tentacleSpineTangentAngle(span, chord, sweep, td);
      }
      return {
        ...raw,
        zoneId: zone.id,
        attachFrac,
        attachY,
        atEdge,
        attachX,
        span,
        chord,
        sweep,
        hullNormalX: normal.hullNormalX,
        hullNormalY: normal.hullNormalY,
        spineAngle: raw.shape === 'tentacle' ? spineAngle : undefined,
        bodyMidY: size.midY,
        bodyRefR,
        tipX,
        tipY,
      };
    });
  }

  /** Hull-only bounds (hitbox target). Wings may extend outside this box. */
  function measureHullBounds(size) {
    const y0 = size.noseY;
    const y1 = size.tailY;
    const steps = 40;
    let maxHalfW = 0;
    for (let i = 0; i <= steps; i++) {
      const y = y0 + ((y1 - y0) * i) / steps;
      maxHalfW = Math.max(maxHalfW, size.widthAt(y));
    }
    return {
      minX: -maxHalfW,
      maxX: maxHalfW,
      minY: y0,
      maxY: y1,
      width: maxHalfW * 2,
      height: y1 - y0,
      centerY: (y0 + y1) / 2,
    };
  }

  function measureVisualBounds(size, wingPairs, alignToHull = false) {
    const hull = measureHullBounds(size);
    let minX = hull.minX;
    let maxX = hull.maxX;
    let minY = hull.minY;
    let maxY = hull.maxY;
    for (const p of wingPairs) {
      for (const side of [1, -1]) {
        const b = wingPairBoundsForSide(side, p, useHullWingAlign(p, alignToHull));
        minX = Math.min(minX, b.minX);
        maxX = Math.max(maxX, b.maxX);
        minY = Math.min(minY, b.minY);
        maxY = Math.max(maxY, b.maxY);
      }
    }
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
  }

  /** Scale so the hull fills the game hitbox; wing span does not shrink the body. */
  function fitScaleToHull(hullBounds, tier) {
    const fill = 0.98;
    const sx = tier.targetLength / (hullBounds.height || 1);
    const sy = tier.targetWidth / (hullBounds.width || 1);
    return Math.min(sx, sy) * fill;
  }

  function sampleShipConfig(seed, bodyType, tier = SIZE_TIER_SMALL, cellIndex = 0, styleFilters = defaultStyleFilters(), coherence = 0.75) {
    const r = makeRng(seed, bodyType, cellIndex);
    const body = sampleBodyParams(bodyType, r, tier);
    const size = buildBodySize(bodyType, body);
    const filters = normalizeStyleFilters(styleFilters);
    const shapePool = wingShapePoolForFilters(filters);
    const wingCount = r.pick(tier.wingCountWeights);
    const primaryShape = r.pick(shapePool);
    const pairs = [];
    for (let wi = 0; wi < wingCount; wi++) {
      pairs.push(sampleWingPair(r, size, tier, shapePool, primaryShape, wi, coherence));
    }
    return {
      version: 1,
      tier: tier.id,
      seed,
      bodyType,
      cellIndex,
      styleFilters: filters,
      body,
      wings: { count: wingCount, primaryShape, coherence, pairs },
    };
  }

  function defaultShipConfig(bodyType = 'lens', tier = SIZE_TIER_SMALL, styleFilters = defaultStyleFilters()) {
    const body = defaultBodyParams(bodyType, tier);
    const filters = normalizeStyleFilters(styleFilters);
    const primaryShape = defaultWingShapeForFilters(filters);
    const defaultWingCount = tier.id === 'tiny' ? 1 : 2;
    const pair = {
      shape: primaryShape,
      attachFrac: attachFracForZone('mid'),
      atEdge: true,
      spanScale: 1.2,
      chordScale: 0.22,
      sweep: 0.2,
      detail: sampleWingDetail(primaryShape, new RNG(42)),
    };
    return {
      version: 1,
      tier: tier.id,
      seed: 1,
      bodyType,
      cellIndex: 0,
      styleFilters: filters,
      body,
      wings: { count: defaultWingCount, primaryShape, coherence: 0.75, pairs: [pair] },
    };
  }

  function normalizeConfig(input, tierOverride) {
    const c = typeof input === 'string' ? JSON.parse(input) : { ...input };
    const tier =
      tierOverride != null
        ? typeof tierOverride === 'string'
          ? getSizeTier(tierOverride)
          : tierOverride
        : getSizeTier(c.tier || 'small');
    c.tier = tier.id;
    c.body = c.body || defaultBodyParams(c.bodyType, tier);
    c.styleFilters = normalizeStyleFilters(c.styleFilters || c.bodyFilters);
    delete c.bodyFilters;
    const allowedBodies = bodyTypesForFilters(c.styleFilters);
    if (allowedBodies.length && !allowedBodies.includes(c.bodyType)) {
      c.bodyType = allowedBodies[0];
      c.body = defaultBodyParams(c.bodyType, tier);
    }
    const filters = c.styleFilters;
    const defaultWingCount = tier.id === 'tiny' ? 1 : 2;
    c.wings = c.wings || {
      count: defaultWingCount,
      primaryShape: defaultWingShapeForFilters(filters),
      coherence: 0.75,
      pairs: [],
    };
    c.wings.count = clampWingCount(c.wings.count, tier);
    if (c.wings.wingMode != null) delete c.wings.wingMode;
    const allowed = wingShapesForFilters(filters);
    if (allowed.length && !allowed.includes(c.wings.primaryShape)) {
      c.wings.primaryShape = allowed[0];
    }
    while (c.wings.pairs.length < c.wings.count) {
      c.wings.pairs.push({
        shape: c.wings.primaryShape,
        attachFrac: attachFracForZone('mid'),
        atEdge: true,
        spanScale: 1.2,
        chordScale: 0.22,
        sweep: 0.2,
        detail: {},
      });
    }
    c.wings.pairs = c.wings.pairs.slice(0, c.wings.count);
    c.wings.pairs.forEach((pair) => {
      if (!allowed.includes(pair.shape)) pair.shape = c.wings.primaryShape;
      if (pair.shape === 'tentacle') pair.atEdge = true;
      if (isWingEnergy(pair.shape)) pair.atEdge = true;
    });
    return c;
  }

  function configFromSeed(seed, bodyType, cellIndex = 0, tier = SIZE_TIER_SMALL, styleFilters = defaultStyleFilters(), coherence = 0.75) {
    return sampleShipConfig(seed, bodyType, tier, cellIndex, styleFilters, coherence);
  }

  function drawShip(ctx, cx, cy, config, options = {}) {
    const cfg = normalizeConfig(config);
    const tier = getSizeTier(cfg.tier);
    const {
      showBody = true,
      showWings = true,
      showWidthAt = true,
      showAttach = true,
      showBBox = true,
      /** Rotate edge-attached wings to follow hull outward normal. */
      alignWingsToHull = true,
      /** Scale hull to tier targetLength × targetWidth (game hitbox). */
      fitToHitbox = true,
      /** Round placement to whole pixels (gallery 1:1 preview). */
      pixelSnap = false,
      /** Editor preview multiplier on top of fitToHitbox (1 = game pixels). */
      viewZoom = 1,
      fillStyle = '#c8d8f0',
      strokeStyle = '#8aabcc',
      lineWidth = 0.8,
    } = options;

    const size = buildBodySize(cfg.bodyType, cfg.body);
    const wingPairs = resolveWingPairs(cfg, size, tier);
    const hullBounds = measureHullBounds(size);
    const visualBounds = measureVisualBounds(size, wingPairs, alignWingsToHull);
    const hullScale = fitToHitbox ? fitScaleToHull(hullBounds, tier) : 1;
    const scale = hullScale * viewZoom;
    const halfL = tier.targetLength / 2;
    const halfW = tier.targetWidth / 2;

    const px = pixelSnap ? Math.round(cx) : cx;
    const py = pixelSnap ? Math.round(cy) : cy;

    ctx.save();
    ctx.translate(px, py);
    ctx.scale(scale, scale);
    ctx.translate(0, -hullBounds.centerY);

    const setStyle = () => {
      ctx.fillStyle = fillStyle;
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth / scale;
    };

    if (showWidthAt) {
      ctx.save();
      ctx.strokeStyle = '#40c080';
      ctx.lineWidth = 1 / scale;
      ctx.globalAlpha = 0.85;
      const steps = 48;
      const y0 = size.noseY;
      const y1 = size.tailY;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const y = y0 + ((y1 - y0) * i) / steps;
        const w = size.widthAt(y);
        const x = w;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = steps; i >= 0; i--) {
        const y = y0 + ((y1 - y0) * i) / steps;
        const w = size.widthAt(y);
        ctx.lineTo(-w, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    if (showBody) {
      setStyle();
      ctx.beginPath();
      traceBodyPath(ctx, cfg.bodyType, cfg.body, size);
      ctx.fill();
      ctx.stroke();
    }

    if (showWings) {
      setStyle();
      for (const pair of wingPairs) {
        for (const side of [1, -1]) {
          ctx.save();
          if (pair.shape === 'halo') {
            ctx.scale(side, 1);
            ctx.beginPath();
            traceHaloWingPath(ctx, pair);
          } else if (pair.shape === 'node') {
            ctx.scale(side, 1);
            ctx.beginPath();
            traceNodeClusterHull(ctx, pair);
          } else if (useHullWingAlign(pair, alignWingsToHull)) {
            applyAlignedWingTransform(ctx, pair, side);
            ctx.beginPath();
            traceWingPath(ctx, wingLocalPair(pair));
          } else {
            ctx.scale(side, 1);
            ctx.beginPath();
            traceWingPath(ctx, wingLocalPair(pair));
          }
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    if (showAttach) {
      ctx.save();
      for (const pair of wingPairs) {
        const r = 2.5 / scale;
        ctx.fillStyle = pair.atEdge ? '#ffaa00' : '#40c0ff';
        for (const side of [1, -1]) {
          const wx = side * pair.attachX;
          const wy = pair.attachY;
          ctx.beginPath();
          ctx.arc(wx, wy, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 1 / scale;
        ctx.setLineDash([2 / scale, 2 / scale]);
        ctx.beginPath();
        if (useHullWingAlign(pair, alignWingsToHull)) {
          for (const side of [1, -1]) {
            const wx = side * pair.attachX;
            const wy = pair.attachY;
            const tangX = -pair.hullNormalY * side;
            const tangY = pair.hullNormalX;
            const halfChord = pair.chord * 0.5;
            ctx.moveTo(wx - tangX * halfChord, wy - tangY * halfChord);
            ctx.lineTo(wx + tangX * halfChord, wy + tangY * halfChord);
          }
        } else {
          ctx.moveTo(-size.widthAt(pair.attachY), pair.attachY);
          ctx.lineTo(size.widthAt(pair.attachY), pair.attachY);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        if (useHullWingAlign(pair, alignWingsToHull)) {
          ctx.strokeStyle = '#60e0a0';
          ctx.lineWidth = 1 / scale;
          for (const side of [1, -1]) {
            const wx = side * pair.attachX;
            const wy = pair.attachY;
            const nx = side * pair.hullNormalX;
            const ny = pair.hullNormalY;
            const nLen = pair.span * 0.35;
            ctx.beginPath();
            ctx.moveTo(wx, wy);
            ctx.lineTo(wx + nx * nLen, wy + ny * nLen);
            ctx.stroke();
          }
        }
        ctx.beginPath();
        ctx.strokeStyle = '#c060ff';
        for (const side of [1, -1]) {
          const tip = wingTipWorld(pair, side, useHullWingAlign(pair, alignWingsToHull));
          ctx.moveTo(side * pair.attachX, pair.attachY);
          ctx.lineTo(tip.x, tip.y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    if (showBBox) {
      // Path units sized to game hitbox before viewZoom; ctx.scale(scale) applies zoom like body/wings.
      const bboxHalfW = halfW / hullScale;
      const bboxHalfL = halfL / hullScale;
      ctx.save();
      ctx.strokeStyle = '#40c0ff';
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 1 / scale;
      ctx.setLineDash([3 / scale, 3 / scale]);
      ctx.strokeRect(-bboxHalfW, -bboxHalfL, tier.targetWidth / hullScale, tier.targetLength / hullScale);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    ctx.restore();
    return { scale, size, wingPairs, hullBounds, visualBounds };
  }

  const SilhouetteCore = {
    BODY_TYPES,
    BODY_ORGANIC_TYPES: [...BODY_ORGANIC],
    BODY_INORGANIC_TYPES: [...BODY_INORGANIC],
    isBodyOrganic,
    isBodyInorganic,
    BODY_ENERGY_TYPES: [...BODY_ENERGY],
    isBodyEnergy,
    defaultStyleFilters,
    normalizeStyleFilters,
    styleModeFromFilters,
    bodyTypesForFilters,
    isBodyTypeAllowed,
    WING_SHAPES,
    WING_ORGANIC_TYPES: [...WING_ORGANIC],
    WING_INORGANIC_TYPES: [...WING_INORGANIC],
    isWingOrganic,
    isWingInorganic,
    WING_SHAPES_ORGANIC,
    WING_SHAPES_INORGANIC,
    WING_ENERGY_TYPES: [...WING_ENERGY],
    isWingEnergy,
    WING_SHAPES_ENERGY,
    wingShapePoolForFilters,
    wingShapesForFilters,
    defaultWingShapeForFilters,
    applyPrimaryWingShape,
    applyWingCoherence,
    ZONES,
    zoneFromAttachFrac,
    attachFracForZone,
    SIZE_TIER_TINY,
    SIZE_TIER_SMALL,
    SIZE_TIERS,
    getSizeTier,
    wingCountOptionsForTier,
    clampWingCount,
    RNG,
    makeRng,
    sampleShipConfig,
    configFromSeed,
    defaultShipConfig,
    normalizeConfig,
    defaultBodyParams,
    createHullProfile,
    buildBodySize,
    measureHullBounds,
    measureVisualBounds,
    fitScaleToHull,
    drawShip,
  };

  const root = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {};
  root.SilhouetteCore = SilhouetteCore;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {});
