import * as THREE from 'three';
import { ROAD_NETWORK, WORLD_HALF_SIZE } from '../data/worldConfig';
import { ProceduralMaterials } from './TextureLibrary';

function hash2D(ix: number, iz: number): number {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2D(ix, iz);
  const b = hash2D(ix + 1, iz);
  const c = hash2D(ix, iz + 1);
  const d = hash2D(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x: number, z: number, octaves = 4): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * (valueNoise(x * freq, z * freq) * 2 - 1);
    freq *= 2.02;
    amp *= 0.5;
  }
  return value;
}

function ridgedFbm(x: number, z: number, octaves = 4): number {
  let value = 0;
  let amp = 0.52;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    const n = 1.0 - Math.abs(valueNoise(x * freq, z * freq) * 2 - 1);
    value += amp * n * n;
    freq *= 2.08;
    amp *= 0.48;
  }
  return value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function distToSegment(px: number, pz: number, x1: number, z1: number, x2: number, z2: number): number {
  const vx = x2 - x1;
  const vz = z2 - z1;
  const wx = px - x1;
  const wz = pz - z1;
  const c1 = vx * wx + vz * wz;
  if (c1 <= 0) return Math.hypot(px - x1, pz - z1);
  const c2 = vx * vx + vz * vz;
  if (c2 <= c1) return Math.hypot(px - x2, pz - z2);
  const b = c1 / c2;
  return Math.hypot(px - (x1 + b * vx), pz - (z1 + b * vz));
}

export type SurfaceType = 'concrete' | 'asphalt' | 'sand' | 'grass' | 'rock' | 'dirt' | 'metal';

const ALL_ROAD_SEGMENTS = [
  ...ROAD_NETWORK,
  { x1: 310, z1: 35, x2: 382, z2: -36, width: 9, kind: 'dirt' as const },
];

export class TerrainManager {
  private sharedTerrainMat: THREE.MeshStandardMaterial | null = null;
  private sharedMountainMat: THREE.MeshStandardMaterial | null = null;

  public isInsideUndergroundVault(x: number, z: number): boolean {
    return x >= 68 && x <= 122 && z >= -146 && z <= -106;
  }

  public isInsideUndergroundRamp(x: number, z: number): boolean {
    return x >= 88 && x <= 102 && z >= -106 && z <= -74;
  }

