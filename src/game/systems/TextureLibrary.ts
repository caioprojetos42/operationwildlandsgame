import * as THREE from 'three';
import { GraphicsPreset } from '../types';

export interface TerrainSplatTextures {
  sandAlbedoRough: THREE.DataTexture;
  sandNormalHeight: THREE.DataTexture;
  dirtAlbedoRough: THREE.DataTexture;
  grassAlbedoRough: THREE.DataTexture;
  soilGrassNormalHeight: THREE.DataTexture;
  rockAlbedoRough: THREE.DataTexture;
  rockNormalHeight: THREE.DataTexture;
  concreteAlbedoRough: THREE.DataTexture;
  asphaltAlbedoRough: THREE.DataTexture;
  urbanNormalHeight: THREE.DataTexture;
}

export interface ProceduralMaterials {
  concrete: THREE.MeshStandardMaterial;
  concreteDark: THREE.MeshStandardMaterial;
  hazardConcrete: THREE.MeshStandardMaterial;
  corrugatedMetal: THREE.MeshStandardMaterial;
  rustedMetal: THREE.MeshStandardMaterial;
  asphalt: THREE.MeshStandardMaterial;
  dirtRoad: THREE.MeshStandardMaterial;
  railBed: THREE.MeshStandardMaterial;
  woodCrate: THREE.MeshStandardMaterial;
  militaryCrate: THREE.MeshStandardMaterial;
  sandbag: THREE.MeshStandardMaterial;
  brickUrban: THREE.MeshStandardMaterial;
  desertStucco: THREE.MeshStandardMaterial;
  metalPanel: THREE.MeshStandardMaterial;
  bunkerSteel: THREE.MeshStandardMaterial;
  gunMetal: THREE.MeshStandardMaterial;
  polymerDark: THREE.MeshStandardMaterial;
  glassTinted: THREE.MeshStandardMaterial;
  chainLink: THREE.MeshStandardMaterial;
  militarySign: THREE.MeshStandardMaterial;
  camoVehicleMap: THREE.CanvasTexture;
  camoVehicleNormal: THREE.CanvasTexture;
  tireTreadMap: THREE.CanvasTexture;
  tireTreadNormal: THREE.CanvasTexture;
  gunNormalMap: THREE.CanvasTexture;
  gunWearMap: THREE.CanvasTexture;
  gunRoughnessMap: THREE.CanvasTexture;
  polymerNormalMap: THREE.CanvasTexture;
  contactShadow: THREE.MeshBasicMaterial;
  smokeSpriteMap: THREE.CanvasTexture;
  terrainDetailMap: THREE.CanvasTexture;
  terrainBumpMap: THREE.CanvasTexture;
  terrainNormalMap: THREE.CanvasTexture;
  terrainRoughnessMap: THREE.CanvasTexture;
  terrainSplat: TerrainSplatTextures;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  isColor: boolean,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates an authentic tangent-space Normal Map from a grayscale height canvas using Sobel gradients.
 */
function heightCanvasToNormal(
  heightCanvas: HTMLCanvasElement,
  strength: number,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const srcCtx = heightCanvas.getContext('2d')!;
  const src = srcCtx.getImageData(0, 0, w, h).data;

  const [outCanvas, outCtx] = makeCanvas(w);
  const outImg = outCtx.createImageData(w, h);
  const dst = outImg.data;

  const sample = (x: number, y: number) => {
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
  return finalizeTexture(outCanvas, anisotropy, false, repeatX, repeatY);
}

export class TextureLibrary {
  public materials: ProceduralMaterials;
  private textures: THREE.Texture[] = [];

  constructor(renderer: THREE.WebGLRenderer) {
    const aniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 16);

    // 1. High-detail 512px Military Concrete (Albedo + Height -> Normal + Roughness)
    const concretePack = this.createConcretePBR(512, '#73766e', '#4c5049', 101, aniso, 2);
    const concreteDarkPack = this.createConcretePBR(512, '#4a4e49', '#2e312d', 109, aniso, 2);
    const hazardAlbedo = this.createHazardConcreteTexture(512, aniso);

    // 2. Corrugated Steel Hangar Sheets (Albedo + Normal + Roughness)
    const corrugatedPack = this.createCorrugatedPBR(512, '#5c6669', '#384043', aniso, 3);
    const rustedPack = this.createRustedMetalPBR(512, aniso, 2);

    // 3. Roads: Weathered Asphalt + Dirt Track + Railway Gravel/Sleepers
    const asphaltPack = this.createAsphaltPBR(512, aniso);
    const dirtPack = this.createDirtRoadPBR(512, aniso);
    const railBedAlbedo = this.createRailBedTexture(512, aniso);

    // 4. Crates, Sandbags, Urban Brick, Desert Stucco, Riveted Metal Panels, Signage, Chainlink
    const woodPack = this.createWoodCratePBR(512, '#7d5f3e', '#45311c', aniso);
    const milCratePack = this.createMilitaryCratePBR(512, aniso);
    const brickPack = this.createBrickPBR(512, aniso, 3);
    const stuccoPack = this.createDesertStuccoPBR(512, aniso, 2);
    const metalPanelPack = this.createMetalPanelPBR(512, '#434b4d', aniso, 2);
    const sandbagPack = this.createSandbagPBR(256, aniso, 4);
    const chainLinkAlbedo = this.createChainLinkTexture(256, aniso);
    const militarySignAlbedo = this.createMilitarySignTexture(512, aniso);

    // 5. Vehicle Camo & Tire Tread + Weapon Anodized Wear, Brushed Metal & Stippled Polymer PBR
    const camoPack = this.createVehicleCamoPBR(512, aniso);
    const tirePack = this.createTireTreadPBR(256, aniso);
    const gunNormalMap = this.createBrushedMetalNormal(256, aniso);
    const gunWearPack = this.createGunWearPBR(512, aniso);
    const polymerNormalMap = this.createStippledPolymerNormal(256, aniso);

    // 6. Terrain Organic Detail Albedo + Normal + Roughness + PHASE 2 6-Material PBR Splatting Suite
    const terrainPack = this.createTerrainPBR(512, aniso);
    const terrainSplat = this.createTerrainSplatSuite(512, aniso);

    // 7. Soft Contact Shadow & Volumetric Smoke Sprite
    const shadowTex = this.createRadialTexture(128, 'rgba(0,0,0,0.85)', 'rgba(0,0,0,0.38)', 'rgba(0,0,0,0)');
    const smokeSpriteMap = this.createSmokePuffTexture(128);

    this.materials = {
      concrete: new THREE.MeshStandardMaterial({
        map: concretePack.albedo,
        normalMap: concretePack.normal,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughnessMap: concretePack.roughness,
        roughness: 0.92,
        metalness: 0.04,
      }),
      concreteDark: new THREE.MeshStandardMaterial({
        map: concreteDarkPack.albedo,
        normalMap: concreteDarkPack.normal,
        normalScale: new THREE.Vector2(0.95, 0.95),
        roughnessMap: concreteDarkPack.roughness,
        roughness: 0.9,
        metalness: 0.08,
      }),
      hazardConcrete: new THREE.MeshStandardMaterial({
        map: hazardAlbedo,
        normalMap: concreteDarkPack.normal,
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughness: 0.84,
        metalness: 0.08,
      }),
      corrugatedMetal: new THREE.MeshStandardMaterial({
        map: corrugatedPack.albedo,
        normalMap: corrugatedPack.normal,
        normalScale: new THREE.Vector2(1.25, 1.25),
        roughnessMap: corrugatedPack.roughness,
        roughness: 0.56,
        metalness: 0.72,
      }),
      rustedMetal: new THREE.MeshStandardMaterial({
        map: rustedPack.albedo,
        normalMap: rustedPack.normal,
        normalScale: new THREE.Vector2(0.9, 0.9),
        roughnessMap: rustedPack.roughness,
        roughness: 0.76,
        metalness: 0.52,
      }),
      asphalt: new THREE.MeshStandardMaterial({
        map: asphaltPack.albedo,
        normalMap: asphaltPack.normal,
        normalScale: new THREE.Vector2(0.9, 0.9),
        roughnessMap: asphaltPack.roughness,
        roughness: 0.92,
        metalness: 0.03,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      dirtRoad: new THREE.MeshStandardMaterial({
        map: dirtPack.albedo,
        normalMap: dirtPack.normal,
        normalScale: new THREE.Vector2(0.8, 0.8),
        roughness: 0.96,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      railBed: new THREE.MeshStandardMaterial({
        map: railBedAlbedo,
        normalMap: dirtPack.normal,
        normalScale: new THREE.Vector2(1.1, 1.1),
        roughness: 0.94,
        metalness: 0.08,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      woodCrate: new THREE.MeshStandardMaterial({
        map: woodPack.albedo,
        normalMap: woodPack.normal,
        normalScale: new THREE.Vector2(1.0, 1.0),
        roughnessMap: woodPack.roughness,
        roughness: 0.88,
        metalness: 0.04,
      }),
      militaryCrate: new THREE.MeshStandardMaterial({
        map: milCratePack.albedo,
        normalMap: milCratePack.normal,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughnessMap: milCratePack.roughness,
        roughness: 0.56,
        metalness: 0.34,
      }),
      sandbag: new THREE.MeshStandardMaterial({
        map: sandbagPack.albedo,
        normalMap: sandbagPack.normal,
        normalScale: new THREE.Vector2(1.1, 1.1),
        roughness: 0.94,
        metalness: 0.0,
      }),
      brickUrban: new THREE.MeshStandardMaterial({
        map: brickPack.albedo,
        normalMap: brickPack.normal,
        normalScale: new THREE.Vector2(1.0, 1.0),
        roughness: 0.88,
        metalness: 0.04,
      }),
      desertStucco: new THREE.MeshStandardMaterial({
        map: stuccoPack.albedo,
        normalMap: stuccoPack.normal,
        normalScale: new THREE.Vector2(1.05, 1.05),
        roughnessMap: stuccoPack.roughness,
        roughness: 0.91,
        metalness: 0.02,
      }),
      metalPanel: new THREE.MeshStandardMaterial({
        map: metalPanelPack.albedo,
        normalMap: metalPanelPack.normal,
        normalScale: new THREE.Vector2(0.9, 0.9),
        roughnessMap: metalPanelPack.roughness,
        roughness: 0.52,
        metalness: 0.68,
        envMapIntensity: 1.25,
      }),
      bunkerSteel: new THREE.MeshStandardMaterial({
        map: metalPanelPack.albedo,
        normalMap: metalPanelPack.normal,
        normalScale: new THREE.Vector2(0.7, 0.7),
        roughnessMap: metalPanelPack.roughness,
        roughness: 0.42,
        metalness: 0.82,
        envMapIntensity: 1.35,
      }),
      gunMetal: new THREE.MeshStandardMaterial({
        color: 0x3b4149,
        map: gunWearPack.albedo,
        roughnessMap: gunWearPack.roughness,
        normalMap: gunNormalMap,
        normalScale: new THREE.Vector2(0.52, 0.52),
        roughness: 0.32,
        metalness: 0.9,
        envMapIntensity: 1.55,
      }),
      polymerDark: new THREE.MeshStandardMaterial({
        color: 0x1b1e20,
        normalMap: polymerNormalMap,
        normalScale: new THREE.Vector2(0.75, 0.75),
        roughness: 0.74,
        metalness: 0.14,
        envMapIntensity: 1.1,
      }),
      glassTinted: new THREE.MeshPhysicalMaterial({
        color: 0x112028,
        roughness: 0.05,
        metalness: 0.32,
        reflectivity: 1.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        envMapIntensity: 2.1,
        transparent: true,
        opacity: 0.82,
      }),
      chainLink: new THREE.MeshStandardMaterial({
        map: chainLinkAlbedo,
        alphaTest: 0.35,
        transparent: true,
        side: THREE.DoubleSide,
        roughness: 0.45,
        metalness: 0.82,
        envMapIntensity: 1.3,
      }),
      militarySign: new THREE.MeshStandardMaterial({
        map: militarySignAlbedo,
        roughness: 0.48,
        metalness: 0.38,
        envMapIntensity: 1.2,
      }),
      camoVehicleMap: camoPack.albedo,
      camoVehicleNormal: camoPack.normal,
      tireTreadMap: tirePack.albedo,
      tireTreadNormal: tirePack.normal,
      gunNormalMap,
      gunWearMap: gunWearPack.albedo,
      gunRoughnessMap: gunWearPack.roughness,
      polymerNormalMap,
      contactShadow: new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
      }),
      smokeSpriteMap,
      terrainDetailMap: terrainPack.albedo,
      terrainBumpMap: terrainPack.roughness,
      terrainNormalMap: terrainPack.normal,
      terrainRoughnessMap: terrainPack.roughness,
      terrainSplat,
    };
  }

  private register<T extends THREE.Texture>(t: T): T {
    this.textures.push(t);
    return t;
  }

  private createConcretePBR(size: number, base: string, stain: string, seed: number, aniso: number, repeat: number) {
    const [canvas, ctx] = makeCanvas(size);
    const [hCanvas, hCtx] = makeCanvas(size);
    const rand = seededRand(seed);

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    hCtx.fillStyle = '#808080';
    hCtx.fillRect(0, 0, size, size);

    // Weathering grime & damp patches
    for (let i = 0; i < 80; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const w = 18 + rand() * 88;
      const h = 18 + rand() * 88;
      ctx.fillStyle = rand() > 0.45 ? stain : 'rgba(215,212,200,0.08)';
      ctx.globalAlpha = 0.08 + rand() * 0.14;
      ctx.fillRect(x, y, w, h);

      hCtx.fillStyle = rand() > 0.5 ? '#686868' : '#969696';
      hCtx.globalAlpha = 0.16;
      hCtx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = 1;
    hCtx.globalAlpha = 1;

    // Concrete formwork seams & tie-rod holes
    ctx.strokeStyle = 'rgba(18,20,18,0.42)';
    ctx.lineWidth = 3;
    hCtx.strokeStyle = '#252525';
    hCtx.lineWidth = 4;
    for (let y = 0; y < size; y += 128) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      hCtx.beginPath();
      hCtx.moveTo(0, y);
      hCtx.lineTo(size, y);
      hCtx.stroke();
    }
    for (let x = 0; x < size; x += 256) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
      hCtx.beginPath();
      hCtx.moveTo(x, 0);
      hCtx.lineTo(x, size);
      hCtx.stroke();
    }

    // Tie-rod holes + rust water drips
    for (let y = 64; y < size; y += 128) {
      for (let x = 64; x < size; x += 128) {
        ctx.fillStyle = 'rgba(20,22,20,0.65)';
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        hCtx.fillStyle = '#181818';
        hCtx.beginPath();
        hCtx.arc(x, y, 5, 0, Math.PI * 2);
        hCtx.fill();
        // Vertical grime streak below hole
        const grad = ctx.createLinearGradient(x, y, x, y + 44);
        grad.addColorStop(0, 'rgba(42,36,28,0.34)');
        grad.addColorStop(1, 'rgba(42,36,28,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - 3, y, 6, 44);
      }
    }

    // Micro aggregate grit
    for (let i = 0; i < 4800; i++) {
      const gx = rand() * size;
      const gy = rand() * size;
      const v = rand() > 0.5 ? 230 : 25;
      ctx.fillStyle = `rgba(${v},${v},${v},0.065)`;
      ctx.fillRect(gx, gy, 2, 2);
      hCtx.fillStyle = rand() > 0.5 ? '#9d9d9d' : '#616161';
      hCtx.fillRect(gx, gy, 2, 2);
    }

    return {
      albedo: this.register(finalizeTexture(canvas, aniso, true, repeat, repeat)),
      normal: this.register(heightCanvasToNormal(hCanvas, 2.2, aniso, repeat, repeat)),
      roughness: this.register(finalizeTexture(hCanvas, aniso, false, repeat, repeat)),
    };
  }

  private createHazardConcreteTexture(size: number, aniso: number) {
    const [canvas, ctx] = makeCanvas(size);
    ctx.fillStyle = '#4c504a';
    ctx.fillRect(0, 0, size, size);
    // Yellow/black industrial caution chevron stripe along bottom band
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, size * 0.72, size, size * 0.28);
    ctx.clip();
    ctx.fillStyle = '#c4962c';
    ctx.fillRect(0, size * 0.72, size, size * 0.28);
    ctx.fillStyle = '#1d1f1d';
    for (let x = -size; x < size * 2; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, size * 0.72);
      ctx.lineTo(x + 32, size * 0.72);
      ctx.lineTo(x - 24, size);
      ctx.lineTo(x - 56, size);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Dirt wear over stripes
    const rand = seededRand(881);
    for (let i = 0; i < 2200; i++) {
      ctx.fillStyle = 'rgba(35,34,30,0.12)';
      ctx.fillRect(rand() * size, rand() * size, 3, 3);
    }
    return this.register(finalizeTexture(canvas, aniso, true, 2, 1));
  }

  private createCorrugatedPBR(size: number, light: string, dark: string, aniso: number, repeat: number) {
    const [canvas, ctx] = makeCanvas(size);
    const [hCanvas, hCtx] = makeCanvas(size);
    const rand = seededRand(202);
    const ribs = 24;
    const ribW = size / ribs;

    for (let i = 0; i < ribs; i++) {
      const grad = ctx.createLinearGradient(i * ribW, 0, (i + 1) * ribW, 0);
      grad.addColorStop(0, dark);
      grad.addColorStop(0.48, light);
      grad.addColorStop(1, dark);
      ctx.fillStyle = grad;
      ctx.fillRect(i * ribW, 0, ribW, size);

      const hGrad = hCtx.createLinearGradient(i * ribW, 0, (i + 1) * ribW, 0);
      hGrad.addColorStop(0, '#222222');
      hGrad.addColorStop(0.5, '#f0f0f0');
      hGrad.addColorStop(1, '#222222');
      hCtx.fillStyle = hGrad;
      hCtx.fillRect(i * ribW, 0, ribW, size);
    }

    // Horizontal sheet overlap seams + rivets
    for (let y = 128; y < size; y += 128) {
      ctx.fillStyle = 'rgba(14,16,18,0.45)';
      ctx.fillRect(0, y, size, 4);
      hCtx.fillStyle = '#181818';
      hCtx.fillRect(0, y, size, 4);
    }

    // Rain-streaked rust oxidation
    for (let i = 0; i < 45; i++) {
      const rx = rand() * size;
      const ry = rand() * size;
      ctx.fillStyle = `rgba(116,58,28,${0.12 + rand() * 0.22})`;
      ctx.fillRect(rx, ry, 4 + rand() * 18, 32 + rand() * 140);
    }

    return {
      albedo: this.register(finalizeTexture(canvas, aniso, true, repeat, repeat)),
      normal: this.register(heightCanvasToNormal(hCanvas, 2.8, aniso, repeat, repeat)),
      roughness: this.register(finalizeTexture(hCanvas, aniso, false, repeat, repeat)),
    };
  }

  private createRustedMetalPBR(size: number, aniso: number, repeat: number) {
    const [canvas, ctx] = makeCanvas(size);
    const [hCanvas, hCtx] = makeCanvas(size);
    const rand = seededRand(303);

    ctx.fillStyle = '#484d50';
    ctx.fillRect(0, 0, size, size);
    hCtx.fillStyle = '#909090';
    hCtx.fillRect(0, 0, size, size);

    for (let i = 0; i < 110; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 8 + rand() * 44;
      ctx.fillStyle = rand() > 0.32 ? '#784122' : '#35393c';
      ctx.globalAlpha = 0.14 + rand() * 0.28;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      hCtx.fillStyle = '#c8c8c8';
      hCtx.globalAlpha = 0.18;
      hCtx.beginPath();
      hCtx.arc(x, y, r * 0.8, 0, Math.PI * 2);
      hCtx.fill();
    }
    ctx.globalAlpha = 1;
    hCtx.globalAlpha = 1;

    // Plate rivets
    ctx.strokeStyle = 'rgba(20,22,24,0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, size - 8, size - 8);
    ctx.strokeRect(4, size / 2, size - 8, size / 2 - 4);

    return {
      albedo: this.register(finalizeTexture(canvas, aniso, true, repeat, repeat)),
      normal: this.register(heightCanvasToNormal(hCanvas, 2.0, aniso, repeat, repeat)),
      roughness: this.register(finalizeTexture(hCanvas, aniso, false, repeat, repeat)),
    };
  }

  private createAsphaltPBR(size: number, aniso: number) {
    const [canvas, ctx] = makeCanvas(size);
    const [hCanvas, hCtx] = makeCanvas(size);
    const rand = seededRand(404);

    ctx.fillStyle = '#2d3033';
    ctx.fillRect(0, 0, size, size);
    hCtx.fillStyle = '#808080';
    hCtx.fillRect(0, 0, size, size);

    // Aggregate gravel noise
    for (let i = 0; i < 9000; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const g = 34 + Math.floor(rand() * 44);
      ctx.fillStyle = `rgb(${g},${g},${g + 2})`;
      ctx.fillRect(x, y, 2, 2);
      hCtx.fillStyle = g > 55 ? '#9c9c9c' : '#606060';
      hCtx.fillRect(x, y, 2, 2);
    }

    // Subtle dark tire wear tracks along left and right lanes
    ctx.fillStyle = 'rgba(18,19,21,0.28)';
    ctx.fillRect(size * 0.2, 0, size * 0.14, size);
    ctx.fillRect(size * 0.66, 0, size * 0.14, size);

    // Weathered cracks
    ctx.strokeStyle = 'rgba(14,15,16,0.55)';
    ctx.lineWidth = 2;
    for (let c = 0; c < 6; c++) {
      let cx = rand() * size;
      let cy = rand() * size;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let s = 0; s < 5; s++) {
        cx += (rand() - 0.5) * 35;
        cy += rand() * 35;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }

    // Yellow dashed military center lane + faded white edge lines
    ctx.fillStyle = 'rgba(204, 174, 88, 0.72)';
    ctx.fillRect(size * 0.485, 36, size * 0.03, 180);
    ctx.fillRect(size * 0.485, 292, size * 0.03, 180);
    ctx.fillStyle = 'rgba(210, 212, 205, 0.45)';
    ctx.fillRect(24, 0, 10, size);
    ctx.fillRect(size - 34, 0, 10, size);

    return {
      albedo: this.register(finalizeTexture(canvas, aniso, true, 1, 1)),
      normal: this.register(heightCanvasToNormal(hCanvas, 2.2, aniso, 1, 1)),
      roughness: this.register(finalizeTexture(hCanvas, aniso, false, 1, 1)),
    };
  }

  private createDirtRoadPBR(size: number, aniso: number) {
    const [canvas, ctx] = makeCanvas(size);
    const [hCanvas, hCtx] = makeCanvas(size);
    const rand = seededRand(415);

    ctx.fillStyle = '#7e694b';
    ctx.fillRect(0, 0, size, size);
    hCtx.fillStyle = '#888888';
    hCtx.fillRect(0, 0, size, size);

    // Tire ruts
    ctx.fillStyle = 'rgba(68,52,34,0.34)';
    ctx.fillRect(size * 0.18, 0, size * 0.18, size);
    ctx.fillRect(size * 0.64, 0, size * 0.18, size);
    hCtx.fillStyle = '#4e4e4e';
    hCtx.fillRect(size * 0.18, 0, size * 0.18, size);
    hCtx.fillRect(size * 0.64, 0, size * 0.18, size);

    for (let i = 0; i < 6500; i++) {
      const x = rand() * size;
      const y = rand() * size;
      ctx.fillStyle = rand() > 0.5 ? 'rgba(156,136,102,0.22)' : 'rgba(62,48,32,0.22)';
      ctx.fillRect(x, y, 3, 3);
      hCtx.fillStyle = rand() > 0.5 ? '#a2a2a2' : '#5e5e5e';
      hCtx.fillRect(x, y, 3, 3);
    }

    return {
      albedo: this.register(finalizeTexture(canvas, aniso, true, 1, 1)),
      normal: this.register(heightCanvasToNormal(hCanvas, 2.4, aniso, 1, 1)),
    };
  }

  private createRailBedTexture(size: number, aniso: number) {
    const [canvas, ctx] = makeCanvas(size);
    const rand = seededRand(455);
    // Ballast gravel
    ctx.fillStyle = '#4d4842';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 6000; i++) {
      const g = 55 + Math.floor(rand() * 55);
      ctx.fillStyle = `rgb(${g + 4},${g},${g - 4})`;
      ctx.fillRect(rand() * size, rand() * size, 3, 3);
    }
    // Wooden railway sleepers
    ctx.fillStyle = '#3d2c1e';
    for (let y = 12; y < size; y += 42) {
      ctx.fillRect(size * 0.14, y, size * 0.72, 16);
      ctx.fillStyle = '#291d13';
      ctx.fillRect(size * 0.14, y + 14, size * 0.72, 3);
      ctx.fillStyle = '#3d2c1e';
    }
    // Twin steel rails
    ctx.fillStyle = '#8b8f94';
    ctx.fillRect(size * 0.26, 0, 14, size);
    ctx.fillRect(size * 0.74 - 14, 0, 14, size);
    ctx.fillStyle = '#5c4130';
    ctx.fillRect(size * 0.26 - 4, 0, 4, size);
    ctx.fillRect(size * 0.74, 0, 4, size);

    return this.register(finalizeTexture(canvas, aniso, true, 1, 1));
  }

  private createWoodCratePBR(size: number, base: string, dark: string, aniso: number) {
    const [canvas, ctx] = makeCanvas(size);
    const [hCanvas, hCtx] = makeCanvas(size);
    const rand = seededRand(611);

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    hCtx.fillStyle = '#8a8a8a';
    hCtx.fillRect(0, 0, size, size);

    // Rich horizontal wood grain fibers per plank
    for (let p = 0; p < 8; p++) {
      const py = p * (size / 8);
      const ph = size / 8;
      const tint = (rand() - 0.5) * 22;
      ctx.fillStyle = `rgba(${115 + tint}, ${86 + tint * 0.7}, ${52 + tint * 0.5}, 0.35)`;
      ctx.fillRect(0, py, size, ph);

      for (let g = 0; g < 14; g++) {
        const gy = py + 4 + rand() * (ph - 8);
        ctx.strokeStyle = rand() > 0.4 ? 'rgba(56,38,20,0.38)' : 'rgba(154,122,82,0.22)';
        ctx.lineWidth = 1 + rand() * 2.2;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(size * 0.33, gy + (rand() - 0.5) * 6, size * 0.66, gy + (rand() - 0.5) * 6, size, gy);
        ctx.stroke();

        hCtx.strokeStyle = rand() > 0.5 ? '#6e6e6e' : '#9c9c9c';
        hCtx.lineWidth = 1.5;
        hCtx.beginPath();
        hCtx.moveTo(0, gy);
        hCtx.lineTo(size, gy);
        hCtx.stroke();
      }
    }

    // Deep plank bevel seams
    ctx.strokeStyle = dark;
    ctx.lineWidth = 6;
    hCtx.strokeStyle = '#1e1e1e';
    hCtx.lineWidth = 8;
    for (let y = 0; y <= size; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      hCtx.beginPath();
      hCtx.moveTo(0, y);
      hCtx.lineTo(size, y);
      hCtx.stroke();
    }

    // Outer structural frame + diagonal brace + recessed inner face
    ctx.strokeStyle = '#5a4128';
    ctx.lineWidth = 30;
    ctx.strokeRect(15, 15, size - 30, size - 30);
    hCtx.strokeStyle = '#c8c8c8';
    hCtx.lineWidth = 30;
    hCtx.strokeRect(15, 15, size - 30, size - 30);

    ctx.strokeStyle = '#4e3721';
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.moveTo(24, 24);
    ctx.lineTo(size - 24, size - 24);
    ctx.stroke();
    hCtx.strokeStyle = '#b4b4b4';
    hCtx.lineWidth = 24;
    hCtx.beginPath();
    hCtx.moveTo(24, 24);
    hCtx.lineTo(size - 24, size - 24);
    hCtx.stroke();

    // Nail heads along framing
    for (let n = 36; n < size - 24; n += 64) {
      for (const [nx, ny] of [[16, n], [size - 16, n], [n, 16], [n, size - 16]]) {
        ctx.fillStyle = '#26221e';
        ctx.beginPath();
        ctx.arc(nx, ny, 3.5, 0, Math.PI * 2);
        ctx.fill();
        hCtx.fillStyle = '#e5e5e5';
        hCtx.beginPath();
        hCtx.arc(nx, ny, 3.5, 0, Math.PI * 2);
        hCtx.fill();
      }
    }

    return {
      albedo: this.register(finalizeTexture(canvas, aniso, true, 1, 1)),
      normal: this.register(heightCanvasToNormal(hCanvas, 2.8, aniso, 1, 1)),
      roughness: this.register(finalizeTexture(hCanvas, aniso, false, 1, 1)),
    };
  }

  private createMilitaryCratePBR(size: number, aniso: number) {
    const [canvas, ctx] = makeCanvas(size);
    const [hCanvas, hCtx] = makeCanvas(size);
    const rand = seededRand(629);

    ctx.fillStyle = '#3c4533';
    ctx.fillRect(0, 0, size, size);
    hCtx.fillStyle = '#848484';
    hCtx.fillRect(0, 0, size, size);

    // Molded polymer/steel reinforcement ribs
    for (let x = 48; x < size - 48; x += 36) {
      ctx.fillStyle = 'rgba(22,26,18,0.34)';
      ctx.fillRect(x, 42, 12, size - 84);
      hCtx.fillStyle = '#a8a8a8';
      hCtx.fillRect(x, 42, 12, size - 84);
    }

    // Heavy rimmed border & corner latches
    ctx.strokeStyle = '#20261b';
    ctx.lineWidth = 28;
    ctx.strokeRect(14, 14, size - 28, size - 28);
    hCtx.strokeStyle = '#d2d2d2';
    hCtx.lineWidth = 28;
    hCtx.strokeRect(14, 14, size - 28, size - 28);

    // Steel corner brackets
    ctx.fillStyle = '#2a2e2c';
    hCtx.fillStyle = '#e0e0e0';
    for (const [cx, cy] of [[0, 0], [size - 48, 0], [0, size - 48], [size - 48, size - 48]]) {
      ctx.fillRect(cx, cy, 48, 48);
      hCtx.fillRect(cx, cy, 48, 48);
    }

    // Center recessed handle band
    ctx.fillStyle = '#242a20';
    ctx.fillRect(36, size * 0.44, size - 72, 42);
    hCtx.fillStyle = '#484848';
    hCtx.fillRect(36, size * 0.44, size - 72, 42);

    // Weathered NATO stencil
    ctx.fillStyle = '#cbb76c';
    ctx.font = 'bold 46px monospace';
    ctx.fillText('NATO 5.56', 108, 134);
    ctx.font = 'bold 28px monospace';
    ctx.fillText('LOT 04-WILDLANDS', 112, 392);
    ctx.fillStyle = '#c2a44c';
    ctx.fillRect(64, 332, size - 128, 14);

    // Edge wear & dust scratches
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(130,126,102,0.14)' : 'rgba(16,18,14,0.18)';
      ctx.fillRect(rand() * size, rand() * size, 3 + rand() * 5, 2);
    }

    return {
      albedo: this.register(finalizeTexture(canvas, aniso, true, 1, 1)),
      normal: this.register(heightCanvasToNormal(hCanvas, 2.4, aniso, 1, 1)),
      roughness: this.register(finalizeTexture(hCanvas, aniso, false, 1, 1)),
    };
  }

  private createDesertStuccoPBR(size: number, aniso: number, repeat: number) {
    const [canvas, ctx] = makeCanvas(size);
    const [hCanvas, hCtx] = makeCanvas(size);
    const rand = seededRand(743);

    // Warm sun-baked desert sandstone / military stucco base
    ctx.fillStyle = '#b49f7f';
    ctx.fillRect(0, 0, size, size);
    hCtx.fillStyle = '#808080';
    hCtx.fillRect(0, 0, size, size);

    // Plaster blotches & humidity stains
    for (let i = 0; i < 120; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 16 + rand() * 56;
      ctx.fillStyle = rand() > 0.5 ? 'rgba(148,125,92,0.18)' : 'rgba(202,184,152,0.14)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      hCtx.fillStyle = rand() > 0.5 ? 'rgba(155,155,155,0.2)' : 'rgba(105,105,105,0.2)';
      hCtx.beginPath();
      hCtx.arc(x, y, r, 0, Math.PI * 2);
      hCtx.fill();
    }

    // Exposed weathered brick patches where plaster peeled off
    for (let p = 0; p < 5; p++) {
      const px = 40 + rand() * (size - 120);
      const py = 40 + rand() * (size - 120);
      const pw = 48 + rand() * 56;
      const ph = 32 + rand() * 40;
      ctx.fillStyle = '#6c5340';
      ctx.fillRect(px, py, pw, ph);
      hCtx.fillStyle = '#383838';
      hCtx.fillRect(px, py, pw, ph);
      for (let by = py + 3; by < py + ph - 6; by += 12) {
        for (let bx = px + 3; bx < px + pw - 10; bx += 22) {
          ctx.fillStyle = rand() > 0.5 ? '#8f6249' : '#7b523c';
          ctx.fillRect(bx, by, 18, 9);
          hCtx.fillStyle = '#686868';
          hCtx.fillRect(bx, by, 18, 9);
        }
      }
    }

    // Fine sand-plaster grain
    for (let i = 0; i < 6500; i++) {
      const gx = rand() * size;
      const gy = rand() * size;
      ctx.fillStyle = rand() > 0.5 ? 'rgba(225,212,188,0.14)' : 'rgba(84,70,52,0.14)';
      ctx.fillRect(gx, gy, 2, 2);
      hCtx.fillStyle = rand() > 0.5 ? '#9a9a9a' : '#646464';
      hCtx.fillRect(gx, gy, 2, 2);
    }

    return {
      albedo: this.register(finalizeTexture(canvas, aniso, true, repeat, repeat)),
      normal: this.register(heightCanvasToNormal(hCanvas, 2.3, aniso, repeat, repeat)),
      roughness: this.register(finalizeTexture(hCanvas, aniso, false, repeat, repeat)),
    };
  }

  private createMetalPanelPBR(size: number, base: string, aniso: number, repeat: number) {
    const [canvas, ctx] = makeCanvas(size);
    const [hCanvas, hCtx] = makeCanvas(size);
    const rand = seededRand(823);

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    hCtx.fillStyle = '#808080';
    hCtx.fillRect(0, 0, size, size);

    // Steel plate seams (2x2 grid)
    ctx.strokeStyle = 'rgba(18,22,24,0.65)';
    ctx.lineWidth = 4;
    hCtx.strokeStyle = '#262626';
    hCtx.lineWidth = 5;
    for (const pos of [0, size / 2]) {
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();

      hCtx.beginPath();
      hCtx.moveTo(pos, 0);
      hCtx.lineTo(pos, size);
      hCtx.moveTo(0, pos);
      hCtx.lineTo(size, pos);
      hCtx.stroke();
    }

    // Edge highlight & chipped paint wear
    ctx.strokeStyle = 'rgba(185,195,200,0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, size / 2 - 8, size / 2 - 8);
    ctx.strokeRect(size / 2 + 4, 4, size / 2 - 8, size / 2 - 8);
    ctx.strokeRect(4, size / 2 + 4, size / 2 - 8, size / 2 - 8);
    ctx.strokeRect(size / 2 + 4, size / 2 + 4, size / 2 - 8, size / 2 - 8);

    // Rivets along panel borders
    for (let p = 18; p < size; p += 32) {
      for (const [rx, ry] of [[p, 12], [p, size / 2 + 12], [12, p], [size / 2 + 12, p]]) {
        ctx.fillStyle = '#6e787c';
        ctx.beginPath();
        ctx.arc(rx, ry, 3, 0, Math.PI * 2);
        ctx.fill();
        hCtx.fillStyle = '#dadada';
        hCtx.beginPath();
        hCtx.arc(rx, ry, 3.2, 0, Math.PI * 2);
        hCtx.fill();
      }
    }

    // Oil drips & surface scratches
    for (let i = 0; i < 65; i++) {
      const sx = rand() * size;
      const sy = rand() * size;
      ctx.fillStyle = rand() > 0.5 ? 'rgba(155,165,170,0.16)' : 'rgba(28,30,32,0.22)';
      ctx.fillRect(sx, sy, 4 + rand() * 18, 2);
    }

    return {
      albedo: this.register(finalizeTexture(canvas, aniso, true, repeat, repeat)),
      normal: this.register(heightCanvasToNormal(hCanvas, 2.2, aniso, repeat, repeat)),
      roughness: this.register(finalizeTexture(hCanvas, aniso, false, repeat, repeat)),
    };
  }

  private createBrickPBR(size: number, aniso: number, repeat: number) {
    const [canvas, ctx] = makeCanvas(size);
    const [hCanvas, hCtx] = makeCanvas(size);
    const rand = seededRand(505);
    ctx.fillStyle = '#5d574f';
    ctx.fillRect(0, 0, size, size);
    hCtx.fillStyle = '#353535';
    hCtx.fillRect(0, 0, size, size);

    const rows = 16;
    const cols = 8;
    const rh = size / rows;
    const cw = size / cols;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (cw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const shade = 74 + Math.floor(rand() * 34);
        ctx.fillStyle = `rgb(${shade + 20}, ${shade + 8}, ${shade - 4})`;
        ctx.fillRect(c * cw + offset + 3, r * rh + 3, cw - 6, rh - 6);
        hCtx.fillStyle = '#c8c8c8';
        hCtx.fillRect(c * cw + offset + 3, r * rh + 3, cw - 6, rh - 6);
      }
    }
    return {
      albedo: this.register(finalizeTexture(canvas, aniso, true, repeat, repeat)),
      normal: this.register(heightCanvasToNormal(hCanvas, 2.5, aniso, repeat, repeat)),
    };
  }

  private createSandbagPBR(size: number, aniso: number, repeat: number) {
    const [canvas, ctx] = makeCanvas(size);
    const [hCanvas, hCtx] = makeCanvas(size);
    ctx.fillStyle = '#9c8a68';
    ctx.fillRect(0, 0, size, size);
    hCtx.fillStyle = '#303030';
    hCtx.fillRect(0, 0, size, size);
    const rows = 6;
    const cols = 3;
    const rh = size / rows;
    const cw = size / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (cw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const grad = ctx.createRadialGradient(
          c * cw + off + cw * 0.5,
          r * rh + rh * 0.5,
          4,
          c * cw + off + cw * 0.5,
          r * rh + rh * 0.5,
          cw * 0.55
        );
        grad.addColorStop(0, '#b5a27d');
        grad.addColorStop(1, '#756649');
        ctx.fillStyle = grad;
        ctx.fillRect(c * cw + off + 2, r * rh + 2, cw - 4, rh - 4);

        const hGrad = hCtx.createRadialGradient(
          c * cw + off + cw * 0.5,
          r * rh + rh * 0.5,
          4,
          c * cw + off + cw * 0.5,
          r * rh + rh * 0.5,
          cw * 0.52
        );
        hGrad.addColorStop(0, '#f0f0f0');
        hGrad.addColorStop(1, '#262626');
        hCtx.fillStyle = hGrad;
        hCtx.fillRect(c * cw + off + 2, r * rh + 2, cw - 4, rh - 4);
      }
    }
    return {
      albedo: this.register(finalizeTexture(canvas, aniso, true, repeat, repeat)),
      normal: this.register(heightCanvasToNormal(hCanvas, 2.6, aniso, repeat, repeat)),
    };
  }

