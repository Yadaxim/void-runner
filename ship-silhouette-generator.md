# Ship Silhouette Generator — v0.1 Reference

Procedural top-down spaceship silhouette generator for an HTML5 Canvas game.
All ships are **vertically symmetrical** (nose pointing up, tail down).
The system is split into two independent layers: **bodies** and **wings**.
Tails are not yet implemented.

---

## Architecture

```
drawShip(ctx, cx, cy, bodyType, rng)
  └── drawBody()   → returns a `size` object
  └── drawWings()  → uses the `size` object to place wings
```

Each layer is fully procedural, driven by a seeded RNG so results are reproducible.

---

## RNG

Simple deterministic RNG based on `Math.sin`. Each ship cell gets its own `RNG` instance seeded from `(globalSeed * 97 + cellIndex * 31)`.

```js
function rng(s) { let x = Math.sin(s) * 99999; return x - Math.floor(x); }

class RNG {
  constructor(s) { this.s = s; }
  next()           { this.s++; return rng(this.s); }
  range(a, b)      { return a + this.next() * (b - a); }
  pick(arr)        { return arr[Math.floor(this.next() * arr.length)]; }
}
```

---

## Body Layer

### `drawBody(ctx, type, r)` → `size`

Draws the hull and returns a **size object** used by the wing layer:

```js
{
  w,          // nominal half-width of body
  noseY,      // top Y (nose tip)
  tailY,      // bottom Y (tail)
  midY,       // approximate widest point Y
  isRect,     // boolean — rect bodies get larger wings
  widthAt(y)  // function: returns actual half-width of hull at world Y coordinate
}
```

The `widthAt(y)` function is **critical** — it lets wings attach flush to the hull surface regardless of body shape. Each body implements its own version.

---

### Body Types

All coordinates: `0,0` = ship center, negative Y = nose (up), positive Y = tail (down).

#### `drop`
Teardrop / pod. Two mirrored cubic bezier curves.
- Randomises: `len`, `w` (half-width), `bulge` (0.25–0.6, position of max width along length)
- **Flip**: 50% chance the wide end faces nose-up vs tail-up
- `widthAt`: sine envelope, peak aligned to `bulgePeakY` in world space (accounts for flip)

#### `dart`
Long narrow needle. Sharp bezier nose, slight waist pinch, flat rectangular tail.
- Randomises: `len`, `w`, `bulgeFwd` (how fast nose tapers), `waistFrac` (where pinch sits), `waistW`
- `widthAt`: linear taper nose→waist, then linear expand waist→tail

#### `delta`
Swept triangle / arrowhead with a small tail notch.
- Randomises: `len`, `spread` (max half-width), `sweep` (0.38–0.72, where widest point sits along length), `notch`
- `widthAt`: piecewise ray intersection against 4 interpolated points along the quadratic edge curve (more accurate than a formula). Avoids under-estimating the curve bulge.

#### `rect`
Rounded rectangle, always taller than wide (portrait orientation).
- Randomises: `w` (12–22), `h` (26–42), corner `rad`, nose `taper` (0–0.3, narrows the top edge slightly)
- `widthAt`: constant `hw` except near the nose corner radius
- `isRect: true` → wings get larger span/chord multipliers

#### `trapezoid`
Narrow nose, wide tail. Linear taper between them.
- Randomises: `h`, `noseW`, `tailW`, corner `rad`
- `widthAt`: linear interpolation `hn + (ht - hn) * t`

#### `crescent`
Boolean subtraction: large outer disc minus offset inner disc.
- Randomises: `outerR`, `innerR` (0.55–0.75× outer), `offset` (0.28–0.5× outer, along +Y so bite faces tail)
- Uses `destination-out` composite operation for the cutout
- `widthAt`: circle arc formula `sqrt(outerR² - y²)`
- **Note**: the inner circle stroke is intentionally omitted to keep a clean hole

#### `polygon`
Regular polygon (4–8 sides), optionally stretched on Y axis.
- Randomises: `sides` (4/5/6/7/8), `rad`, `stretch` (0.85–1.4× on Y)
- First vertex always at top (nose direction): `angle = -π/2`
- `widthAt`: ray-casts a horizontal line against all polygon edges, returns max X intersection

