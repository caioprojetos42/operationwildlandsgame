import * as THREE from 'three';
import { EnemyClass } from '../types';
import { ProceduralMaterials } from './TextureLibrary';

export interface CharacterTextureSuite {
  urbanCamoMap: THREE.CanvasTexture;
  multicamMap: THREE.CanvasTexture;
  greyHoodieMap: THREE.CanvasTexture;
  specOpsMap: THREE.CanvasTexture;
  ghillieMap: THREE.CanvasTexture;
  clothNormalMap: THREE.CanvasTexture;
  molleCamoMap: THREE.CanvasTexture;
  molleDarkMap: THREE.CanvasTexture;
  molleOliveMap: THREE.CanvasTexture;
  molleNormalMap: THREE.CanvasTexture;
  gloveMeshMap: THREE.CanvasTexture;
  gloveNormalMap: THREE.CanvasTexture;
  faceRespiratorMap: THREE.CanvasTexture;
  faceOliveBalaclavaMap: THREE.CanvasTexture;
  faceBlackBalaclavaMap: THREE.CanvasTexture;
  faceBalaclavaMap: THREE.CanvasTexture;
  opoPatchMap: THREE.CanvasTexture;
  bootLeatherMap: THREE.CanvasTexture;
}

let cachedSuite: CharacterTextureSuite | null = null;

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function makeCanvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function heightCanvasToNormal(
  heightCanvas: HTMLCanvasElement,
  strength: number,
  repeatX = 1,
  repeatY = 1
): THREE.DataTexture {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const ctx = heightCanvas.getContext('2d')!;
  const src = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h * 4);

  const sample = (x: number, y: number) => {
    const wx = ((x % w) + w) % w;
    const wy = ((y % h) + h) % h;
    return src[(wy * w + wx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (sample(x + 1, y) - sample(x - 1, y)) * strength;
      const dy = (sample(x, y + 1) - sample(x, y - 1)) * strength;
      let nx = -dx;
      let ny = -dy;
      let nz = 1.0;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv;
      ny *= inv;
      nz *= inv;
      const idx = (y * w + x) * 4;
      out[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      out[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates the signature Urban Slate-Blue/Grey Tactical Camo BDU directly matching
 * the 360-degree ATC/OPO Special Ops turnaround reference (cool slate-blue highlights,
 * charcoal-navy irregular urban camo blotches, micro-ripstop weave & deep fabric crease AO).
 */
function createUrbanSpecOpsCamoTexture(seed: number, tintShift = 0): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = makeCanvas(size);
  const rand = seededRand(seed);

  // Cool urban gunmetal-slate base
  ctx.fillStyle = tintShift === 0 ? '#576273' : tintShift > 0 ? '#606c7e' : '#4a5464';
  ctx.fillRect(0, 0, size, size);

  const layers: Array<{ color: string; count: number; baseR: number; alpha: number }> = [
    { color: '#7d8a9e', count: 55, baseR: 54, alpha: 0.72 }, // steel-ice highlight blotches
    { color: '#394252', count: 74, baseR: 42, alpha: 0.86 }, // mid navy-slate
    { color: '#222731', count: 68, baseR: 32, alpha: 0.90 }, // deep charcoal urban camo
    { color: '#9aa7bc', count: 44, baseR: 22, alpha: 0.52 }, // worn fabric ridge highlights
    { color: '#171b22', count: 48, baseR: 17, alpha: 0.82 }, // dark contrast flecks
  ];

  for (const layer of layers) {
    ctx.fillStyle = layer.color;
    for (let i = 0; i < layer.count; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const rx = layer.baseR * (0.65 + rand() * 0.95);
      const ry = layer.baseR * (0.42 + rand() * 0.65);
      const rot = rand() * Math.PI * 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.globalAlpha = layer.alpha;
      ctx.beginPath();
      const pts = 8;
      for (let p = 0; p <= pts; p++) {
        const a = (p / pts) * Math.PI * 2;
        const j = 0.62 + rand() * 0.65;
        const px = Math.cos(a) * rx * j;
        const py = Math.sin(a) * ry * j;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;

  // Fine combat BDU ripstop cross-grid weave
  ctx.strokeStyle = 'rgba(15,18,24,0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i < size; i += 6) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  // Deep realistic cloth tension folds & joint creases (matches heavy folded BDU trousers/sleeves)
  for (let i = 0; i < 26; i++) {
    const y0 = rand() * size;
    const dark = rand() > 0.38;
    ctx.strokeStyle = dark ? 'rgba(12,15,21,0.28)' : 'rgba(176,190,212,0.16)';
    ctx.lineWidth = 4 + rand() * 9;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.bezierCurveTo(
      size * 0.33,
      y0 + (rand() - 0.5) * 46,
      size * 0.66,
      y0 + (rand() - 0.5) * 46,
      size,
      y0 + (rand() - 0.5) * 28
    );
    ctx.stroke();
  }

  // Double-needle BDU vertical side seams
  for (const sx of [128, 384]) {
    ctx.fillStyle = 'rgba(12,15,20,0.45)';
    ctx.fillRect(sx - 1.5, 0, 3, size);
    ctx.strokeStyle = 'rgba(130,145,165,0.34)';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sx - 5, 0);
    ctx.lineTo(sx - 5, size);
    ctx.moveTo(sx + 5, 0);
    ctx.lineTo(sx + 5, size);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createClothNormalTexture(): THREE.CanvasTexture {
  const size = 256;
  const [hc, hctx] = makeCanvas(size);
  const rand = seededRand(8123);
  hctx.fillStyle = '#808080';
  hctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 4) {
    hctx.fillStyle = y % 8 === 0 ? '#989898' : '#6c6c6c';
    hctx.fillRect(0, y, size, 2);
  }
  for (let x = 0; x < size; x += 4) {
    hctx.fillStyle = x % 8 === 0 ? 'rgba(170,170,170,0.46)' : 'rgba(92,92,92,0.46)';
    hctx.fillRect(x, 0, 2, size);
  }
  for (let i = 0; i < 32; i++) {
    const y = rand() * size;
    hctx.strokeStyle = rand() > 0.5 ? 'rgba(230,230,230,0.36)' : 'rgba(32,32,32,0.36)';
    hctx.lineWidth = 4 + rand() * 10;
    hctx.beginPath();
    hctx.moveTo(0, y);
    hctx.bezierCurveTo(size * 0.33, y + (rand() - 0.5) * 34, size * 0.66, y + (rand() - 0.5) * 34, size, y);
    hctx.stroke();
  }
  return heightCanvasToNormal(hc, 2.5, 2, 2) as unknown as THREE.CanvasTexture;
}

function createMolleGearTexture(
  variant: 'dark' | 'olive' | 'camo'
): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const size = 256;
  const [c, ctx] = makeCanvas(size);
  const [hc, hctx] = makeCanvas(size);
  const rand = seededRand(variant === 'dark' ? 9442 : variant === 'olive' ? 9443 : 9441);

  ctx.fillStyle = variant === 'dark' ? '#1e2126' : variant === 'olive' ? '#464a35' : '#4a4e3f';
  ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#5e5e5e';
  hctx.fillRect(0, 0, size, size);

  // Subtle Cordura ballistic nylon micro-speckle
  for (let i = 0; i < 3600; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.09)';
    ctx.fillRect(rand() * size, rand() * size, 2, 2);
  }

  // Horizontal PALS / MOLLE Cordura webbing straps + vertical bar-tack stitching
  for (let y = 10; y < size; y += 34) {
    ctx.fillStyle =
      variant === 'dark'
        ? 'rgba(34,38,44,0.96)'
        : variant === 'olive'
        ? 'rgba(84,88,60,0.95)'
        : 'rgba(72,70,54,0.92)';
    ctx.fillRect(0, y, size, 20);
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fillRect(0, y + 20, size, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(0, y, size, 2);

    hctx.fillStyle = '#dcdcdc';
    hctx.fillRect(0, y, size, 20);
    hctx.fillStyle = '#1c1c1c';
    hctx.fillRect(0, y + 20, size, 5);

    for (let x = 18; x < size; x += 34) {
      ctx.fillStyle = 'rgba(10,12,14,0.72)';
      ctx.fillRect(x, y + 1, 3, 18);
      hctx.fillStyle = '#323232';
      hctx.fillRect(x, y, 3, 20);
    }
  }

  const map = new THREE.CanvasTexture(c);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  const normal = heightCanvasToNormal(hc, 3.0, 1, 1) as unknown as THREE.CanvasTexture;
  return { map, normal };
}

/**
 * Fine pebbled black-charcoal leather tactical glove texture matching the close-up glove reference.
 */
function createGloveLeatherTexture(): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const size = 256;
  const [c, ctx] = makeCanvas(size);
  const [hc, hctx] = makeCanvas(size);
  const rand = seededRand(5151);

  ctx.fillStyle = '#24272b';
  ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#787878';
  hctx.fillRect(0, 0, size, size);

  // Fine organic leather pebble grain
  for (let i = 0; i < 6200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.8 + rand() * 1.6;
    const bright = rand() > 0.5;
    ctx.fillStyle = bright ? 'rgba(72,78,86,0.22)' : 'rgba(10,12,14,0.32)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    hctx.fillStyle = bright ? '#b8b8b8' : '#3a3a3a';
    hctx.beginPath();
    hctx.arc(x, y, r, 0, Math.PI * 2);
    hctx.fill();
  }

  // Subtle leather crease folds + double stitching border
  ctx.strokeStyle = 'rgba(108,116,126,0.36)';
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.4;
  ctx.strokeRect(10, 10, size - 20, size - 20);
  ctx.setLineDash([]);

  const map = new THREE.CanvasTexture(c);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2.5, 2.5);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  const normal = heightCanvasToNormal(hc, 2.4, 2.5, 2.5) as unknown as THREE.CanvasTexture;
  return { map, normal };
}

/**
 * Generates anatomically UV-wrapped human head textures for all 3 reference variants:
 * - 'respirator': exposed brow, realistic eyes, cropped dark brown hair & black lower mask straps (Row 1)
 * - 'olive_balaclava': olive-drab knitted full balaclava with clean eye slit (Row 2)
 * - 'black_balaclava': matte charcoal-black knitted full balaclava with clean eye slit (Row 3 & Player)
 */
function createOperatorFaceTexture(mode: 'respirator' | 'olive_balaclava' | 'black_balaclava'): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 256);
  const rand = seededRand(mode === 'respirator' ? 3341 : mode === 'olive_balaclava' ? 3342 : 3343);

  const cx = 256;
  const eyeY = 108;

  if (mode === 'respirator') {
    // Lower black tactical collar + upper dark brown cropped hair on cranium/back
    ctx.fillStyle = '#202328';
    ctx.fillRect(0, 0, 512, 256);

    // Cropped short dark-brown hair over top/back of skull (matches Row 1 side & back views!)
    const hairGrad = ctx.createLinearGradient(0, 0, 0, 155);
    hairGrad.addColorStop(0, '#3e291d');
    hairGrad.addColorStop(0.65, '#4b3223');
    hairGrad.addColorStop(1, '#261a14');
    ctx.fillStyle = hairGrad;
    ctx.fillRect(0, 0, 512, 138);
    for (let i = 0; i < 3800; i++) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(26,16,10,0.34)' : 'rgba(98,68,48,0.22)';
      ctx.fillRect(rand() * 512, rand() * 136, 2, 4);
    }

    // Exposed realistic human forehead, temples, cheeks & ears around front face
    const faceGrad = ctx.createRadialGradient(cx, eyeY + 8, 12, cx, eyeY + 8, 92);
    faceGrad.addColorStop(0, '#d2a282');
    faceGrad.addColorStop(0.68, '#b58264');
    faceGrad.addColorStop(1, '#7a523c');
    ctx.fillStyle = faceGrad;
    ctx.beginPath();
    ctx.ellipse(cx, eyeY + 12, 86, 56, 0, 0, Math.PI * 2);
    ctx.fill();

    // Lower respirator black mask base shadow over chin/mouth
    ctx.fillStyle = '#181b20';
    ctx.beginPath();
    ctx.ellipse(cx, eyeY + 58, 72, 34, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Full knitted tactical balaclava (Olive-Drab Row 2 or Charcoal-Black Row 3)
    const baseHex = mode === 'olive_balaclava' ? '#4a4e37' : '#212429';
    const ribDark = mode === 'olive_balaclava' ? 'rgba(22,25,16,0.35)' : 'rgba(8,10,13,0.42)';
    const ribLight = mode === 'olive_balaclava' ? 'rgba(116,120,86,0.22)' : 'rgba(72,78,88,0.2)';

    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 512, 256);

    for (let x = 0; x < 512; x += 3) {
      ctx.fillStyle = x % 6 === 0 ? ribDark : ribLight;
      ctx.fillRect(x, 0, 1.5, 256);
    }
    for (let i = 0; i < 3200; i++) {
      ctx.fillStyle = rand() > 0.5 ? ribDark : ribLight;
      ctx.fillRect(rand() * 512, rand() * 256, 2, 2);
    }

    // Stitched dark hem border around balaclava eye opening
    ctx.fillStyle = mode === 'olive_balaclava' ? '#2c2f21' : '#121418';
    ctx.beginPath();
    ctx.ellipse(cx, eyeY, 68, 25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Warm realistic human skin inside eye opening
    const skinGrad = ctx.createRadialGradient(cx, eyeY - 3, 6, cx, eyeY, 64);
    skinGrad.addColorStop(0, '#ce9d7d');
    skinGrad.addColorStop(0.66, '#b07e60');
    skinGrad.addColorStop(1, '#75503b');
    ctx.fillStyle = skinGrad;
    ctx.beginPath();
    ctx.ellipse(cx, eyeY, 62, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nose bridge highlight & orbital brow shadow
  ctx.fillStyle = 'rgba(232,190,160,0.34)';
  ctx.fillRect(cx - 5, eyeY - 12, 10, 24);
  ctx.fillStyle = 'rgba(48,28,18,0.35)';
  ctx.fillRect(cx - 56, eyeY - 19, 112, 7);

  // Expressive sculpted eyes + eyebrows
  for (const side of [-1, 1]) {
    const ex = cx + side * 24;
    ctx.strokeStyle = '#2a1d15';
    ctx.lineWidth = 4.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - 13 * side, eyeY - 11);
    ctx.quadraticCurveTo(ex, eyeY - 14, ex + 12 * side, eyeY - 9);
    ctx.stroke();

    ctx.fillStyle = 'rgba(42,24,16,0.5)';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY + 1, 13, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e0d9d0';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY + 1, 10, 4.1, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3a2b20';
    ctx.beginPath();
    ctx.arc(ex, eyeY + 1, 3.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#100c0a';
    ctx.beginPath();
    ctx.arc(ex, eyeY + 1, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,250,242,0.82)';
    ctx.beginPath();
    ctx.arc(ex + 1.2, eyeY - 0.3, 1.05, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#261810';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(ex - 11, eyeY + 1);
    ctx.quadraticCurveTo(ex, eyeY - 5, ex + 11, eyeY + 1);
    ctx.stroke();
  }

  // Sculpted lower face fabric folds over mouth/nose bridge for balaclava variants
  if (mode !== 'respirator') {
    ctx.fillStyle = 'rgba(14,16,18,0.34)';
    ctx.beginPath();
    ctx.ellipse(cx, eyeY + 42, 34, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(135,140,128,0.16)';
    ctx.beginPath();
    ctx.ellipse(cx, eyeY + 25, 16, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Circular Gold/Amber "OPO" Special Ops Emblem Patch (seen on upper sleeves & backpack top in 360° reference!)
 */
function createOpoPatchTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128);
  ctx.fillStyle = '#1b1f24';
  ctx.fillRect(0, 0, 128, 128);

  ctx.strokeStyle = '#e6b84c';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#242a32';
  ctx.beginPath();
  ctx.arc(64, 64, 44, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f2cb66';
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('OPO', 64, 66);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBootLeatherTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256);
  const rand = seededRand(6621);
  // Matte-charcoal tactical combat boot leather (matches all 3 rows in 360° reference!)
  ctx.fillStyle = '#23262b';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(10,12,15,0.28)' : 'rgba(84,92,102,0.16)';
    ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
  }
  // Subtle light dust scuff near rubber lug sole
  const dust = ctx.createLinearGradient(0, 185, 0, 256);
  dust.addColorStop(0, 'rgba(130,136,142,0)');
  dust.addColorStop(1, 'rgba(130,136,142,0.34)');
  ctx.fillStyle = dust;
  ctx.fillRect(0, 185, 256, 71);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function getCharacterTextureSuite(): CharacterTextureSuite {
  if (cachedSuite) return cachedSuite;
  const molleCamo = createMolleGearTexture('camo');
  const molleDark = createMolleGearTexture('dark');
  const molleOlive = createMolleGearTexture('olive');
  const glove = createGloveLeatherTexture();
  const faceBlack = createOperatorFaceTexture('black_balaclava');

  cachedSuite = {
    urbanCamoMap: createUrbanSpecOpsCamoTexture(1101, 0),
    multicamMap: createUrbanSpecOpsCamoTexture(1107, 1),
    greyHoodieMap: createUrbanSpecOpsCamoTexture(2202, -1),
    specOpsMap: createUrbanSpecOpsCamoTexture(3303, 0),
    ghillieMap: createUrbanSpecOpsCamoTexture(4404, -1),
    clothNormalMap: createClothNormalTexture(),
    molleCamoMap: molleCamo.map,
    molleDarkMap: molleDark.map,
    molleOliveMap: molleOlive.map,
    molleNormalMap: molleDark.normal,
    gloveMeshMap: glove.map,
    gloveNormalMap: glove.normal,
    faceRespiratorMap: createOperatorFaceTexture('respirator'),
    faceOliveBalaclavaMap: createOperatorFaceTexture('olive_balaclava'),
    faceBlackBalaclavaMap: faceBlack,
    faceBalaclavaMap: faceBlack,
    opoPatchMap: createOpoPatchTexture(),
    bootLeatherMap: createBootLeatherTexture(),
  };
  return cachedSuite;
}

/**
 * Creates an anatomically shaped organic body/limb segment using LatheGeometry + elliptical cross-section
 * and realistic cloth tension wrinkles (zero rigid boxes or pipes).
 */
function createOrganicProfileGeometry(
  profile: [number, number][], // [radius, y]
  radialSegs: number,
  scaleX: number,
  scaleZ: number,
  fabricWrinkleAmp = 0.008
): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.004, r), y));
  const geo = new THREE.LatheGeometry(pts, radialSegs);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    const wrinkle =
      1 +
      Math.sin(y * 30 + ang * 2.0) * fabricWrinkleAmp +
      Math.cos(y * 54 - ang * 3.0) * fabricWrinkleAmp * 0.45;
    pos.setXYZ(i, x * scaleX * wrinkle, y, z * scaleZ * wrinkle);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Sculpted ribbed hard-shell tactical shin guard / greave wrapping cleanly over the front calf
 * (directly modeled after Row 1 & Row 3 of the 360° reference sheet!).
 */
function createRibbedShinGuardGeo(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.068, 0.056, 0.30, 14, 18, true, Math.PI * 0.62, Math.PI * 0.76);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // 5 horizontal molded tactical shin armor ribs
    const rib = Math.pow(Math.max(0, Math.sin((y + 0.15) * 48)), 1.6) * 0.0095;
    const len = Math.hypot(x, z);
    if (len > 1e-5) {
      const scale = (len + rib) / len;
      pos.setXYZ(i, x * scale, y, z * scale);
    }
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Sculpted rounded tactical assault backpack (matches Row 3 Side & Back views of the 360° reference!).
 */
function createTacticalBackpackGeo(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 18, 14);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i);
    const uy = pos.getY(i);
    const uz = pos.getZ(i);
    // Narrower rounded top, fuller main pack compartment, flat back face resting flush against carrier
    const topTaper = uy > 0 ? 1 - uy * 0.18 : 1.0;
    const x = ux * 0.145 * topTaper;
    const y = uy * 0.21;
    let z = uz * 0.095;
    if (uz < 0) z *= 0.35; // Flat inner back hugging the back plate
    // Horizontal compression ribs on rear face
    if (uz > 0.25) {
      z += Math.sin(uy * 26) * 0.0055 * uz;
    }
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

interface SharedCharacterGeos {
  torso: THREE.BufferGeometry;
  pelvis: THREE.BufferGeometry;
  neck: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  thigh: THREE.BufferGeometry;
  shin: THREE.BufferGeometry;
  upperArm: THREE.BufferGeometry;
  forearm: THREE.BufferGeometry;
  boot: THREE.BufferGeometry;
  kneePad: THREE.BufferGeometry;
  elbowPad: THREE.BufferGeometry;
  shinGuard: THREE.BufferGeometry;
  plateFront: THREE.BufferGeometry;
  backpack: THREE.BufferGeometry;
}

let cachedGeos: SharedCharacterGeos | null = null;

function getSharedCharacterGeos(): SharedCharacterGeos {
  if (cachedGeos) return cachedGeos;

  // 1. Athletic Special-Ops Torso (lean waist -> sculpted ribcage/chest -> broad shoulders)
  const torso = createOrganicProfileGeometry(
    [
      [0.138, 0.0],   // waist
      [0.148, 0.09],  // lower abs
      [0.175, 0.22],  // ribcage
      [0.198, 0.36],  // chest / lats
      [0.208, 0.45],  // upper chest / shoulder shelf
      [0.150, 0.51],  // trapezius slope
      [0.072, 0.54],  // collar / neck root
    ],
    16,
    1.12,
    0.70,
    0.014
  );

  // 2. Sculpted Pelvis / Hips
  const pelvis = createOrganicProfileGeometry(
    [
      [0.130, -0.09],
      [0.164, -0.02],
      [0.160, 0.06],
      [0.142, 0.11],
    ],
    14,
    1.08,
    0.76,
    0.010
  );

  // 3. Human Neck
  const neck = new THREE.CylinderGeometry(0.054, 0.066, 0.11, 12);

  // 4. Anatomically Oval Human Head (cranium + sculpted jawline, facing -Z with u=0.5 aligned forward!)
  const head = new THREE.SphereGeometry(0.116, 18, 16);
  const hPos = head.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < hPos.count; i++) {
    let x = hPos.getX(i);
    let y = hPos.getY(i);
    let z = hPos.getZ(i);
    y *= 1.18;
    x *= 0.87;
    z *= 0.98;
    if (y < 0) {
      const jawT = THREE.MathUtils.clamp(-y / 0.14, 0, 1);
      x *= 1 - jawT * 0.25;
      z *= 1 - jawT * 0.12;
      if (z < 0) z -= Math.sin(jawT * Math.PI) * 0.016;
    }
    hPos.setXYZ(i, x, y, z);
  }
  head.rotateY(-Math.PI * 0.5); // Aligns SphereGeometry UV u=0.5 directly toward -Z
  head.computeVertexNormals();
  head.computeBoundingSphere();

  // 5. Sculpted Tactical BDU Thigh (hip y=0 -> knee y=-0.43) with realistic folded cloth contour
  const thigh = createOrganicProfileGeometry(
    [
      [0.064, -0.43],
      [0.076, -0.33],
      [0.094, -0.18],
      [0.100, -0.05],
      [0.084, 0.02],
    ],
    14,
    0.96,
    1.04,
    0.020
  );

  // 6. Sculpted BDU Calf / Shin (knee y=0 -> ankle y=-0.41)
  const shin = createOrganicProfileGeometry(
    [
      [0.050, -0.41],
      [0.060, -0.29],
      [0.074, -0.14],
      [0.068, -0.02],
      [0.056, 0.02],
    ],
    14,
    0.94,
    1.02,
    0.018
  );

  // 7. Sculpted Upper Arm (shoulder y=0 -> elbow y=-0.29)
  const upperArm = createOrganicProfileGeometry(
    [
      [0.046, -0.29],
      [0.056, -0.18],
      [0.070, -0.05],
      [0.056, 0.03],
    ],
    12,
    0.96,
    1.02,
    0.020
  );

  // 8. Sculpted Forearm with folded combat sleeve (elbow y=0 -> wrist y=-0.26)
  const forearm = createOrganicProfileGeometry(
    [
      [0.035, -0.26],
      [0.045, -0.16],
      [0.055, -0.04],
      [0.047, 0.02],
    ],
    12,
    0.95,
    1.0,
    0.020
  );

  // 9. Chunky Anatomical Black Military Combat Boot (matches 360° reference profile!)
  const bootShape = new THREE.Shape();
  bootShape.moveTo(-0.072, -0.022);
  bootShape.lineTo(-0.076, 0.135);
  bootShape.lineTo(0.046, 0.145);
  bootShape.quadraticCurveTo(0.082, 0.062, 0.18, 0.038);
  bootShape.quadraticCurveTo(0.21, 0.02, 0.20, -0.022);
  bootShape.lineTo(-0.072, -0.022);
  const boot = new THREE.ExtrudeGeometry(bootShape, {
    depth: 0.086,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.014,
    bevelSegments: 2,
  });
  boot.translate(-0.02, 0, -0.043);
  boot.rotateY(Math.PI * 0.5);
  boot.computeVertexNormals();
  boot.computeBoundingSphere();

  // 10. Curved Hard-Shell Round Tactical Knee Pad
  const kneePad = new THREE.SphereGeometry(0.078, 12, 10, -Math.PI * 0.36, Math.PI * 0.72, Math.PI * 0.26, Math.PI * 0.5);
  kneePad.rotateY(-Math.PI * 0.5);
  kneePad.computeVertexNormals();

  // 11. Curved Hard-Shell Tactical Elbow Pad
  const elbowPad = new THREE.SphereGeometry(0.054, 10, 8, -Math.PI * 0.36, Math.PI * 0.72, Math.PI * 0.28, Math.PI * 0.48);
  elbowPad.rotateY(Math.PI * 0.5); // Faces back of elbow (+Z)
  elbowPad.computeVertexNormals();

  // 12. Contoured Shooter-Cut MOLLE Plate Carrier Shell
  const plateShape = new THREE.Shape();
  plateShape.moveTo(-0.142, -0.175);
  plateShape.lineTo(0.142, -0.175);
  plateShape.lineTo(0.152, 0.075);
  plateShape.lineTo(0.092, 0.185);
  plateShape.lineTo(-0.092, 0.185);
  plateShape.lineTo(-0.152, 0.075);
  plateShape.closePath();
  const plateFront = new THREE.ExtrudeGeometry(plateShape, {
    depth: 0.042,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  plateFront.translate(0, 0, -0.021);
  plateFront.computeVertexNormals();

  cachedGeos = {
    torso,
    pelvis,
    neck,
    head,
    thigh,
    shin,
    upperArm,
    forearm,
    boot,
    kneePad,
    elbowPad,
    shinGuard: createRibbedShinGuardGeo(),
    plateFront,
    backpack: createTacticalBackpackGeo(),
  };
  return cachedGeos;
}

export interface BuiltEnemyModel {
  group: THREE.Group;
  headMesh: THREE.Mesh;
  torsoMesh: THREE.Mesh;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  rightArm: THREE.Group;
  muzzleFlash: THREE.Mesh;
  hitMeshes: THREE.Mesh[];
  // Articulated anatomical animation pivots
  upperBody: THREE.Group;
  headPivot: THREE.Group;
  leftShin: THREE.Group;
  rightShin: THREE.Group;
  leftArm: THREE.Group;
  weaponPivot: THREE.Group;
}

export interface BuiltPlayerModel extends BuiltEnemyModel {
  firstPersonHiddenNodes: THREE.Object3D[];
  setFirstPersonMode: (enabled: boolean) => void;
}

type OperatorArchetype = 'respirator' | 'recon_olive' | 'assault_pack';

/**
 * Core 360°-faithful Special Ops Operator builder matching the 3 rows of download_11c39636.jpg:
 * - 'respirator'   (Row 1): Dual-canister gas mask + forehead goggles + 6 chest mag pouches + chest chemlights + ribbed shin guards
 * - 'recon_olive'  (Row 2): Olive balaclava + olive chest pouches + rear hip canteen + olive thigh pouches + shoulder chemlights
 * - 'assault_pack' (Row 3 & Player): Black balaclava + contoured assault backpack w/ glowing gold OPO patch + thigh chemlights + ribbed shin guards
 */
function buildSpecialOpsOperator(
  archetype: OperatorArchetype,
  enemyId: string,
  mats: ProceduralMaterials,
  isSniperWeapon: boolean,
  registerForCombatHits: boolean
): BuiltPlayerModel {
  const tex = getCharacterTextureSuite();
  const geos = getSharedCharacterGeos();
  const group = new THREE.Group();
  const hitMeshes: THREE.Mesh[] = [];
  const firstPersonHiddenNodes: THREE.Object3D[] = [];

  const registerHit = (mesh: THREE.Mesh, hitZone: 'head' | 'torso' | 'limb') => {
    if (!registerForCombatHits) return;
    mesh.userData = { enemyId, hitZone };
    hitMeshes.push(mesh);
  };

  const hasShinGuards = archetype === 'respirator' || archetype === 'assault_pack';
  const hasBackpack = archetype === 'assault_pack';
  const hasOliveAccents = archetype === 'recon_olive';

  const uniformMap =
    archetype === 'respirator'
      ? tex.urbanCamoMap
      : archetype === 'recon_olive'
      ? tex.greyHoodieMap
      : tex.specOpsMap;

  // === SHARED HIGH-FIDELITY PBR MATERIALS ===
  const uniformMat = new THREE.MeshPhysicalMaterial({
    map: uniformMap,
    normalMap: tex.clothNormalMap,
    normalScale: new THREE.Vector2(1.25, 1.25),
    roughness: 0.85,
    metalness: 0.04,
    sheen: 0.42,
    sheenRoughness: 0.72,
    sheenColor: new THREE.Color(0x9fb2cc),
    envMapIntensity: 1.15,
  });

  const vestBlackMat = new THREE.MeshPhysicalMaterial({
    map: tex.molleDarkMap,
    normalMap: tex.molleNormalMap,
    normalScale: new THREE.Vector2(1.35, 1.35),
    roughness: 0.72,
    metalness: 0.1,
    sheen: 0.25,
    sheenRoughness: 0.74,
    sheenColor: new THREE.Color(0x6c7788),
    envMapIntensity: 1.18,
  });

  const pouchAccentMat = new THREE.MeshPhysicalMaterial({
    map: hasOliveAccents ? tex.molleOliveMap : tex.molleDarkMap,
    normalMap: tex.molleNormalMap,
    normalScale: new THREE.Vector2(1.25, 1.25),
    color: hasOliveAccents ? 0x9fa37c : 0x2a2f36,
    roughness: 0.76,
    metalness: 0.08,
    envMapIntensity: 1.12,
  });

  const hardArmorMat = new THREE.MeshPhysicalMaterial({
    color: 0x1d2026,
    normalMap: tex.gloveNormalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.42,
    metalness: 0.26,
    clearcoat: 0.24,
    clearcoatRoughness: 0.36,
    envMapIntensity: 1.35,
  });

  const bootMat = new THREE.MeshStandardMaterial({
    map: tex.bootLeatherMap,
    normalMap: tex.gloveNormalMap,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughness: 0.62,
    metalness: 0.14,
    envMapIntensity: 1.2,
  });

  const gloveMat = new THREE.MeshPhysicalMaterial({
    map: tex.gloveMeshMap,
    normalMap: tex.gloveNormalMap,
    normalScale: new THREE.Vector2(1.25, 1.25),
    roughness: 0.5,
    metalness: 0.14,
    clearcoat: 0.18,
    clearcoatRoughness: 0.44,
    envMapIntensity: 1.25,
  });

  const faceTexture =
    archetype === 'respirator'
      ? tex.faceRespiratorMap
      : archetype === 'recon_olive'
      ? tex.faceOliveBalaclavaMap
      : tex.faceBlackBalaclavaMap;

  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTexture,
    normalMap: tex.clothNormalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.72,
    metalness: 0.02,
  });

  const metalDarkMat = new THREE.MeshStandardMaterial({
    color: 0x262b32,
    map: mats.gunWearMap,
    roughnessMap: mats.gunRoughnessMap,
    normalMap: mats.gunNormalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.34,
    metalness: 0.88,
    envMapIntensity: 1.55,
  });

  const goggleLensMat = new THREE.MeshPhysicalMaterial({
    color: 0x101820,
    emissive: 0x050a10,
    roughness: 0.05,
    metalness: 0.45,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    envMapIntensity: 2.1,
  });

  // Signature glowing green tactical chemlight / IFF glow sticks from the 360° reference!
  const chemlightMat = new THREE.MeshStandardMaterial({
    color: 0xd9ffe0,
    emissive: 0x7eff96,
    emissiveIntensity: 2.2,
    roughness: 0.2,
    metalness: 0.05,
  });

  // Signature Gold/Amber Circular "OPO" Unit Patch (upper sleeves & backpack emblem!)
  const opoPatchMat = new THREE.MeshStandardMaterial({
    map: tex.opoPatchMap,
    emissive: 0xd49d35,
    emissiveIntensity: hasBackpack ? 0.45 : 0.15,
    roughness: 0.6,
    metalness: 0.15,
  });

  // Soft contact shadow under boots
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 1.12), mats.contactShadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  group.add(shadow);

  // === 1. PELVIS, DUTY BELT & REAR WAIST GEAR (y = 0.91m) ===
  const pelvis = new THREE.Mesh(geos.pelvis, uniformMat);
  pelvis.position.set(0, 0.91, 0);
  pelvis.castShadow = true;
  registerHit(pelvis, 'torso');
  group.add(pelvis);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.178, 0.180, 0.058, 16), hardArmorMat);
  belt.scale.set(1.06, 1, 0.76);
  belt.position.set(0, 0.948, 0);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.048, 0.024), metalDarkMat);
  buckle.position.set(0, 0.948, -0.142);
  group.add(belt, buckle);

  // Rear Lower-Back Tactical Gear (matches Back Views of all 3 rows in 360° reference!)
  if (archetype === 'recon_olive') {
    // Row 2 Back View: Olive tactical canteen (left hip) + olive utility buttpack (right-center)
    const canteen = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.052, 0.115, 10), pouchAccentMat);
    canteen.scale.set(1.0, 1.0, 0.72);
    canteen.position.set(-0.105, 0.91, 0.155);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.024, 8), hardArmorMat);
    cap.position.set(-0.105, 0.978, 0.155);
    const rearPouch = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.095, 0.064), pouchAccentMat);
    rearPouch.position.set(0.04, 0.91, 0.158);
    group.add(canteen, cap, rearPouch);
  } else {
    // Row 1 & Row 3 Back View: Contoured black tactical buttpack + twin buckle straps on lower back
    const buttpack = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.115, 0.078), vestBlackMat);
    buttpack.position.set(0, 0.915, 0.156);
    const bpFlap = new THREE.Mesh(new THREE.BoxGeometry(0.172, 0.045, 0.084), hardArmorMat);
    bpFlap.position.set(0, 0.955, 0.158);
    for (const sx of [-0.046, 0.046]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.11, 0.012), hardArmorMat);
      strap.position.set(sx, 0.915, 0.197);
      group.add(strap);
    }
    group.add(buttpack, bpFlap);
  }

  // Front-left small belt pouch (visible on Row 1 front view!)
  const frontBeltPouch = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.078, 0.036), vestBlackMat);
  frontBeltPouch.position.set(0.092, 0.92, -0.145);
  group.add(frontBeltPouch);

  // === 2. ARTICULATED LEGS, DROP-LEG RIGS, KNEE PADS, RIBBED SHIN GUARDS & COMBAT BOOTS ===
  const buildArticulatedLeg = (side: -1 | 1) => {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(side * 0.102, 0.87, 0);

    const thighMesh = new THREE.Mesh(geos.thigh, uniformMat);
    thighMesh.castShadow = true;
    registerHit(thighMesh, 'limb');
    hipPivot.add(thighMesh);

    // Double horizontal tactical drop-leg webbing straps on BOTH thighs (signature 360° reference look!)
    for (const sy of [-0.14, -0.235]) {
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.094, 0.092, 0.026, 14), hardArmorMat);
      strap.scale.set(0.98, 1, 1.05);
      strap.position.set(0, sy, 0);
      hipPivot.add(strap);
    }

    if (side === 1) {
      // RIGHT thigh: Drop-leg polymer pistol holster + sidearm grip (or olive cargo pouch on Recon)
      const holster = new THREE.Mesh(
        new THREE.BoxGeometry(0.052, 0.155, 0.086),
        hasOliveAccents ? pouchAccentMat : hardArmorMat
      );
      holster.position.set(0.094, -0.185, 0.008);
      holster.rotation.x = 0.12;
      hipPivot.add(holster);

      if (!hasOliveAccents) {
        const sidearmGrip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.088, 0.048), metalDarkMat);
        sidearmGrip.position.set(0.098, -0.092, 0.044);
        sidearmGrip.rotation.x = -0.34;
        hipPivot.add(sidearmGrip);
      }
    } else {
      // LEFT thigh: Drop-leg tactical pouch (+ 2 glowing green chemlights on Row 3 / Assault Pack!)
      const thighPouch = new THREE.Mesh(
        new THREE.BoxGeometry(0.052, 0.138, 0.098),
        hasOliveAccents ? pouchAccentMat : vestBlackMat
      );
      thighPouch.position.set(-0.092, -0.195, -0.004);
      hipPivot.add(thighPouch);

      if (archetype === 'assault_pack') {
        for (let cl = 0; cl < 2; cl++) {
          const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.088, 6), chemlightMat);
          glow.position.set(-0.082, -0.15 - cl * 0.092, -0.068);
          glow.rotation.z = 0.12;
          hipPivot.add(glow);
        }
      }
    }

    // Knee & Shin Pivot
    const shinPivot = new THREE.Group();
    shinPivot.position.set(0, -0.42, 0);

    const shinMesh = new THREE.Mesh(geos.shin, uniformMat);
    shinMesh.castShadow = true;
    registerHit(shinMesh, 'limb');
    shinPivot.add(shinMesh);

    // Sculpted Round Hard-Shell Tactical Knee Pad + retention strap
    const kneePad = new THREE.Mesh(geos.kneePad, hardArmorMat);
    kneePad.position.set(0, -0.008, -0.02);
    const kneeStrap = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.070, 0.024, 12), hardArmorMat);
    kneeStrap.position.set(0, -0.012, 0);
    shinPivot.add(kneePad, kneeStrap);

    // Signature Ribbed Hard-Shell Tactical Shin Guards / Greaves (Row 1 & Row 3 of 360° reference!)
    if (hasShinGuards) {
      const greave = new THREE.Mesh(geos.shinGuard, hardArmorMat);
      greave.position.set(0, -0.20, -0.012);
      greave.castShadow = true;
      shinPivot.add(greave);

      // Rear retention straps securing shin guard around calf
      for (const gy of [-0.12, -0.26]) {
        const gStrap = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.062, 0.022, 12), hardArmorMat);
        gStrap.position.set(0, gy, 0);
        shinPivot.add(gStrap);
      }
    }

    // Chunky Black Military Combat Boot + lugged rubber sole
    const bootMesh = new THREE.Mesh(geos.boot, bootMat);
    bootMesh.position.set(0, -0.415, -0.02);
    bootMesh.castShadow = true;
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.114, 0.028, 0.28), hardArmorMat);
    sole.position.set(0, -0.436, -0.058);
    shinPivot.add(bootMesh, sole);

    hipPivot.add(shinPivot);
    return { hipPivot, shinPivot };
  };

  const leftLegBuilt = buildArticulatedLeg(-1);
  const rightLegBuilt = buildArticulatedLeg(1);
  group.add(leftLegBuilt.hipPivot, rightLegBuilt.hipPivot);

  // === 3. UPPER BODY, CONTOURED MOLLE PLATE CARRIER, POUCHES, CHEMLIGHTS & BACKPACK ===
  const upperBody = new THREE.Group();
  upperBody.position.set(0, 0.94, 0);
  upperBody.rotation.x = 0.06;
  group.add(upperBody);

  const torsoMesh = new THREE.Mesh(geos.torso, uniformMat);
  torsoMesh.castShadow = true;
  registerHit(torsoMesh, 'torso');
  upperBody.add(torsoMesh);

  // Contoured Front & Back MOLLE Plate Carrier + Side Cummerbund
  const frontPlate = new THREE.Mesh(geos.plateFront, vestBlackMat);
  frontPlate.position.set(0, 0.275, -0.14);
  frontPlate.rotation.x = -0.06;
  frontPlate.castShadow = true;
  registerHit(frontPlate, 'torso');

  const backPlate = new THREE.Mesh(geos.plateFront, vestBlackMat);
  backPlate.position.set(0, 0.28, 0.138);
  backPlate.rotation.x = 0.06;
  registerHit(backPlate, 'torso');

  const cummerbund = new THREE.Mesh(new THREE.CylinderGeometry(0.186, 0.174, 0.19, 14), vestBlackMat);
  cummerbund.scale.set(1.06, 1, 0.72);
  cummerbund.position.set(0, 0.19, 0);
  upperBody.add(frontPlate, backPlate, cummerbund);

  // Padded Shoulder Harness Straps
  for (const side of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.038, 0.27), vestBlackMat);
    strap.position.set(side * 0.112, 0.482, 0);
    strap.rotation.z = side * -0.18;
    upperBody.add(strap);
  }

  // Front Chest Rig Layout tailored per 360° Reference Row
  if (archetype === 'respirator') {
    // Row 1: 6 narrow vertical stacked black MOLLE pouches + 2 angled glowing green chemlights on right chest
    for (const mx of [-0.095, -0.032, 0.032, 0.095]) {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.148, 0.044), vestBlackMat);
      pouch.position.set(mx, 0.20, -0.175);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.038, 0.048), hardArmorMat);
      flap.position.set(mx, 0.268, -0.178);
      upperBody.add(pouch, flap);
    }
    for (let cl = 0; cl < 2; cl++) {
      const chem = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.092, 6), chemlightMat);
      chem.position.set(-0.088 + cl * 0.018, 0.365 - cl * 0.018, -0.172);
      chem.rotation.z = 0.48;
      upperBody.add(chem);
    }
  } else if (archetype === 'recon_olive') {
    // Row 2: Olive-drab triple rifle mag pouches + angled upper chest utility pouch + shoulder glow strips
    for (const mx of [-0.082, 0, 0.082]) {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.132, 0.052), pouchAccentMat);
      pouch.position.set(mx, 0.185, -0.18);
      upperBody.add(pouch);
    }
    const adminPouch = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.072, 0.044), pouchAccentMat);
    adminPouch.position.set(0.03, 0.335, -0.174);
    adminPouch.rotation.z = -0.16;
    upperBody.add(adminPouch);
    const chem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.075, 6), chemlightMat);
    chem.position.set(0.085, 0.425, -0.155);
    chem.rotation.z = -0.58;
    upperBody.add(chem);
  } else {
    // Row 3 & Player: Layered black tactical chest pouches + admin buckle pouch + glowing chest IFF marker
    for (const mx of [-0.084, 0, 0.084]) {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.135, 0.05), vestBlackMat);
      pouch.position.set(mx, 0.185, -0.18);
      upperBody.add(pouch);
    }
    const chestBox = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.088, 0.052), hardArmorMat);
    chestBox.position.set(0.055, 0.25, -0.195);
    upperBody.add(chestBox);
    const chem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.082, 6), chemlightMat);
    chem.position.set(-0.085, 0.365, -0.17);
    chem.rotation.z = 0.44;
    upperBody.add(chem);
  }

  // Rear Sculpted Tactical Assault Backpack with Glowing Gold OPO Emblem (Row 3 Back View & Player!)
  if (hasBackpack) {
    const packGroup = new THREE.Group();
    const packBody = new THREE.Mesh(geos.backpack, vestBlackMat);
    packBody.position.set(0, 0.29, 0.195);
    packBody.castShadow = true;
    registerHit(packBody, 'torso');
    packGroup.add(packBody);

    // Glowing Gold Circular OPO Emblem at upper rear of backpack (exact signature from Row 3 Back View!)
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.048, 16), opoPatchMat);
    emblem.position.set(0, 0.395, 0.278);
    packGroup.add(emblem);

    // Subtle crimson tactical zipper trim on center pack pocket
    const redTrim = new THREE.Mesh(
      new THREE.BoxGeometry(0.044, 0.009, 0.01),
      new THREE.MeshStandardMaterial({ color: 0x9c2824, roughness: 0.5 })
    );
    redTrim.position.set(0, 0.305, 0.285);
    packGroup.add(redTrim);

    upperBody.add(packGroup);
    firstPersonHiddenNodes.push(packGroup);
  } else {
    // Row 1 & 2 Back View: Rear vertical MOLLE utility pouches + shoulder comms radio & whip antenna
    for (const bx of [-0.068, 0.068]) {
      const rearMag = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.16, 0.042), vestBlackMat);
      rearMag.position.set(bx, 0.23, 0.175);
      upperBody.add(rearMag);
    }
    const radio = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.12, 0.038), metalDarkMat);
    radio.position.set(-0.145, 0.34, 0.152);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0055, 0.32, 6), metalDarkMat);
    antenna.position.set(-0.145, 0.54, 0.158);
    antenna.rotation.x = 0.12;
    upperBody.add(radio, antenna);
    firstPersonHiddenNodes.push(radio, antenna);
  }

  // Circular Gold "OPO" Shoulder Patches on Upper Sleeves (visible in all 3 Side Views!)
  for (const side of [-1, 1]) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(0.034, 14), opoPatchMat);
    patch.position.set(side * 0.258, 0.385, 0.005);
    patch.rotation.y = side * Math.PI * 0.5;
    upperBody.add(patch);
    firstPersonHiddenNodes.push(patch);
  }

  // === 4. HEAD PIVOT & AUTHENTIC 360° HEADGEAR (Respirator / Olive Balaclava / Black Balaclava) ===
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.54, -0.01);
  upperBody.add(headPivot);
  firstPersonHiddenNodes.push(headPivot);

  const neckMesh = new THREE.Mesh(geos.neck, faceMat);
  neckMesh.position.set(0, 0.04, 0);
  headPivot.add(neckMesh);

  const headMesh = new THREE.Mesh(geos.head, faceMat);
  headMesh.position.set(0, 0.16, -0.01);
  headMesh.castShadow = true;
  registerHit(headMesh, 'head');
  headPivot.add(headMesh);

  if (archetype === 'respirator') {
    // Row 1 Signature: Sculpted 3D Gas Mask / Dual-Canister Tactical Respirator + Forehead Goggles!
    const maskBridge = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), hardArmorMat);
    maskBridge.scale.set(1.02, 1.05, 1.15);
    maskBridge.position.set(0, 0.108, -0.095);
    headPivot.add(maskBridge);

    // Front voice diaphragm vent disc
    const ventDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.032, 12), metalDarkMat);
    ventDisc.rotation.x = Math.PI * 0.5;
    ventDisc.position.set(0, 0.098, -0.155);
    headPivot.add(ventDisc);

    // Dual side respirator filter canisters
    for (const side of [-1, 1]) {
      const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.029, 0.048, 10), hardArmorMat);
      filter.rotation.set(Math.PI * 0.44, 0, side * 0.42);
      filter.position.set(side * 0.056, 0.092, -0.125);
      headPivot.add(filter);
    }

    // Low-profile dark ballistic goggles resting on forehead (matches Row 1 Front & Side views!)
    const goggleBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.114, 0.114, 0.036, 16, 1, true, Math.PI * 0.68, Math.PI * 0.64),
      goggleLensMat
    );
    goggleBody.position.set(0, 0.228, -0.022);
    const goggleStrap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.024, 16, 1, true),
      hardArmorMat
    );
    goggleStrap.position.set(0, 0.222, -0.008);
    headPivot.add(goggleBody, goggleStrap);
  }

  // === 5. ARTICULATED TWO-HANDED COMBAT ARMS, ELBOW PADS, GLOVED HANDS & SCULPTED RIFLE ===
  const rightArm = new THREE.Group();
  rightArm.position.set(0.215, 0.43, 0.01);
  upperBody.add(rightArm);
  firstPersonHiddenNodes.push(rightArm);

  const rUpper = new THREE.Mesh(geos.upperArm, uniformMat);
  rUpper.rotation.set(0.55, 0, -0.18);
  rUpper.castShadow = true;
  registerHit(rUpper, 'limb');
  rightArm.add(rUpper);

  const rElbow = new THREE.Group();
  rElbow.position.set(0.045, -0.23, -0.14);
  rElbow.rotation.set(1.22, -0.34, 0.08);
  const rFore = new THREE.Mesh(geos.forearm, uniformMat);
  rFore.castShadow = true;
  registerHit(rFore, 'limb');
  const rElbowPad = new THREE.Mesh(geos.elbowPad, hardArmorMat);
  rElbowPad.position.set(0, -0.01, 0.015);
  const rGlove = new THREE.Mesh(new THREE.SphereGeometry(0.043, 10, 8), gloveMat);
  rGlove.scale.set(0.88, 1.15, 0.95);
  rGlove.position.set(0, -0.27, 0);
  rElbow.add(rFore, rElbowPad, rGlove);
  rightArm.add(rElbow);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.215, 0.43, 0.01);
  upperBody.add(leftArm);
  firstPersonHiddenNodes.push(leftArm);

  const lUpper = new THREE.Mesh(geos.upperArm, uniformMat);
  lUpper.rotation.set(0.76, 0, 0.24);
  lUpper.castShadow = true;
  registerHit(lUpper, 'limb');
  leftArm.add(lUpper);

  const lElbow = new THREE.Group();
  lElbow.position.set(-0.065, -0.20, -0.19);
  lElbow.rotation.set(1.18, 0.68, -0.18);
  const lFore = new THREE.Mesh(geos.forearm, uniformMat);
  lFore.castShadow = true;
  registerHit(lFore, 'limb');
  const lElbowPad = new THREE.Mesh(geos.elbowPad, hardArmorMat);
  lElbowPad.position.set(0, -0.01, 0.015);
  const lGlove = new THREE.Mesh(new THREE.SphereGeometry(0.044, 10, 8), gloveMat);
  lGlove.scale.set(0.9, 1.15, 0.95);
  lGlove.position.set(0, -0.27, 0);
  lElbow.add(lFore, lElbowPad, lGlove);
  leftArm.add(lElbow);

  // Detailed Operator Rifle held cleanly between both gloved hands
  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(0.09, 0.31, -0.24);
  upperBody.add(weaponPivot);
  firstPersonHiddenNodes.push(weaponPivot);

  const rifleLen = isSniperWeapon ? 1.05 : 0.78;
  const rRec = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.082, 0.34), metalDarkMat);
  rRec.position.set(0, 0, -0.12);
  const rHandguard = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.068, 0.24), metalDarkMat);
  rHandguard.position.set(0, 0.008, -0.39);
  const rBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, rifleLen * 0.45, 8), metalDarkMat);
  rBarrel.rotation.x = Math.PI * 0.5;
  rBarrel.position.set(0, 0.012, -0.52 - rifleLen * 0.14);
  const rStock = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.092, 0.22), hardArmorMat);
  rStock.position.set(0, -0.012, 0.14);
  const rGrip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.04), hardArmorMat);
  rGrip.position.set(0, -0.075, -0.01);
  rGrip.rotation.x = 0.28;
  const rMag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.15, 0.056), hardArmorMat);
  rMag.position.set(0, -0.095, -0.17);
  rMag.rotation.x = -0.16;
  const rOptic = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.017, isSniperWeapon ? 0.24 : 0.1, 8),
    metalDarkMat
  );
  rOptic.rotation.x = Math.PI * 0.5;
  rOptic.position.set(0, 0.064, -0.14);
  weaponPivot.add(rRec, rHandguard, rBarrel, rStock, rGrip, rMag, rOptic);

  // Starburst Muzzle Flash
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd06e, transparent: true, opacity: 0.95 })
  );
  flash.position.set(0, 0.012, -0.52 - rifleLen * 0.36);
  flash.visible = false;
  weaponPivot.add(flash);

  // Hide upper chest collar in first-person mode so looking straight down shows waist/vest/legs/boots without near-plane clipping
  const setFirstPersonMode = (enabled: boolean) => {
    for (const node of firstPersonHiddenNodes) {
      node.visible = !enabled;
    }
    shadow.visible = true;
  };

  return {
    group,
    headMesh,
    torsoMesh,
    leftLeg: leftLegBuilt.hipPivot,
    rightLeg: rightLegBuilt.hipPivot,
    leftShin: leftLegBuilt.shinPivot,
    rightShin: rightLegBuilt.shinPivot,
    upperBody,
    headPivot,
    rightArm,
    leftArm,
    weaponPivot,
    muzzleFlash: flash,
    hitMeshes,
    firstPersonHiddenNodes,
    setFirstPersonMode,
  };
}

