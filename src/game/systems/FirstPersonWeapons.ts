import * as THREE from 'three';
import { WeaponId } from '../types';
import { WEAPONS } from '../data/weapons';
import { ProceduralMaterials } from './TextureLibrary';
import { getCharacterTextureSuite } from './CharacterModels';

export interface BuiltWeaponModel {
  group: THREE.Group;
  muzzlePoint: THREE.Object3D;
  ejectionPort: THREE.Object3D;
  suppressorMesh: THREE.Object3D;
  boltMesh: THREE.Object3D;
  magMesh: THREE.Object3D;
  muzzleFlash: THREE.Object3D;
  magRestPos: THREE.Vector3;
  boltRestPos: THREE.Vector3;
  // Articulated first-person gloved left support arm for dynamic reload & sprint choreography
  leftArmGroup: THREE.Group;
  leftArmRestPos: THREE.Vector3;
  leftArmRestRot: THREE.Euler;
  rightArmGroup: THREE.Group;
  adsOffsetY: number;
}

/**
 * Helper: Creates a beveled extruded mesh along the weapon's X width (side profile drawn in Z/Y -> rotated to align -Z forward).
 */
function createBeveledSideExtrusion(
  points: [number, number][], // [zForwardNegative, yUp]
  width: number,
  bevelSize = 0.0035,
  bevelThickness = 0.0035
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  points.forEach(([z, y], idx) => {
    // Shape X maps to +Z after rotating Y by -PI/2 -> so pass -z to make -Z forward!
    const sx = -z;
    if (idx === 0) shape.moveTo(sx, y);
    else shape.lineTo(sx, y);
  });
  shape.closePath();

  const depth = Math.max(0.002, width - bevelThickness * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -depth * 0.5);
  geo.rotateY(Math.PI * 0.5); // Shape +X -> -Z (weapon muzzle forward!)
  geo.computeVertexNormals();
  return geo;
}

/**
 * Procedural radial optical coating texture for deeply recessed rifle scope ocular glass
 * (rich dark blue-green anti-reflective sheen with soft edge vignette — zero flat grey discs!).
 */
let cachedScopeLensTex: THREE.CanvasTexture | null = null;
function getScopeLensTexture(): THREE.CanvasTexture {
  if (cachedScopeLensTex) return cachedScopeLensTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(108, 102, 10, 128, 128, 128);
  grad.addColorStop(0.0, '#4f7a88');
  grad.addColorStop(0.28, '#2b4a57');
  grad.addColorStop(0.62, '#13222b');
  grad.addColorStop(0.86, '#081015');
  grad.addColorStop(1.0, '#030608');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle curved anti-reflective cyan-emerald crescent reflection
  const sheen = ctx.createRadialGradient(84, 78, 4, 84, 78, 72);
  sheen.addColorStop(0, 'rgba(155, 222, 240, 0.34)');
  sheen.addColorStop(0.55, 'rgba(72, 154, 184, 0.12)');
  sheen.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.arc(84, 78, 72, 0, Math.PI * 2);
  ctx.fill();

  // Subtle dark internal reticle hairlines inside ocular lens
  ctx.strokeStyle = 'rgba(8, 14, 18, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(128, 18);
  ctx.lineTo(128, 238);
  ctx.moveTo(18, 128);
  ctx.lineTo(238, 128);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedScopeLensTex = tex;
  return tex;
}

// ============================================================================
// ULTRA-REALISTIC FIRST-PERSON HAND & SOFTSHELL SLEEVE PBR + ORGANIC SCULPTING
// ============================================================================

interface RealisticHandPBRSuite {
  sleeveAlbedo: THREE.CanvasTexture;
  sleeveNormal: THREE.CanvasTexture;
  sleeveRough: THREE.CanvasTexture;
  gloveAlbedo: THREE.CanvasTexture;
  gloveNormal: THREE.CanvasTexture;
  gloveRough: THREE.CanvasTexture;
  palmAlbedo: THREE.CanvasTexture;
  palmNormal: THREE.CanvasTexture;
  palmRough: THREE.CanvasTexture;
}

let cachedHandPBR: RealisticHandPBRSuite | null = null;

/**
 * Converts a deterministic grayscale height canvas into a crisp tangent-space normal map via Sobel gradients.
 */