---

## Wing Layer

### `drawWings(ctx, size, r, bodyType)`

Called after body is drawn. Wings are always drawn in **mirrored pairs** (port + starboard) using `ctx.scale(side, 1)` with `side ∈ [1, -1]`.

### Wing count
`r.pick([1, 1, 2, 2, 2, 3])` — biased toward 2 pairs.

### Primary shape bias
A **primary wing shape** is picked once per ship. The first wing pair always uses it. Each subsequent pair has **75% chance** of repeating the same shape. This keeps multi-wing ships visually coherent.

### Attachment zones
Three zones along the body length (nose=0, tail=1):
- **Front**: 0.10 – 0.35
- **Mid**: 0.38 – 0.62
- **Rear**: 0.65 – 0.90

One zone is picked per wing pair. The attach Y is randomised within that zone.

### Edge vs centerline attachment
- **Edge** (65% chance): `attachX = widthAt(attachY) * 0.95–1.02` — wing roots at hull surface
- **Centerline** (35% chance): `attachX = 0` — wing grows from spine outward

When centerline: minimum span is `1.1× body.w` and chord is larger, ensuring the wing always protrudes past the hull.

### Wing span / chord
```js
spanScale  = isRect ? range(1.2, 2.8) : range(0.5, 1.8)   // edge
spanScale  = isRect ? range(1.2, 3.2) : range(1.1, 2.4)   // centerline
wSpan      = size.w * spanScale

chordScale = isRect ? range(0.18, 0.45) : range(0.10, 0.35)  // edge
chordScale = isRect ? range(0.18, 0.55) : range(0.18, 0.45)  // centerline
wChord     = bodyLen * chordScale
```

### Sweep
`sweep = range(-0.3, 0.7)` — negative = forward sweep, positive = aft sweep.
Tip position: `tipX = attachX + span`, `tipY = attachY + span * sweep`

---

### Wing Shapes

All shapes are drawn for the **right side only** (positive X). The left side is a canvas mirror.
Parameters: `ax, ay` = root attach point; `span`, `chord` = size; `sweep` = aft angle.

#### `swept`
Classic tapered swept wing. Four-point polygon.
```
root-leading → tip-leading → tip-trailing → root-trailing
```
Tip chord is randomised smaller than root chord.

#### `delta`
Pure triangle. Root leading → tip → root trailing. Zero tip chord.

#### `rect`
Rectangular panel. Tip chord is 0.6–1.0× root chord (slightly tapered or parallel).

#### `blade`
Very thin strut / antenna. Width is only 8–20% of chord. Useful for sensor arrays, pylons.

#### `fin`
Curved organic fin. Root to tip via two bezier control points that arc forward, tip trails back.

#### `insect`
Two separate lobes mimicking dragonfly / moth wings.
- Forward lobe: larger, arcs upward (toward nose)
- Rear lobe: smaller, curves downward (toward tail)
Both are closed bezier paths sharing the attach point as their junction.

#### `tentacle`
Tapered curling limb. Wide at root (`w0`), pinched tip (`w1 = 0.05–0.2× w0`).
A `curl` parameter (`-0.4` to `+0.4`) deflects the midpoint perpendicular to the sweep axis.
Tip has a small rounded cap via `quadraticCurveTo`.

#### `lobe`
Single fat organic lobe — manta ray pectoral style.
The outer edge bulges via a bezier whose peak X is randomised (0.3–0.6× span from root).
Separate top and bottom bulge magnitudes give an asymmetric organic feel.

---

## Canvas Setup

```js
const W = 680, H = 560;   // canvas size
const COLS = 7, ROWS = 3; // grid: one column per body type, 3 variants per row
const CW = W / COLS, CH = H / ROWS;
// background: #0a0a12
// fill:   #c8d8f0
// stroke: #8aabcc, lineWidth 0.8
```

---

## What's Next (not yet implemented)

- **Tails**: engine nacelles, exhaust nozzles, tail fins — attached at `tailY`, symmetric
- **Size scaling**: tiny / small / medium / large / capital — scale multiplier on the whole ship
- **Role flavour**: combat (angular, more wings), civilian (rounded, fewer wings), cargo (wide rect/trapezoid bodies, minimal wings), utility (asymmetric attachments, blade wings)
- **Export**: SVG path output per silhouette for use as game sprites
- **Composition**: stack body + wings + tail into a single reusable draw call with a stable unique ID per variant