  private createChainLinkTexture(size: number, aniso: number) {
    const [canvas, ctx] = makeCanvas(size);
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = '#9aa2a6';
    ctx.lineWidth = 3;
    const step = 24;
    for (let i = -size; i < size * 2; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + size, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i, size);
      ctx.lineTo(i + size, 0);
      ctx.stroke();
    }
    return this.register(finalizeTexture(canvas, aniso, true, 4, 2));
  }

  private createMilitarySignTexture(size: number, aniso: number) {
    const [canvas, ctx] = makeCanvas(size);
    ctx.fillStyle = '#242925';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#c79b3c';
    ctx.lineWidth = 18;
    ctx.strokeRect(18, 18, size - 36, size - 36);
    ctx.fillStyle = '#c79b3c';
    ctx.fillRect(36, 48, size - 72, 92);
    ctx.fillStyle = '#141715';
    ctx.font = 'bold 56px monospace';
    ctx.fillText('RESTRICTED', 84, 114);
    ctx.fillStyle = '#d9ded6';
    ctx.font = 'bold 42px monospace';
    ctx.fillText('BLACKSITE SEC-01', 64, 250);
    ctx.font = 'bold 30px monospace';
    ctx.fillStyle = '#b6bfb1';
    ctx.fillText('AUTHORIZED PERSONNEL', 68, 330);
    ctx.fillText('LETHAL FORCE AUTHORIZED', 54, 395);
    return this.register(finalizeTexture(canvas, aniso, true, 1, 1));
  }

  private createVehicleCamoPBR(size: number, aniso: number) {
    const [canvas, ctx] = makeCanvas(size);
    const [hCanvas, hCtx] = makeCanvas(size);
    const rand = seededRand(612);
    ctx.fillStyle = '#cfcfc6'; // High-clarity multiplier so vehicle olive/sand armor paint stays vivid
    ctx.fillRect(0, 0, size, size);
    hCtx.fillStyle = '#808080';
    hCtx.fillRect(0, 0, size, size);

    // Subtle field weathering, rain streaks & micro-grime patina
    for (let i = 0; i < 85; i++) {
      ctx.fillStyle = rand() > 0.48 ? 'rgba(72,76,64,0.16)' : 'rgba(224,212,188,0.16)';
      ctx.beginPath();
      ctx.ellipse(rand() * size, rand() * size, 22 + rand() * 64, 14 + rand() * 40, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    // Fine steel grain micro-speckle
    for (let i = 0; i < 2400; i++) {
      const v = rand() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(20,22,18,0.08)';
      ctx.fillStyle = v;
      ctx.fillRect(rand() * size, rand() * size, 2, 2);
    }
    // Lower-panel desert mud/dust splash gradient
    const dustGrad = ctx.createLinearGradient(0, size * 0.65, 0, size);
    dustGrad.addColorStop(0, 'rgba(176,154,122,0)');
    dustGrad.addColorStop(1, 'rgba(176,154,122,0.34)');
    ctx.fillStyle = dustGrad;
    ctx.fillRect(0, size * 0.65, size, size * 0.35);

    // Armored steel plate seams (outer perimeter + mid cross-seam)
    ctx.strokeStyle = 'rgba(16,18,16,0.46)';
    ctx.lineWidth = 3;
    hCtx.strokeStyle = '#242424';
    hCtx.lineWidth = 3.5;
    ctx.strokeRect(10, 10, size - 20, size - 20);
    hCtx.strokeRect(10, 10, size - 20, size - 20);
    ctx.beginPath();
    ctx.moveTo(10, size * 0.5);
    ctx.lineTo(size - 10, size * 0.5);
    ctx.moveTo(size * 0.5, 10);
    ctx.lineTo(size * 0.5, size - 10);
    ctx.stroke();
    hCtx.beginPath();
    hCtx.moveTo(10, size * 0.5);
    hCtx.lineTo(size - 10, size * 0.5);
    hCtx.moveTo(size * 0.5, 10);
    hCtx.lineTo(size * 0.5, size - 10);
    hCtx.stroke();

    // Raised armor bolts & rivets along all 4 edges + center seam
    for (let i = 28; i < size - 16; i += 40) {
      for (const y of [22, size * 0.5 - 12, size * 0.5 + 12, size - 22]) {
        ctx.fillStyle = 'rgba(24,26,24,0.5)';
        ctx.beginPath();
        ctx.arc(i, y, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(225,228,220,0.3)';
        ctx.beginPath();
        ctx.arc(i - 1, y - 1, 1.8, 0, Math.PI * 2);
        ctx.fill();
        hCtx.fillStyle = '#ececec';
        hCtx.beginPath();
        hCtx.arc(i, y, 4.2, 0, Math.PI * 2);
        hCtx.fill();
      }
    }
    // Metallic combat edge wear & surface scratches
    for (let i = 0; i < 55; i++) {
      const sx = rand() * size;
      const sy = rand() * size;
      ctx.strokeStyle = rand() > 0.3 ? 'rgba(225,230,235,0.28)' : 'rgba(30,28,24,0.28)';
      ctx.lineWidth = 1.2 + rand() * 0.9;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (rand() - 0.5) * 52, sy + (rand() - 0.5) * 18);
      ctx.stroke();
    }

    return {
      albedo: this.register(finalizeTexture(canvas, aniso, true, 1, 1)),
      normal: this.register(heightCanvasToNormal(hCanvas, 2.5, aniso, 1, 1)),
    };
  }

  private createGunWearPBR(size: number, aniso: number) {
    const [canvas, ctx] = makeCanvas(size);
    const [rCanvas, rCtx] = makeCanvas(size);
    const rand = seededRand(8842);

    // Base dark anodized parkerized finish (neutral-bright enough to multiply with weapon colorPrimary)
    ctx.fillStyle = '#c4c9cf';
    ctx.fillRect(0, 0, size, size);
    // Base satin-matte roughness (around 0.42 -> ~107)
    rCtx.fillStyle = '#727272';
    rCtx.fillRect(0, 0, size, size);

    // Fine directional CNC machined brush grain
    for (let y = 0; y < size; y += 2) {
      const shade = 186 + Math.floor(rand() * 26);
      ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 5})`;
      ctx.fillRect(0, y, size, 2);
      const rVal = 96 + Math.floor(rand() * 34);
      rCtx.fillStyle = `rgb(${rVal},${rVal},${rVal})`;
      rCtx.fillRect(0, y, size, 2);
    }

    // Subtle oil sheen / gun-oil handling smudges (glossy low-roughness patches)
    for (let i = 0; i < 36; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const rad = 18 + rand() * 44;
      const g = rCtx.createRadialGradient(x, y, 2, x, y, rad);
      g.addColorStop(0, 'rgba(38,38,38,0.55)');
      g.addColorStop(1, 'rgba(115,115,115,0)');
      rCtx.fillStyle = g;
      rCtx.beginPath();
      rCtx.arc(x, y, rad, 0, Math.PI * 2);
      rCtx.fill();
    }

    // Machined edge silvering & realistic combat scratches (bright metal albedo + low roughness)
    for (let i = 0; i < 120; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const len = 8 + rand() * 46;
      const ang = (rand() - 0.5) * 0.45;
      ctx.strokeStyle = rand() > 0.25 ? 'rgba(242,246,252,0.42)' : 'rgba(62,66,72,0.35)';
      ctx.lineWidth = 0.8 + rand() * 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();

      rCtx.strokeStyle = 'rgba(28,28,28,0.75)';
      rCtx.lineWidth = 1.4;
      rCtx.beginPath();
      rCtx.moveTo(x, y);
      rCtx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      rCtx.stroke();
    }

    // Subtle recessed receiver seam & proof-mark micro-stencils
    ctx.strokeStyle = 'rgba(36,40,45,0.42)';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, size - 36, size - 36);
    ctx.fillStyle = 'rgba(225,230,235,0.22)';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('MIL-SPEC 5.56 NATO', 34, 48);
    ctx.fillText('SER. OW-41692', 34, size - 34);

    return {
      albedo: this.register(finalizeTexture(canvas, aniso, true, 1, 1)),
      roughness: this.register(finalizeTexture(rCanvas, aniso, false, 1, 1)),
    };
  }

  private createTireTreadPBR(size: number, aniso: number) {
    const [canvas, ctx] = makeCanvas(size);
    const [hCanvas, hCtx] = makeCanvas(size);
    ctx.fillStyle = '#181a1c';
    ctx.fillRect(0, 0, size, size);
    hCtx.fillStyle = '#252525';
    hCtx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#26282a';
    hCtx.fillStyle = '#e0e0e0';
    for (let y = 0; y < size; y += 24) {
      ctx.fillRect(10, y + 4, size * 0.4, 14);
      ctx.fillRect(size * 0.55, y + 12, size * 0.38, 14);
      hCtx.fillRect(10, y + 4, size * 0.4, 14);
      hCtx.fillRect(size * 0.55, y + 12, size * 0.38, 14);
    }

    return {
      albedo: this.register(finalizeTexture(canvas, aniso, true, 1, 3)),
      normal: this.register(heightCanvasToNormal(hCanvas, 3.0, aniso, 1, 3)),
    };
  }

  private createBrushedMetalNormal(size: number, aniso: number) {
    const [hCanvas, hCtx] = makeCanvas(size);
    const rand = seededRand(707);
    hCtx.fillStyle = '#808080';
    hCtx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y++) {
      const v = 112 + Math.floor(rand() * 32);
      hCtx.fillStyle = `rgb(${v},${v},${v})`;
      hCtx.fillRect(0, y, size, 1);
    }
    return this.register(heightCanvasToNormal(hCanvas, 1.4, aniso, 2, 2));
  }

  private createStippledPolymerNormal(size: number, aniso: number) {
    const [hCanvas, hCtx] = makeCanvas(size);
    const rand = seededRand(717);
    hCtx.fillStyle = '#707070';
    hCtx.fillRect(0, 0, size, size);
    for (let i = 0; i < 4200; i++) {
      const v = 70 + Math.floor(rand() * 140);
      hCtx.fillStyle = `rgb(${v},${v},${v})`;
      hCtx.fillRect(rand() * size, rand() * size, 3, 3);
    }
    return this.register(heightCanvasToNormal(hCanvas, 2.1, aniso, 3, 3));
  }

  private createTerrainPBR(size: number, aniso: number) {
    const [canvas, ctx] = makeCanvas(size);
    const [hCanvas, hCtx] = makeCanvas(size);
    const rand = seededRand(909);

    ctx.fillStyle = '#c8c8c4';
    ctx.fillRect(0, 0, size, size);
    hCtx.fillStyle = '#808080';
    hCtx.fillRect(0, 0, size, size);

    // Organic soil clods & micro patches
    for (let i = 0; i < 420; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 6 + rand() * 26;
      const dark = rand() > 0.48;
      ctx.fillStyle = dark ? 'rgba(90,88,80,0.16)' : 'rgba(235,232,222,0.12)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      hCtx.fillStyle = dark ? '#5f5f5f' : '#a4a4a4';
      hCtx.globalAlpha = 0.2;
      hCtx.beginPath();
      hCtx.arc(x, y, r, 0, Math.PI * 2);
      hCtx.fill();
    }
    hCtx.globalAlpha = 1;

    // Fine pebble & grass-blade grain
    for (let i = 0; i < 9500; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const v = 140 + Math.floor(rand() * 95);
      ctx.fillStyle = `rgba(${v},${v},${v - 5},0.35)`;
      ctx.fillRect(x, y, 2, 2);
      hCtx.fillStyle = v > 185 ? '#b4b4b4' : '#585858';
      hCtx.fillRect(x, y, 2, 2);
    }

    return {
      albedo: this.register(finalizeTexture(canvas, aniso, true, 22, 22)),
      normal: this.register(heightCanvasToNormal(hCanvas, 2.3, aniso, 22, 22)),
      roughness: this.register(finalizeTexture(hCanvas, aniso, false, 22, 22)),
    };
  }

  /**
   * Packs RGB from an albedo canvas + linear Roughness from a grayscale array into a zero-premultiply DataTexture.
   */
  private packAlbedoRoughness(
    size: number,
    albedoRgb: Uint8Array,
    roughnessArr: Float32Array,
    aniso: number
  ): THREE.DataTexture {
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      data[i * 4] = albedoRgb[i * 3];
      data[i * 4 + 1] = albedoRgb[i * 3 + 1];
      data[i * 4 + 2] = albedoRgb[i * 3 + 2];
      data[i * 4 + 3] = Math.round(THREE.MathUtils.clamp(roughnessArr[i], 0.05, 1.0) * 255);
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    tex.needsUpdate = true;
    return this.register(tex);
  }

  /**
   * Computes a seamless tangent-space Normal Map (RGB) + Height mask (A) from a tileable float heightfield.
   */
  private heightFieldToNormalHeight(
    size: number,
    heights: Float32Array,
    strength: number,
    aniso: number
  ): THREE.DataTexture {
    const data = new Uint8Array(size * size * 4);
    const sample = (x: number, y: number) => heights[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
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

        const idx = (y * size + x) * 4;
        data[idx] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
        data[idx + 3] = Math.round(THREE.MathUtils.clamp(heights[y * size + x], 0, 1) * 255);
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = aniso;
    tex.needsUpdate = true;
    return this.register(tex);
  }

  /**
   * Seamless tileable 2D value noise with integer period P so textures wrap with ZERO edge seams.
   */
  private tileNoise(x: number, y: number, period: number, seed: number): number {
    const hash = (ix: number, iy: number) => {
      const wx = ((ix % period) + period) % period;
      const wy = ((iy % period) + period) % period;
      const n = Math.sin(wx * 127.1 + wy * 311.7 + seed * 74.7) * 43758.5453123;
      return n - Math.floor(n);
    };
    const px = x * period;
    const py = y * period;
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const fx = px - ix;
    const fy = py - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }

  private tileFbm(u: number, v: number, basePeriod: number, octaves: number, seed: number): number {
    let val = 0;
    let amp = 0.5;
    let p = basePeriod;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      val += amp * this.tileNoise(u, v, p, seed + o * 19);
      norm += amp;
      p *= 2;
      amp *= 0.5;
    }
    return val / norm;
  }

  /**
   * PHASE 2 — Builds 6 seamless, physically calibrated PBR terrain material maps:
   * 1. Wind-Rippled Desert Sand  2. Compacted Military Dirt  3. Dry Olive/Straw Steppe Grass
   * 4. Stratified Alpine Granite Rock  5. Military Base Concrete  6. Weathered Tactical Asphalt
   */
  private createTerrainSplatSuite(size: number, aniso: number): TerrainSplatTextures {
    const pxCount = size * size;
    const TAU = Math.PI * 2;

    // --- 1. WIND-RIPPLED DESERT SAND ---
    const sandRgb = new Uint8Array(pxCount * 3);
    const sandRough = new Float32Array(pxCount);
    const sandHeight = new Float32Array(pxCount);

    // --- 2. COMPACTED MILITARY DIRT & GRAVEL ---
    const dirtRgb = new Uint8Array(pxCount * 3);
    const dirtRough = new Float32Array(pxCount);
    const soilGrassHeight = new Float32Array(pxCount);

    // --- 3. DRY STEPPE / ARID MILITARY GRASS ---
    const grassRgb = new Uint8Array(pxCount * 3);
    const grassRough = new Float32Array(pxCount);

    // --- 4. STRATIFIED CANYON & ALPINE GRANITE ROCK ---
    const rockRgb = new Uint8Array(pxCount * 3);
    const rockRough = new Float32Array(pxCount);
    const rockHeight = new Float32Array(pxCount);

    // --- 5. MILITARY CONCRETE SLABS ---
    const concRgb = new Uint8Array(pxCount * 3);
    const concRough = new Float32Array(pxCount);
    const urbanHeight = new Float32Array(pxCount);

    // --- 6. WEATHERED TARMAC ASPHALT ---
    const asphRgb = new Uint8Array(pxCount * 3);
    const asphRough = new Float32Array(pxCount);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = y * size + x;
        const c3 = idx * 3;

        // Shared multi-octave seamless noises
        const nMacro = this.tileFbm(u, v, 4, 4, 11);
        const nMid = this.tileFbm(u, v, 8, 4, 37);
        const nFine = this.tileNoise(u, v, 64, 73);
        const nMicro = this.tileNoise(u, v, 128, 109);

        // === 1. SAND: Wind-sculpted sand ripples + embedded desert gravel/pebbles + crevice AO ===
        const warp = this.tileFbm(u, v, 4, 3, 211) * 1.15;
        const ripplePhase = (u * 10.0 + v * 4.0 + warp * 0.85) * TAU;
        const rippleWave = 0.5 + 0.5 * Math.sin(ripplePhase + 0.38 * Math.sin(ripplePhase));
        const secondaryRipple = 0.5 + 0.5 * Math.sin((u * 20.0 - v * 6.0 + warp * 0.4) * TAU);
        // Embedded desert stones & pebbles (inspired by arid rocky sand ground reference)
        const stoneNoiseA = this.tileNoise(u, v, 24, 241);
        const stoneNoiseB = this.tileNoise(u, v, 56, 263);
        const embeddedStone = THREE.MathUtils.smoothstep(stoneNoiseA, 0.76, 0.86);
        const fineGravel = THREE.MathUtils.smoothstep(stoneNoiseB, 0.74, 0.84) * 0.55;
        const stoneRimAo = THREE.MathUtils.smoothstep(stoneNoiseA, 0.68, 0.77) * (1 - embeddedStone) * 0.28;
        const sandH = THREE.MathUtils.clamp(
          rippleWave * 0.54 + secondaryRipple * 0.12 + nMid * 0.14 + embeddedStone * 0.32 + fineGravel * 0.12 - stoneRimAo * 0.22,
          0,
          1
        );
        sandHeight[idx] = sandH;

        const sandTone = (0.78 + sandH * 0.24 + (nMacro - 0.5) * 0.16) * (1 - stoneRimAo * 0.48);
        const stoneMix = Math.min(1, embeddedStone * 0.82 + fineGravel * 0.45);
        const baseSandR = 176 * sandTone + (nFine - 0.5) * 14;
        const baseSandG = 140 * sandTone + (nFine - 0.5) * 11;
        const baseSandB = 94 * sandTone + (nFine - 0.5) * 8;
        const pebVal = 104 + (nFine - 0.5) * 34;
        sandRgb[c3] = Math.round(THREE.MathUtils.clamp(THREE.MathUtils.lerp(baseSandR, pebVal * 1.04, stoneMix), 54, 222));
        sandRgb[c3 + 1] = Math.round(THREE.MathUtils.clamp(THREE.MathUtils.lerp(baseSandG, pebVal * 0.99, stoneMix), 46, 186));
        sandRgb[c3 + 2] = Math.round(THREE.MathUtils.clamp(THREE.MathUtils.lerp(baseSandB, pebVal * 0.88, stoneMix), 32, 134));
        sandRough[idx] = THREE.MathUtils.clamp(0.93 - rippleWave * 0.12 - stoneMix * 0.1 + (nMicro - 0.5) * 0.06, 0.72, 0.96);

        // === 2. DIRT: Compacted ochre-umber soil clods, embedded fieldstones & gravel ===
        const dirtClods = this.tileFbm(u, v, 10, 4, 307);
        const dirtStone = THREE.MathUtils.smoothstep(this.tileNoise(u, v, 28, 353), 0.74, 0.85);
        const pebble = THREE.MathUtils.smoothstep(this.tileNoise(u, v, 64, 379), 0.78, 0.88) * 0.26;
        const dirtH = THREE.MathUtils.clamp(dirtClods * 0.55 + nFine * 0.18 + dirtStone * 0.34 + pebble, 0, 1);
        const dirtVar = 0.72 + dirtClods * 0.34 + (nMacro - 0.5) * 0.16;
        const rockTint = Math.min(1, dirtStone * 0.78 + pebble);
        dirtRgb[c3] = Math.round(THREE.MathUtils.clamp(THREE.MathUtils.lerp(126 * dirtVar, 114, rockTint), 44, 170));
        dirtRgb[c3 + 1] = Math.round(THREE.MathUtils.clamp(THREE.MathUtils.lerp(102 * dirtVar, 106, rockTint), 36, 148));
        dirtRgb[c3 + 2] = Math.round(THREE.MathUtils.clamp(THREE.MathUtils.lerp(72 * dirtVar, 92, rockTint), 26, 118));
        dirtRough[idx] = THREE.MathUtils.clamp(0.92 + (1 - dirtH) * 0.06 - rockTint * 0.14, 0.78, 0.99);

        // === 3. DRY STEPPE GRASS: Olive-sage & golden straw blades over dark soil humus ===
        const bladeNoise = this.tileNoise(u * 2.0, v * 0.5, 48, 419);
        const bladeNoise2 = this.tileNoise(u * 0.5, v * 2.0, 48, 461);
        const clump = this.tileFbm(u, v, 6, 4, 503);
        const strawMask = THREE.MathUtils.smoothstep(clump, 0.44, 0.78);
        const blades = Math.max(bladeNoise, bladeNoise2);
        const grassH = THREE.MathUtils.clamp(clump * 0.55 + blades * 0.38 + nMicro * 0.07, 0, 1);
        // Combined soil/grass normal heightfield favors sharp organic clods + blade fiber relief
        soilGrassHeight[idx] = THREE.MathUtils.clamp(dirtH * 0.55 + grassH * 0.45, 0, 1);

        // Deep olive-khaki mixed with warm golden-straw dry patches & dark earth base (NEVER neon green!)
        const darkSoil = THREE.MathUtils.smoothstep(clump, 0.22, 0.55);
        const gR = THREE.MathUtils.lerp(72, THREE.MathUtils.lerp(86, 134, strawMask), darkSoil) + (blades - 0.5) * 24;
        const gG = THREE.MathUtils.lerp(62, THREE.MathUtils.lerp(94, 118, strawMask), darkSoil) + (blades - 0.5) * 22;
        const gB = THREE.MathUtils.lerp(42, THREE.MathUtils.lerp(52, 62, strawMask), darkSoil) + (blades - 0.5) * 14;
        grassRgb[c3] = Math.round(THREE.MathUtils.clamp(gR, 34, 158));
        grassRgb[c3 + 1] = Math.round(THREE.MathUtils.clamp(gG, 36, 148));
        grassRgb[c3 + 2] = Math.round(THREE.MathUtils.clamp(gB, 22, 92));
        grassRough[idx] = THREE.MathUtils.clamp(0.90 + (1 - blades) * 0.08, 0.85, 0.98);

        // === 4. STRATIFIED GRANITE ROCK: Layered cliff ledges & angular crevices ===
        const strataWarp = this.tileFbm(u, v, 4, 3, 601) * 0.35;
        const strata = 0.5 + 0.5 * Math.sin((v * 8.0 + u * 2.0 + strataWarp * 6.0) * TAU);
        const crackNoise = Math.abs(this.tileFbm(u, v, 8, 4, 653) * 2.0 - 1.0);
        const crevice = THREE.MathUtils.smoothstep(crackNoise, 0.0, 0.18);
        const rockH = THREE.MathUtils.clamp((strata * 0.42 + nMid * 0.42 + nFine * 0.16) * (0.45 + 0.55 * crevice), 0, 1);
        rockHeight[idx] = rockH;

        const rBase = (66 + rockH * 72 + (nMacro - 0.5) * 22) * (0.62 + 0.38 * crevice);
        const dustVein = THREE.MathUtils.smoothstep(1.0 - crevice, 0.4, 0.9) * 0.25;
        rockRgb[c3] = Math.round(THREE.MathUtils.clamp(rBase * 1.04 + dustVein * 48, 30, 162));
        rockRgb[c3 + 1] = Math.round(THREE.MathUtils.clamp(rBase * 1.01 + dustVein * 38, 30, 156));
        rockRgb[c3 + 2] = Math.round(THREE.MathUtils.clamp(rBase * 0.97 + dustVein * 22, 28, 152));
        rockRough[idx] = THREE.MathUtils.clamp(0.80 + (1 - rockH) * 0.16, 0.76, 0.97);

        // === 5. MILITARY CONCRETE SLABS: Poured joints, weathered oil stains & grit ===
        const slabU = (u * 2.0) % 1.0;
        const slabV = (v * 2.0) % 1.0;
        const jointDist = Math.min(slabU, 1 - slabU, slabV, 1 - slabV);
        const jointMask = THREE.MathUtils.smoothstep(jointDist, 0.008, 0.022);
        const oilStain = THREE.MathUtils.smoothstep(nMacro, 0.62, 0.85) * 0.22;
        const concTone = (118 + (nMid - 0.5) * 28 + (nFine - 0.5) * 16) * (0.62 + 0.38 * jointMask) * (1 - oilStain);
        concRgb[c3] = Math.round(THREE.MathUtils.clamp(concTone * 1.02, 42, 164));
        concRgb[c3 + 1] = Math.round(THREE.MathUtils.clamp(concTone * 1.0, 42, 160));
        concRgb[c3 + 2] = Math.round(THREE.MathUtils.clamp(concTone * 0.94, 38, 150));
        concRough[idx] = THREE.MathUtils.clamp(0.86 + (1 - jointMask) * 0.1 - oilStain * 0.35 + (nFine - 0.5) * 0.08, 0.68, 0.97);

        // === 6. WEATHERED TARMAC ASPHALT: Coarse stone aggregate, micro-cracks & tire wear ===
        const aggregate = nMicro * 0.55 + nFine * 0.45;
        const asphCrack = Math.abs(this.tileFbm(u, v, 6, 3, 787) * 2.0 - 1.0);
        const crackDark = THREE.MathUtils.smoothstep(asphCrack, 0.0, 0.06);
        const asphTone = (58 + aggregate * 34 + (nMacro - 0.5) * 14) * (0.65 + 0.35 * crackDark);
        asphRgb[c3] = Math.round(THREE.MathUtils.clamp(asphTone * 1.0, 24, 114));
        asphRgb[c3 + 1] = Math.round(THREE.MathUtils.clamp(asphTone * 1.01, 24, 116));
        asphRgb[c3 + 2] = Math.round(THREE.MathUtils.clamp(asphTone * 1.04, 26, 120));
        asphRough[idx] = THREE.MathUtils.clamp(0.76 + (1 - nMacro) * 0.14 + (1 - crackDark) * 0.1, 0.7, 0.96);

        // Urban normal heightfield combines concrete slab joints + coarse asphalt aggregate
        urbanHeight[idx] = THREE.MathUtils.clamp(jointMask * 0.55 + aggregate * 0.35 + crackDark * 0.1, 0, 1);
      }
    }

    return {
      sandAlbedoRough: this.packAlbedoRoughness(size, sandRgb, sandRough, aniso),
      sandNormalHeight: this.heightFieldToNormalHeight(size, sandHeight, 3.2, aniso),
      dirtAlbedoRough: this.packAlbedoRoughness(size, dirtRgb, dirtRough, aniso),
      grassAlbedoRough: this.packAlbedoRoughness(size, grassRgb, grassRough, aniso),
      soilGrassNormalHeight: this.heightFieldToNormalHeight(size, soilGrassHeight, 2.7, aniso),
      rockAlbedoRough: this.packAlbedoRoughness(size, rockRgb, rockRough, aniso),
      rockNormalHeight: this.heightFieldToNormalHeight(size, rockHeight, 3.8, aniso),
      concreteAlbedoRough: this.packAlbedoRoughness(size, concRgb, concRough, aniso),
      asphaltAlbedoRough: this.packAlbedoRoughness(size, asphRgb, asphRough, aniso),
      urbanNormalHeight: this.heightFieldToNormalHeight(size, urbanHeight, 2.4, aniso),
    };
  }

  private createRadialTexture(size: number, c0: string, c1: string, c2: string) {
    const [canvas, ctx] = makeCanvas(size);
    const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    grad.addColorStop(0, c0);
    grad.addColorStop(0.55, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    this.textures.push(tex);
    return tex;
  }

  private createSmokePuffTexture(size: number) {
    const [canvas, ctx] = makeCanvas(size);
    ctx.clearRect(0, 0, size, size);
    const rand = seededRand(515);
    for (let i = 0; i < 14; i++) {
      const cx = size * (0.32 + rand() * 0.36);
      const cy = size * (0.32 + rand() * 0.36);
      const r = size * (0.2 + rand() * 0.22);
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
      grad.addColorStop(0, 'rgba(230,234,228,0.42)');
      grad.addColorStop(0.6, 'rgba(180,186,180,0.18)');
      grad.addColorStop(1, 'rgba(150,155,150,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.textures.push(tex);
    return tex;
  }

  public setAnisotropyForPreset(preset: GraphicsPreset, maxAniso: number) {
    const target =
      preset === 'LOW'
        ? 1
        : preset === 'MEDIUM'
        ? Math.min(4, maxAniso)
        : preset === 'HIGH'
        ? Math.min(8, maxAniso)
        : Math.min(16, maxAniso);
    for (const tex of this.textures) {
      if (tex.anisotropy !== target) {
        tex.anisotropy = target;
        tex.needsUpdate = true;
      }
    }
  }

  public dispose() {
    for (const tex of this.textures) tex.dispose();
    for (const val of Object.values(this.materials)) {
      if (val && typeof (val as THREE.Material).dispose === 'function') {
        (val as THREE.Material).dispose();
      }
    }
  }
}