function heightCanvasToNormalTex(
  heightCanvas: HTMLCanvasElement,
  strength: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const srcCtx = heightCanvas.getContext('2d')!;
  const src = srcCtx.getImageData(0, 0, w, h).data;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d')!;
  const outImg = outCtx.createImageData(w, h);
  const dst = outImg.data;

  const sample = (x: number, y: number): number => {
    const wx = ((x % w) + w) % w;
    const wy = ((y % h) + h) % h;
    return src[(wy * w + wx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);

      const idx = (y * w + x) * 4;
      dst[idx] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }
  outCtx.putImageData(outImg, 0, 0);

  const tex = new THREE.CanvasTexture(outCanvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

function configureHandTex(
  canvas: HTMLCanvasElement,
  isSRGB: boolean,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  if (isSRGB) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates cached 512x512 procedural PBR maps (albedo + tangent normal + roughness)
 * specifically calibrated for dark charcoal-slate tactical softshell sleeves, stitched
 * ballistic-nylon padded combat gloves, and micro-pebbled suede palms.
 */
function getRealisticHandPBRSuite(): RealisticHandPBRSuite {
  if (cachedHandPBR) return cachedHandPBR;

  const size = 512;

  // --- 1. TACTICAL SOFTSHELL JACKET SLEEVE (Ripstop weave + diagonal tension folds + cuff double-stitching) ---
  const sAlb = document.createElement('canvas');
  const sHgt = document.createElement('canvas');
  const sRgh = document.createElement('canvas');
  sAlb.width = sHgt.width = sRgh.width = size;
  sAlb.height = sHgt.height = sRgh.height = size;
  const sAlbCtx = sAlb.getContext('2d')!;
  const sHgtCtx = sHgt.getContext('2d')!;
  const sRghCtx = sRgh.getContext('2d')!;

  const sAlbImg = sAlbCtx.createImageData(size, size);
  const sHgtImg = sHgtCtx.createImageData(size, size);
  const sRghImg = sRghCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Diagonal organic cloth fold shading & relief
      const fold1 = Math.sin((u * 3.0 + v * 5.0) * Math.PI * 2 + Math.sin(u * Math.PI * 4) * 0.9);
      const fold2 = Math.sin((u * 5.0 - v * 4.0) * Math.PI * 2) * 0.45;
      const fold = fold1 * 0.65 + fold2 * 0.35;

      // Micro ripstop cross-grid weave (classic softshell tactical jacket)
      const ripX = x % 8 === 0 ? 1 : 0;
      const ripY = y % 8 === 0 ? 1 : 0;
      const microWeave = (((x >> 1) + (y >> 1)) & 1) ? 0.5 : -0.5;
      const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const grain = (hash - Math.floor(hash) - 0.5) * 0.28;

      const hVal = THREE.MathUtils.clamp(
        0.5 + fold * 0.24 + (ripX | ripY) * 0.08 + microWeave * 0.035 + grain * 0.05,
        0,
        1
      );

      // Cool charcoal-slate softshell tone with soft ridge wear highlights
      const shade = 0.82 + fold * 0.2 + (ripX | ripY) * 0.04 + grain * 0.06;
      const r = Math.round(THREE.MathUtils.clamp(41 * shade, 16, 84));
      const g = Math.round(THREE.MathUtils.clamp(47 * shade, 19, 94));
      const b = Math.round(THREE.MathUtils.clamp(56 * shade, 24, 108));

      // Slightly smoother on rubbed fold crests, matte inside creases
      const rough = Math.round(THREE.MathUtils.clamp((0.83 - fold * 0.08 + grain * 0.05) * 255, 140, 242));

      const idx = (y * size + x) * 4;
      sAlbImg.data[idx] = r;
      sAlbImg.data[idx + 1] = g;
      sAlbImg.data[idx + 2] = b;
      sAlbImg.data[idx + 3] = 255;

      const hb = Math.round(hVal * 255);
      sHgtImg.data[idx] = sHgtImg.data[idx + 1] = sHgtImg.data[idx + 2] = hb;
      sHgtImg.data[idx + 3] = 255;

      sRghImg.data[idx] = sRghImg.data[idx + 1] = sRghImg.data[idx + 2] = rough;
      sRghImg.data[idx + 3] = 255;
    }
  }
  sAlbCtx.putImageData(sAlbImg, 0, 0);
  sHgtCtx.putImageData(sHgtImg, 0, 0);
  sRghCtx.putImageData(sRghImg, 0, 0);

  // Double-needle tactical sleeve seam along u = 0.25 & u = 0.75
  for (const sx of [128, 384]) {
    sAlbCtx.fillStyle = 'rgba(14, 17, 22, 0.75)';
    sAlbCtx.fillRect(sx - 2, 0, 4, size);
    sHgtCtx.fillStyle = '#383838';
    sHgtCtx.fillRect(sx - 2, 0, 4, size);
    sAlbCtx.strokeStyle = 'rgba(98, 110, 124, 0.55)';
    sAlbCtx.lineWidth = 1.4;
    sAlbCtx.setLineDash([7, 5]);
    for (const off of [-6, 6]) {
      sAlbCtx.beginPath();
      sAlbCtx.moveTo(sx + off, 0);
      sAlbCtx.lineTo(sx + off, size);
      sAlbCtx.stroke();
      sHgtCtx.strokeStyle = '#d4d4d4';
      sHgtCtx.setLineDash([7, 5]);
      sHgtCtx.beginPath();
      sHgtCtx.moveTo(sx + off, 0);
      sHgtCtx.lineTo(sx + off, size);
      sHgtCtx.stroke();
    }
    sAlbCtx.setLineDash([]);
    sHgtCtx.setLineDash([]);
  }

  // --- 2. FULL-GRAIN PEBBLED MATTE-SATIN BLACK LEATHER TACTICAL GLOVE (matches 1132373900079277093_f1777dbe.jpg!) ---
  const gAlb = document.createElement('canvas');
  const gHgt = document.createElement('canvas');
  const gRgh = document.createElement('canvas');
  gAlb.width = gHgt.width = gRgh.width = size;
  gAlb.height = gHgt.height = gRgh.height = size;
  const gAlbCtx = gAlb.getContext('2d')!;
  const gHgtCtx = gHgt.getContext('2d')!;
  const gRghCtx = gRgh.getContext('2d')!;

  const gAlbImg = gAlbCtx.createImageData(size, size);
  const gHgtImg = gHgtCtx.createImageData(size, size);
  const gRghImg = gRghCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Multi-frequency organic full-grain leather pebble texture + soft tension folds
      const p1 = Math.sin(x * 0.48 + Math.sin(y * 0.21) * 1.4) * Math.cos(y * 0.46 + Math.cos(x * 0.19) * 1.3);
      const p2 = Math.sin((x + y * 0.7) * 0.85) * Math.cos((x * 0.65 - y) * 0.82);
      const pebble = (p1 * 0.55 + p2 * 0.45) * 0.5 + 0.5;
      // Organic leather skin-fold flex creases (like around thumb metacarpal & knuckle bends)
      const flexFold = Math.sin((y / size) * Math.PI * 10 + Math.sin((x / size) * Math.PI * 4) * 0.75) * 0.16;
      const hash = Math.sin(x * 19.19 + y * 91.73) * 28411.91;
      const microGrain = (hash - Math.floor(hash) - 0.5) * 0.18;

      const hVal = THREE.MathUtils.clamp(0.46 + pebble * 0.28 + flexFold + microGrain * 0.16, 0, 1);
      // Rich matte-satin charcoal-black leather albedo with subtle pebble crest highlights
      const shade = 0.76 + pebble * 0.34 + flexFold * 0.32 + microGrain * 0.1;

      const idx = (y * size + x) * 4;
      gAlbImg.data[idx] = Math.round(THREE.MathUtils.clamp(44 * shade, 18, 78));
      gAlbImg.data[idx + 1] = Math.round(THREE.MathUtils.clamp(46 * shade, 20, 82));
      gAlbImg.data[idx + 2] = Math.round(THREE.MathUtils.clamp(51 * shade, 23, 89));
      gAlbImg.data[idx + 3] = 255;

      const hb = Math.round(hVal * 255);
      gHgtImg.data[idx] = gHgtImg.data[idx + 1] = gHgtImg.data[idx + 2] = hb;
      gHgtImg.data[idx + 3] = 255;

      // Satin leather specular response: glossy pebble crests (~0.42), matte pores/creases (~0.68)
      const rough = Math.round(THREE.MathUtils.clamp((0.64 - pebble * 0.22 - flexFold * 0.14) * 255, 96, 198));
      gRghImg.data[idx] = gRghImg.data[idx + 1] = gRghImg.data[idx + 2] = rough;
      gRghImg.data[idx + 3] = 255;
    }
  }
  gAlbCtx.putImageData(gAlbImg, 0, 0);
  gHgtCtx.putImageData(gHgtImg, 0, 0);
  gRghCtx.putImageData(gRghImg, 0, 0);

  // Crisp double-stitched full-grain leather panel seams (matching reference close-up stitching!)
  for (const bandY of [92, 224, 356, 464]) {
    gAlbCtx.fillStyle = 'rgba(12, 14, 17, 0.72)';
    gAlbCtx.fillRect(0, bandY - 2, size, 4);
    gHgtCtx.fillStyle = '#242424';
    gHgtCtx.fillRect(0, bandY - 2, size, 4);
    gRghCtx.fillStyle = '#787878';
    gRghCtx.fillRect(0, bandY - 8, size, 16);

    gAlbCtx.strokeStyle = 'rgba(148, 156, 168, 0.68)';
    gAlbCtx.lineWidth = 1.6;
    gAlbCtx.setLineDash([7, 4]);
    gHgtCtx.strokeStyle = '#ececec';
    gHgtCtx.lineWidth = 1.8;
    gHgtCtx.setLineDash([7, 4]);
    for (const off of [-6, 6]) {
      gAlbCtx.beginPath();
      gAlbCtx.moveTo(0, bandY + off);
      gAlbCtx.lineTo(size, bandY + off);
      gAlbCtx.stroke();
      gHgtCtx.beginPath();
      gHgtCtx.moveTo(0, bandY + off);
      gHgtCtx.lineTo(size, bandY + off);
      gHgtCtx.stroke();
    }
    gAlbCtx.setLineDash([]);
    gHgtCtx.setLineDash([]);
  }

  // --- 3. MICRO-PEBBLED SYNTHETIC SUEDE / LEATHER PALM & GRIP PAD ---
  const pAlb = document.createElement('canvas');
  const pHgt = document.createElement('canvas');
  const pRgh = document.createElement('canvas');
  pAlb.width = pHgt.width = pRgh.width = 256;
  pAlb.height = pHgt.height = pRgh.height = 256;
  const pAlbCtx = pAlb.getContext('2d')!;
  const pHgtCtx = pHgt.getContext('2d')!;
  const pRghCtx = pRgh.getContext('2d')!;

  const pAlbImg = pAlbCtx.createImageData(256, 256);
  const pHgtImg = pHgtCtx.createImageData(256, 256);
  const pRghImg = pRghCtx.createImageData(256, 256);

  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const h1 = Math.sin(x * 0.42) * Math.cos(y * 0.42);
      const h2 = Math.sin((x + y) * 0.16) * 0.45;
      const rnd = Math.sin(x * 37.13 + y * 59.87) * 19341.7;
      const grain = rnd - Math.floor(rnd) - 0.5;
      const val = THREE.MathUtils.clamp(0.5 + h1 * 0.14 + h2 * 0.12 + grain * 0.24, 0, 1);

      const idx = (y * 256 + x) * 4;
      const base = 36 + val * 28;
      pAlbImg.data[idx] = Math.round(base * 0.96);
      pAlbImg.data[idx + 1] = Math.round(base * 1.0);
      pAlbImg.data[idx + 2] = Math.round(base * 1.08);
      pAlbImg.data[idx + 3] = 255;

      const hb = Math.round(val * 255);
      pHgtImg.data[idx] = pHgtImg.data[idx + 1] = pHgtImg.data[idx + 2] = hb;
      pHgtImg.data[idx + 3] = 255;

      const rb = Math.round(THREE.MathUtils.clamp((0.64 - val * 0.14) * 255, 110, 215));
      pRghImg.data[idx] = pRghImg.data[idx + 1] = pRghImg.data[idx + 2] = rb;
      pRghImg.data[idx + 3] = 255;
    }
  }
  pAlbCtx.putImageData(pAlbImg, 0, 0);
  pHgtCtx.putImageData(pHgtImg, 0, 0);
  pRghCtx.putImageData(pRghImg, 0, 0);

  cachedHandPBR = {
    sleeveAlbedo: configureHandTex(sAlb, true, 1.5, 2.2),
    sleeveNormal: heightCanvasToNormalTex(sHgt, 2.6, 1.5, 2.2),
    sleeveRough: configureHandTex(sRgh, false, 1.5, 2.2),
    gloveAlbedo: configureHandTex(gAlb, true, 1.4, 1.4),
    gloveNormal: heightCanvasToNormalTex(gHgt, 2.4, 1.4, 1.4),
    gloveRough: configureHandTex(gRgh, false, 1.4, 1.4),
    palmAlbedo: configureHandTex(pAlb, true, 2.0, 2.0),
    palmNormal: heightCanvasToNormalTex(pHgt, 1.9, 2.0, 2.0),
    palmRough: configureHandTex(pRgh, false, 2.0, 2.0),
  };

  return cachedHandPBR;
}

/**
 * Singularity-free Parallel-Transport (Bishop frame) continuous organic spline tube with
 * watertight hemisphere caps, custom elliptical/anatomical cross-section & 3D cloth folds.
 * Strictly guarded against zero-length vectors and NaN so computeBoundingSphere() never fails.
 */