---

## Full Source

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Ship Silhouette Generator</title></head>
<body style="background:#0a0a12;margin:0;padding:16px;">
<canvas id="c" width="680" height="560" style="display:block;background:#0a0a12;border-radius:12px;"></canvas>
<div style="padding:10px 0;">
  <button onclick="regen()" style="background:transparent;border:1px solid #444;color:#ccc;padding:6px 16px;border-radius:8px;cursor:pointer;">↻ Regenerate</button>
  <span id="seed-label" style="color:#555;font-size:11px;margin-left:12px;font-family:monospace;"></span>
</div>
<script>
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const W = 680, H = 560;
const COLS = 7, ROWS = 3;
const CW = W / COLS, CH = H / ROWS;
let seed = 1;

function rng(s){let x=Math.sin(s)*99999;return x-Math.floor(x);}
class RNG {
  constructor(s){this.s=s;}
  next(){this.s++;return rng(this.s);}
  range(a,b){return a+this.next()*(b-a);}
  pick(arr){return arr[Math.floor(this.next()*arr.length)];}
}

const BODY_TYPES=['drop','dart','delta','rect','trapezoid','crescent','polygon'];

function regen(){
  seed=Math.floor(Math.random()*100000);
  document.getElementById('seed-label').textContent='seed '+seed;
  draw();
}

function draw(){
  ctx.clearRect(0,0,W,H);
  for(let row=0;row<ROWS;row++){
    for(let col=0;col<COLS;col++){
      const i=row*COLS+col;
      const r=new RNG(seed*97+i*31);
      drawShip(ctx, col*CW+CW/2, row*CH+CH/2, BODY_TYPES[col], r);
    }
  }
}

function setStyle(){
  ctx.fillStyle='#c8d8f0';
  ctx.strokeStyle='#8aabcc';
  ctx.lineWidth=0.8;
}

function drawShip(ctx,cx,cy,type,r){
  ctx.save();
  ctx.translate(cx,cy);
  const size=drawBody(ctx,type,r);
  drawWings(ctx,size,r,type);
  ctx.restore();
}

