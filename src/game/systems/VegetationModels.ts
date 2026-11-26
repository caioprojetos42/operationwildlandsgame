import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ProceduralMaterials } from './TextureLibrary';

export interface OrganicVegetationAssets {
  // LOD0 Full-Detail Organic Species
  pineTrunkGeo: THREE.BufferGeometry;
  pineFoliageGeo: THREE.BufferGeometry;
  oakTrunkGeo: THREE.BufferGeometry;
  oakFoliageGeo: THREE.BufferGeometry;
  palmTrunkGeo: THREE.BufferGeometry;
  palmFoliageGeo: THREE.BufferGeometry;
  shrubGeo: THREE.BufferGeometry;
  dryGrassGeo: THREE.BufferGeometry;
  craggyRockGeo: THREE.BufferGeometry;
  rockOutcropGeo: THREE.BufferGeometry;

  // LOD1 Lightweight Distant Canopy Geometries
  pineLodTrunkGeo: THREE.BufferGeometry;
  pineLodFoliageGeo: THREE.BufferGeometry;
  oakLodTrunkGeo: THREE.BufferGeometry;
  oakLodFoliageGeo: THREE.BufferGeometry;
  palmLodFoliageGeo: THREE.BufferGeometry;

  // PBR Materials (with wind sway, backlit subsurface translucency & distance fade)
  pineBarkMat: THREE.MeshStandardMaterial;
  palmBarkMat: THREE.MeshStandardMaterial;
  pineNeedleMat: THREE.MeshStandardMaterial;
  oakLeafMat: THREE.MeshStandardMaterial;
  palmFrondMat: THREE.MeshStandardMaterial;
  shrubMat: THREE.MeshStandardMaterial;
  dryGrassMat: THREE.MeshStandardMaterial;
  boulderMat: THREE.MeshStandardMaterial;
  dispose: () => void;
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')!];
}

/**
 * High-detail 512px botanical conifer bough spray (woody branchlet, asymmetric sub-twigs, dense multi-tone needles).
 */
function createPineBoughTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512);
  ctx.clearRect(0, 0, 512, 512);
  const rand = seededRand(4101);

  // Curved organic central woody stem
  ctx.strokeStyle = '#38291c';
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(256, 502);
  ctx.bezierCurveTo(246, 360, 266, 200, 254, 46);
  ctx.stroke();

  // Asymmetric radiating sub-branches
  const twigs: { x0: number; y0: number; x1: number; y1: number; w: number }[] = [];
  for (let i = 0; i < 20; i++) {
    const t = 0.08 + (i / 20) * 0.84;
    const y0 = 486 - t * 425;
    const side = i % 2 === 0 ? -1 : 1;
    const span = (1 - t * 0.62) * (135 + rand() * 72);
    const x0 = 256 + (rand() - 0.5) * 10;
    const x1 = x0 + side * span;
    const y1 = y0 - (38 + rand() * 68);
    const w = 5.2 - t * 3.0;
    twigs.push({ x0, y0, x1, y1, w });
    ctx.strokeStyle = '#473525';
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) * 0.5, y0 - 12, x1, y1);
    ctx.stroke();
  }

  // Dense layered pine needle clusters (deep shaded core -> warm sunlit outer tips)
  const drawNeedles = (x0: number, y0: number, x1: number, y1: number, count: number) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const baseAngle = Math.atan2(dy, dx);
    for (let k = 0; k < count; k++) {
      const f = rand();
      const px = x0 + dx * f + (rand() - 0.5) * 16;
      const py = y0 + dy * f + (rand() - 0.5) * 16;
      const sideSpread = (rand() > 0.5 ? 1 : -1) * (0.35 + rand() * 0.95);
      const ang = baseAngle + sideSpread;
      const len = 18 + rand() * 34;
      const shade = rand() * 0.7 + f * 0.3;
      const r = Math.round(30 + shade * 36);
      const g = Math.round(52 + shade * 48);
      const b = Math.round(24 + shade * 20);
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.lineWidth = 2.0 + rand() * 2.0;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
      ctx.stroke();
    }
  };

  drawNeedles(256, 468, 254, 34, 280);
  for (const tw of twigs) {
    drawNeedles(tw.x0, tw.y0, tw.x1, tw.y1, 88);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * High-detail 512px botanical olive/oak broadleaf twig spray with tapered leaves & subtle midribs.
 */
function createBroadleafClusterTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512);
  ctx.clearRect(0, 0, 512, 512);
  const rand = seededRand(5202);

  // Gnarled woody forks
  ctx.strokeStyle = '#3b2c1e';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(256, 496);
  ctx.quadraticCurveTo(248, 360, 256, 235);
  ctx.lineTo(132, 118);
  ctx.moveTo(254, 290);
  ctx.lineTo(384, 145);
  ctx.moveTo(256, 235);
  ctx.lineTo(266, 66);
  ctx.moveTo(195, 180);
  ctx.lineTo(95, 225);
  ctx.moveTo(318, 215);
  ctx.lineTo(415, 255);
  ctx.stroke();

  // Layered pointed botanical leaves (deep shadow layer first, sunlit olive/gold layer on top)
  for (let pass = 0; pass < 2; pass++) {
    const count = pass === 0 ? 290 : 250;
    for (let i = 0; i < count; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = Math.pow(rand(), 0.62) * 212;
      const x = 256 + Math.cos(ang) * rad;
      const y = 246 + Math.sin(ang) * rad * 0.94;
      const len = 16 + rand() * 18;
      const wid = 6 + rand() * 8;
      const rot = rand() * Math.PI * 2;
      const v = rand();
      const bright = pass === 0 ? 0.68 : 1.05;

      const r = Math.round((48 + v * 52) * bright);
      const g = Math.round((64 + v * 48) * bright);
      const b = Math.round((28 + v * 22) * bright);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.moveTo(-len, 0);
      ctx.quadraticCurveTo(0, -wid, len, 0);
      ctx.quadraticCurveTo(0, wid, -len, 0);
      ctx.fill();

      // Subtle lighter central leaf vein on upper sunlit leaves
      if (pass === 1 && v > 0.45) {
        ctx.strokeStyle = `rgba(${Math.min(255, r + 32)},${Math.min(255, g + 34)},${Math.min(255, b + 18)},0.45)`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-len * 0.75, 0);
        ctx.lineTo(len * 0.75, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * High-detail 512px pinnate Desert Date Palm frond texture (central arching rachis + long feathery leaflets).
 */
function createPalmFrondTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512);
  ctx.clearRect(0, 0, 512, 512);
  const rand = seededRand(8419);

  // Central tapered woody rachis stem running bottom -> top
  const stemGrad = ctx.createLinearGradient(256, 512, 256, 18);
  stemGrad.addColorStop(0, '#625032');
  stemGrad.addColorStop(0.5, '#596335');
  stemGrad.addColorStop(1, '#4c5e2c');
  ctx.strokeStyle = stemGrad;
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(256, 510);
  ctx.lineTo(256, 26);
  ctx.stroke();

  // Long pointed feathery leaflets radiating symmetrically along both sides of rachis
  const pairs = 46;
  for (let i = 0; i < pairs; i++) {
    const t = i / (pairs - 1);
    const y = 485 - t * 445;
    // Broad in middle, gracefully tapering toward stem base & tip
    const envelope = Math.sin(Math.pow(t, 0.72) * Math.PI);
    const maxLen = (70 + envelope * 168) * (0.9 + rand() * 0.2);

    for (const side of [-1, 1]) {
      const droopAngle = (0.38 + (1 - t) * 0.34 + (rand() - 0.5) * 0.14);
      const tipX = 256 + side * Math.cos(droopAngle) * maxLen;
      const tipY = y - Math.sin(droopAngle) * maxLen * 0.65;
      const midX = 256 + side * Math.cos(droopAngle) * maxLen * 0.55;
      const midY = y - Math.sin(droopAngle) * maxLen * 0.45 - 6;

      const tone = rand();
      const r = Math.round(48 + tone * 46 + (1 - envelope) * 18);
      const g = Math.round(70 + tone * 44);
      const b = Math.round(28 + tone * 18);

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.moveTo(256, y + 3);
      ctx.quadraticCurveTo(midX, midY - 5, tipX, tipY);
      ctx.quadraticCurveTo(midX, midY + 6, 256, y - 3);
      ctx.closePath();
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Organic furrowed tree bark texture (albedo + matched fibrous depth).
 */
function createBarkTexture(ringedPalm = false): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256);
  const rand = seededRand(ringedPalm ? 7711 : 7404);
  ctx.fillStyle = ringedPalm ? '#5a4936' : '#3d2f23';
  ctx.fillRect(0, 0, 256, 256);

  if (ringedPalm) {
    // Horizontal diamond/ringed leaf-scar bands characteristic of real desert palms
    for (let y = 0; y < 256; y += 16) {
      ctx.fillStyle = 'rgba(28,20,14,0.62)';
      ctx.fillRect(0, y, 256, 4);
      ctx.fillStyle = 'rgba(118,98,74,0.34)';
      ctx.fillRect(0, y + 4, 256, 5);
      for (let x = 0; x < 256; x += 24) {
        ctx.strokeStyle = 'rgba(34,24,16,0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + 2);
        ctx.lineTo(x + 12, y + 14);
        ctx.lineTo(x + 24, y + 2);
        ctx.stroke();
      }
    }
  } else {
    for (let i = 0; i < 280; i++) {
      const x = rand() * 256;
      const w = 2 + rand() * 7;
      const shade = Math.round(32 + rand() * 44);
      ctx.fillStyle = `rgba(${shade + 18},${shade + 7},${shade - 2},0.55)`;
      ctx.fillRect(x, 0, w, 256);
    }
    for (let i = 0; i < 720; i++) {
      const x = rand() * 256;
      const y = rand() * 256;
      ctx.fillStyle = rand() > 0.5 ? 'rgba(18,12,8,0.52)' : 'rgba(96,79,60,0.3)';
      ctx.fillRect(x, y, 2 + rand() * 3, 14 + rand() * 30);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(ringedPalm ? 1.5 : 2, ringedPalm ? 6 : 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function normalizeGeoForMerge(geo: THREE.BufferGeometry, defaultColor?: THREE.Color): THREE.BufferGeometry {
  const nonIndexed = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!nonIndexed.attributes.normal) nonIndexed.computeVertexNormals();
  const count = nonIndexed.attributes.position.count;
  if (!nonIndexed.attributes.uv) {
    nonIndexed.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  if (!nonIndexed.attributes.color) {
    const col = defaultColor ?? new THREE.Color(1, 1, 1);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  return nonIndexed;
}

/**
 * Generates an organic curved, smoothly tapering tubular branch/trunk along a CatmullRomCurve3
 * with optional root flare fluting and subtle bark radius irregularity (ZERO rigid straight cylinders!).
 */
function buildTaperedOrganicBranch(
  points: THREE.Vector3[],
  rBase: number,
  rTip: number,
  lengthSegs: number,
  radialSegs: number,
  rootFluting = 0,
  ringRibAmp = 0
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(lengthSegs, false);

  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const p = new THREE.Vector3();
  const v = new THREE.Vector3();

  for (let i = 0; i <= lengthSegs; i++) {
    const t = i / lengthSegs;
    curve.getPointAt(t, p);
    const N = frames.normals[i];
    const B = frames.binormals[i];

    // Smooth root flare near t=0 -> tapering organic trunk toward tip
    const flare = rootFluting > 0 ? Math.pow(Math.max(0, 1 - t * 4.5), 2.2) * rootFluting : 0;
    const baseRadius = THREE.MathUtils.lerp(rBase, rTip, Math.pow(t, 0.82)) * (1 + flare);
    const ringWave = ringRibAmp > 0 ? Math.sin(t * lengthSegs * Math.PI * 2) * ringRibAmp : 0;

    // Ground-contact AO darkening near roots
    const ao = THREE.MathUtils.lerp(0.62, 1.0, THREE.MathUtils.smoothstep(t, 0.0, 0.25));

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const flute = rootFluting > 0 ? Math.sin(theta * 5.0) * flare * 0.26 : 0;
      const gnarl = Math.sin(t * 11.0 + theta * 2.0) * 0.05;
      const r = Math.max(0.015, baseRadius * (1 + flute + gnarl) + ringWave);

      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      v.copy(p)
        .addScaledVector(N, cosT * r)
        .addScaledVector(B, sinT * r);

      positions.push(v.x, v.y, v.z);
      uvs.push(u, t * 3.0);
      colors.push(ao, ao, ao);
    }
  }

  const stride = radialSegs + 1;
  for (let i = 0; i < lengthSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return normalizeGeoForMerge(geo);
}

/**
 * Creates a cupped/arched 3D botanical foliage card (subdivided curved surface, NEVER a flat 1x1 plane!).
 */
function buildCurvedFoliageCard(
  width: number,
  height: number,
  archDrop: number,
  cupCurve: number,
  segsX = 2,
  segsY = 3
): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, height, segsX, segsY);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // Normalize u in [-1..1], v in [0..1] (clamp protects Float32 rounding from negative Math.pow -> NaN)
    const nx = THREE.MathUtils.clamp(x / (width * 0.5), -1, 1);
    const ny = THREE.MathUtils.clamp((y + height * 0.5) / height, 0, 1);
    // Natural gravity arch toward tip + soft transverse leaf cup
    const zBend = -Math.pow(ny, 1.8) * archDrop - (nx * nx) * cupCurve;
    pos.setZ(i, zBend);
    // Shift pivot to stem base
    pos.setY(i, y + height * 0.42);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * AAA SpeedTree technique: Replaces harsh flat-card normals with smooth radial canopy normals
 * and bakes organic interior-to-exterior canopy AO into vertex colors so foliage looks 100% volumetric!
 */
function applySphericalCanopyNormalsAndAO(
  geo: THREE.BufferGeometry,
  canopyCenter: THREE.Vector3,
  canopyRadius: number,
  aoMin = 0.52,
  aoMax = 1.06
): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const norm = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(canopyCenter);
    const distNorm = THREE.MathUtils.clamp(v.length() / Math.max(0.5, canopyRadius), 0, 1);

    // Outward radial normal biased upward so sunlight wraps softly across the entire crown
    n.set(v.x, v.y * 0.78 + canopyRadius * 0.42, v.z).normalize();
    norm.setXYZ(i, n.x, n.y, n.z);

    // Rich inner canopy occlusion -> warm sunlit outer foliage tips
    const ao = THREE.MathUtils.lerp(aoMin, aoMax, Math.pow(distNorm, 0.72));
    const skyLift = THREE.MathUtils.clamp((v.y / canopyRadius) * 0.14 + 0.06, -0.08, 0.16);
    const c = THREE.MathUtils.clamp(ao + skyLift, 0.4, 1.12);
    colors[i * 3] = c;
    colors[i * 3 + 1] = c * 1.01;
    colors[i * 3 + 2] = c * 0.96;
  }

  norm.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * SPECIES 1: Organic Highland Ponderosa Pine (curved fluted trunk + gnarled drooping boughs + cupped 3D sprays).
 */
function buildOrganicPineGeometries(): {
  trunkGeo: THREE.BufferGeometry;
  foliageGeo: THREE.BufferGeometry;
  lodTrunkGeo: THREE.BufferGeometry;
  lodFoliageGeo: THREE.BufferGeometry;
} {
  const rand = seededRand(9101);
  const woodParts: THREE.BufferGeometry[] = [];
  const leafParts: THREE.BufferGeometry[] = [];

  // Sinuous organic pine trunk with root buttress fluting
  const trunkSpine = [
    new THREE.Vector3(0, -0.25, 0),
    new THREE.Vector3(0.08, 2.5, -0.05),
    new THREE.Vector3(-0.07, 5.6, 0.08),
    new THREE.Vector3(0.05, 8.6, -0.04),
    new THREE.Vector3(0.0, 11.2, 0.02),
  ];
  woodParts.push(buildTaperedOrganicBranch(trunkSpine, 0.36, 0.035, 10, 7, 0.55));

  // Exposed spreading surface roots gripping the dirt
  for (let r = 0; r < 4; r++) {
    const a = (r / 4) * Math.PI * 2 + 0.4 + rand() * 0.25;
    const rootPts = [
      new THREE.Vector3(Math.cos(a) * 0.12, 0.55, Math.sin(a) * 0.12),
      new THREE.Vector3(Math.cos(a) * 0.52, 0.15, Math.sin(a) * 0.52),
      new THREE.Vector3(Math.cos(a) * 0.95, -0.18, Math.sin(a) * 0.95),
    ];
    woodParts.push(buildTaperedOrganicBranch(rootPts, 0.15, 0.03, 4, 5));
  }

  // Multi-whorl irregular asymmetric conifer tiers (curved drooping boughs + cupped 3D needle sprays)
  const tiers = [
    { y: 2.8, radius: 3.1, branches: 6, cardW: 2.55, cardH: 2.45, droop: 0.44 },
    { y: 4.3, radius: 2.8, branches: 6, cardW: 2.35, cardH: 2.25, droop: 0.34 },
    { y: 5.8, radius: 2.35, branches: 5, cardW: 2.05, cardH: 1.98, droop: 0.24 },
    { y: 7.2, radius: 1.82, branches: 5, cardW: 1.75, cardH: 1.72, droop: 0.16 },
    { y: 8.6, radius: 1.28, branches: 4, cardW: 1.45, cardH: 1.42, droop: 0.08 },
    { y: 9.8, radius: 0.78, branches: 4, cardW: 1.15, cardH: 1.18, droop: 0.02 },
  ];

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();

  tiers.forEach((tier, tIdx) => {
    for (let b = 0; b < tier.branches; b++) {
      const ang = (b / tier.branches) * Math.PI * 2 + tIdx * 0.74 + (rand() - 0.5) * 0.42;
      const bLen = tier.radius * (0.82 + rand() * 0.32);
      const yOff = tier.y + (rand() - 0.5) * 0.35;

      // Curved organic woody bough arching outward & slightly upward at tip
      if (tIdx < 4) {
        const limbPts = [
          new THREE.Vector3(0, yOff, 0),
          new THREE.Vector3(Math.cos(ang) * bLen * 0.5, yOff - tier.droop * 0.45, Math.sin(ang) * bLen * 0.5),
          new THREE.Vector3(Math.cos(ang) * bLen * 0.88, yOff - tier.droop * 0.2, Math.sin(ang) * bLen * 0.88),
        ];
        woodParts.push(buildTaperedOrganicBranch(limbPts, 0.085 - tIdx * 0.012, 0.02, 4, 5));
      }

      // 2 cupped arched 3D foliage cards per bough with organic pitch/roll variety
      for (const roll of [-0.46, 0.46]) {
        const card = buildCurvedFoliageCard(tier.cardW, tier.cardH, 0.42 + tier.droop * 0.5, 0.24, 2, 3);
        euler.set(Math.PI * 0.5 - 0.42 + tier.droop * 0.75 + (rand() - 0.5) * 0.18, ang + Math.PI * 0.5, roll, 'YXZ');
        q.setFromEuler(euler);
        m.compose(
          new THREE.Vector3(Math.cos(ang) * (bLen * 0.24), yOff, Math.sin(ang) * (bLen * 0.24)),
          q,
          new THREE.Vector3(0.92 + rand() * 0.18, 0.92 + rand() * 0.18, 1)
        );
        card.applyMatrix4(m);
        leafParts.push(normalizeGeoForMerge(card));
        card.dispose();
      }
    }
  });

  // Irregular curved crown tuft at apex
  for (let c = 0; c < 4; c++) {
    const topCard = buildCurvedFoliageCard(1.5, 2.2, 0.22, 0.18, 2, 2);
    topCard.rotateX(0.18);
    topCard.rotateY((c / 4) * Math.PI * 2 + 0.3);
    topCard.translate(0, 10.1, 0);
    leafParts.push(normalizeGeoForMerge(topCard));
    topCard.dispose();
  }

  const foliageGeo = applySphericalCanopyNormalsAndAO(
    mergeGeometries(leafParts, false)!,
    new THREE.Vector3(0, 6.2, 0),
    4.6,
    0.46,
    1.08
  );

  // Lightweight LOD1 Pine (1/5 vertex cost for distant sectors)
  const lodTrunkGeo = buildTaperedOrganicBranch(
    [new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0.05, 5.2, 0), new THREE.Vector3(0, 10.4, 0)],
    0.34,
    0.05,
    3,
    5
  );
  const lodLeaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const y = 3.2 + i * 2.1;
    const w = 4.6 - i * 0.85;
    for (let k = 0; k < 2; k++) {
      const p = buildCurvedFoliageCard(w, 2.6, 0.3, 0.2, 1, 2);
      p.rotateY(k * Math.PI * 0.5 + i * 0.6);
      p.translate(0, y, 0);
      lodLeaves.push(normalizeGeoForMerge(p));
      p.dispose();
    }
  }
  const lodFoliageGeo = applySphericalCanopyNormalsAndAO(
    mergeGeometries(lodLeaves, false)!,
    new THREE.Vector3(0, 6.2, 0),
    4.6,
    0.55,
    1.05
  );

  return {
    trunkGeo: mergeGeometries(woodParts, false)!,
    foliageGeo,
    lodTrunkGeo,
    lodFoliageGeo,
  };
}

/**
 * SPECIES 2: Gnarled Steppe Olive / Oak Broadleaf Tree (curved forked trunk + cupped volumetric crown).
 */
function buildOrganicOakGeometries(): {
  trunkGeo: THREE.BufferGeometry;
  foliageGeo: THREE.BufferGeometry;
  lodTrunkGeo: THREE.BufferGeometry;
  lodFoliageGeo: THREE.BufferGeometry;
} {
  const rand = seededRand(9202);
  const woodParts: THREE.BufferGeometry[] = [];
  const leafParts: THREE.BufferGeometry[] = [];

  // Twisted, gnarled curved oak trunk with strong root flare
  const mainSpine = [
    new THREE.Vector3(0, -0.25, 0),
    new THREE.Vector3(0.18, 1.1, -0.1),
    new THREE.Vector3(-0.08, 2.4, 0.14),
    new THREE.Vector3(0.04, 3.3, 0.04),
  ];
  woodParts.push(buildTaperedOrganicBranch(mainSpine, 0.4, 0.22, 7, 7, 0.6));

  // 5 crooked spreading primary limbs + forked secondary twigs + cupped multi-angle leaf dome clusters
  const boughs = [
    { ang: 0.18, reach: 2.8, topY: 5.2, baseY: 2.4 },
    { ang: 1.52, reach: 3.1, topY: 5.5, baseY: 2.6 },
    { ang: 2.88, reach: 2.65, topY: 4.9, baseY: 2.3 },
    { ang: 4.18, reach: 2.95, topY: 5.4, baseY: 2.7 },
    { ang: 5.38, reach: 2.3, topY: 6.0, baseY: 2.9 },
  ];

  for (const b of boughs) {
    const midX = Math.cos(b.ang) * b.reach * 0.52 + (rand() - 0.5) * 0.35;
    const midZ = Math.sin(b.ang) * b.reach * 0.52 + (rand() - 0.5) * 0.35;
    const tipX = Math.cos(b.ang) * b.reach;
    const tipZ = Math.sin(b.ang) * b.reach;

    const limbPts = [
      new THREE.Vector3(0, b.baseY, 0),
      new THREE.Vector3(midX, (b.baseY + b.topY) * 0.52, midZ),
      new THREE.Vector3(tipX, b.topY, tipZ),
    ];
    woodParts.push(buildTaperedOrganicBranch(limbPts, 0.16, 0.045, 5, 5));

    // Forked secondary branchlet
    const forkAng = b.ang + (rand() > 0.5 ? 0.55 : -0.55);
    const subTipX = midX + Math.cos(forkAng) * 1.45;
    const subTipZ = midZ + Math.sin(forkAng) * 1.45;
    const subTopY = b.topY + 0.35;
    woodParts.push(
      buildTaperedOrganicBranch(
        [
          new THREE.Vector3(midX, (b.baseY + b.topY) * 0.52, midZ),
          new THREE.Vector3(subTipX, subTopY, subTipZ),
        ],
        0.09,
        0.03,
        3,
        4
      )
    );

    // Volumetric cupped 3D leaf clusters enveloping both limb tip & fork tip
    const clusterCenters = [
      new THREE.Vector3(tipX, b.topY, tipZ),
      new THREE.Vector3(subTipX, subTopY, subTipZ),
    ];
    for (const center of clusterCenters) {
      for (let k = 0; k < 4; k++) {
        const sz = 2.0 + rand() * 1.05;
        const card = buildCurvedFoliageCard(sz, sz * 0.92, 0.36, 0.32, 2, 2);
        card.translate(0, -sz * 0.4, 0);
        card.rotateX((rand() - 0.5) * 1.25);
        card.rotateY(rand() * Math.PI * 2);
        card.rotateZ((rand() - 0.5) * 0.95);
        card.translate(
          center.x + (rand() - 0.5) * 1.1,
          center.y + (rand() - 0.5) * 0.75,
          center.z + (rand() - 0.5) * 1.1
        );
        leafParts.push(normalizeGeoForMerge(card));
        card.dispose();
      }
    }
  }

  const foliageGeo = applySphericalCanopyNormalsAndAO(
    mergeGeometries(leafParts, false)!,
    new THREE.Vector3(0, 5.1, 0),
    3.9,
    0.48,
    1.08
  );

  // Lightweight LOD1 Oak
  const lodTrunkGeo = buildTaperedOrganicBranch(
    [new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0.1, 2.2, 0), new THREE.Vector3(0, 4.4, 0)],
    0.36,
    0.1,
    3,
    5
  );
  const lodLeaves: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const card = buildCurvedFoliageCard(5.4, 4.2, 0.4, 0.35, 1, 2);
    card.translate(0, -1.8, 0);
    card.rotateY((k / 4) * Math.PI);
    card.rotateX(0.22);
    card.translate(0, 5.0, 0);
    lodLeaves.push(normalizeGeoForMerge(card));
    card.dispose();
  }
  const lodFoliageGeo = applySphericalCanopyNormalsAndAO(
    mergeGeometries(lodLeaves, false)!,
    new THREE.Vector3(0, 5.0, 0),
    3.8,
    0.55,
    1.04
  );

  return {
    trunkGeo: mergeGeometries(woodParts, false)!,
    foliageGeo,
    lodTrunkGeo,
    lodFoliageGeo,
  };
}

/**
 * SPECIES 3: Desert Oasis Date Palm (leaning curved ringed trunk + 14 gracefully arched 3D pinnate fronds!).
 * Directly inspired by the user's Desert Outpost oasis reference photo.
 */
function buildDesertPalmGeometries(): {
  trunkGeo: THREE.BufferGeometry;
  foliageGeo: THREE.BufferGeometry;
  lodFoliageGeo: THREE.BufferGeometry;
} {
  const rand = seededRand(8521);

  // Gracefully sweeping curved ringed palm trunk
  const palmSpine = [
    new THREE.Vector3(0, -0.25, 0),
    new THREE.Vector3(0.45, 2.4, 0.15),
    new THREE.Vector3(1.1, 5.2, 0.35),
    new THREE.Vector3(1.42, 7.8, 0.42),
    new THREE.Vector3(1.5, 9.2, 0.4),
  ];
  const trunkGeo = buildTaperedOrganicBranch(palmSpine, 0.31, 0.18, 14, 7, 0.32, 0.018);

  const crown = palmSpine[palmSpine.length - 1];
  const frondParts: THREE.BufferGeometry[] = [];
  const lodFrondParts: THREE.BufferGeometry[] = [];

  // Helper: Builds a genuinely arched 3D parabolic palm frond strip (6 lengthwise segments x 2 width segments)
  const makeArchedPalmFrond = (len: number, width: number, archHeight: number, tipDrop: number, segsL: number) => {
    const geo = new THREE.PlaneGeometry(width, len, 2, segsL);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const t = THREE.MathUtils.clamp((y + len * 0.5) / len, 0, 1); // 0 at crown stem -> 1 at outer tip
      const nx = THREE.MathUtils.clamp(Math.abs(x) / (width * 0.5), 0, 1);
      // Graceful parabolic fountain arc: rises from crown, peaks mid-frond, droops elegantly at tip!
      const forward = t * len;
      const up = Math.sin(t * Math.PI * 0.82) * archHeight - Math.pow(t, 2.3) * tipDrop - nx * 0.18;
      pos.setXYZ(i, x, up, -forward);
    }
    geo.computeVertexNormals();
    return geo;
  };

  // 2 tiers of arching fronds: lower drooping mature tier (8 fronds) + upper rising young crown tier (6 fronds)
  const tiers = [
    { count: 8, len: 3.9, width: 1.55, archH: 1.15, drop: 2.35, yOff: -0.15 },
    { count: 6, len: 3.1, width: 1.32, archH: 1.85, drop: 1.25, yOff: 0.12 },
  ];

  tiers.forEach((tier, tIdx) => {
    for (let i = 0; i < tier.count; i++) {
      const ang = (i / tier.count) * Math.PI * 2 + tIdx * 0.45 + (rand() - 0.5) * 0.22;
      const fLen = tier.len * (0.9 + rand() * 0.22);
      const frond = makeArchedPalmFrond(fLen, tier.width, tier.archH, tier.drop, 6);
      frond.rotateZ((rand() - 0.5) * 0.22);
      frond.rotateY(ang);
      frond.translate(crown.x, crown.y + tier.yOff, crown.z);
      frondParts.push(normalizeGeoForMerge(frond));
      frond.dispose();

      // Half count & fewer segments for distant LOD1
      if (i % 2 === 0) {
        const lodF = makeArchedPalmFrond(fLen, tier.width * 1.15, tier.archH, tier.drop, 3);
        lodF.rotateY(ang);
        lodF.translate(crown.x, crown.y + tier.yOff, crown.z);
        lodFrondParts.push(normalizeGeoForMerge(lodF));
        lodF.dispose();
      }
    }
  });

  const foliageGeo = applySphericalCanopyNormalsAndAO(
    mergeGeometries(frondParts, false)!,
    crown.clone().add(new THREE.Vector3(0, 0.3, 0)),
    3.8,
    0.58,
    1.1
  );
  const lodFoliageGeo = applySphericalCanopyNormalsAndAO(
    mergeGeometries(lodFrondParts, false)!,
    crown.clone().add(new THREE.Vector3(0, 0.3, 0)),
    3.8,
    0.62,
    1.08
  );

  return { trunkGeo, foliageGeo, lodFoliageGeo };
}