function createTaperedOrganicTube(
  controlPoints: THREE.Vector3[],
  tubularSegments: number,
  radialSegments: number,
  radiusFn: (t: number, angle: number) => [number, number],
  uvScale: [number, number] = [1, 1],
  capEnds = true
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(controlPoints, false, 'centripetal', 0.5);

  const centers: THREE.Vector3[] = [];
  const tangents: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    if (!Number.isFinite(tan.x) || !Number.isFinite(tan.y) || !Number.isFinite(tan.z) || tan.lengthSq() < 1e-8) {
      tan.set(0, 0, -1);
    } else {
      tan.normalize();
    }
    centers.push(p);
    tangents.push(tan);
  }

  // Parallel-transport initial frame: orient N consistently toward local +Y (dorsal up) whenever possible
  const initUp = Math.abs(tangents[0].y) < 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const b0 = new THREE.Vector3().crossVectors(tangents[0], initUp);
  if (b0.lengthSq() < 1e-8) b0.set(1, 0, 0);
  else b0.normalize();
  const n0 = new THREE.Vector3().crossVectors(b0, tangents[0]).normalize();

  normals.push(n0);
  binormals.push(b0);

  const rotQ = new THREE.Quaternion();
  for (let i = 1; i <= tubularSegments; i++) {
    const prevT = tangents[i - 1];
    const currT = tangents[i];
    const prevN = normals[i - 1].clone();
    const dot = THREE.MathUtils.clamp(prevT.dot(currT), -1, 1);
    if (dot < 0.999999 && dot > -0.999999) {
      rotQ.setFromUnitVectors(prevT, currT);
      prevN.applyQuaternion(rotQ);
    }
    // Re-orthogonalize to prevent drift
    prevN.addScaledVector(currT, -prevN.dot(currT));
    if (prevN.lengthSq() < 1e-8) prevN.copy(normals[i - 1]);
    else prevN.normalize();

    const currB = new THREE.Vector3().crossVectors(currT, prevN);
    if (currB.lengthSq() < 1e-8) currB.copy(binormals[i - 1]);
    else currB.normalize();

    normals.push(prevN);
    binormals.push(currB);
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const stride = radialSegments + 1;

  const pushVertex = (v: THREE.Vector3, u: number, w: number) => {
    positions.push(
      Number.isFinite(v.x) ? v.x : 0,
      Number.isFinite(v.y) ? v.y : 0,
      Number.isFinite(v.z) ? v.z : 0
    );
    uvs.push(u, w);
  };

  // Build ring definitions (including 2 smooth dome rings at each capped end)
  interface RingSpec {
    t: number;
    idx: number;
    scale: number;
    axialOffset: number;
  }
  const rings: RingSpec[] = [];
  if (capEnds) {
    const [r0x, r0y] = radiusFn(0, 0);
    const capR0 = Math.max(0.001, (r0x + r0y) * 0.42);
    rings.push({ t: 0, idx: 0, scale: 0.02, axialOffset: -capR0 });
    rings.push({ t: 0, idx: 0, scale: 0.68, axialOffset: -capR0 * 0.52 });
  }
  for (let i = 0; i <= tubularSegments; i++) {
    rings.push({ t: i / tubularSegments, idx: i, scale: 1.0, axialOffset: 0 });
  }
  if (capEnds) {
    const [r1x, r1y] = radiusFn(1, 0);
    const capR1 = Math.max(0.001, (r1x + r1y) * 0.48);
    rings.push({ t: 1, idx: tubularSegments, scale: 0.66, axialOffset: capR1 * 0.56 });
    rings.push({ t: 1, idx: tubularSegments, scale: 0.02, axialOffset: capR1 });
  }

  const vTmp = new THREE.Vector3();
  for (let r = 0; r < rings.length; r++) {
    const spec = rings[r];
    const c = centers[spec.idx];
    const T = tangents[spec.idx];
    const N = normals[spec.idx];
    const B = binormals[spec.idx];

    for (let j = 0; j <= radialSegments; j++) {
      const uFrac = j / radialSegments;
      const angle = uFrac * Math.PI * 2;
      const [rxRaw, ryRaw] = radiusFn(spec.t, angle);
      const rx = Math.max(0.0005, rxRaw * spec.scale);
      const ry = Math.max(0.0005, ryRaw * spec.scale);

      const ca = Math.cos(angle);
      const sa = Math.sin(angle);

      // B is lateral axis, N is dorsal-palmar axis
      vTmp
        .copy(c)
        .addScaledVector(T, spec.axialOffset)
        .addScaledVector(B, ca * rx)
        .addScaledVector(N, sa * ry);

      pushVertex(vTmp, uFrac * uvScale[0], spec.t * uvScale[1]);
    }
  }

  for (let r = 0; r < rings.length - 1; r++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = r * stride + j;
      const b = (r + 1) * stride + j;
      const c = (r + 1) * stride + (j + 1);
      const d = r * stride + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Vertex-sculpted manifold anatomical human hand / metacarpal shell:
 * - Narrow wrist flaring organically to metacarpal knuckle breadth
 * - Natural transverse dorsal arch + concave palmar cup (wraps smoothly around weapon forend/grip)
 * - Subtle extensor tendon contours + padded dorsal glove ribs
 * - Anatomical index-to-pinky knuckle slant + fleshy thenar muscle mound on the thumb side
 */
function createAnatomicalPalmGeo(thumbSign: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 28, 20);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i); // -1..1 across hand width
    const uy = pos.getY(i); // -1..1 dorsal(+)/palmar(-)
    const uz = pos.getZ(i); // -1 (knuckles) .. +1 (wrist)

    // u = 0 at knuckle edge (-Z), u = 1 at wrist (+Z)
    const u = (uz + 1) * 0.5;
    const thumbSide = ux * thumbSign; // +1 on thumb/index side, -1 on pinky side

    // Width flares smoothly from wrist (0.0285m) to metacarpal knuckles (0.0375m)
    const widthProfile = 0.0365 - 0.0082 * Math.pow(u, 1.55) + 0.0022 * Math.sin(u * Math.PI);
    // Thickness: slightly deeper at heel of hand & padded dorsum, sleeker at knuckle front
    const thickProfile = 0.0148 + 0.0032 * Math.sin(u * Math.PI * 0.85) + (uy > 0 ? 0.0018 : 0.0005);

    let x = ux * widthProfile;
    let y = uy * thickProfile;
    let z = uz * 0.043 - 0.011; // spans z = -0.054 (knuckles) to +0.032 (wrist)

    // Real human knuckle cascade: pinky edge steps slightly backward (+Z) and drops lower (-Y)
    const slant = (1 - u) * Math.max(0, -thumbSide);
    z += slant * 0.011;
    y -= slant * 0.0045;

    // Transverse metacarpal arch: convex backhand, softly concave palm underside
    const archDrop = ux * ux * 0.0062;
    y -= archDrop;
    if (uy < 0) {
      // Concave palmar cup so the gloved palm cradles rifle handguards & grips organically
      const palmCup = (1 - ux * ux * 0.72) * Math.sin(u * Math.PI) * 0.0045;
      y += palmCup * Math.abs(uy);
    } else {
      // Subtle extensor tendons + padded tactical glove backhand rib quilting
      const tendon = Math.cos(ux * Math.PI * 4) * 0.00085 * Math.sin(u * Math.PI);
      const rib = Math.sin(u * Math.PI * 5.5) * 0.00075 * (1 - ux * ux * 0.65);
      y += (tendon + rib) * uy;
    }

    // Fleshy thenar eminence (thumb base muscle pad on palmar-thumb side)
    if (thumbSide > 0.12 && uz > -0.35) {
      const thenarFactor =
        Math.pow(Math.max(0, (thumbSide - 0.12) / 0.88), 1.35) *
        Math.exp(-Math.pow((uz - 0.22) * 2.1, 2));
      x += thumbSign * thenarFactor * 0.0095;
      y -= thenarFactor * (uy < 0.25 ? 0.0075 : 0.0012);
    }

    // Slight wrist taper blend into neoprene cuff
    if (u > 0.8) {
      const wT = (u - 0.8) / 0.2;
      x *= 1 - wT * 0.12;
      y *= 1 - wT * 0.08;
    }

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Single continuous anatomically curved molded polymer knuckle guard with 4 integral raised knuckle domes
 * conforming seamlessly to the dorsal metacarpal arch & pinky slant (zero detached primitive spheres!).
 */
function createCurvedKnuckleArmorGeo(thumbSign: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(0.068, 0.009, 0.021, 20, 4, 6);
  const pos = geo.attributes.position;

  // 4 anatomical knuckle X centers (index -> pinky)
  const knuckleXs = [0.022, 0.0075, -0.0075, -0.022].map((v) => v * thumbSign);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    const nx = x / 0.034; // -1..1
    const nz = z / 0.0105; // -1..1
    const thumbSide = nx * thumbSign;

    // Bevel edges smoothly into the glove leather
    const edgeFalloff = Math.max(0, 1 - Math.pow(nx, 4)) * Math.max(0, 1 - Math.pow(nz, 4));

    // Match the exact hand transverse arch + pinky cascade
    const archY = -(nx * nx) * 0.0068 - Math.max(0, -thumbSide) * 0.0038;
    const slantZ = Math.max(0, -thumbSide) * 0.0095;

    // Integral sculpted knuckle domes
    let dome = 0;
    for (let k = 0; k < 4; k++) {
      const dx = (x - knuckleXs[k]) / 0.0085;
      const dz = z / 0.0082;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1.35) {
        const amp = k === 0 || k === 1 ? 0.0044 : k === 2 ? 0.0039 : 0.0031;
        dome = Math.max(dome, amp * Math.exp(-d2 * 1.9));
      }
    }

    const outY = y * (0.45 + 0.55 * edgeFalloff) + archY + (y > 0 ? dome : 0);
    pos.setXYZ(i, x, outY, z + slantZ);
  }

  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Curved dorsal stitched armor rib pad hugging the back of the gloved hand.
 */