  public getSurfaceHeightAt(x: number, z: number): number {
    // Natural rolling highland steppe terrain with subtle terrain breaks, gullies & ridges
    let h =
      fbm(x * 0.0036, z * 0.0036, 4) * 15 +
      fbm(x * 0.013, z * 0.013, 3) * 2.6 +
      (valueNoise(x * 0.045, z * 0.045) - 0.5) * 0.62;

    // 1. Blacksite Military Complex (flat central industrial plateau around 0,0)
    const distBlacksite = Math.hypot(x, z);
    const blacksiteFlat = 1 - smoothstep(145, 235, distBlacksite);
    h = THREE.MathUtils.lerp(h, 0.0, blacksiteFlat);

    // 2. Abandoned City (flat urban plateau north around -40, -410)
    const distCity = Math.hypot(x + 40, z + 410);
    const cityFlat = 1 - smoothstep(125, 200, distCity);
    h = THREE.MathUtils.lerp(h, 4.0, cityFlat);

    // 3. Industrial Valley (west basin around -390, -60)
    const distInd = Math.hypot(x + 390, z + 60);
    const indFlat = 1 - smoothstep(125, 205, distInd);
    h = THREE.MathUtils.lerp(h, -1.5, indFlat);

    // 4. Desert Outpost (east arid plateau around 400, -80 — flat base pad ringed by wind-swept dunes & ridges!)
    const distDesert = Math.hypot(x - 400, z + 80);
    const desertInfluence = 1 - smoothstep(150, 290, distDesert);
    const windWarp = fbm(x * 0.008, z * 0.008, 3) * 14.0;
    const duneRidge = Math.sin((x * 0.025 + z * 0.015) + windWarp * 0.14);
    const dunes = (duneRidge + 0.28 * Math.sin(duneRidge * 2.0)) * 3.1 + fbm(x * 0.009, z * 0.009, 3) * 4.5;
    const desertBasePad = 1 - smoothstep(80, 140, distDesert);
    h = THREE.MathUtils.lerp(h, 5.5 + dunes * (1 - desertBasePad), desertInfluence);

    // 5. Mountain Range (dramatic alpine peaks NE & NW)
    const distMtnNE = Math.hypot(x - 350, z + 430);
    const mtnInfluence = 1 - smoothstep(95, 290, distMtnNE);
    const ridge = ridgedFbm(x * 0.0065, z * 0.0065, 4) * 52 + 18;
    const radarPlateau = 1 - smoothstep(26, 65, Math.hypot(x - 340, z + 420));
    const mtnH = THREE.MathUtils.lerp(ridge, 28, radarPlateau);
    h = THREE.MathUtils.lerp(h, mtnH, mtnInfluence);

    const distMtnNW = Math.hypot(x + 430, z + 440);
    const mtnNW = 1 - smoothstep(80, 260, distMtnNW);
    h = THREE.MathUtils.lerp(h, 36 + ridgedFbm(x * 0.0085, z * 0.0085, 3) * 32, mtnNW);

    // 6. Rural Settlement (rolling farmland SW around -340, 340)
    const distRural = Math.hypot(x + 340, z - 340);
    const ruralFlat = 1 - smoothstep(115, 210, distRural);
    h = THREE.MathUtils.lerp(h, 2.5 + Math.sin(x * 0.015) * 1.2, ruralFlat);

    // 7. Natural Alpine Mountain Rim Perimeter beyond playable zone
    const edgeDist = Math.max(Math.abs(x), Math.abs(z));
    if (edgeDist > WORLD_HALF_SIZE - 95) {
      const rimT = smoothstep(WORLD_HALF_SIZE - 95, WORLD_HALF_SIZE + 115, edgeDist);
      const crags = 48 + ridgedFbm(x * 0.009, z * 0.009, 4) * 85;
      h += rimT * crags;
    }

    // Smoothly grade roads so vehicles drive effortlessly
    for (let i = 0; i < ROAD_NETWORK.length; i++) {
      const seg = ROAD_NETWORK[i];
      const d = distToSegment(x, z, seg.x1, seg.z1, seg.x2, seg.z2);
      if (d < seg.width + 6) {
        const blend = 1 - smoothstep(seg.width * 0.5, seg.width + 6, d);
        h = h * (1 - blend * 0.25);
      }
    }

    // 8. Dedicated Tactical Firing Range Plateau (south clearing centered at x = 0, z = 590)
    const rangeDx = Math.max(0, Math.abs(x) - 30);
    const rangeDz = Math.max(0, Math.abs(z - 590) - 68);
    const rangeDist = Math.hypot(rangeDx, rangeDz);
    if (rangeDist < 28) {
      const rangeFlat = 1 - smoothstep(0, 28, rangeDist);
      h = THREE.MathUtils.lerp(h, 2.0, rangeFlat);
    }

    return h;
  }

  public getHeightAt(x: number, z: number, currentY = 10): number {
    if (this.isInsideUndergroundRamp(x, z)) {
      const t = THREE.MathUtils.clamp((-74 - z) / 32, 0, 1);
      const surfaceStart = this.getSurfaceHeightAt(x, -74);
      return THREE.MathUtils.lerp(surfaceStart, -8.5, t);
    }
    if (this.isInsideUndergroundVault(x, z) && currentY < -2.0) {
      return -8.5;
    }
    return this.getSurfaceHeightAt(x, z);
  }

  public getNormalAt(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    const eps = 1.2;
    const hL = this.getSurfaceHeightAt(x - eps, z);
    const hR = this.getSurfaceHeightAt(x + eps, z);
    const hD = this.getSurfaceHeightAt(x, z - eps);
    const hU = this.getSurfaceHeightAt(x, z + eps);
    return out.set(hL - hR, 2 * eps, hD - hU).normalize();
  }

  public getSurfaceType(x: number, z: number, y = 0): SurfaceType {
    if (y < -2.2 && this.isInsideUndergroundVault(x, z)) return 'concrete';
    for (let i = 0; i < ALL_ROAD_SEGMENTS.length; i++) {
      const seg = ALL_ROAD_SEGMENTS[i];
      if (distToSegment(x, z, seg.x1, seg.z1, seg.x2, seg.z2) < seg.width * 0.55) {
        return seg.kind === 'asphalt' ? 'asphalt' : seg.kind === 'rail' ? 'metal' : 'dirt';
      }
    }
    if (Math.hypot(x, z) < 155) return 'concrete';
    if (Math.hypot(x - 400, z + 80) < 235) return 'sand';
    if (Math.hypot(x - 350, z + 430) < 210) return 'rock';
    if (Math.hypot(x + 40, z + 410) < 170) return 'asphalt';
    return 'grass';
  }