/**
 * SPECIES 4: Organic Multi-Layer Arid Desert Sagebrush / Scrub (cupped 3D foliage clusters + spherical canopy normals).
 */
function buildOrganicShrubGeometry(): THREE.BufferGeometry {
  const rand = seededRand(6123);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const rad = i < 3 ? 0.14 : 0.42 + rand() * 0.25;
    const w = 1.15 + rand() * 0.55;
    const h = 0.95 + rand() * 0.45;
    const card = buildCurvedFoliageCard(w, h, 0.28, 0.26, 2, 2);
    card.rotateX(0.32 + (rand() - 0.5) * 0.35);
    card.rotateY(ang);
    card.rotateZ((rand() - 0.5) * 0.4);
    card.translate(Math.cos(ang) * rad, 0.04 + (i < 3 ? 0.22 : 0.0), Math.sin(ang) * rad);
    parts.push(normalizeGeoForMerge(card));
    card.dispose();
  }
  return applySphericalCanopyNormalsAndAO(
    mergeGeometries(parts, false)!,
    new THREE.Vector3(0, 0.55, 0),
    1.25,
    0.46,
    1.06
  );
}

/**
 * TRUE 3D CURVED INDIVIDUAL GRASS BLADE CLUMP (ZERO crossed flat rectangles!).
 * 16 curved tapering arched blades + wispy steppe tones with smooth root-to-tip AO & backlit glow!
 */