function drawBody(ctx,type,r){
  setStyle();

  if(type==='drop'){
    const len=r.range(26,38),w=r.range(10,16);
    const nose=-len*0.52,tail=len*0.48;
    const bulge=r.range(0.25,0.6);
    const flip=r.next()>0.5?1:-1;
    const n=nose*flip,t=tail*flip;
    ctx.beginPath();
    ctx.moveTo(0,n);
    ctx.bezierCurveTo(w,n+len*bulge*flip,w*0.9,t-len*0.1*flip,0,t);
    ctx.bezierCurveTo(-w,t-len*0.1*flip,-w,n+len*bulge*flip,0,n);
    ctx.closePath();ctx.fill();ctx.stroke();
    const topY=flip===1?nose:-tail,botY=flip===1?tail:-nose;
    const bulgePeakY=topY+(botY-topY)*(flip===1?bulge:1-bulge);
    return{w,tailY:botY,noseY:topY,midY:(topY+botY)*0.5,isRect:false,
      widthAt(y){
        const totalLen=botY-topY;
        if(totalLen<=0)return 0;
        const t=(y-topY)/totalLen;
        if(t<=0||t>=1)return 0;
        const peakT=(bulgePeakY-topY)/totalLen;
        const u=t<=peakT?(t/peakT)*0.5:0.5+((t-peakT)/(1-peakT))*0.5;
        return w*Math.sin(Math.PI*u);
      }
    };

  }else if(type==='dart'){
    const len=r.range(30,46),w=r.range(5,10);
    const nose=-len*0.54,tail=len*0.46;
    const bulgeFwd=r.range(0.08,0.2);
    const waistFrac=r.range(0.3,0.55);
    const waistW=w*r.range(0.55,0.8);
    const midY=nose+len*waistFrac;
    ctx.beginPath();
    ctx.moveTo(0,nose);
    ctx.bezierCurveTo(w*0.6,nose+len*bulgeFwd,w,midY,waistW,midY);
    ctx.lineTo(w,tail);ctx.lineTo(-w,tail);
    ctx.lineTo(-waistW,midY);
    ctx.bezierCurveTo(-w,midY,-w*0.6,nose+len*bulgeFwd,0,nose);
    ctx.closePath();ctx.fill();ctx.stroke();
    return{w,tailY:tail,noseY:nose,midY,isRect:false,
      widthAt(y){
        const t=(y-nose)/(tail-nose);
        if(t<=0||t>=1)return 0;
        if(t<waistFrac)return w*(t/waistFrac);
        return waistW+(w-waistW)*((t-waistFrac)/(1-waistFrac));
      }
    };

  }else if(type==='delta'){
    const len=r.range(28,40);
    const spread=len*r.range(0.32,0.52);
    const sweep=r.range(0.38,0.72);
    const tip=-len*0.5,base=len*0.5;
    const notch=r.range(0.03,0.1);
    const wideY=tip+len*sweep;
    ctx.beginPath();
    ctx.moveTo(0,tip);
    ctx.quadraticCurveTo(spread*0.6,wideY,spread,base);
    ctx.lineTo(spread*notch,base-len*notch);
    ctx.lineTo(0,base);ctx.lineTo(-spread*notch,base-len*notch);
    ctx.lineTo(-spread,base);
    ctx.quadraticCurveTo(-spread*0.6,wideY,0,tip);
    ctx.closePath();ctx.fill();ctx.stroke();
    const verts=[[0,tip],[spread*0.3,tip+len*sweep*0.5],[spread*0.6,wideY],[spread,base]];
    return{w:spread,tailY:base,noseY:tip,midY:wideY,isRect:false,
      widthAt(y){
        if(y<=tip||y>=base)return 0;
        for(let i=0;i<verts.length-1;i++){
          const a=verts[i],b=verts[i+1];
          if(a[1]<=y&&b[1]>y){
            const t=(y-a[1])/(b[1]-a[1]);
            return a[0]+t*(b[0]-a[0]);
          }
        }
        return spread;
      }
    };

  }else if(type==='rect'){
    const w=r.range(12,22),h=r.range(26,42);
    const rad=r.range(2,7),taper=r.range(0,0.3);
    const hw=w/2,hh=h/2,noseW=hw*(1-taper);
    ctx.beginPath();
    ctx.moveTo(-noseW,-hh);ctx.lineTo(noseW,-hh);
    ctx.quadraticCurveTo(hw,-hh,hw,-hh+rad);
    ctx.lineTo(hw,hh-rad);ctx.quadraticCurveTo(hw,hh,hw-rad,hh);
    ctx.lineTo(-hw+rad,hh);ctx.quadraticCurveTo(-hw,hh,-hw,hh-rad);
    ctx.lineTo(-hw,-hh+rad);ctx.quadraticCurveTo(-hw,-hh,-noseW,-hh);
    ctx.closePath();ctx.fill();ctx.stroke();
    return{w:hw,tailY:hh,noseY:-hh,midY:0,isRect:true,
      widthAt(y){
        const t=(y+hh)/h;
        if(t<0||t>1)return 0;
        if(t<rad/h)return noseW*(t/(rad/h));
        return hw;
      }
    };

  }else if(type==='trapezoid'){
    const h=r.range(20,36),noseW=r.range(6,14),tailW=r.range(20,36);
    const rad=r.range(1,5),hh=h/2,hn=noseW/2,ht=tailW/2;
    ctx.beginPath();
    ctx.moveTo(-hn+rad,-hh);ctx.lineTo(hn-rad,-hh);
    ctx.quadraticCurveTo(hn,-hh,hn+(ht-hn)*rad/h,-hh+rad);
    ctx.lineTo(ht-rad,hh);ctx.quadraticCurveTo(ht,hh,ht-rad,hh);
    ctx.lineTo(-ht+rad,hh);ctx.quadraticCurveTo(-ht,hh,-ht+rad,hh);
    ctx.lineTo(-(hn+(ht-hn)*rad/h),-hh+rad);
    ctx.quadraticCurveTo(-hn,-hh,-hn+rad,-hh);
    ctx.closePath();ctx.fill();ctx.stroke();
    return{w:ht,tailY:hh,noseY:-hh,midY:hh*0.3,isRect:false,
      widthAt(y){
        const t=(y+hh)/h;
        if(t<0||t>1)return 0;
        return hn+(ht-hn)*t;
      }
    };

  }else if(type==='crescent'){
    const outerR=r.range(16,24);
    const innerR=outerR*r.range(0.55,0.75);
    const offset=outerR*r.range(0.28,0.5);
    setStyle();
    ctx.beginPath();ctx.arc(0,0,outerR,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.globalCompositeOperation='destination-out';
    ctx.beginPath();ctx.arc(0,offset,innerR,0,Math.PI*2);ctx.fill();
    ctx.globalCompositeOperation='source-over';
    return{w:outerR,tailY:outerR,noseY:-outerR,midY:0,isRect:false,
      widthAt(y){const d=outerR*outerR-y*y;return d>0?Math.sqrt(d):0;}
    };

  }else if(type==='polygon'){
    const sides=r.pick([4,5,6,7,8]);
    const rad=r.range(14,22),stretch=r.range(0.85,1.4);
    ctx.beginPath();ctx.save();ctx.scale(1,stretch);
    ctx.moveTo(0,-rad);
    for(let i=1;i<sides;i++){
      const a=(i/sides)*Math.PI*2-Math.PI/2;
      ctx.lineTo(Math.cos(a)*rad,Math.sin(a)*rad);
    }
    ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    const verts=[];
    for(let i=0;i<sides;i++){
      const a=(i/sides)*Math.PI*2-Math.PI/2;
      verts.push([Math.cos(a)*rad,Math.sin(a)*rad*stretch]);
    }
    const sRad=rad*stretch;
    return{w:rad,tailY:sRad,noseY:-sRad,midY:0,isRect:false,
      widthAt(y){
        let maxX=0;
        for(let i=0;i<verts.length;i++){
          const a=verts[i],b=verts[(i+1)%verts.length];
          if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y)){
            const t=(y-a[1])/(b[1]-a[1]);
            maxX=Math.max(maxX,Math.abs(a[0]+t*(b[0]-a[0])));
          }
        }
        return maxX;
      }
    };
  }
}