  public getBiomeColor(x: number, z: number, h: number, slopeY = 1, out = new THREE.Color()): THREE.Color {
    const soilPatch = smoothstep(-0.35, 0.45, fbm(x * 0.022, z * 0.022, 3));
    let r = THREE.MathUtils.lerp(0.28, 0.39, soilPatch);
    let g = THREE.MathUtils.lerp(0.29, 0.34, soilPatch);
    let b = THREE.MathUtils.lerp(0.17, 0.21, soilPatch);

    const blacksiteT = 1 - smoothstep(130, 185, Math.hypot(x, z));
    r = THREE.MathUtils.lerp(r, 0.31, blacksiteT);
    g = THREE.MathUtils.lerp(g, 0.31, blacksiteT);
    b = THREE.MathUtils.lerp(b, 0.28, blacksiteT);

    const desertDist = Math.hypot(x - 400, z + 80);
    const desertT = 1 - smoothstep(160, 310, desertDist);
    r = THREE.MathUtils.lerp(r, 0.48, desertT);
    g = THREE.MathUtils.lerp(g, 0.39, desertT);
    b = THREE.MathUtils.lerp(b, 0.24, desertT);

    const cliffT = smoothstep(0.93, 0.7, slopeY);
    const highRockT = Math.max(cliffT, smoothstep(18, 42, h));
    r = THREE.MathUtils.lerp(r, 0.26, highRockT);
    g = THREE.MathUtils.lerp(g, 0.26, highRockT);
    b = THREE.MathUtils.lerp(b, 0.27, highRockT);

    return out.setRGB(r, g, b);
  }