function build3DCurvedGrassTuftGeometry(): THREE.BufferGeometry {
  const rand = seededRand(6303);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const bladeCount = 16;
  const segs = 4; // Smooth 4-segment natural parabolic arc per blade
  let vertOffset = 0;

  for (let b = 0; b < bladeCount; b++) {
    const spreadAng = (b / bladeCount) * Math.PI * 2 + (rand() - 0.5) * 0.45;
    const clumpR = Math.pow(rand(), 0.65) * 0.58;
    const bx = Math.cos(spreadAng) * clumpR;
    const bz = Math.sin(spreadAng) * clumpR;

    const faceAng = spreadAng + (rand() - 0.5) * 1.1;
    const cosF = Math.cos(faceAng);
    const sinF = Math.sin(faceAng);
    // Blade tangent (width axis) & bend direction
    const rightX = -sinF;
    const rightZ = cosF;

    const bladeH = 0.46 + rand() * 0.56;
    const baseW = 0.036 + rand() * 0.034;
    const bendAmt = 0.14 + rand() * 0.34;
    const leanDirX = cosF;
    const leanDirZ = sinF;

    // Olive-khaki to warm sunlit straw hue variation per blade
    const dryRoll = rand();
    const baseR = THREE.MathUtils.lerp(0.24, 0.46, dryRoll);
    const baseG = THREE.MathUtils.lerp(0.28, 0.41, dryRoll);
    const baseB = THREE.MathUtils.lerp(0.11, 0.16, dryRoll);

    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const w = baseW * Math.pow(Math.max(0, 1.0 - t), 0.85); // Tapering to sharp natural blade point!
      const y = bladeH * (t - 0.14 * t * t * t);
      const arch = bendAmt * t * t;
      const cx = bx + leanDirX * arch;
      const cz = bz + leanDirZ * arch;

      // Ground-contact AO at root -> sunlit bright golden tips
      const ao = THREE.MathUtils.lerp(0.36, 1.18, Math.pow(Math.max(0, t), 0.72));
      const cr = Math.min(1.15, baseR * ao * (1 + t * 0.35));
      const cg = Math.min(1.12, baseG * ao * (1 + t * 0.22));
      const cb = Math.min(0.85, baseB * ao * (1 + t * 0.12));

      // Upward-biased smooth normal catches low golden sunlight naturally without harsh side flips
      const nx = leanDirX * 0.35;
      const ny = 0.92;
      const nz = leanDirZ * 0.35;

      if (s === segs) {
        // Pointed blade apex vertex
        positions.push(cx, y, cz);
        normals.push(nx, ny, nz);
        uvs.push(0.5, 1.0);
        colors.push(cr, cg, cb);
      } else {
        positions.push(cx - rightX * w, y, cz - rightZ * w);
        normals.push(nx, ny, nz);
        uvs.push(0.0, t);
        colors.push(cr, cg, cb);

        positions.push(cx + rightX * w, y, cz + rightZ * w);
        normals.push(nx, ny, nz);
        uvs.push(1.0, t);
        colors.push(cr, cg, cb);
      }
    }

    for (let s = 0; s < segs; s++) {
      if (s < segs - 1) {
        const i0 = vertOffset + s * 2;
        const i1 = i0 + 1;
        const i2 = i0 + 2;
        const i3 = i0 + 3;
        indices.push(i0, i1, i2, i1, i3, i2);
      } else {
        const i0 = vertOffset + s * 2;
        const i1 = i0 + 1;
        const tip = vertOffset + segs * 2;
        indices.push(i0, i1, tip);
      }
    }

    vertOffset += segs * 2 + 1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  return geo;
}