function createCurvedDorsalPadGeo(width: number, depth: number, thickness: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(width, thickness, depth, 14, 2, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = x / (width * 0.5);
    const nz = z / (depth * 0.5);
    const pillow = Math.max(0, 1 - nx * nx * 0.85) * Math.max(0, 1 - nz * nz * 0.85);
    const archY = -(nx * nx) * 0.0052;
    pos.setXYZ(i, x, y * (0.4 + 0.6 * pillow) + archY + (y > 0 ? pillow * 0.0018 : 0), z);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Builds a single continuous 3-phalanx organically curved gloved finger (zero detached capsule seams!).
 */
function buildOrganicFinger(
  lengths: [number, number, number],
  bends: [number, number, number],
  baseRadius: number,
  spreadY: number,
  gloveMat: THREE.Material,
  padMat: THREE.Material
): THREE.Group {
  const group = new THREE.Group();

  // Compute natural 3-phalanx spline path starting embedded inside metacarpal shell (+0.006m)
  const p0 = new THREE.Vector3(0, 0.001, 0.006);
  const a1 = bends[0];
  const a2 = a1 + bends[1];
  const a3 = a2 + bends[2];

  const p1 = new THREE.Vector3(0, Math.sin(a1) * lengths[0], -Math.cos(a1) * lengths[0]);
  const p2 = p1.clone().add(new THREE.Vector3(0, Math.sin(a2) * lengths[1], -Math.cos(a2) * lengths[1]));
  const p3 = p2.clone().add(new THREE.Vector3(0, Math.sin(a3) * lengths[2], -Math.cos(a3) * lengths[2]));

  const fingerGeo = createTaperedOrganicTube(
    [p0, p1, p2, p3],
    14,
    10,
    (t, angle) => {
      // Base flare seamlessly merging into palm -> gentle anatomical taper toward rounded fingertip
      const baseFlare = Math.exp(-t * 9.5) * 0.24;
      const pipKnuckle = Math.exp(-Math.pow((t - 0.38) * 10.5, 2)) * 0.11;
      const dipKnuckle = Math.exp(-Math.pow((t - 0.72) * 11.5, 2)) * 0.085;
      const taper = 1.0 - t * 0.24;
      const r = baseRadius * (taper + baseFlare + pipKnuckle + dipKnuckle);

      // Realistic elliptical cross-section: slightly wider laterally, slightly flattened palmar pad
      const dorsalBump = Math.sin(angle) > 0 ? (pipKnuckle + dipKnuckle) * baseRadius * 0.75 : 0;
      return [r * 1.06, r * 0.92 + dorsalBump];
    },
    [1.0, 2.0],
    true
  );

  const fingerMesh = new THREE.Mesh(fingerGeo, gloveMat);
  group.add(fingerMesh);

  // Contoured PIP & DIP tactical finger armor pads (authentic Standoff 2 armored combat glove look)
  const pipPad = new THREE.Mesh(new THREE.SphereGeometry(baseRadius * 0.82, 8, 6), padMat);
  pipPad.scale.set(1.14, 0.44, 1.42);
  pipPad.position.copy(p1).add(new THREE.Vector3(0, baseRadius * 0.72, 0));
  pipPad.rotation.x = (a1 + a2) * 0.5;
  group.add(pipPad);

  const dipPad = new THREE.Mesh(new THREE.SphereGeometry(baseRadius * 0.68, 8, 6), padMat);
  dipPad.scale.set(1.08, 0.4, 1.24);
  dipPad.position.copy(p2).add(new THREE.Vector3(0, baseRadius * 0.62, 0));
  dipPad.rotation.x = (a2 + a3) * 0.5;
  group.add(dipPad);

  group.rotation.y = spreadY;
  return group;
}

/**
 * Builds an anatomically sculpted opposing tactical thumb flowing out of the thenar eminence,
 * featuring a stitched seam collar + the signature light-slate/ash reinforced suede fingertip cap
 * from the Standoff 2 reference.
 */
function buildOrganicThumb(
  thumbSign: number,
  isLeftSupport: boolean,
  gloveMat: THREE.Material,
  suedeTipMat: THREE.Material,
  armorMat: THREE.Material
): THREE.Group {
  const group = new THREE.Group();

  // Proximal thumb shaft curving organically from thenar mound
  const ptsBase = isLeftSupport
    ? [
        new THREE.Vector3(thumbSign * 0.017, -0.005, 0.004),
        new THREE.Vector3(thumbSign * 0.035, 0.004, -0.012),
        new THREE.Vector3(thumbSign * 0.041, 0.012, -0.031),
      ]
    : [
        new THREE.Vector3(thumbSign * 0.017, -0.004, 0.006),
        new THREE.Vector3(thumbSign * 0.035, 0.004, -0.009),
        new THREE.Vector3(thumbSign * 0.036, -0.003, -0.028),
      ];

  const baseGeo = createTaperedOrganicTube(
    ptsBase,
    10,
    10,
    (t, angle) => {
      const baseBulk = Math.exp(-t * 5.2) * 0.0048;
      const jointSwell = Math.exp(-Math.pow((t - 0.86) * 6.5, 2)) * 0.0013;
      const r = 0.0104 - t * 0.0015 + baseBulk + jointSwell;
      const dorsal = Math.sin(angle) > 0 ? 0.0007 : 0;
      return [r * 1.08, r * 0.9 + dorsal];
    },
    [1.0, 1.4],
    true
  );
  group.add(new THREE.Mesh(baseGeo, gloveMat));

  // Distal thumb phalanx with reinforced contrasting ash-slate suede pad (signature Standoff 2 detail!)
  const pStart = ptsBase[2];
  const ptsTip = isLeftSupport
    ? [
        pStart.clone().add(new THREE.Vector3(-thumbSign * 0.001, -0.001, 0.003)),
        pStart.clone().add(new THREE.Vector3(thumbSign * 0.001, 0.004, -0.013)),
        pStart.clone().add(new THREE.Vector3(-thumbSign * 0.003, 0.002, -0.025)),
      ]
    : [
        pStart.clone().add(new THREE.Vector3(-thumbSign * 0.001, 0, 0.003)),
        pStart.clone().add(new THREE.Vector3(-thumbSign * 0.005, -0.008, -0.012)),
        pStart.clone().add(new THREE.Vector3(-thumbSign * 0.012, -0.016, -0.022)),
      ];

  const tipGeo = createTaperedOrganicTube(
    ptsTip,
    9,
    10,
    (t) => {
      const r = 0.0092 * (1.0 - t * 0.22);
      return [r * 1.12, r * 0.84];
    },
    [1.0, 1.0],
    true
  );
  group.add(new THREE.Mesh(tipGeo, isLeftSupport ? suedeTipMat : gloveMat));

  // Stitched seam ring & molded thumb IP knuckle shield separating dark fabric from suede fingertip
  const seamRing = new THREE.Mesh(new THREE.TorusGeometry(0.0092, 0.0014, 6, 12), armorMat);
  seamRing.position.copy(pStart);
  seamRing.scale.set(1.06, 0.9, 1.0);
  group.add(seamRing);

  const ipPad = new THREE.Mesh(new THREE.SphereGeometry(0.0068, 8, 6), armorMat);
  ipPad.scale.set(1.18, 0.46, 1.32);
  ipPad.position.copy(pStart).add(new THREE.Vector3(0, 0.0066, 0.002));
  group.add(ipPad);

  return group;
}

/**
 * Builds a Standoff-2-faithful first-person tactical gloved hand + compact, steeply-plunging
 * folded dark charcoal-slate softshell cuff (ZERO stretched-out forearm tube!).
 * - Compact deeply-creased wrist cuff dropping sharply off the bottom viewport edge (identical to Standoff 2)
 * - Lean, anatomically sculpted metacarpal glove shell with concave palmar cup & thenar muscle mound
 * - Continuous curved molded carbon-polymer knuckle bridge + dorsal armor panels + finger PIP/DIP armor
 * - Sculpted opposing thumb with stitched seam ring & ash-slate reinforced suede fingertip pad
 */
function buildFirstPersonGlovedArm(
  side: 'left' | 'right',
  isPistol: boolean
): THREE.Group {
  const pbr = getRealisticHandPBRSuite();
  const charTex = getCharacterTextureSuite();
  const root = new THREE.Group();
  const s = side === 'left' ? -1 : 1;
  // Anatomically: palm-down pointing -Z => left thumb is +X (+1), right thumb is -X (-1)
  const thumbSign = -s;

  // 1. Urban Slate-Blue/Grey Tactical Camo Compact BDU Cuff (matches 360° Operator body & legs!)
  const sleeveMat = new THREE.MeshPhysicalMaterial({
    map: charTex.urbanCamoMap,
    normalMap: pbr.sleeveNormal,
    normalScale: new THREE.Vector2(1.65, 1.65),
    roughnessMap: pbr.sleeveRough,
    color: 0xd8e0ea,
    roughness: 0.88,
    metalness: 0.04,
    sheen: 0.48,
    sheenRoughness: 0.68,
    sheenColor: new THREE.Color(0x95a8c0),
    envMapIntensity: 1.12,
  });

  // Slightly deeper shadow-toned folded camo cuff lip
  const cuffTrimMat = new THREE.MeshPhysicalMaterial({
    map: charTex.urbanCamoMap,
    normalMap: pbr.sleeveNormal,
    normalScale: new THREE.Vector2(1.75, 1.75),
    color: 0x9aa6b5,
    roughness: 0.86,
    metalness: 0.05,
    sheen: 0.42,
    sheenRoughness: 0.72,
    sheenColor: new THREE.Color(0x78889c),
    envMapIntensity: 1.05,
  });

  // 2. Full-Grain Pebbled Matte-Satin Black Tactical Leather Glove (matches 1132373900079277093_f1777dbe.jpg!)
  const gloveDorsalMat = new THREE.MeshPhysicalMaterial({
    map: pbr.gloveAlbedo,
    normalMap: pbr.gloveNormal,
    normalScale: new THREE.Vector2(1.65, 1.65),
    roughnessMap: pbr.gloveRough,
    roughness: 0.56,
    metalness: 0.14,
    clearcoat: 0.28,
    clearcoatRoughness: 0.44,
    sheen: 0.22,
    sheenRoughness: 0.58,
    sheenColor: new THREE.Color(0x8893a2),
    envMapIntensity: 1.38,
  });

  // 3. Tactile dark pebbled leather palm & thick rolled leather wrist collar
  const glovePalmMat = new THREE.MeshPhysicalMaterial({
    map: pbr.palmAlbedo,
    normalMap: pbr.palmNormal,
    normalScale: new THREE.Vector2(1.35, 1.35),
    roughnessMap: pbr.palmRough,
    color: 0x5c626c,
    roughness: 0.52,
    metalness: 0.15,
    clearcoat: 0.24,
    clearcoatRoughness: 0.46,
    envMapIntensity: 1.32,
  });

  // 4. Reinforced pebbled satin leather thumb fingertip pad (cohesive black tactical leather!)
  const suedeThumbTipMat = new THREE.MeshPhysicalMaterial({
    map: pbr.gloveAlbedo,
    normalMap: pbr.gloveNormal,
    normalScale: new THREE.Vector2(1.45, 1.45),
    roughnessMap: pbr.gloveRough,
    color: 0xb4bcc6,
    roughness: 0.54,
    metalness: 0.14,
    clearcoat: 0.26,
    clearcoatRoughness: 0.42,
    envMapIntensity: 1.32,
  });

  // 5. Molded semi-matte leather/carbon knuckle bridge, finger armor & thick stitched Velcro strap
  const knuckleArmorMat = new THREE.MeshPhysicalMaterial({
    map: pbr.gloveAlbedo,
    normalMap: pbr.gloveNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    color: 0x8c929c,
    roughness: 0.42,
    metalness: 0.22,
    clearcoat: 0.34,
    clearcoatRoughness: 0.36,
    envMapIntensity: 1.45,
  });

  // Matte gunmetal Velcro buckle accent
  const buckleMat = new THREE.MeshStandardMaterial({
    color: 0x353c45,
    roughness: 0.42,
    metalness: 0.72,
  });

  // === A. COMPACT, STEEPLY-PLUNGING FOLDED SOFTSHELL CUFF (Standoff 2 silhouette — ZERO stretched arm!) ===
  // Short (~16cm) thickly folded cuff diving sharply downward off the bottom border of the screen
  const cuffSpine = [
    new THREE.Vector3(s * 0.002, -0.007, 0.032),
    new THREE.Vector3(s * 0.011, -0.036, 0.068),
    new THREE.Vector3(s * 0.022, -0.082, 0.114),
    new THREE.Vector3(s * 0.032, -0.136, 0.162),
  ];

  const cuffGeo = createTaperedOrganicTube(
    cuffSpine,
    20,
    20,
    (t, angle) => {
      // Compact bunched softshell cuff volume that widens naturally as it drops off screen
      const baseR = 0.034 + 0.0165 * Math.pow(t, 0.75);
      const upperBias = 0.65 + 0.45 * Math.sin(angle + 0.35);
      // Pronounced 3D bunched cloth fold ridges right behind the wrist (identical to Standoff 2 sniper/UMP cuff!)
      const foldCrest1 = Math.exp(-Math.pow((t - 0.18) * 6.5, 2)) * 0.0068 * upperBias;
      const foldCrest2 = Math.exp(-Math.pow((t - 0.52) * 5.8, 2)) * 0.0056 * upperBias;
      const diagRipple =
        Math.sin(t * 24.0 + Math.cos(angle - s * 0.5) * 2.2) *
        0.0032 *
        upperBias *
        Math.sin(Math.min(1, t * 2.5) * Math.PI * 0.5);
      const drapeSag = Math.max(0, -Math.sin(angle)) * (0.0035 + t * 0.0045);

      const rx = baseR * 1.14 + foldCrest1 + foldCrest2 + diagRipple;
      const ry = baseR * 0.94 + foldCrest1 * 0.9 + foldCrest2 * 0.95 + diagRipple + drapeSag;
      return [rx, ry];
    },
    [1.4, 1.5],
    true
  );
  root.add(new THREE.Mesh(cuffGeo, sleeveMat));

  // Overlapping folded jacket cuff lip creating a crisp recessed shadow where the glove tucks inside the sleeve
  const cuffLipGeo = createTaperedOrganicTube(
    [
      new THREE.Vector3(s * 0.001, -0.006, 0.028),
      new THREE.Vector3(s * 0.006, -0.019, 0.048),
      new THREE.Vector3(s * 0.012, -0.035, 0.068),
    ],
    10,
    18,
    (t, angle) => {
      const lip = Math.sin(t * Math.PI) * 0.0052;
      const crease = Math.sin(angle * 3.0 + t * 6.5) * 0.0018;
      return [0.0372 + lip + crease, 0.0315 + lip * 0.92 + crease];
    },
    [1.2, 0.45],
    true
  );
  root.add(new THREE.Mesh(cuffLipGeo, cuffTrimMat));

  // === B. THICK ROLLED STITCHED LEATHER GLOVE WRIST CUFF & VELCRO CLOSURE STRAP (matches 1132373900079277093_f1777dbe.jpg!) ===
  const wristTubeGeo = createTaperedOrganicTube(
    [
      new THREE.Vector3(0, -0.001, 0.011),
      new THREE.Vector3(s * 0.001, -0.004, 0.031),
      new THREE.Vector3(s * 0.004, -0.011, 0.046),
    ],
    8,
    16,
    (t) => [0.0305 + t * 0.0024, 0.0235 + t * 0.0024],
    [1.0, 0.6],
    true
  );
  root.add(new THREE.Mesh(wristTubeGeo, glovePalmMat));

  // Signature thick rolled stitched leather edge collar around wrist opening
  const rolledCuffRing = new THREE.Mesh(new THREE.TorusGeometry(0.0305, 0.0046, 10, 22), knuckleArmorMat);
  rolledCuffRing.position.set(s * 0.002, -0.005, 0.033);
  rolledCuffRing.scale.set(1.06, 0.84, 1.0);
  rolledCuffRing.rotation.x = 0.22;
  root.add(rolledCuffRing);

  // Thick beveled stitched leather Velcro wrist closure strap + side loop tab
  const velcroStrap = new THREE.Mesh(
    createCurvedDorsalPadGeo(0.049, 0.021, 0.0075),
    knuckleArmorMat
  );
  velcroStrap.position.set(0, 0.0195, 0.022);
  velcroStrap.rotation.x = -0.16;
  root.add(velcroStrap);

  const wristBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.017), buckleMat);
  wristBuckle.position.set(thumbSign * 0.021, 0.0185, 0.022);
  wristBuckle.rotation.z = -thumbSign * 0.28;
  root.add(wristBuckle);

  // === C. ANATOMICAL METACARPAL HAND SHELL + MULTI-PANEL DORSAL & KNUCKLE ARMOR ===
  const handGroup = new THREE.Group();

  const palmGeo = createAnatomicalPalmGeo(thumbSign);
  // Slightly leaner, tighter combat-glove profile (matches the crisp pistol hand proportions!)
  palmGeo.scale(0.96, 0.95, 0.98);
  const palmMesh = new THREE.Mesh(palmGeo, gloveDorsalMat);
  handGroup.add(palmMesh);

  // Sculpted dark suede grip patch hugging palmar underside
  const palmGripGeo = createAnatomicalPalmGeo(thumbSign);
  palmGripGeo.scale(0.88, 0.85, 0.86);
  const palmGripMesh = new THREE.Mesh(palmGripGeo, glovePalmMat);
  palmGripMesh.position.set(0, -0.0042, -0.002);
  handGroup.add(palmGripMesh);

  // Contoured backhand tactical padding ribs + diagonal reinforcement strap (signature Standoff 2 glove geometry!)
  for (let r = 0; r < 2; r++) {
    const dorsalRib = new THREE.Mesh(
      createCurvedDorsalPadGeo(0.05 - r * 0.004, 0.0115, 0.0058),
      knuckleArmorMat
    );
    dorsalRib.position.set(0, 0.0148 - r * 0.0004, -0.006 - r * 0.0155);
    dorsalRib.rotation.y = thumbSign * 0.06;
    handGroup.add(dorsalRib);
  }

  // Diagonal stitched tactical overlay strap running from wrist across dorsal thumb/index metacarpal
  const diagPanel = new THREE.Mesh(
    createCurvedDorsalPadGeo(0.022, 0.044, 0.0045),
    glovePalmMat
  );
  diagPanel.position.set(thumbSign * 0.016, 0.0128, -0.018);
  diagPanel.rotation.y = thumbSign * 0.22;
  handGroup.add(diagPanel);

  // Single continuous sculpted curved knuckle armor bridge + 4 integral beveled knuckle domes
  const knuckleArmor = new THREE.Mesh(createCurvedKnuckleArmorGeo(thumbSign), knuckleArmorMat);
  knuckleArmor.scale.set(0.96, 1.0, 0.96);
  knuckleArmor.position.set(0, 0.0138, -0.042);
  handGroup.add(knuckleArmor);

  // === D. SEAMLESS CONTINUOUS 3-PHALANX FINGERS & OPPOSING THUMB ===
  // Anatomical knuckle anchor positions from Index (0) -> Pinky (3) respecting real human cascade
  const fingerAnchors: Array<{ x: number; y: number; z: number; r: number; lens: [number, number, number] }> = [
    { x: thumbSign * 0.0214, y: 0.0018, z: -0.046, r: 0.0077, lens: [0.024, 0.017, 0.014] }, // Index
    { x: thumbSign * 0.0073, y: 0.0026, z: -0.048, r: 0.0079, lens: [0.027, 0.019, 0.015] }, // Middle (longest)
    { x: thumbSign * -0.0072, y: 0.0006, z: -0.044, r: 0.0075, lens: [0.024, 0.017, 0.014] }, // Ring
    { x: thumbSign * -0.0208, y: -0.0032, z: -0.038, r: 0.0067, lens: [0.019, 0.014, 0.012] }, // Pinky
  ];

  if (side === 'left') {
    // Left support hand: fingers wrap organically under & around the forend / grip
    const leftCurls: Array<[number, number, number]> = [
      [-0.58, -0.78, -0.58],
      [-0.68, -0.84, -0.62],
      [-0.76, -0.88, -0.66],
      [-0.84, -0.92, -0.68],
    ];
    for (let f = 0; f < 4; f++) {
      const a = fingerAnchors[f];
      const spreadY = thumbSign * (0.04 - f * 0.03);
      const finger = buildOrganicFinger(a.lens, leftCurls[f], a.r, spreadY, gloveDorsalMat, knuckleArmorMat);
      finger.position.set(a.x, a.y, a.z);
      handGroup.add(finger);
    }

    // Left opposing thumb resting cleanly along upper-left flank with signature ash-slate suede tip
    const thumb = buildOrganicThumb(thumbSign, true, gloveDorsalMat, suedeThumbTipMat, knuckleArmorMat);
    handGroup.add(thumb);
  } else {
    // Right firing hand: index finger extended smoothly to trigger guard, other 3 curled firmly on pistol grip
    const rightCurls: Array<[number, number, number]> = [
      [-0.14, -0.44, -0.42], // Trigger finger
      [-0.86, -0.96, -0.72],
      [-0.94, -1.02, -0.74],
      [-1.02, -1.06, -0.76],
    ];
    for (let f = 0; f < 4; f++) {
      const a = fingerAnchors[f];
      const spreadY = f === 0 ? thumbSign * -0.18 : thumbSign * (0.02 - f * 0.025);
      const finger = buildOrganicFinger(a.lens, rightCurls[f], a.r, spreadY, gloveDorsalMat, knuckleArmorMat);
      finger.position.set(a.x, a.y, a.z);
      handGroup.add(finger);
    }

    const thumb = buildOrganicThumb(thumbSign, false, gloveDorsalMat, suedeThumbTipMat, knuckleArmorMat);
    handGroup.add(thumb);
  }

  if (isPistol) {
    handGroup.scale.setScalar(0.95);
  }

  root.add(handGroup);
  return root;
}