  /**
   * Computes physically motivated 6-material terrain splat weights + alpine snow & organic macro variation:
   * out0 = [sand, dirt, grass, rock], out1 = [concrete, asphalt, snow, macroVar]
   */
  private computeTerrainSplatWeights(
    x: number,
    z: number,
    h: number,
    slopeY: number,
    out0: [number, number, number, number],
    out1: [number, number, number, number]
  ) {
    // Organic boundary warp so biome transitions never look like rigid circles
    const borderNoise = fbm(x * 0.011, z * 0.011, 3) * 42.0;
    const patchNoise = fbm(x * 0.026, z * 0.026, 3);
    const microNoise = valueNoise(x * 0.065, z * 0.065);

    // Base wildlands balance: dry steppe grass mixed with patches of exposed compacted dirt
    const dryDirtPatch = smoothstep(-0.18, 0.48, patchNoise);
    let wGrass = 1.0 - dryDirtPatch * 0.65;
    let wDirt = dryDirtPatch * 0.65;
    let wSand = 0.0;
    let wRock = 0.0;
    let wConcrete = 0.0;
    let wAsphalt = 0.0;

    // 1. Rural Settlement SW: richer steppe grass meadows
    const ruralT = 1 - smoothstep(120, 240, Math.hypot(x + 340, z - 340) + borderNoise * 0.7);
    if (ruralT > 0.01) {
      wGrass = THREE.MathUtils.lerp(wGrass, 0.88, ruralT);
      wDirt = THREE.MathUtils.lerp(wDirt, 0.12, ruralT);
    }

    // 2. Desert Outpost East: sweeping wind-rippled sand dunes + dusty gravel compound courtyard
    const desertDist = Math.hypot(x - 400, z + 80);
    const desertT = 1 - smoothstep(165, 340, desertDist + borderNoise);
    if (desertT > 0.01) {
      const duneSandMix = smoothstep(-0.35, 0.25, patchNoise + 0.25);
      wSand = Math.max(wSand, desertT * (0.62 + duneSandMix * 0.38));
      wDirt = Math.max(wDirt, desertT * (1.0 - duneSandMix) * 0.42);
      wGrass *= 1.0 - desertT * 0.92;

      // Compacted military base pad inside Desert Outpost perimeter (dirt + weathered concrete apron)
      const padT = 1 - smoothstep(64, 96, desertDist + borderNoise * 0.25);
      if (padT > 0.01) {
        wDirt = THREE.MathUtils.lerp(wDirt, 0.58, padT);
        wConcrete = Math.max(wConcrete, padT * 0.42);
        wSand *= 1.0 - padT * 0.65;
      }
    }

    // 3. Blacksite Military Complex (Center): concrete tarmac slabs + dusty dirt edges
    const blacksiteDist = Math.hypot(x, z);
    const blacksiteT = 1 - smoothstep(118, 175, blacksiteDist + borderNoise * 0.35);
    if (blacksiteT > 0.01) {
      const tarmacWear = smoothstep(-0.3, 0.45, patchNoise);
      wConcrete = Math.max(wConcrete, blacksiteT * (0.72 + tarmacWear * 0.22));
      wAsphalt = Math.max(wAsphalt, blacksiteT * (1 - tarmacWear) * 0.22);
      wDirt = THREE.MathUtils.lerp(wDirt, 0.2, blacksiteT);
      wGrass *= 1.0 - blacksiteT * 0.94;
    }

    // 4. Abandoned City North: cracked urban asphalt + rubble concrete
    const cityT = 1 - smoothstep(115, 190, Math.hypot(x + 40, z + 410) + borderNoise * 0.35);
    if (cityT > 0.01) {
      const rubbleMix = smoothstep(-0.2, 0.35, patchNoise);
      wAsphalt = Math.max(wAsphalt, cityT * (0.58 + (1 - rubbleMix) * 0.28));
      wConcrete = Math.max(wConcrete, cityT * rubbleMix * 0.44);
      wDirt = Math.max(wDirt, cityT * 0.16);
      wGrass *= 1.0 - cityT * 0.85;
    }

    // 5. Industrial Valley West: compacted heavy grime dirt + concrete yards
    const indT = 1 - smoothstep(115, 215, Math.hypot(x + 390, z + 60) + borderNoise * 0.4);
    if (indT > 0.01) {
      wDirt = Math.max(wDirt, indT * 0.62);
      wConcrete = Math.max(wConcrete, indT * 0.38);
      wGrass *= 1.0 - indT * 0.8;
    }

    // 6. Road shoulders: blend asphalt or packed dirt track into surrounding soil seamlessly!
    for (let i = 0; i < ALL_ROAD_SEGMENTS.length; i++) {
      const seg = ALL_ROAD_SEGMENTS[i];
      const d = distToSegment(x, z, seg.x1, seg.z1, seg.x2, seg.z2);
      const shoulderRadius = seg.width * 1.15;
      if (d < shoulderRadius) {
        const coreT = 1 - smoothstep(seg.width * 0.42, seg.width * 0.72, d);
        const edgeT = 1 - smoothstep(seg.width * 0.5, shoulderRadius, d);
        if (seg.kind === 'asphalt') {
          wAsphalt = Math.max(wAsphalt, coreT * 0.92);
          wDirt = Math.max(wDirt, edgeT * 0.68);
        } else {
          wDirt = Math.max(wDirt, edgeT * 0.92);
        }
        wGrass *= 1.0 - edgeT * 0.88;
        wSand *= 1.0 - coreT * 0.72;
      }
    }

    // 7. Steep slopes & alpine elevation: exposed stratified granite rock!
    const slopeRock = smoothstep(0.92, 0.68, slopeY);
    const altRock = smoothstep(16, 40, h + patchNoise * 8);
    wRock = Math.max(slopeRock, altRock * 0.92);
    if (wRock > 0.01) {
      const suppress = 1.0 - wRock * 0.88;
      wGrass *= suppress;
      wSand *= suppress;
      wDirt *= 1.0 - wRock * 0.55;
      wConcrete *= suppress;
      wAsphalt *= suppress;
    }

    // 8. High-altitude alpine snow streaks (only on rocky summits > 42m)
    const wSnow = smoothstep(42, 68, h + microNoise * 12) * smoothstep(0.55, 0.88, slopeY);

    // Normalize the 6 PBR material weights so sum === 1.0
    const sum = wSand + wDirt + wGrass + wRock + wConcrete + wAsphalt + 0.0001;
    out0[0] = wSand / sum;
    out0[1] = wDirt / sum;
    out0[2] = wGrass / sum;
    out0[3] = wRock / sum;

    out1[0] = wConcrete / sum;
    out1[1] = wAsphalt / sum;
    out1[2] = wSnow;
    // Macro organic tonal variation seed (0..1)
    out1[3] = THREE.MathUtils.clamp(0.5 + patchNoise * 0.45 + (microNoise - 0.5) * 0.2, 0, 1);
  }