/**
 * Sculpted asymmetrical geological boulder helper using planar fracture cleavage + sedimentary strata.
 */
function sculptGeologicalRockMesh(
  radius: number,
  seed: number,
  sx: number,
  sy: number,
  sz: number,
  offsetX = 0,
  offsetY = 0,
  offsetZ = 0
): THREE.BufferGeometry {
  const rand = seededRand(seed);
  const geo = new THREE.IcosahedronGeometry(radius, 3);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // Generate 7 random geological cleavage planes to carve angular natural stone faces!
  const planes: { n: THREE.Vector3; d: number }[] = [];
  for (let p = 0; p < 7; p++) {
    const n = new THREE.Vector3(rand() * 2 - 1, rand() * 1.4 - 0.4, rand() * 2 - 1).normalize();
    planes.push({ n, d: radius * (0.58 + rand() * 0.36) });
  }

  const v = new THREE.Vector3();
  const colors = new Float32Array(pos.count * 3);
  const p1 = rand() * 10;
  const p2 = rand() * 10;

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);

    // Apply cleavage plane flattening for sharp natural rock facets
    for (const pl of planes) {
      const proj = v.dot(pl.n);
      if (proj > pl.d) {
        v.addScaledVector(pl.n, -(proj - pl.d) * 0.72);
      }
    }

    // Ridged strata ledges & micro-fractures
    const strata = Math.sin(v.y * 5.8 + v.x * 1.4 + p1) * 0.085;
    const ridge = (1 - Math.abs(Math.sin(v.x * 3.4 + p2) * Math.cos(v.z * 3.1 - p1))) * 0.14;
    const crag = Math.sin(v.x * 7.2 - v.y * 5.5 + v.z * 6.4) * 0.045;
    v.multiplyScalar(0.92 + strata + ridge + crag);

    v.set(v.x * sx, v.y * sy, v.z * sz);
    // Heavily flatten bottom so boulders embed solidly into dirt/sand
    if (v.y < -0.18 * radius * sy) {
      v.y = -0.18 * radius * sy + (v.y + 0.18 * radius * sy) * 0.25;
    }

    // Subtle crevice & ground-contact AO vertex tint
    const hT = THREE.MathUtils.clamp((v.y / (radius * sy) + 0.4) * 0.85, 0.48, 1.08);
    colors[i * 3] = hT;
    colors[i * 3 + 1] = hT * 0.99;
    colors[i * 3 + 2] = hT * 0.96;

    pos.setXYZ(i, v.x + offsetX, v.y + offsetY, v.z + offsetZ);
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return normalizeGeoForMerge(geo);
}

