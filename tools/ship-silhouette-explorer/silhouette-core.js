/**
 * Procedural ship silhouette generator — Small size tier.
 * Nose = −Y, tail = +Y. Vertically symmetric.
 * All hulls share one pipeline: halfWidth(y) → traced path + wing attach.
 * Same seed + bodyType + tier → same ShipConfig.
 */
(function (global) {
  const BODY_TYPES = ['lens', 'dart', 'delta', 'rect', 'trapezoid', 'polygon'];

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
  const WING_SHAPES = ['swept', 'delta', 'rect', 'blade', 'fin', 'insect', 'tentacle', 'lobe'];
  const WING_SHAPES_INORGANIC = ['swept', 'swept', 'delta', 'rect', 'blade'];
  const WING_SHAPES_ORGANIC = ['fin', 'insect', 'tentacle', 'lobe'];
  const WING_MODES = ['hybrid', 'organic', 'inorganic'];

  function wingShapePoolForMode(mode) {
    if (mode === 'organic') return WING_SHAPES_ORGANIC;
    if (mode === 'inorganic') return WING_SHAPES_INORGANIC;
    return SIZE_TIER_SMALL.primaryShapePool;
  }

  function wingShapesForMode(mode) {
    if (mode === 'organic') return WING_SHAPES_ORGANIC.filter((s, i, a) => a.indexOf(s) === i);
    if (mode === 'inorganic') return ['swept', 'delta', 'rect', 'blade'];
    return WING_SHAPES.slice();
  }

  function applyPrimaryWingShape(wings, options = { allPairs: true, seed: 1 }) {
    const mode = wings.wingMode || 'hybrid';
    const allowed = wingShapesForMode(mode);
    if (!allowed.includes(wings.primaryShape)) {
      wings.primaryShape = allowed[0];
    }
    const r = new RNG((options.seed ?? 1) + 17);
    wings.pairs.forEach((pair, i) => {
      if (i === 0 || options.allPairs) {
        pair.shape = wings.primaryShape;
        pair.detail = sampleWingDetail(wings.primaryShape, r);
      }
    });
    if (!options.allPairs) applyWingCoherence(wings);
  }

  function applyWingCoherence(wings, seed = 1) {
    const mode = wings.wingMode || 'hybrid';
    const pool = wingShapePoolForMode(mode);
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

  function defaultWingShapeForMode(mode) {
    if (mode === 'organic') return 'fin';
    if (mode === 'inorganic') return 'swept';
    return 'swept';
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

  /** Game-facing hitbox for Small (above Tiny ~32×16). Aligns with art-guidelines Courier class. */
  const SIZE_TIER_SMALL = {
    id: 'small',
    label: 'Small',
    targetLength: 40,
    targetWidth: 24,
    /** Scales handout nominal coords (~34 length) to Small hitbox. */
    geomScale: 1.18,
    wingCountWeights: [1, 2, 2, 2, 3],
    primaryShapePool: ['swept', 'swept', 'delta', 'rect', 'blade', 'fin', 'insect', 'tentacle', 'lobe'],
  };

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
        return { bladeWidth: r.range(0.08, 0.2) };
      case 'insect':
        return {
          fSpan: r.range(0.7, 1),
          rSpan: r.range(0.4, 0.7),
          fBulge: r.range(0.5, 1),
          rBulge: r.range(0.3, 0.6),
        };
      case 'tentacle':
        return {
          curl: r.range(-0.4, 0.4),
          w0: r.range(0.3, 0.55),
          w1Ratio: r.range(0.05, 0.2),
        };
      case 'lobe':
        return {
          bulgeX: r.range(0.3, 0.6),
          bulgeTop: r.range(0.7, 1.3),
          bulgeBot: r.range(0.4, 0.8),
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
    const atEdge = r.chance(0.65);
    const edgeMult = atEdge ? r.range(0.95, 1.02) : 1;
    const minSpan = atEdge ? 0.5 : 1.1;
    const maxSpan = size.isRect ? (atEdge ? 2.8 : 3.2) : atEdge ? 1.8 : 2.4;
    const minChord = atEdge ? 0.1 : 0.18;
    const maxChord = size.isRect ? (atEdge ? 0.45 : 0.55) : atEdge ? 0.35 : 0.45;
    return {
      shape,
      zoneId: zone.id,
      attachFrac,
      attachY,
      atEdge,
      edgeMult,
      spanScale: r.range(minSpan, maxSpan),
      chordScale: r.range(minChord, maxChord),
      sweep: r.range(-0.3, 0.7),
      detail: sampleWingDetail(shape, r),
    };
  }

  function defaultBodyParams(bodyType, tier) {
    const s = tier.geomScale;
    const mid = (a, b) => ((a + b) / 2) * s;
    switch (bodyType) {
      case 'lens':
        return { len: mid(26, 38), w: mid(10, 16), bulge: 0.42 };
      case 'dart':
        return {
          len: mid(30, 46),
          w: mid(5, 10),
          waistFrac: 0.42,
          waistRatio: 0.68,
        };
      case 'delta':
        return { len: mid(28, 40), spreadRatio: 0.42, sweep: 0.55, notch: 0.06 };
      case 'rect':
        return { w: mid(12, 22), h: mid(26, 42), rad: 4 * s, taper: 0.15 };
      case 'trapezoid':
        return { h: mid(20, 36), noseW: mid(6, 14), tailW: mid(20, 36) };
      case 'polygon':
        return { sides: 6, rad: mid(14, 22), stretch: 1.1 };
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
      case 'delta': {
        const [la, lb] = scaled([28, 40], tier);
        const len = r.range(la, lb);
        return {
          len,
          spreadRatio: r.range(0.32, 0.52),
          sweep: r.range(0.38, 0.72),
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
      case 'delta': {
        const { len, spreadRatio, sweep } = body;
        const spread = len * spreadRatio;
        const noseY = -len * 0.5;
        const tailY = len * 0.5;
        const wideY = noseY + len * sweep;
        const edge = sampleQuadraticEdge(0, noseY, spread * 0.6, wideY, spread, tailY);
        return {
          noseY,
          tailY,
          midY: wideY,
          w: spread,
          isRect: false,
          halfWidth(y) {
            return halfWidthRayCast(y, noseY, tailY, edge);
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
    const nx = pair.hullNormalX;
    const ny = pair.hullNormalY;
    if (side === 1) {
      const cos = nx;
      const sin = ny;
      return { x: wx + lx * cos - ly * sin, y: wy + lx * sin + ly * cos };
    }
    // Port: rotate to outward (-nx, ny), then flip local Y so chord follows hull tangent.
    const cos = -nx;
    const sin = ny;
    const flippedLy = -ly;
    return { x: wx + lx * cos - flippedLy * sin, y: wy + lx * sin + flippedLy * cos };
  }

  function applyAlignedWingTransform(ctx, pair, side) {
    ctx.translate(side * pair.attachX, pair.attachY);
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
    return wingLocalToWorld(pair.span, pair.span * sweep, pair, side, alignToHull);
  }

  function wingPairBoundsForSide(side, pair, alignToHull) {
    const ax = side * pair.attachX;
    const ay = pair.attachY;
    const chord = pair.chord;
    const span = pair.span;
    const sweep = pair.sweep ?? 0;

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
      const bw = chord * (d.bladeWidth ?? 0.14);
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
      const mid = ay + chord * 0.15;
      const fSpan = span * (d.fSpan ?? 0.85);
      const rSpan = span * (d.rSpan ?? 0.55);
      const fBulge = chord * (d.fBulge ?? 0.75);
      const rBulge = chord * (d.rBulge ?? 0.45);
      ctx.moveTo(ax, ay - chord * 0.05);
      ctx.bezierCurveTo(
        ax + fSpan * 0.3,
        ay - fBulge,
        ax + fSpan * 0.8,
        ay - fBulge * 0.6,
        ax + fSpan,
        mid - chord * 0.1
      );
      ctx.bezierCurveTo(ax + fSpan * 0.6, mid + chord * 0.05, ax + fSpan * 0.2, mid, ax, mid);
      ctx.closePath();
      ctx.moveTo(ax, mid);
      ctx.bezierCurveTo(
        ax + rSpan * 0.3,
        mid + rBulge * 0.5,
        ax + rSpan * 0.8,
        mid + rBulge * 0.8,
        ax + rSpan,
        mid + chord * 0.4
      );
      ctx.bezierCurveTo(ax + rSpan * 0.5, mid + rBulge * 0.6, ax + rSpan * 0.2, ay + chord * 0.6, ax, ay + chord * 0.5);
      ctx.closePath();
    } else if (shape === 'tentacle') {
      const curl = d.curl ?? 0;
      const w0 = chord * (d.w0 ?? 0.42);
      const w1 = w0 * (d.w1Ratio ?? 0.12);
      const midX = ax + span * 0.5;
      const midY = ay + span * sweep * 0.5 + chord * curl;
      ctx.moveTo(ax, ay - w0);
      ctx.bezierCurveTo(midX, midY - w0 * 0.5, tipX - span * 0.1, tipY - w1 * 2, tipX, tipY - w1);
      ctx.quadraticCurveTo(tipX + w1, tipY, tipX, tipY + w1);
      ctx.bezierCurveTo(tipX - span * 0.1, tipY + w1 * 2, midX, midY + w0 * 0.5, ax, ay + w0);
      ctx.closePath();
    } else if (shape === 'lobe') {
      const bulgeX = ax + span * (d.bulgeX ?? 0.45);
      const bulgeTop = ay - chord * (d.bulgeTop ?? 1);
      const bulgeBot = ay + chord * (d.bulgeBot ?? 0.6);
      ctx.moveTo(ax, ay - chord * 0.3);
      ctx.bezierCurveTo(bulgeX, bulgeTop, tipX, tipY - chord * 0.15, tipX, tipY);
      ctx.bezierCurveTo(tipX, tipY + chord * 0.1, bulgeX, bulgeBot, ax, ay + chord * 0.3);
      ctx.closePath();
    }
  }

  function resolveWingPairs(config, size, tier) {
    const bodyLen = size.tailY - size.noseY;
    return config.wings.pairs.map((raw) => {
      const attachFrac =
        raw.attachFrac ??
        (raw.zoneId != null ? attachFracForZone(raw.zoneId) : 0.5);
      const zone = zoneFromAttachFrac(attachFrac);
      const attachY = size.noseY + bodyLen * attachFrac;
      const bodyW = size.widthAt(attachY);
      const atEdge = raw.atEdge !== false;
      const attachX = atEdge ? bodyW * (raw.edgeMult ?? 1) : 0;
      const span = size.w * (raw.spanScale ?? 1.2);
      const chord = bodyLen * (raw.chordScale ?? 0.22);
      const sweep = raw.sweep ?? 0;
      const normal = atEdge ? computeHullOutwardNormal(size, attachY) : { hullNormalX: 1, hullNormalY: 0 };
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
        tipX: attachX + span,
        tipY: attachY + span * sweep,
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
        const b = wingPairBoundsForSide(side, p, alignToHull && p.atEdge);
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

  function sampleShipConfig(seed, bodyType, tier = SIZE_TIER_SMALL, cellIndex = 0, wingMode = 'hybrid', coherence = 0.75) {
    const r = makeRng(seed, bodyType, cellIndex);
    const body = sampleBodyParams(bodyType, r, tier);
    const size = buildBodySize(bodyType, body);
    const shapePool = wingShapePoolForMode(wingMode);
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
      body,
      wings: { wingMode, count: wingCount, primaryShape, coherence, pairs },
    };
  }

  function defaultShipConfig(bodyType = 'lens', tier = SIZE_TIER_SMALL, wingMode = 'hybrid') {
    const body = defaultBodyParams(bodyType, tier);
    const primaryShape = defaultWingShapeForMode(wingMode);
    const pair = {
      shape: primaryShape,
      attachFrac: attachFracForZone('mid'),
      atEdge: true,
      edgeMult: 1,
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
      body,
      wings: { wingMode, count: 1, primaryShape, coherence: 0.75, pairs: [pair] },
    };
  }

  function normalizeConfig(input, tier = SIZE_TIER_SMALL) {
    const c = typeof input === 'string' ? JSON.parse(input) : { ...input };
    c.tier = c.tier || tier.id;
    c.body = c.body || defaultBodyParams(c.bodyType, tier);
    const wingMode = c.wings?.wingMode || 'hybrid';
    c.wings = c.wings || {
      wingMode,
      count: 1,
      primaryShape: defaultWingShapeForMode(wingMode),
      coherence: 0.75,
      pairs: [],
    };
    c.wings.wingMode = c.wings.wingMode || wingMode;
    const allowed = wingShapesForMode(c.wings.wingMode);
    if (!allowed.includes(c.wings.primaryShape)) {
      c.wings.primaryShape = allowed[0];
    }
    while (c.wings.pairs.length < c.wings.count) {
      c.wings.pairs.push({
        shape: c.wings.primaryShape,
        attachFrac: attachFracForZone('mid'),
        atEdge: true,
        edgeMult: 1,
        spanScale: 1.2,
        chordScale: 0.22,
        sweep: 0.2,
        detail: {},
      });
    }
    c.wings.pairs = c.wings.pairs.slice(0, c.wings.count);
    c.wings.pairs.forEach((pair) => {
      if (!allowed.includes(pair.shape)) pair.shape = c.wings.primaryShape;
    });
    return c;
  }

  function configFromSeed(seed, bodyType, cellIndex = 0, tier = SIZE_TIER_SMALL, wingMode = 'hybrid', coherence = 0.75) {
    return sampleShipConfig(seed, bodyType, tier, cellIndex, wingMode, coherence);
  }

  function drawShip(ctx, cx, cy, config, options = {}) {
    const tier = SIZE_TIER_SMALL;
    const cfg = normalizeConfig(config, tier);
    const {
      showBody = true,
      showWings = true,
      showWidthAt = true,
      showAttach = true,
      showBBox = true,
      /** Rotate edge-attached wings to follow hull outward normal. */
      alignWingsToHull = false,
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
          if (alignWingsToHull && pair.atEdge) {
            applyAlignedWingTransform(ctx, pair, side);
            ctx.beginPath();
            traceWingPath(ctx, wingLocalPair(pair));
          } else {
            ctx.scale(side, 1);
            ctx.beginPath();
            traceWingPath(ctx, pair);
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
        if (alignWingsToHull && pair.atEdge) {
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
        if (alignWingsToHull && pair.atEdge) {
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
          const tip = wingTipWorld(pair, side, alignWingsToHull);
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
    WING_SHAPES,
    WING_SHAPES_ORGANIC,
    WING_SHAPES_INORGANIC,
    WING_MODES,
    wingShapePoolForMode,
    wingShapesForMode,
    defaultWingShapeForMode,
    applyPrimaryWingShape,
    applyWingCoherence,
    ZONES,
    zoneFromAttachFrac,
    attachFracForZone,
    SIZE_TIER_SMALL,
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