function drawWings(ctx,size,r,bodyType){
  const allShapes=['swept','swept','delta','rect','blade','fin','insect','tentacle','lobe'];
  const count=r.pick([1,1,2,2,2,3]);
  const bodyLen=size.tailY-size.noseY;
  const zones=[[0.10,0.35],[0.38,0.62],[0.65,0.90]];
  const primaryShape=r.pick(allShapes);

  for(let wi=0;wi<count;wi++){
    const shape=(wi===0||r.next()<0.75)?primaryShape:r.pick(allShapes);
    const zone=r.pick(zones);
    const attachFrac=r.range(zone[0],zone[1]);
    const attachY=size.noseY+bodyLen*attachFrac;
    const bodyW=size.widthAt(attachY);
    const atEdge=r.next()>0.35;
    const attachX=atEdge?bodyW*r.range(0.95,1.02):0;
    const minSpanScale=atEdge?0.5:1.1;
    const maxSpanScale=size.isRect?(atEdge?2.8:3.2):(atEdge?1.8:2.4);
    const wSpan=size.w*r.range(minSpanScale,maxSpanScale);
    const minChord=atEdge?0.10:0.18;
    const maxChord=size.isRect?(atEdge?0.45:0.55):(atEdge?0.35:0.45);
    const wChord=bodyLen*r.range(minChord,maxChord);
    const sweep=r.range(-0.3,0.7);

    setStyle();
    for(const side of[1,-1]){
      ctx.save();ctx.scale(side,1);
      ctx.beginPath();
      wingShape(ctx,shape,attachX,attachY,wSpan,wChord,sweep,r);
      ctx.fill();ctx.stroke();
      ctx.restore();
    }
  }
}