/**
 * Rock Variant 1: Natural 3-stone weathered boulder cluster (dominant tilted boulder + 2 embedded scree stones).
 */
function buildCraggyBoulderClusterGeometry(): THREE.BufferGeometry {
  const main = sculptGeologicalRockMesh(1.15, 3101, 1.25, 0.74, 1.05, 0, 0.15, 0);
  const sideA = sculptGeologicalRockMesh(0.68, 3209, 1.15, 0.62, 0.95, 0.88, -0.04, 0.42);
  const sideB = sculptGeologicalRockMesh(0.52, 3317, 0.95, 0.56, 1.15, -0.78, -0.08, -0.45);
  return mergeGeometries([main, sideA, sideB], false)!;
}

/**
 * Rock Variant 2: Layered angular canyon rock outcrop (stratified slabs & stepped ledges).
 */
function buildStratifiedOutcropGeometry(): THREE.BufferGeometry {
  const slabBase = sculptGeologicalRockMesh(1.55, 4401, 1.55, 0.58, 1.15, 0, 0.1, 0);
  const upperLedge = sculptGeologicalRockMesh(1.05, 4519, 1.25, 0.75, 0.88, -0.35, 0.65, 0.18);
  const flankStone = sculptGeologicalRockMesh(0.66, 4637, 1.0, 0.68, 1.1, 1.15, 0.02, -0.38);
  return mergeGeometries([slabBase, upperLedge, flankStone], false)!;
}

/**
 * Injects organic gust wind sway + backlit solar subsurface translucency + optional smooth distance fade
 * into Three.js MeshStandardMaterial while preserving full PBR lighting, shadows, GTAO & fog!
 */