/**
 * Builds an NPC Special Ops Soldier directly modeled after the 3 variants in the 360° reference sheet!
 */
export function buildRealisticSoldierModel(
  enemyClass: EnemyClass,
  enemyId: string,
  mats: ProceduralMaterials
): BuiltEnemyModel {
  const archetype: OperatorArchetype =
    enemyClass === 'guard' || enemyClass === 'sniper'
      ? 'recon_olive'
      : enemyClass === 'heavy'
      ? 'assault_pack'
      : 'respirator';

  const built = buildSpecialOpsOperator(
    archetype,
    enemyId,
    mats,
    enemyClass === 'sniper',
    true
  );

  // Subtle class scale distinction (Heavy operators slightly broader/taller)
  if (enemyClass === 'heavy') {
    built.group.scale.set(1.06, 1.04, 1.06);
  } else if (enemyClass === 'elite') {
    built.group.scale.set(1.02, 1.02, 1.02);
  }

  return built;
}

/**
 * Builds the Player Operator's own full 3D body directly modeled after the 360° Special Ops Assault Pack variant
 * (urban slate-blue camo BDU, black MOLLE carrier, chest & thigh glowing chemlights, assault backpack w/ gold OPO emblem,
 * drop-leg holster/pouches, knee pads, ribbed shin guards, and combat boots).
 */
export function buildPlayerOperatorModel(mats: ProceduralMaterials): BuiltPlayerModel {
  const built = buildSpecialOpsOperator('assault_pack', 'player_operator', mats, false, false);
  built.setFirstPersonMode(true);
  return built;
}