function wingShape(ctx,shape,ax,ay,span,chord,sweep,r){
  const tipX=ax+span,tipY=ay+span*sweep;
  if(shape==='swept'){
    ctx.moveTo(ax,ay-chord*0.5);
    ctx.lineTo(tipX,tipY-chord*r.range(0.05,0.3));
    ctx.lineTo(tipX,tipY+chord*r.range(0.05,0.2));
    ctx.lineTo(ax,ay+chord*0.5);ctx.closePath();
  }else if(shape==='delta'){
    ctx.moveTo(ax,ay-chord*0.5);ctx.lineTo(tipX,tipY);
    ctx.lineTo(ax,ay+chord*0.5);ctx.closePath();
  }else if(shape==='rect'){
    const tc=chord*r.range(0.6,1.0);
    ctx.moveTo(ax,ay-chord*0.5);ctx.lineTo(tipX,tipY-tc*0.5);
    ctx.lineTo(tipX,tipY+tc*0.5);ctx.lineTo(ax,ay+chord*0.5);ctx.closePath();
  }else if(shape==='blade'){
    const bw=chord*r.range(0.08,0.2);
    ctx.moveTo(ax,ay-bw);ctx.lineTo(tipX,tipY-bw*0.5);
    ctx.lineTo(tipX,tipY+bw*0.5);ctx.lineTo(ax,ay+bw);ctx.closePath();
  }else if(shape==='fin'){
    ctx.moveTo(ax,ay-chord*0.4);
    ctx.bezierCurveTo(ax+span*0.3,ay-chord*0.8,ax+span*0.7,tipY-chord*0.2,tipX,tipY);
    ctx.lineTo(ax,ay+chord*0.4);ctx.closePath();
  }else if(shape==='insect'){
    const mid=ay+chord*0.15;
    const fSpan=span*r.range(0.7,1.0),rSpan=span*r.range(0.4,0.7);
    const fBulge=chord*r.range(0.5,1.0),rBulge=chord*r.range(0.3,0.6);
    ctx.moveTo(ax,ay-chord*0.05);
    ctx.bezierCurveTo(ax+fSpan*0.3,ay-fBulge,ax+fSpan*0.8,ay-fBulge*0.6,ax+fSpan,mid-chord*0.1);
    ctx.bezierCurveTo(ax+fSpan*0.6,mid+chord*0.05,ax+fSpan*0.2,mid,ax,mid);
    ctx.closePath();
    ctx.moveTo(ax,mid);
    ctx.bezierCurveTo(ax+rSpan*0.3,mid+rBulge*0.5,ax+rSpan*0.8,mid+rBulge*0.8,ax+rSpan,mid+chord*0.4);
    ctx.bezierCurveTo(ax+rSpan*0.5,mid+rBulge*0.6,ax+rSpan*0.2,ay+chord*0.6,ax,ay+chord*0.5);
    ctx.closePath();
  }else if(shape==='tentacle'){
    const curl=r.range(-0.4,0.4);
    const w0=chord*r.range(0.3,0.55),w1=w0*r.range(0.05,0.2);
    const midX=ax+span*0.5,midY=ay+span*sweep*0.5+chord*curl;
    ctx.moveTo(ax,ay-w0);
    ctx.bezierCurveTo(midX,midY-w0*0.5,tipX-span*0.1,tipY-w1*2,tipX,tipY-w1);
    ctx.quadraticCurveTo(tipX+w1,tipY,tipX,tipY+w1);
    ctx.bezierCurveTo(tipX-span*0.1,tipY+w1*2,midX,midY+w0*0.5,ax,ay+w0);
    ctx.closePath();
  }else if(shape==='lobe'){
    const bulgeX=ax+span*r.range(0.3,0.6);
    const bulgeTop=ay-chord*r.range(0.7,1.3),bulgeBot=ay+chord*r.range(0.4,0.8);
    ctx.moveTo(ax,ay-chord*0.3);
    ctx.bezierCurveTo(bulgeX,bulgeTop,tipX,tipY-chord*0.15,tipX,tipY);
    ctx.bezierCurveTo(tipX,tipY+chord*0.1,bulgeX,bulgeBot,ax,ay+chord*0.3);
    ctx.closePath();
  }
}

seed=Math.floor(Math.random()*100000);
document.getElementById('seed-label').textContent='seed '+seed;
draw();
</script>
</body>
</html>
```