/**
 * Generates a realistic rich walnut/laminated rifle wood texture for AK-74M & M870 (matching image_6125596e.png!).
 */
let cachedWoodTex: THREE.CanvasTexture | null = null;
function getWeaponWoodTexture(): THREE.CanvasTexture {
  if (cachedWoodTex) return cachedWoodTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#5c3119';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    const grain = Math.sin(y * 0.14) * 18 + Math.sin(y * 0.43) * 9;
    const r = Math.round(THREE.MathUtils.clamp(108 + grain, 52, 148));
    const g = Math.round(THREE.MathUtils.clamp(54 + grain * 0.55, 24, 82));
    const b = Math.round(THREE.MathUtils.clamp(26 + grain * 0.3, 12, 46));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, y, 256, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedWoodTex = tex;
  return tex;
}

/**
 * PHASE 5 — Builds an ultra-detailed, Call-of-Duty-grade First-Person Weapon + Gloved Hands & Forearms!
 * Directly inspired by the user's HK416/M4A1 & AK-47 first-person references.
 */
export function buildRealisticWeaponModel(weaponId: WeaponId, mats?: ProceduralMaterials): BuiltWeaponModel {
  const spec = WEAPONS[weaponId];
  const group = new THREE.Group();

  const gunNormal = mats?.gunNormalMap ?? null;
  const gunWearMap = mats?.gunWearMap ?? null;
  const gunRoughMap = mats?.gunRoughnessMap ?? null;
  const polyNormal = mats?.polymerNormalMap ?? null;
  const isWood = spec.stockStyle === 'wood';
  const isPistol = spec.category === 'pistol';
  const isAKStyle = weaponId === 'ak74' || weaponId === 'saiga12';

  // Physically calibrated weathered anodized gunmetal, phosphate steel, polymer, bronze collar & coated optics!
  const matReceiver = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(spec.colorPrimary).offsetHSL(0, 0, 0.06),
    map: gunWearMap,
    roughnessMap: gunRoughMap,
    roughness: 0.36,
    metalness: 0.88,
    clearcoat: 0.24,
    clearcoatRoughness: 0.34,
    normalMap: gunNormal,
    normalScale: new THREE.Vector2(0.65, 0.65),
    envMapIntensity: 1.65,
  });
  const matSecondary = isWood
    ? new THREE.MeshPhysicalMaterial({
        map: getWeaponWoodTexture(),
        roughness: 0.44,
        metalness: 0.05,
        clearcoat: 0.32,
        clearcoatRoughness: 0.28,
        envMapIntensity: 1.2,
      })
    : new THREE.MeshStandardMaterial({
        color: spec.colorSecondary,
        roughness: 0.58,
        metalness: 0.26,
        normalMap: polyNormal,
        normalScale: new THREE.Vector2(0.9, 0.9),
        envMapIntensity: 1.2,
      });
  const matBarrel = new THREE.MeshStandardMaterial({
    color: 0x20252b,
    map: gunWearMap,
    roughnessMap: gunRoughMap,
    roughness: 0.26,
    metalness: 0.95,
    normalMap: gunNormal,
    normalScale: new THREE.Vector2(0.45, 0.45),
    envMapIntensity: 1.75,
  });
  const matSteelBright = new THREE.MeshStandardMaterial({
    color: 0x9aa2ab,
    roughnessMap: gunRoughMap,
    roughness: 0.18,
    metalness: 0.98,
    normalMap: gunNormal,
    normalScale: new THREE.Vector2(0.32, 0.32),
    envMapIntensity: 1.85,
  });
  const matBronzeCollar = new THREE.MeshStandardMaterial({
    color: 0xa47144,
    roughness: 0.28,
    metalness: 0.9,
    envMapIntensity: 1.6,
  });
  const matGrip = new THREE.MeshStandardMaterial({
    color: 0x1a1d20,
    roughness: 0.82,
    metalness: 0.08,
    normalMap: polyNormal,
    normalScale: new THREE.Vector2(1.3, 1.3),
    envMapIntensity: 1.1,
  });
  const matLensCoated = new THREE.MeshPhysicalMaterial({
    color: 0x1d4b63,
    emissive: 0x143345,
    emissiveIntensity: 0.55,
    roughness: 0.04,
    metalness: 0.55,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    reflectivity: 1.0,
    envMapIntensity: 2.2,
  });
  const matLaserFDE = new THREE.MeshStandardMaterial({
    color: 0x6b604b,
    roughness: 0.58,
    metalness: 0.3,
    normalMap: polyNormal,
    normalScale: new THREE.Vector2(0.65, 0.65),
    envMapIntensity: 1.25,
  });

  const receiverLen = isPistol ? 0.19 : spec.category === 'smg' ? 0.27 : 0.34;
  const receiverH = isPistol ? 0.042 : 0.068;
  const receiverW = isPistol ? 0.03 : 0.044;

  // === 1. MACHINED BEVELED UPPER & LOWER RECEIVER (ExtrudeGeometry — ZERO flat raw boxes!) ===
  if (isPistol) {
    const slideGeo = createBeveledSideExtrusion(
      [
        [0.095, 0.0],
        [0.092, 0.032],
        [-0.098, 0.032],
        [-0.102, 0.004],
        [-0.092, -0.004],
        [0.095, -0.004],
      ],
      receiverW,
      0.003,
      0.003
    );
    const frameGeo = createBeveledSideExtrusion(
      [
        [0.088, -0.002],
        [0.072, -0.022],
        [-0.085, -0.02],
        [-0.095, -0.004],
      ],
      receiverW * 0.92,
      0.0025,
      0.0025
    );
    group.add(new THREE.Mesh(slideGeo, matReceiver), new THREE.Mesh(frameGeo, matGrip));
    // Slide rear serrations
    for (let s = 0; s < 5; s++) {
      const serr = new THREE.Mesh(new THREE.BoxGeometry(receiverW + 0.002, 0.02, 0.004), matBarrel);
      serr.position.set(0, 0.014, 0.045 + s * 0.009);
      group.add(serr);
    }
  } else {
    // Upper receiver beveled profile (HK416 / M4A1 / AK-47 machined silhouette!)
    const upperGeo = createBeveledSideExtrusion(
      [
        [receiverLen * 0.48, -0.002],
        [receiverLen * 0.44, receiverH * 0.54],
        [-receiverLen * 0.48, receiverH * 0.54],
        [-receiverLen * 0.5, -0.002],
      ],
      receiverW,
      0.004,
      0.004
    );
    const upperMesh = new THREE.Mesh(upperGeo, matReceiver);
    group.add(upperMesh);

    // Lower receiver with angled flared magwell & rear buffer boss
    const lowerGeo = createBeveledSideExtrusion(
      [
        [receiverLen * 0.46, 0.0],
        [receiverLen * 0.44, -receiverH * 0.45],
        [receiverLen * 0.16, -receiverH * 0.52],
        [receiverLen * 0.02, -receiverH * 0.46],
        [-0.005, -receiverH * 0.78], // rear magwell edge
        [-0.088, -receiverH * 0.74], // angled front magwell flare
        [-0.102, -receiverH * 0.25],
        [-receiverLen * 0.42, 0.0],
      ],
      receiverW * 0.94,
      0.0035,
      0.0035
    );
    const lowerMesh = new THREE.Mesh(lowerGeo, matReceiver);
    group.add(lowerMesh);

    // Brass deflector wedge + forward assist plunger on right upper receiver
    const deflector = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.018, 4), matReceiver);
    deflector.rotation.z = -Math.PI * 0.5;
    deflector.position.set(receiverW * 0.52, 0.012, 0.045);
    const fwdAssist = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.024, 8), matBarrel);
    fwdAssist.rotation.x = Math.PI * 0.5;
    fwdAssist.rotation.y = 0.35;
    fwdAssist.position.set(receiverW * 0.46, 0.008, 0.085);
    group.add(deflector, fwdAssist);

    // Stamped steel receiver pins, mag release button & fire selector lever
    const pinGeo = new THREE.CylinderGeometry(0.0038, 0.0038, receiverW * 1.06, 8);
    pinGeo.rotateZ(Math.PI * 0.5);
    for (const pz of [-0.075, 0.018, 0.078]) {
      const pin = new THREE.Mesh(pinGeo, matSteelBright);
      pin.position.set(0, -0.016, pz);
      group.add(pin);
    }
    const selector = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.009, 0.026), matBarrel);
    selector.position.set(-receiverW * 0.52, -0.01, 0.068);
    selector.rotation.x = 0.52;
    group.add(selector);
  }

  // === 2. FULL-LENGTH MACHINED PICATINNY TOP RAIL WITH INDIVIDUAL TEETH ===
  const barrelStartZ = -receiverLen * 0.46;
  const barrelEndZ = barrelStartZ - spec.barrelLength;
  const hgLen = isPistol ? 0 : spec.barrelLength * 0.68;
  const hgCenterZ = -(receiverLen * 0.5 + hgLen * 0.48);

  if (!isPistol) {
    const totalRailLen = receiverLen * 0.92 + (isAKStyle ? 0 : hgLen * 0.94);
    const railStartZ = receiverLen * 0.42;
    const railEndZ = railStartZ - totalRailLen;
    const topRailBase = new THREE.Mesh(
      new THREE.BoxGeometry(receiverW * 0.58, 0.007, totalRailLen),
      matBarrel
    );
    topRailBase.position.set(0, receiverH * 0.54 + 0.003, (railStartZ + railEndZ) * 0.5);
    group.add(topRailBase);

    const teeth = Math.min(26, Math.floor(totalRailLen / 0.018));
    const toothGeo = new THREE.BoxGeometry(receiverW * 0.64, 0.005, 0.0085);
    for (let i = 0; i < teeth; i++) {
      const tz = railStartZ - 0.012 - (i / Math.max(1, teeth - 1)) * (totalRailLen - 0.024);
      const tooth = new THREE.Mesh(toothGeo, matBarrel);
      tooth.position.set(0, receiverH * 0.54 + 0.008, tz);
      group.add(tooth);
    }

    // === 3. OCTAGONAL VENTED QUAD-RAIL HANDGUARD (HK416/M4A1) OR CONTOURED WOOD HANDGUARD (AK-74) ===
    const hgProfile = createBeveledSideExtrusion(
      [
        [hgLen * 0.5, -receiverH * 0.34],
        [hgLen * 0.5, receiverH * 0.44],
        [-hgLen * 0.5, receiverH * 0.44],
        [-hgLen * 0.5, -receiverH * 0.32],
      ],
      receiverW * 0.92,
      0.006,
      0.006
    );
    const handguard = new THREE.Mesh(hgProfile, isWood ? matSecondary : matReceiver);
    handguard.position.set(0, 0.005, hgCenterZ);
    group.add(handguard);

    if (!isWood) {
      // Machined side quad-rail cooling ribs (matching image_18c80c60.png!)
      const ribCount = Math.max(6, Math.floor(hgLen / 0.021));
      const ribGeo = new THREE.BoxGeometry(receiverW * 1.08, 0.018, 0.009);
      for (let r = 0; r < ribCount; r++) {
        const rz = hgCenterZ + hgLen * 0.42 - (r / Math.max(1, ribCount - 1)) * hgLen * 0.84;
        const rib = new THREE.Mesh(ribGeo, matBarrel);
        rib.position.set(0, 0.006, rz);
        group.add(rib);
      }
      // Under-barrel Picatinny rail
      const bottomRail = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.009, hgLen * 0.88), matBarrel);
      bottomRail.position.set(0, -receiverH * 0.38, hgCenterZ);
      group.add(bottomRail);
    } else {
      // AK-style rounded upper wooden gas-tube cover
      const upperWood = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.018, hgLen * 0.88, 10), matSecondary);
      upperWood.rotation.x = Math.PI * 0.5;
      upperWood.position.set(0, 0.028, hgCenterZ + 0.01);
      group.add(upperWood);
    }

    // PEQ-15 Tactical IR Laser Box on right side rail for tactical rifles/SMGs
    if (spec.category === 'assault' && !isAKStyle) {
      const peq = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.021, 0.078), matLaserFDE);
      peq.position.set(receiverW * 0.62, 0.014, hgCenterZ - hgLen * 0.18);
      const peqLens = new THREE.Mesh(
        new THREE.CircleGeometry(0.0045, 8),
        new THREE.MeshBasicMaterial({ color: 0xdd2a22 })
      );
      peqLens.position.set(receiverW * 0.62, 0.014, hgCenterZ - hgLen * 0.18 - 0.04);
      peqLens.rotation.y = Math.PI;
      group.add(peq, peqLens);
    }

    // Front Gas Block + Flip-Up Front Sight Tower (matching image_18c80c60.png!)
    const gasBlockZ = hgCenterZ - hgLen * 0.5 - 0.012;
    const gasBlock = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.042, 0.028), matBarrel);
    gasBlock.position.set(0, 0.014, gasBlockZ);
    const frontPostL = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.032, 0.014), matBarrel);
    frontPostL.position.set(-0.009, 0.046, gasBlockZ);
    const frontPostR = frontPostL.clone();
    frontPostR.position.x = 0.009;
    const frontPin = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.022, 6), matSteelBright);
    frontPin.position.set(0, 0.045, gasBlockZ);
    group.add(gasBlock, frontPostL, frontPostR, frontPin);
  }

  // === 4. COLD-HAMMER-FORGED BARREL + BRONZE CRUSH COLLAR + SLOTTED 3-PORT MUZZLE BRAKE ===
  const barrelRadius = spec.category === 'shotgun' ? 0.015 : spec.category === 'sniper' ? 0.0125 : 0.0102;
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(barrelRadius, barrelRadius * 1.12, spec.barrelLength, 14),
    matBarrel
  );
  barrel.rotation.x = Math.PI * 0.5;
  barrel.position.set(0, 0.013, barrelStartZ - spec.barrelLength * 0.5);
  group.add(barrel);

  // Signature Copper/Bronze barrel collar ring (straight from image_18c80c60.png!)
  if (!isPistol) {
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(barrelRadius * 1.38, barrelRadius * 1.38, 0.014, 12),
      matBronzeCollar
    );
    collar.rotation.x = Math.PI * 0.5;
    collar.position.set(0, 0.013, hgCenterZ - hgLen * 0.5 - 0.036);
    group.add(collar);
  }

  // Shotgun under-barrel tube + ribbed pump grip
  if (spec.magStyle === 'tube') {
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0125, 0.0125, spec.barrelLength * 0.88, 10),
      matReceiver
    );
    tube.rotation.x = Math.PI * 0.5;
    tube.position.set(0, -0.015, barrelStartZ - spec.barrelLength * 0.44);
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.17, 12), matSecondary);
    pump.rotation.x = Math.PI * 0.5;
    pump.position.set(0, -0.015, barrelStartZ - spec.barrelLength * 0.35);
    group.add(tube, pump);
  }

  // Slotted 3-Port Tactical Compensator / Muzzle Brake
  const muzzleGroup = new THREE.Group();
  const mbBody = new THREE.Mesh(
    new THREE.CylinderGeometry(barrelRadius * 1.45, barrelRadius * 1.34, 0.056, 12),
    matBarrel
  );
  mbBody.rotation.x = Math.PI * 0.5;
  muzzleGroup.add(mbBody);
  for (const pz of [-0.014, 0, 0.014]) {
    const port = new THREE.Mesh(new THREE.BoxGeometry(barrelRadius * 3.05, 0.008, 0.008), matGrip);
    port.position.z = pz;
    muzzleGroup.add(port);
  }
  muzzleGroup.position.set(0, 0.013, barrelEndZ - 0.024);
  group.add(muzzleGroup);

  // Fluted Tactical Suppressor
  const suppressorGroup = new THREE.Group();
  const suppTube = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.2, 16), matGrip);
  suppTube.rotation.x = Math.PI * 0.5;
  suppressorGroup.add(suppTube);
  for (const rz of [-0.072, 0, 0.072]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.012, 16), matBarrel);
    ring.rotation.x = Math.PI * 0.5;
    ring.position.z = rz;
    suppressorGroup.add(ring);
  }
  suppressorGroup.position.set(0, 0.013, barrelEndZ - 0.11);
  suppressorGroup.visible = Boolean(spec.suppressedByDefault);
  group.add(suppressorGroup);

  // === 5. RECIPROCATING BOLT CARRIER + CHARGING HANDLE + EJECTION PORT ===
  const boltGroup = new THREE.Group();
  const boltCarrier = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.018, 0.072), matSteelBright);
  boltGroup.add(boltCarrier);
  const chargeHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0055, 0.028, 8), matBarrel);
  chargeHandle.rotation.z = Math.PI * 0.5;
  chargeHandle.position.set(0.014, 0.002, -0.012);
  boltGroup.add(chargeHandle);
  const boltRestPos = new THREE.Vector3(receiverW * 0.45, 0.014, -0.015);
  boltGroup.position.copy(boltRestPos);
  group.add(boltGroup);

  const ejectionPort = new THREE.Object3D();
  ejectionPort.position.set(receiverW * 0.56, 0.014, -0.012);
  group.add(ejectionPort);

  // === 6. CONTOURED ERGONOMIC PISTOL GRIP + CURVED TRIGGER GUARD & TRIGGER ===
  const gripGeo = createBeveledSideExtrusion(
    [
      [0.014, 0.008],
      [-0.024, 0.004],
      [-0.006, -0.048],
      [0.012, -0.105],
      [0.048, -0.102],
      [0.032, -0.036],
    ],
    0.03,
    0.005,
    0.005
  );
  const gripMesh = new THREE.Mesh(gripGeo, matGrip);
  const gripAnchorZ = isPistol ? 0.045 : 0.088;
  gripMesh.position.set(0, -0.028, gripAnchorZ);
  group.add(gripMesh);

  // Open curved trigger guard bow + steel trigger blade
  const guardBottom = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.005, 0.056), matReceiver);
  guardBottom.position.set(0, -0.056, gripAnchorZ - 0.044);
  const guardFront = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.028, 0.006), matReceiver);
  guardFront.position.set(0, -0.044, gripAnchorZ - 0.07);
  const triggerBlade = new THREE.Mesh(new THREE.BoxGeometry(0.0045, 0.022, 0.006), matSteelBright);
  triggerBlade.position.set(0, -0.038, gripAnchorZ - 0.036);
  triggerBlade.rotation.x = 0.38;
  group.add(guardBottom, guardFront, triggerBlade);

  // === 7. CURVED RIBBED STANAG / AK MAGAZINE (Beveled curved silhouette — matches references!) ===
  const magGroup = new THREE.Group();
  const magRestPos = new THREE.Vector3();

  if (spec.magStyle === 'tube') {
    magGroup.scale.set(0.001, 0.001, 0.001);
  } else if (spec.magStyle === 'curved') {
    const magCurveGeo = createBeveledSideExtrusion(
      [
        [0.028, 0.075],
        [-0.028, 0.075],
        [-0.034, 0.0],
        [-0.056, -0.088],
        [-0.004, -0.098],
        [0.02, -0.008],
      ],
      0.026,
      0.003,
      0.003
    );
    const magBody = new THREE.Mesh(magCurveGeo, matBarrel);
    magGroup.add(magBody);
    // Stamped reinforcing magazine ribs
    for (const ry of [-0.045, -0.01, 0.025]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.029, 0.008, 0.052), matReceiver);
      rib.position.set(0, ry, -0.012 + ry * 0.22);
      rib.rotation.x = -0.22;
      magGroup.add(rib);
    }
    const basePlate = new THREE.Mesh(new THREE.BoxGeometry(0.031, 0.014, 0.062), matGrip);
    basePlate.position.set(0, -0.095, -0.03);
    basePlate.rotation.x = -0.24;
    magGroup.add(basePlate);
    magRestPos.set(0, -0.105, -0.042);
  } else {
    const magW = spec.magStyle === 'box' ? 0.032 : 0.022;
    const magH = spec.magStyle === 'pistol' ? 0.095 : 0.135;
    const magD = spec.magStyle === 'box' ? 0.07 : spec.magStyle === 'pistol' ? 0.034 : 0.038;
    const magBody = new THREE.Mesh(new THREE.BoxGeometry(magW, magH, magD), matBarrel);
    const basePlate = new THREE.Mesh(new THREE.BoxGeometry(magW * 1.12, 0.014, magD * 1.1), matGrip);
    basePlate.position.y = -magH * 0.5 - 0.005;
    magGroup.add(magBody, basePlate);
    if (spec.magStyle === 'pistol') {
      magRestPos.set(0, -0.082, gripAnchorZ + 0.014);
      magGroup.rotation.x = 0.24;
    } else {
      magRestPos.set(0, -0.1, -0.042);
      magGroup.rotation.x = -0.06;
    }
  }
  magGroup.position.copy(magRestPos);
  group.add(magGroup);

  // === 8. COLLAPSIBLE CTR/SOPMOD TACTICAL STOCK OR HARDWOOD AK STOCK ===
  if (spec.stockStyle !== 'none') {
    const stockLen = spec.stockStyle === 'sniper' ? 0.28 : 0.24;
    const stockStartZ = receiverLen * 0.46;

    if (isWood) {
      const woodStockGeo = createBeveledSideExtrusion(
        [
          [0.0, 0.018],
          [0.0, -0.022],
          [stockLen, -0.085],
          [stockLen, 0.005],
        ],
        0.036,
        0.006,
        0.006
      );
      const woodStock = new THREE.Mesh(woodStockGeo, matSecondary);
      woodStock.position.set(0, 0.0, stockStartZ);
      group.add(woodStock);
    } else {
      // Buffer tube + beveled angled CTR/SOPMOD stock + skeletal lower strut (straight from image_18c80c60.png!)
      const bufferTube = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0155, stockLen * 0.9, 12), matBarrel);
      bufferTube.rotation.x = Math.PI * 0.5;
      bufferTube.position.set(0, 0.008, stockStartZ + stockLen * 0.42);
      group.add(bufferTube);

      const ctrGeo = createBeveledSideExtrusion(
        [
          [0.04, 0.026],
          [stockLen * 0.96, 0.022],
          [stockLen * 0.98, -0.088],
          [stockLen * 0.82, -0.088],
          [0.05, -0.022],
        ],
        0.038,
        0.005,
        0.005
      );
      const ctrStock = new THREE.Mesh(ctrGeo, matGrip);
      ctrStock.position.set(0, 0.0, stockStartZ);
      group.add(ctrStock);

      if (spec.stockStyle === 'sniper') {
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.022, 0.13), matSecondary);
        cheek.position.set(0, 0.036, stockStartZ + stockLen * 0.52);
        group.add(cheek);
      }
    }
    const buttpad = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.112, 0.018), matGrip);
    buttpad.position.set(0, -0.032, stockStartZ + stockLen);
    group.add(buttpad);
  }

  // === 9. PRECISION OPTICS (Tubular Aimpoint Micro Red-Dot / ACOG / Sniper Scope / Iron Sights) ===
  let adsOffsetY = -0.082;
  if (spec.opticStyle === 'holo') {
    // Tubular Aimpoint Micro T2 Red-Dot on Picatinny Riser (directly from image_18c80c60.png!)
    const opticY = receiverH * 0.54 + 0.044;
    const riser = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.022, 0.046), matBarrel);
    riser.position.set(0, receiverH * 0.54 + 0.018, 0.005);

    // Open hollow sight tube (outer cylinder openEnded + thin inner ring so you see right through!)
    const tubeOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.021, 0.021, 0.068, 16, 1, true),
      matBarrel
    );
    tubeOuter.rotation.x = Math.PI * 0.5;
    tubeOuter.position.set(0, opticY, 0.005);
    const tubeInner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.068, 16, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x111316, side: THREE.BackSide, roughness: 0.7 })
    );
    tubeInner.rotation.x = Math.PI * 0.5;
    tubeInner.position.set(0, opticY, 0.005);

    // Front & rear objective bezels + elevation/windage caps
    const frontRim = new THREE.Mesh(new THREE.TorusGeometry(0.0195, 0.0028, 8, 18), matReceiver);
    frontRim.position.set(0, opticY, -0.029);
    const rearRim = frontRim.clone();
    rearRim.position.z = 0.039;

    const topCap = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.012, 10), matBarrel);
    topCap.position.set(0, opticY + 0.024, 0.005);
    const sideCap = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.014, 10), matBarrel);
    sideCap.rotation.z = Math.PI * 0.5;
    sideCap.position.set(0.023, opticY, 0.005);

    // Anti-reflective tinted lens + crisp glowing holographic red dot!
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.0175, 16),
      new THREE.MeshBasicMaterial({ color: 0x36a2c4, transparent: true, opacity: 0.14 })
    );
    lens.position.set(0, opticY, -0.01);
    const redDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.0018, 10),
      new THREE.MeshBasicMaterial({ color: 0xff3b24 })
    );
    redDot.position.set(0, opticY, 0.0);

    group.add(riser, tubeOuter, tubeInner, frontRim, rearRim, topCap, sideCap, lens, redDot);
    adsOffsetY = -opticY;
  } else if (spec.opticStyle === 'acog' || spec.opticStyle === 'sniper') {
    const isSniper = spec.opticStyle === 'sniper';
    const scopeLen = isSniper ? 0.30 : 0.165;
    const mainR = isSniper ? 0.0165 : 0.016;
    const ocularR = isSniper ? 0.026 : 0.022;
    const objR = isSniper ? 0.028 : 0.022;
    const opticY = receiverH * 0.54 + 0.046;
    const centerZ = -0.02;
    const rearZ = centerZ + scopeLen * 0.5;
    const frontZ = centerZ - scopeLen * 0.5;

    const matScopeBody = new THREE.MeshStandardMaterial({
      color: 0x2b3036,
      map: gunWearMap,
      roughnessMap: gunRoughMap,
      roughness: 0.36,
      metalness: 0.78,
      normalMap: gunNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      envMapIntensity: 1.45,
    });
    const matScopeRubber = new THREE.MeshStandardMaterial({
      color: 0x181b1f,
      roughness: 0.84,
      metalness: 0.12,
      normalMap: polyNormal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      envMapIntensity: 1.0,
    });
    const matInnerBore = new THREE.MeshStandardMaterial({
      color: 0x07090b,
      roughness: 0.92,
      metalness: 0.1,
      side: THREE.BackSide,
    });
    const matRecessedLens = new THREE.MeshPhysicalMaterial({
      map: getScopeLensTexture(),
      roughness: 0.06,
      metalness: 0.25,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      reflectivity: 1.0,
      envMapIntensity: 1.8,
    });

    // 1. Main central 30mm aluminum scope tube
    const mainTube = new THREE.Mesh(
      new THREE.CylinderGeometry(mainR, mainR, scopeLen * 0.58, 20),
      matScopeBody
    );
    mainTube.rotation.x = Math.PI * 0.5;
    mainTube.position.set(0, opticY, centerZ);
    group.add(mainTube);

    // 2. Stepped magnification collar + hollow recessed rear ocular eyepiece bell (matches Standoff 2 AWM/M24 reference!)
    const magCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(ocularR * 0.86, mainR * 1.06, 0.032, 20),
      matScopeRubber
    );
    magCollar.rotation.x = Math.PI * 0.5;
    magCollar.position.set(0, opticY, rearZ - 0.072);
    group.add(magCollar);

    const ocularLen = 0.068;
    const ocularCenterZ = rearZ - ocularLen * 0.38;
    const ocularOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(ocularR, ocularR * 0.88, ocularLen, 24, 1, true),
      matScopeBody
    );
    ocularOuter.rotation.x = Math.PI * 0.5;
    ocularOuter.position.set(0, opticY, ocularCenterZ);
    const ocularInner = new THREE.Mesh(
      new THREE.CylinderGeometry(ocularR * 0.84, ocularR * 0.78, ocularLen, 24, 1, true),
      matInnerBore
    );
    ocularInner.rotation.x = Math.PI * 0.5;
    ocularInner.position.set(0, opticY, ocularCenterZ);
    group.add(ocularOuter, ocularInner);

    // Thick sculpted rear rubber eye-cup bezel ring + tactile knurled diopter ribs
    const rearBezel = new THREE.Mesh(new THREE.TorusGeometry(ocularR * 0.92, 0.0036, 10, 24), matScopeRubber);
    rearBezel.position.set(0, opticY, ocularCenterZ + ocularLen * 0.5);
    group.add(rearBezel);

    const knurlGeo = new THREE.BoxGeometry(0.0028, 0.0026, 0.026);
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      const rib = new THREE.Mesh(knurlGeo, matScopeRubber);
      rib.position.set(
        Math.cos(a) * (ocularR + 0.0005),
        opticY + Math.sin(a) * (ocularR + 0.0005),
        ocularCenterZ + ocularLen * 0.24
      );
      rib.rotation.z = a;
      group.add(rib);
    }

    // Deeply recessed concave optical ocular glass set inside the hollow hood!
    const rearLens = new THREE.Mesh(new THREE.CircleGeometry(ocularR * 0.81, 24), matRecessedLens);
    rearLens.position.set(0, opticY, ocularCenterZ + ocularLen * 0.16);
    group.add(rearLens);

    // 3. Flared front objective bell & recessed sunshade
    const frontTaper = new THREE.Mesh(
      new THREE.CylinderGeometry(objR, mainR * 1.02, 0.044, 20),
      matScopeBody
    );
    frontTaper.rotation.x = Math.PI * 0.5;
    frontTaper.position.set(0, opticY, frontZ + 0.044);
    const frontBell = new THREE.Mesh(
      new THREE.CylinderGeometry(objR, objR, 0.056, 22, 1, true),
      matScopeBody
    );
    frontBell.rotation.x = Math.PI * 0.5;
    frontBell.position.set(0, opticY, frontZ - 0.006);
    const frontBezel = new THREE.Mesh(new THREE.TorusGeometry(objR * 0.96, 0.0028, 8, 22), matScopeRubber);
    frontBezel.position.set(0, opticY, frontZ - 0.034);
    group.add(frontTaper, frontBell, frontBezel);

    // 4. Center turret saddle block + matte-dark knurled elevation, windage & parallax drums
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(mainR * 2.25, mainR * 2.25, 0.038), matScopeRubber);
    saddle.position.set(0, opticY, centerZ - 0.015);
    group.add(saddle);

    const elevDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0132, 0.022, 16), matScopeRubber);
    elevDrum.position.set(0, opticY + mainR + 0.011, centerZ - 0.015);
    const elevCap = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.012, 0.005, 16), matScopeBody);
    elevCap.position.set(0, opticY + mainR + 0.023, centerZ - 0.015);

    const windDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0112, 0.018, 14), matScopeRubber);
    windDrum.rotation.z = Math.PI * 0.5;
    windDrum.position.set(mainR + 0.01, opticY, centerZ - 0.015);

    const parallaxDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0112, 0.016, 14), matScopeRubber);
    parallaxDrum.rotation.z = Math.PI * 0.5;
    parallaxDrum.position.set(-(mainR + 0.009), opticY, centerZ - 0.015);
    group.add(elevDrum, elevCap, windDrum, parallaxDrum);

    // 5. Heavy-duty dual cantilever Picatinny scope rings
    for (const mz of [-0.068, 0.028]) {
      const mountBase = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.032, 0.02), matGrip);
      mountBase.position.set(0, receiverH * 0.54 + 0.02, mz);
      const mountRing = new THREE.Mesh(new THREE.CylinderGeometry(mainR * 1.24, mainR * 1.24, 0.018, 16), matGrip);
      mountRing.rotation.x = Math.PI * 0.5;
      mountRing.position.set(0, opticY, mz);
      group.add(mountBase, mountRing);
    }
    adsOffsetY = -opticY;
  } else {
    // Machined Iron Sights with glowing tritium green dots
    const sightY = receiverH * 0.54 + 0.018;
    const frontBase = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.022, 0.014), matBarrel);
    frontBase.position.set(0, sightY, barrelEndZ + 0.035);
    const frontDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.0022, 8),
      new THREE.MeshBasicMaterial({ color: 0x52ff7a })
    );
    frontDot.position.set(0, sightY + 0.006, barrelEndZ + 0.043);
    const rearL = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.016, 0.014), matBarrel);
    rearL.position.set(-0.009, sightY, receiverLen * 0.38);
    const rearR = rearL.clone();
    rearR.position.x = 0.009;
    group.add(frontBase, frontDot, rearL, rearR);
    adsOffsetY = -(sightY + 0.006);
  }

  // === 10. MUZZLE POINT & MULTI-PLANE STARBURST MUZZLE FLASH ===
  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0.013, barrelEndZ - 0.068);
  group.add(muzzlePoint);

  const flashGroup = new THREE.Group();
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd275,
    transparent: true,
    opacity: 0.94,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const coneMain = new THREE.Mesh(new THREE.ConeGeometry(0.046, 0.21, 6), flashMat);
  coneMain.rotation.x = -Math.PI * 0.5;
  coneMain.position.z = -0.095;
  const starV = new THREE.Mesh(new THREE.PlaneGeometry(0.165, 0.052), flashMat);
  starV.position.z = -0.02;
  const starH = starV.clone();
  starH.rotation.z = Math.PI * 0.5;
  const starD = starV.clone();
  starD.rotation.z = Math.PI * 0.25;
  flashGroup.add(coneMain, starV, starH, starD);
  flashGroup.position.copy(muzzlePoint.position);
  flashGroup.visible = false;
  group.add(flashGroup);

  // === 11. STANDOFF-2-FAITHFUL TACTICAL GLOVED HANDS & COMPACT CUFFS (Zero stretched forearm!) ===
  // Right Firing Hand gripping pistol grip & trigger — compact cuff drops cleanly off bottom-right edge
  const rightArmGroup = buildFirstPersonGlovedArm('right', isPistol);
  if (isPistol) {
    rightArmGroup.position.set(0.024, -0.070, gripAnchorZ + 0.032);
    rightArmGroup.rotation.set(0.22, -0.15, -0.44);
  } else if (spec.category === 'sniper') {
    rightArmGroup.position.set(0.028, -0.068, gripAnchorZ + 0.030);
    rightArmGroup.rotation.set(0.24, -0.16, -0.48);
  } else {
    rightArmGroup.position.set(0.026, -0.072, gripAnchorZ + 0.032);
    rightArmGroup.rotation.set(0.22, -0.16, -0.46);
  }
  group.add(rightArmGroup);

  // Left Support Hand anchored CLOSE to the receiver / rear forend (identical to Standoff 2 sniper & UMP45!)
  // No stretched-out arm reaching far down the barrel — only the sculpted gloved hand + folded cuff!
  const leftArmGroup = buildFirstPersonGlovedArm('left', isPistol);
  let leftArmRestPos: THREE.Vector3;
  let leftArmRestRot: THREE.Euler;

  if (isPistol) {
    leftArmRestPos = new THREE.Vector3(-0.026, -0.082, gripAnchorZ + 0.018);
    leftArmRestRot = new THREE.Euler(0.26, 0.34, 0.54);
  } else if (spec.category === 'smg') {
    leftArmRestPos = new THREE.Vector3(-0.032, -0.056, -0.105);
    leftArmRestRot = new THREE.Euler(0.20, 0.28, 0.64);
  } else if (spec.category === 'sniper') {
    leftArmRestPos = new THREE.Vector3(-0.032, -0.050, -0.135);
    leftArmRestRot = new THREE.Euler(0.16, 0.26, 0.72);
  } else if (spec.category === 'shotgun') {
    leftArmRestPos = new THREE.Vector3(-0.033, -0.052, -0.145);
    leftArmRestRot = new THREE.Euler(0.18, 0.28, 0.68);
  } else {
    // Assault rifles: close support grip right ahead of magwell / rear handguard
    leftArmRestPos = new THREE.Vector3(-0.033, -0.054, -0.128);
    leftArmRestRot = new THREE.Euler(0.18, 0.28, 0.68);
  }
  leftArmGroup.position.copy(leftArmRestPos);
  leftArmGroup.rotation.copy(leftArmRestRot);
  group.add(leftArmGroup);

  return {
    group,
    muzzlePoint,
    ejectionPort,
    suppressorMesh: suppressorGroup,
    boltMesh: boltGroup,
    magMesh: magGroup,
    muzzleFlash: flashGroup,
    magRestPos,
    boltRestPos,
    leftArmGroup,
    leftArmRestPos,
    leftArmRestRot,
    rightArmGroup,
    adsOffsetY,
  };
}