function injectOrganicFoliageShader(
  mat: THREE.MeshStandardMaterial,
  windTimeUniform: { value: number },
  sunDirUniform: { value: THREE.Vector3 },
  opts: {
    swayAmp: number;
    swayFreq: number;
    hStart: number;
    hEnd: number;
    translucency: number;
    transColor: THREE.Color;
    fadeStart?: number;
    fadeEnd?: number;
    cacheId: string;
  }
) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTimeUniform;
    shader.uniforms.uSunDir = sunDirUniform;
    shader.uniforms.uTransColor = { value: opts.transColor };

    const hasFade = typeof opts.fadeStart === 'number' && typeof opts.fadeEnd === 'number';

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWindTime;
        varying vec3 vFoliageWorldPos;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float wMask = smoothstep(${opts.hStart.toFixed(2)}, ${opts.hEnd.toFixed(2)}, position.y);
         #ifdef USE_INSTANCING
           vec3 instP = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
         #else
           vec3 instP = vec3(0.0);
         #endif
         float ph = uWindTime * ${opts.swayFreq.toFixed(2)} + instP.x * 0.08 + instP.z * 0.06;
         float gust = sin(ph) * 0.62 + sin(ph * 1.95 + 1.3) * 0.28 + sin(ph * 3.7 + position.x * 2.1) * 0.1;
         transformed.x += gust * ${opts.swayAmp.toFixed(3)} * wMask;
         transformed.z += cos(ph * 0.88 + 0.5) * ${(opts.swayAmp * 0.65).toFixed(3)} * wMask;
         ${
           hasFade
             ? `float camD = length(cameraPosition - instP);
                float distShrink = 1.0 - smoothstep(${opts.fadeStart!.toFixed(1)}, ${opts.fadeEnd!.toFixed(1)}, camD);
                transformed *= distShrink;`
             : ''
         }`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        #ifdef USE_INSTANCING
          vFoliageWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vFoliageWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDir;
        uniform vec3 uTransColor;
        varying vec3 vFoliageWorldPos;`
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // Physically inspired backlit subsurface translucency through living leaves & grass blades
        vec3 fViewDir = normalize(cameraPosition - vFoliageWorldPos);
        float backLight = pow(clamp(dot(fViewDir, -normalize(uSunDir)), 0.0, 1.0), 3.0);
        float sunUp = smoothstep(-0.05, 0.15, uSunDir.y);
        reflectedLight.directDiffuse += diffuseColor.rgb * uTransColor * backLight * ${opts.translucency.toFixed(2)} * sunUp;`
      );
  };
  mat.customProgramCacheKey = () => `wildlands_foliage_aaa_${opts.cacheId}`;
}

export function createOrganicVegetationAssets(
  mats: ProceduralMaterials,
  windTimeUniform: { value: number },
  sunDirUniform: { value: THREE.Vector3 }
): OrganicVegetationAssets {
  const pine = buildOrganicPineGeometries();
  const oak = buildOrganicOakGeometries();
  const palm = buildDesertPalmGeometries();
  const shrubGeo = buildOrganicShrubGeometry();
  const dryGrassGeo = build3DCurvedGrassTuftGeometry();
  const craggyRockGeo = buildCraggyBoulderClusterGeometry();
  const rockOutcropGeo = buildStratifiedOutcropGeometry();

  const barkTex = createBarkTexture(false);
  const palmBarkTex = createBarkTexture(true);
  const pineBoughTex = createPineBoughTexture();
  const broadleafTex = createBroadleafClusterTexture();
  const palmFrondTex = createPalmFrondTexture();

  const pineBarkMat = new THREE.MeshStandardMaterial({
    map: barkTex,
    normalMap: mats.terrainSplat.rockNormalHeight,
    normalScale: new THREE.Vector2(0.85, 0.85),
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.0,
  });

  const palmBarkMat = new THREE.MeshStandardMaterial({
    map: palmBarkTex,
    normalMap: mats.terrainSplat.rockNormalHeight,
    normalScale: new THREE.Vector2(0.95, 0.95),
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.0,
  });

  const pineNeedleMat = new THREE.MeshStandardMaterial({
    map: pineBoughTex,
    alphaTest: 0.34,
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.0,
  });
  injectOrganicFoliageShader(pineNeedleMat, windTimeUniform, sunDirUniform, {
    swayAmp: 0.24,
    swayFreq: 1.5,
    hStart: 2.2,
    hEnd: 11.0,
    translucency: 0.58,
    transColor: new THREE.Color(0x98b552),
    cacheId: 'pine_v2',
  });

  const oakLeafMat = new THREE.MeshStandardMaterial({
    map: broadleafTex,
    alphaTest: 0.36,
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.0,
  });
  injectOrganicFoliageShader(oakLeafMat, windTimeUniform, sunDirUniform, {
    swayAmp: 0.22,
    swayFreq: 1.75,
    hStart: 2.0,
    hEnd: 6.5,
    translucency: 0.72,
    transColor: new THREE.Color(0xb6be54),
    cacheId: 'oak_v2',
  });

  const palmFrondMat = new THREE.MeshStandardMaterial({
    map: palmFrondTex,
    alphaTest: 0.34,
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.0,
  });
  injectOrganicFoliageShader(palmFrondMat, windTimeUniform, sunDirUniform, {
    swayAmp: 0.34,
    swayFreq: 1.35,
    hStart: 6.5,
    hEnd: 11.2,
    translucency: 0.88,
    transColor: new THREE.Color(0xc9b44e),
    cacheId: 'palm_v2',
  });

  const shrubMat = new THREE.MeshStandardMaterial({
    map: broadleafTex,
    alphaTest: 0.38,
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.0,
  });
  injectOrganicFoliageShader(shrubMat, windTimeUniform, sunDirUniform, {
    swayAmp: 0.12,
    swayFreq: 2.1,
    hStart: 0.1,
    hEnd: 1.25,
    translucency: 0.62,
    transColor: new THREE.Color(0xb4ad54),
    fadeStart: 135,
    fadeEnd: 175,
    cacheId: 'shrub_v2',
  });

  // 3D Individual Curved Grass Blades with smooth distance shrink fade & warm backlit sun translucency!
  const dryGrassMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.88,
    metalness: 0.0,
  });
  injectOrganicFoliageShader(dryGrassMat, windTimeUniform, sunDirUniform, {
    swayAmp: 0.2,
    swayFreq: 2.45,
    hStart: 0.05,
    hEnd: 0.92,
    translucency: 1.15,
    transColor: new THREE.Color(0xd9b85c),
    fadeStart: 76,
    fadeEnd: 112,
    cacheId: 'grass3d_v2',
  });

  // Stratified natural geological boulder material powered by Phase 2 rock PBR maps!
  const boulderMat = new THREE.MeshStandardMaterial({
    color: 0xb8b0a2,
    map: mats.terrainSplat.rockAlbedoRough,
    normalMap: mats.terrainSplat.rockNormalHeight,
    normalScale: new THREE.Vector2(1.55, 1.55),
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
  });

  return {
    pineTrunkGeo: pine.trunkGeo,
    pineFoliageGeo: pine.foliageGeo,
    oakTrunkGeo: oak.trunkGeo,
    oakFoliageGeo: oak.foliageGeo,
    palmTrunkGeo: palm.trunkGeo,
    palmFoliageGeo: palm.foliageGeo,
    shrubGeo,
    dryGrassGeo,
    craggyRockGeo,
    rockOutcropGeo,
    pineLodTrunkGeo: pine.lodTrunkGeo,
    pineLodFoliageGeo: pine.lodFoliageGeo,
    oakLodTrunkGeo: oak.lodTrunkGeo,
    oakLodFoliageGeo: oak.lodFoliageGeo,
    palmLodFoliageGeo: palm.lodFoliageGeo,
    pineBarkMat,
    palmBarkMat,
    pineNeedleMat,
    oakLeafMat,
    palmFrondMat,
    shrubMat,
    dryGrassMat,
    boulderMat,
    dispose: () => {
      pine.trunkGeo.dispose();
      pine.foliageGeo.dispose();
      pine.lodTrunkGeo.dispose();
      pine.lodFoliageGeo.dispose();
      oak.trunkGeo.dispose();
      oak.foliageGeo.dispose();
      oak.lodTrunkGeo.dispose();
      oak.lodFoliageGeo.dispose();
      palm.trunkGeo.dispose();
      palm.foliageGeo.dispose();
      palm.lodFoliageGeo.dispose();
      shrubGeo.dispose();
      dryGrassGeo.dispose();
      craggyRockGeo.dispose();
      rockOutcropGeo.dispose();
      barkTex.dispose();
      palmBarkTex.dispose();
      pineBoughTex.dispose();
      broadleafTex.dispose();
      palmFrondTex.dispose();
      pineBarkMat.dispose();
      palmBarkMat.dispose();
      pineNeedleMat.dispose();
      oakLeafMat.dispose();
      palmFrondMat.dispose();
      shrubMat.dispose();
      dryGrassMat.dispose();
      boulderMat.dispose();
    },
  };
}

/**
 * Aerodynamic Sculpted Military Patrol Helicopter (beveled ExtrudeGeometry hull, swept tail fin, curved cockpit).
 */
export function buildPatrolHelicopterModel(mats: ProceduralMaterials): {
  group: THREE.Group;
  mainRotor: THREE.Group;
  tailRotor: THREE.Group;
} {
  const group = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x3b4238,
    map: mats.camoVehicleMap,
    normalMap: mats.camoVehicleNormal,
    roughness: 0.52,
    metalness: 0.46,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.38, metalness: 0.76 });

  // Aerodynamic sculpted side profile fuselage via ExtrudeGeometry with bevels (NO raw boxes!)
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-4.8, -0.45); // pointed aerodynamic nose
  bodyShape.quadraticCurveTo(-3.9, 0.55, -2.5, 0.95); // sloped cockpit windshield
  bodyShape.lineTo(1.6, 1.05); // cabin roof
  bodyShape.quadraticCurveTo(3.2, 0.85, 4.1, 0.25); // rear taper into tail boom
  bodyShape.lineTo(3.4, -0.78); // rear belly ramp
  bodyShape.lineTo(-2.6, -0.95); // lower cabin keel
  bodyShape.quadraticCurveTo(-4.2, -0.88, -4.8, -0.45);

  const hullGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 1.9,
    bevelEnabled: true,
    bevelThickness: 0.28,
    bevelSize: 0.22,
    bevelSegments: 3,
  });
  hullGeo.translate(0, 0, -0.95);
  hullGeo.rotateY(Math.PI * 0.5); // Align nose toward -Z
  const fuselage = new THREE.Mesh(hullGeo, hullMat);

  // Curved tinted armored cockpit glazing
  const canopyShape = new THREE.Shape();
  canopyShape.moveTo(-4.1, -0.1);
  canopyShape.quadraticCurveTo(-3.4, 0.68, -2.2, 0.92);
  canopyShape.lineTo(-1.8, 0.05);
  canopyShape.closePath();
  const canopyGeo = new THREE.ExtrudeGeometry(canopyShape, {
    depth: 1.85,
    bevelEnabled: true,
    bevelThickness: 0.14,
    bevelSize: 0.1,
    bevelSegments: 2,
  });
  canopyGeo.translate(0, 0, -0.925);
  canopyGeo.rotateY(Math.PI * 0.5);
  const cockpit = new THREE.Mesh(canopyGeo, mats.glassTinted);

  // Twin rounded turbine cowling nacelles on roof
  for (const side of [-0.46, 0.46]) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 3.2, 10), darkMat);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(side, 1.32, 0.1);
    group.add(nacelle);
  }

  // Tapered tubular tail boom + swept vertical fin + horizontal stabilizers
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.54, 7.6, 10), hullMat);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 0.35, 6.7);

  const finShape = new THREE.Shape();
  finShape.moveTo(0, -0.2);
  finShape.lineTo(1.25, -0.2);
  finShape.lineTo(1.85, 2.05);
  finShape.lineTo(0.85, 2.05);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  finGeo.translate(-0.7, 0, -0.07);
  finGeo.rotateY(Math.PI * 0.5);
  const vFin = new THREE.Mesh(finGeo, hullMat);
  vFin.position.set(0, 0.25, 9.7);

  const hFin = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.1, 0.62), hullMat);
  hFin.position.set(0, 0.35, 9.0);

  // Landing skids with angled curved struts
  for (const side of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 6.4, 8), darkMat);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(side * 1.45, -1.55, -0.4);
    const strutF = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.15, 8), darkMat);
    strutF.position.set(side * 1.12, -1.12, -1.9);
    strutF.rotation.z = side * -0.45;
    const strutR = strutF.clone();
    strutR.position.z = 1.4;
    group.add(skid, strutF, strutR);
  }

  // Main 4-blade swept rotor assembly
  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 2.15, -0.2);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.65, 10), darkMat);
  mainRotor.add(hub);
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 7.1), darkMat);
    blade.rotation.y = (i / 4) * Math.PI * 2;
    blade.translateZ(3.55);
    mainRotor.add(blade);
  }

  // Tail rotor
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.32, 1.5, 10.35);
  for (let i = 0; i < 2; i++) {
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.035, 2.2, 0.18), darkMat);
    tb.rotation.x = (i / 2) * Math.PI;
    tailRotor.add(tb);
  }

  // Anti-collision strobe beacon
  const strobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3b2f })
  );
  strobe.position.set(0, 2.38, 10.35);

  group.add(fuselage, cockpit, boom, vFin, hFin, mainRotor, tailRotor, strobe);
  return { group, mainRotor, tailRotor };
}