  /**
   * PHASE 2 — Creates the shared multi-material PBR Terrain Splatting Material.
   * Uses world-space dual-scale anti-tiling UVs, height-sharpened blending of 6 PBR materials
   * (Sand ripples, Dirt, Dry Grass, Stratified Rock, Concrete, Asphalt), real per-material normals & roughness,
   * and full Three.js PBR lighting, shadows, IBL, GTAO, and fog integration.
   */
  private getOrCreateTerrainSplatMaterial(mats: ProceduralMaterials): THREE.MeshStandardMaterial {
    if (this.sharedTerrainMat) return this.sharedTerrainMat;

    const splat = mats.terrainSplat;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1.0,
      metalness: 0.0,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTexSand = { value: splat.sandAlbedoRough };
      shader.uniforms.uNormSand = { value: splat.sandNormalHeight };
      shader.uniforms.uTexDirt = { value: splat.dirtAlbedoRough };
      shader.uniforms.uTexGrass = { value: splat.grassAlbedoRough };
      shader.uniforms.uNormSoilGrass = { value: splat.soilGrassNormalHeight };
      shader.uniforms.uTexRock = { value: splat.rockAlbedoRough };
      shader.uniforms.uNormRock = { value: splat.rockNormalHeight };
      shader.uniforms.uTexConcrete = { value: splat.concreteAlbedoRough };
      shader.uniforms.uTexAsphalt = { value: splat.asphaltAlbedoRough };
      shader.uniforms.uNormUrban = { value: splat.urbanNormalHeight };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec4 aSplat0;
          attribute vec4 aSplat1;
          varying vec4 vSplat0;
          varying vec4 vSplat1;
          varying vec3 vTerrainWorldPos;
          varying vec3 vTerrainWorldNorm;`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
          vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vTerrainWorldNorm = normalize(mat3(modelMatrix) * objectNormal);
          vSplat0 = aSplat0;
          vSplat1 = aSplat1;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D uTexSand;
          uniform sampler2D uNormSand;
          uniform sampler2D uTexDirt;
          uniform sampler2D uTexGrass;
          uniform sampler2D uNormSoilGrass;
          uniform sampler2D uTexRock;
          uniform sampler2D uNormRock;
          uniform sampler2D uTexConcrete;
          uniform sampler2D uTexAsphalt;
          uniform sampler2D uNormUrban;

          varying vec4 vSplat0;
          varying vec4 vSplat1;
          varying vec3 vTerrainWorldPos;
          varying vec3 vTerrainWorldNorm;

          // Rotated dual-scale anti-tiling lookup eliminates repeating patterns at both close & aerial views
          vec4 sampleAntiTile(sampler2D tex, vec2 uv, float macroBlend) {
            vec4 nearS = texture2D(tex, uv);
            mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
            vec4 farS = texture2D(tex, rot * uv * 0.27 + vec2(3.17, 1.93));
            return mix(nearS, farS, macroBlend);
          }

          vec3 unpackNormalXY(vec4 nm, float strength) {
            vec3 n = nm.xyz * 2.0 - 1.0;
            return vec3(n.xy * strength, max(n.z, 0.1));
          }`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          vec2 wp = vTerrainWorldPos.xz;
          float camDist = length(cameraPosition - vTerrainWorldPos);
          float distFade = smoothstep(22.0, 145.0, camDist);

          // Low-frequency world breakup modulates anti-tiling & natural soil moisture patches
          float macroWaveA = sin(wp.x * 0.021 + cos(wp.y * 0.019) * 2.2);
          float macroWaveB = cos(wp.y * 0.037 - wp.x * 0.017);
          float antiTileMix = clamp(0.24 + distFade * 0.44 + macroWaveA * 0.1, 0.14, 0.72);

          // World-space UVs tailored to real physical scale of each material
          vec2 uvSand = wp * 0.115;
          vec2 uvDirt = wp * 0.14;
          vec2 uvGrass = wp * 0.16;
          vec2 uvRock = wp * 0.085;
          vec2 uvUrban = wp * 0.125;

          vec4 sSand = sampleAntiTile(uTexSand, uvSand, antiTileMix);
          vec4 nSand = sampleAntiTile(uNormSand, uvSand, antiTileMix * 0.7);

          vec4 sDirt = sampleAntiTile(uTexDirt, uvDirt, antiTileMix);
          vec4 sGrass = sampleAntiTile(uTexGrass, uvGrass, antiTileMix);
          vec4 nSoilGrass = sampleAntiTile(uNormSoilGrass, uvDirt, antiTileMix * 0.75);

          vec4 sRock = sampleAntiTile(uTexRock, uvRock, antiTileMix);
          vec4 nRock = sampleAntiTile(uNormRock, uvRock, antiTileMix * 0.7);

          vec4 sConcrete = sampleAntiTile(uTexConcrete, uvUrban, antiTileMix * 0.55);
          vec4 sAsphalt = sampleAntiTile(uTexAsphalt, uvUrban * 1.15, antiTileMix * 0.55);
          vec4 nUrban = sampleAntiTile(uNormUrban, uvUrban, antiTileMix * 0.5);

          // Height-modulated splat blending for sharp natural seams (rocks/clods/concrete borders!)
          float wSand = vSplat0.x;
          float wDirt = vSplat0.y;
          float wGrass = vSplat0.z;
          float wRock = vSplat0.w;
          float wConcrete = vSplat1.x;
          float wAsphalt = vSplat1.y;
          float wSnow = vSplat1.z;

          float hSand = wSand > 0.001 ? wSand + nSand.a * 0.18 : 0.0;
          float hDirt = wDirt > 0.001 ? wDirt + nSoilGrass.a * 0.16 : 0.0;
          float hGrass = wGrass > 0.001 ? wGrass + (1.0 - nSoilGrass.a) * 0.18 : 0.0;
          float hRock = wRock > 0.001 ? wRock + nRock.a * 0.24 : 0.0;
          float hConcrete = wConcrete > 0.001 ? wConcrete + nUrban.a * 0.14 : 0.0;
          float hAsphalt = wAsphalt > 0.001 ? wAsphalt + (1.0 - nUrban.a) * 0.14 : 0.0;

          float maxH = max(max(max(hSand, hDirt), max(hGrass, hRock)), max(hConcrete, hAsphalt));
          float blendDepth = 0.22;
          float bSand = max(hSand - (maxH - blendDepth), 0.0) * step(0.001, wSand);
          float bDirt = max(hDirt - (maxH - blendDepth), 0.0) * step(0.001, wDirt);
          float bGrass = max(hGrass - (maxH - blendDepth), 0.0) * step(0.001, wGrass);
          float bRock = max(hRock - (maxH - blendDepth), 0.0) * step(0.001, wRock);
          float bConcrete = max(hConcrete - (maxH - blendDepth), 0.0) * step(0.001, wConcrete);
          float bAsphalt = max(hAsphalt - (maxH - blendDepth), 0.0) * step(0.001, wAsphalt);
          float bSum = bSand + bDirt + bGrass + bRock + bConcrete + bAsphalt + 0.0001;

          bSand /= bSum;
          bDirt /= bSum;
          bGrass /= bSum;
          bRock /= bSum;
          bConcrete /= bSum;
          bAsphalt /= bSum;

          // Blended PBR Albedo
          vec3 terrainAlbedo =
            sSand.rgb * bSand +
            sDirt.rgb * bDirt +
            sGrass.rgb * bGrass +
            sRock.rgb * bRock +
            sConcrete.rgb * bConcrete +
            sAsphalt.rgb * bAsphalt;

          // Blended PBR Roughness (stored linearly in alpha channel of each packed texture)
          float terrainRoughness =
            sSand.a * bSand +
            sDirt.a * bDirt +
            sGrass.a * bGrass +
            sRock.a * bRock +
            sConcrete.a * bConcrete +
            sAsphalt.a * bAsphalt;

          // Blended World Tangent-Space Normal (strong crisp relief close up, smooth anti-aliased far away)
          float normalAtten = mix(1.0, 0.45, distFade);
          vec3 terrainTanNorm =
            unpackNormalXY(nSand, 1.35 * normalAtten) * bSand +
            unpackNormalXY(nSoilGrass, 1.05 * normalAtten) * (bDirt + bGrass) +
            unpackNormalXY(nRock, 1.45 * normalAtten) * bRock +
            unpackNormalXY(nUrban, 0.95 * normalAtten) * (bConcrete + bAsphalt);

          // High-altitude alpine snow streaks
          if (wSnow > 0.01) {
            vec3 snowCol = vec3(0.56, 0.59, 0.64);
            terrainAlbedo = mix(terrainAlbedo, snowCol, wSnow * 0.85);
            terrainRoughness = mix(terrainRoughness, 0.78, wSnow * 0.8);
          }

          // Subtle macro earth coloration variation (eliminates flat sterile uniformity)
          float macroShade = 0.91 + macroWaveA * 0.055 + macroWaveB * 0.04 + (vSplat1.w - 0.5) * 0.14;
          vec3 warmDustTint = mix(vec3(0.96, 0.98, 1.0), vec3(1.05, 0.99, 0.91), vSplat1.w);
          diffuseColor.rgb = terrainAlbedo * macroShade * warmDustTint;`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = clamp(terrainRoughness, 0.68, 0.99);`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          vec3 geomWorldN = normalize(vTerrainWorldNorm);
          vec3 tBasis = normalize(vec3(geomWorldN.y, -geomWorldN.x, 0.0));
          vec3 bBasis = normalize(cross(geomWorldN, tBasis));
          vec3 perturbedWorldN = normalize(
            tBasis * terrainTanNorm.x +
            bBasis * terrainTanNorm.y +
            geomWorldN * max(terrainTanNorm.z, 0.2)
          );
          normal = normalize((viewMatrix * vec4(perturbedWorldN, 0.0)).xyz);`
        );
    };

    mat.customProgramCacheKey = () => 'wildlands_terrain_splat_pbr_v3';
    this.sharedTerrainMat = mat;
    return mat;
  }

  public createSectorTerrainMesh(
    centerX: number,
    centerZ: number,
    size: number,
    segments: number,
    mats: ProceduralMaterials
  ): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const splat0Arr = new Float32Array(pos.count * 4);
    const splat1Arr = new Float32Array(pos.count * 4);
    const tmpNorm = new THREE.Vector3();
    const s0: [number, number, number, number] = [0, 0, 0, 0];
    const s1: [number, number, number, number] = [0, 0, 0, 0];

    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + centerX;
      const wz = pos.getZ(i) + centerZ;
      let wy = this.getSurfaceHeightAt(wx, wz);

      if (this.isInsideUndergroundRamp(wx, wz)) {
        const t = THREE.MathUtils.clamp((-74 - wz) / 32, 0, 1);
        wy = THREE.MathUtils.lerp(wy, -8.5, t);
      }

      pos.setY(i, wy);
      this.getNormalAt(wx, wz, tmpNorm);
      this.computeTerrainSplatWeights(wx, wz, wy, tmpNorm.y, s0, s1);

      const idx4 = i * 4;
      splat0Arr[idx4] = s0[0];
      splat0Arr[idx4 + 1] = s0[1];
      splat0Arr[idx4 + 2] = s0[2];
      splat0Arr[idx4 + 3] = s0[3];

      splat1Arr[idx4] = s1[0];
      splat1Arr[idx4 + 1] = s1[1];
      splat1Arr[idx4 + 2] = s1[2];
      splat1Arr[idx4 + 3] = s1[3];
    }

    geo.setAttribute('aSplat0', new THREE.BufferAttribute(splat0Arr, 4));
    geo.setAttribute('aSplat1', new THREE.BufferAttribute(splat1Arr, 4));
    geo.computeVertexNormals();

    const mat = this.getOrCreateTerrainSplatMaterial(mats);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(centerX, 0, centerZ);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.userData.isTerrain = true;
    return mesh;
  }

  /**
   * Generates physical 3D terrain-hugging asphalt roads, rutted dirt vehicle tracks, and railway beds
   * with smooth cross-sectional embankment crowns so edges sit naturally into the terrain.
   */
  public createRoadAndRailNetworkGroup(mats: ProceduralMaterials): THREE.Group {
    const group = new THREE.Group();

    for (const seg of ALL_ROAD_SEGMENTS) {
      const dx = seg.x2 - seg.x1;
      const dz = seg.z2 - seg.z1;
      const length = Math.hypot(dx, dz);
      const steps = Math.max(10, Math.ceil(length / 7));
      const perpX = (-dz / length) * (seg.width * 0.5);
      const perpZ = (dx / length) * (seg.width * 0.5);

      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      // 4-column cross-section: outer-left skirt -> left crown -> right crown -> outer-right skirt
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const cx = seg.x1 + dx * t;
        const cz = seg.z1 + dz * t;

        const olx = cx - perpX * 1.18;
        const olz = cz - perpZ * 1.18;
        const lx = cx - perpX * 0.92;
        const lz = cz - perpZ * 0.92;
        const rx = cx + perpX * 0.92;
        const rz = cz + perpZ * 0.92;
        const orx = cx + perpX * 1.18;
        const orz = cz + perpZ * 1.18;

        const cY = this.getSurfaceHeightAt(cx, cz);
        const lY = this.getSurfaceHeightAt(lx, lz);
        const rY = this.getSurfaceHeightAt(rx, rz);
        const crownY = Math.max(cY, lY, rY) + 0.085;
        const olY = this.getSurfaceHeightAt(olx, olz) - 0.06;
        const orY = this.getSurfaceHeightAt(orx, orz) - 0.06;

        positions.push(
          olx, olY, olz,
          lx, crownY, lz,
          rx, crownY, rz,
          orx, orY, orz
        );

        const vCoord = (t * length) / (seg.kind === 'rail' ? 7 : 11);
        uvs.push(
          0.0, vCoord,
          0.12, vCoord,
          0.88, vCoord,
          1.0, vCoord
        );

        if (i < steps) {
          const b0 = i * 4;
          const b1 = (i + 1) * 4;
          for (let q = 0; q < 3; q++) {
            indices.push(b0 + q, b1 + q, b0 + q + 1, b0 + q + 1, b1 + q, b1 + q + 1);
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const mat =
        seg.kind === 'asphalt'
          ? mats.asphalt
          : seg.kind === 'rail'
          ? mats.railBed
          : mats.dirtRoad;

      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    return group;
  }

  /**
   * Builds a dramatic 360-degree jagged alpine mountain range ring (730m to 1620m)
   * shaded with stratified granite rock normals, alpine snow veins, and olive foothill blending.
   */
  public createDistantMountainRing(mats: ProceduralMaterials): THREE.Mesh {
    const radialSegs = 144;
    const ringSegs = 14;
    const innerR = WORLD_HALF_SIZE - 45;
    const outerR = 1620;

    const positions: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const tmpCol = new THREE.Color();

    for (let r = 0; r <= ringSegs; r++) {
      const rt = r / ringSegs;
      const radius = THREE.MathUtils.lerp(innerR, outerR, rt);
      for (let a = 0; a <= radialSegs; a++) {
        const ang = (a / radialSegs) * Math.PI * 2;
        const wx = Math.cos(ang) * radius;
        const wz = Math.sin(ang) * radius;

        let wy = this.getSurfaceHeightAt(wx, wz);
        if (r > 0) {
          const env = Math.sin(rt * Math.PI);
          const mainRidges = ridgedFbm(wx * 0.0024, wz * 0.0024, 5) * 270;
          const secondaryCrags = ridgedFbm(wx * 0.0068, wz * 0.0068, 3) * 72;
          const foothillBase = Math.pow(rt, 0.52) * 58;
          wy = Math.max(wy, foothillBase + (mainRidges + secondaryCrags) * Math.pow(env, 0.72) - 18);
        }

        positions.push(wx, wy, wz);
        uvs.push(wx * 0.014, wz * 0.014);

        const treeLineT = smoothstep(32, 95, wy);
        const snowVein = valueNoise(wx * 0.015, wz * 0.015) * 38;
        const snowT = smoothstep(120, 200, wy + snowVein);

        let cr = THREE.MathUtils.lerp(0.27, 0.30, treeLineT);
        let cg = THREE.MathUtils.lerp(0.28, 0.30, treeLineT);
        let cb = THREE.MathUtils.lerp(0.20, 0.31, treeLineT);

        cr = THREE.MathUtils.lerp(cr, 0.74, snowT);
        cg = THREE.MathUtils.lerp(cg, 0.76, snowT);
        cb = THREE.MathUtils.lerp(cb, 0.81, snowT);

        tmpCol.setRGB(cr, cg, cb);
        colors.push(tmpCol.r, tmpCol.g, tmpCol.b);
      }
    }

    const rowStride = radialSegs + 1;
    for (let r = 0; r < ringSegs; r++) {
      for (let a = 0; a < radialSegs; a++) {
        const i0 = r * rowStride + a;
        const i1 = i0 + 1;
        const i2 = i0 + rowStride;
        const i3 = i2 + 1;
        indices.push(i0, i1, i2, i1, i3, i2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    if (!this.sharedMountainMat) {
      this.sharedMountainMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: mats.terrainSplat.rockAlbedoRough,
        normalMap: mats.terrainSplat.rockNormalHeight,
        normalScale: new THREE.Vector2(1.15, 1.15),
        roughness: 0.94,
        metalness: 0.0,
      });
    }

    const mesh = new THREE.Mesh(geo, this.sharedMountainMat);
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    return mesh;
  }

  public dispose() {
    this.sharedTerrainMat?.dispose();
    this.sharedTerrainMat = null;
    this.sharedMountainMat?.dispose();
    this.sharedMountainMat = null;
  }
}
