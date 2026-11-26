import * as THREE from 'three';
import {
  EXTRACTION_POINTS,
  REGION_LIST,
  ROAD_NETWORK,
  SECTOR_SIZE,
  WORLD_HALF_SIZE,
} from '../data/worldConfig';
import { GraphicsPreset, RegionId, WeatherType } from '../types';
import { getRegionAt } from '../data/worldConfig';
import { ProceduralMaterials } from './TextureLibrary';
import { TerrainManager, distToSegment } from './TerrainManager';
import { LootSystem } from './LootSystem';
import { createInventoryEntry } from '../data/items';
import { AtmosphereLightingState, SkyAtmosphere } from './SkyAtmosphere';
import {
  buildPatrolHelicopterModel,
  createOrganicVegetationAssets,
  OrganicVegetationAssets,
} from './VegetationModels';
import { AssetCategory, ModelAssetManager } from './ModelAssetManager';

export interface ColliderBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  material: 'concrete' | 'metal' | 'wood';
  sectorKey: string;
}

export interface DestructibleProp {
  id: string;
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  health: number;
  explosive: boolean;
  missionId?: string;
  destroyed: boolean;
  sectorKey: string;
}

export interface InteractiveTerminal {
  id: string;
  label: string;
  position: THREE.Vector3;
  missionId: string;
  used: boolean;
  mesh: THREE.Object3D;
}

export interface SecurityCameraEntity {
  id: string;
  position: THREE.Vector3;
  baseYaw: number;
  currentYaw: number;
  headMesh: THREE.Object3D;
  coneLight: THREE.Mesh;
  destroyed: boolean;
  alarmCooldown: number;
  sectorKey: string;
}

interface SectorData {
  key: string;
  sx: number;
  sz: number;
  centerX: number;
  centerZ: number;
  group: THREE.Group;
  colliders: ColliderBox[];
  lodHighObjects: THREE.Object3D[];
  lodLowObjects: THREE.Object3D[];
  nearClutterObjects: THREE.Object3D[];
  isFarLod: boolean;
}

interface ExtractionSmokePuff {
  sprite: THREE.Sprite;
  origin: THREE.Vector3;
  phase: number;
  speed: number;
  swayOffset: number;
}

function sectorHash(sx: number, sz: number, n: number): number {
  let h = (sx * 374761393 + sz * 668265263 + n * 1442695041) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 0xffffffff;
}

export class WorldManager {
  public scene: THREE.Scene;
  public terrain: TerrainManager;
  public mats: ProceduralMaterials;
  public loot: LootSystem;
  public assetManager: ModelAssetManager;

  public sectors = new Map<string, SectorData>();
  public allColliders: ColliderBox[] = [];
  public destructibles: DestructibleProp[] = [];
  public terminals: InteractiveTerminal[] = [];
  public securityCameras: SecurityCameraEntity[] = [];
  public raycastMeshes: THREE.Object3D[] = [];

  // Lighting, Sky & Weather (Default 17:40 Golden Hour matching Desert Outpost reference!)
  public sunLight: THREE.DirectionalLight;
  public bounceLight: THREE.DirectionalLight;
  public hemiLight: THREE.HemisphereLight;
  public sky: SkyAtmosphere;
  public fog: THREE.Fog;
  public lastAtmosphere: AtmosphereLightingState | null = null;
  public lastWeatherDim = 1.0;
  public timeOfDay = 17.28;
  public daySpeed = 0.025;
  public weather: WeatherType = 'clear';
  private weatherTimer = 140;

  private rainPoints: THREE.Points;
  private rainPositions: Float32Array;
  private dustPoints: THREE.Points;
  private dustPositions: Float32Array;
  private patrolHeli: { group: THREE.Group; mainRotor: THREE.Group; tailRotor: THREE.Group };
  private heliAngle = 0.4;

  private extractionSmokePuffs: ExtractionSmokePuff[] = [];
  private beaconMeshes: THREE.Mesh[] = [];
  private artificialLampMats: THREE.MeshStandardMaterial[] = [];
  private windTimeUniform = { value: 0 };
  private sunDirUniform = { value: new THREE.Vector3(-0.82, 0.16, -0.54).normalize() };

  public activeRadius = 2;
  private graphicsPreset: GraphicsPreset = 'HIGH';
  private lastPlayerSectorKey = '';
  private isSoftwareGl: boolean;

  private onSectorLoaded?: (sx: number, sz: number, key: string) => void;
  private onSectorUnloaded?: (key: string) => void;

  // Organic multi-part vegetation assets (replaces ALL cones/pyramids!)
  private veg: OrganicVegetationAssets;
  private barrelGeo = new THREE.CylinderGeometry(0.36, 0.36, 1.15, 12);
  private barrelMat: THREE.MeshStandardMaterial;
  private lampWarmMat: THREE.MeshStandardMaterial;
  private lampCoolMat: THREE.MeshStandardMaterial;
  private beaconRedMat: THREE.MeshBasicMaterial;
  private containerMats: THREE.MeshStandardMaterial[];
  private desertConcreteMat: THREE.MeshStandardMaterial;

  constructor(
    scene: THREE.Scene,
    terrain: TerrainManager,
    mats: ProceduralMaterials,
    loot: LootSystem,
    isSoftwareGl: boolean,
    callbacks?: {
      onSectorLoaded?: (sx: number, sz: number, key: string) => void;
      onSectorUnloaded?: (key: string) => void;
    }
  ) {
    this.scene = scene;
    this.terrain = terrain;
    this.mats = mats;
    this.loot = loot;
    this.isSoftwareGl = isSoftwareGl;
    this.onSectorLoaded = callbacks?.onSectorLoaded;
    this.onSectorUnloaded = callbacks?.onSectorUnloaded;

    // Initialize GLB/GLTF professional model override manager (manifest-driven, zero 404s)
    this.assetManager = new ModelAssetManager();
    void this.assetManager.init().then(() => this.assetManager.preloadRegisteredInstancedAssets());

    // Build organic non-geometric curved trees, desert palms, 3D curved grass tufts & sculpted geological rock clusters
    this.veg = createOrganicVegetationAssets(mats, this.windTimeUniform, this.sunDirUniform);

    this.desertConcreteMat = new THREE.MeshStandardMaterial({
      color: 0xa69b86,
      map: mats.concrete.map,
      normalMap: mats.concrete.normalMap,
      normalScale: new THREE.Vector2(1.05, 1.05),
      roughnessMap: mats.concrete.roughnessMap,
      roughness: 0.92,
      metalness: 0.04,
    });

    this.barrelMat = new THREE.MeshStandardMaterial({
      color: 0xa62e20,
      roughness: 0.45,
      metalness: 0.52,
      normalMap: mats.gunNormalMap,
      normalScale: new THREE.Vector2(0.3, 0.3),
    });

    this.lampWarmMat = new THREE.MeshStandardMaterial({
      color: 0xffe4b5,
      emissive: 0xffb85c,
      emissiveIntensity: 0.95,
      roughness: 0.2,
    });
    this.lampCoolMat = new THREE.MeshStandardMaterial({
      color: 0xd8ecff,
      emissive: 0x7cb8ff,
      emissiveIntensity: 0.75,
      roughness: 0.2,
    });
    this.artificialLampMats.push(this.lampWarmMat, this.lampCoolMat);

    this.beaconRedMat = new THREE.MeshBasicMaterial({ color: 0xff3226 });

    this.containerMats = [0x35493d, 0x7c3624, 0x344354, 0x62573e].map(
      (hex) =>
        new THREE.MeshStandardMaterial({
          color: hex,
          map: mats.corrugatedMetal.map,
          normalMap: mats.corrugatedMetal.normalMap,
          normalScale: new THREE.Vector2(1.0, 1.0),
          roughness: 0.62,
          metalness: 0.48,
        })
    );

    // Atmospheric GLSL Golden-Hour Sky Dome & linear horizon fog pinned cleanly to the edge of the last loaded chunk
    const initialFogFar = this.activeRadius * SECTOR_SIZE * 0.92;
    this.fog = new THREE.Fog(0xc49567, initialFogFar * 0.52, initialFogFar);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(0xc49567);
    this.sky = new SkyAtmosphere(this.scene);

    // Vivid Golden-Hour Outdoor Lighting Rig (Warm Sun Key + Cool Atmospheric Bounce + Sky/Ground Hemisphere)
    this.hemiLight = new THREE.HemisphereLight(0x96b8de, 0x694e34, 0.74);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffcf88, 2.75);
    this.sunLight.position.set(-140, 75, -90);
    this.sunLight.castShadow = !isSoftwareGl;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 420;
    const d = 112;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.00035;
    this.sunLight.shadow.normalBias = 0.024;
    this.sunLight.shadow.radius = 2.0;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Cool sky atmospheric bounce fill opposite the sun (no shadows, adds depth to shadowed concrete & dunes)
    this.bounceLight = new THREE.DirectionalLight(0x7ca2cc, 0.34);
    this.bounceLight.position.set(120, 55, 95);
    this.bounceLight.castShadow = false;
    this.scene.add(this.bounceLight);

    // Rain particle field
    const rainCount = 1500;
    this.rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * 96;
      this.rainPositions[i * 3 + 1] = Math.random() * 46;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 96;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0xc2d4e0,
      size: 0.24,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    });
    this.rainPoints = new THREE.Points(rainGeo, rainMat);
    this.rainPoints.visible = false;
    this.rainPoints.frustumCulled = false;
    this.scene.add(this.rainPoints);

    // Ambient sunlit airborne dust motes drifting across the battlefield
    const dustCount = 320;
    this.dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      this.dustPositions[i * 3] = (Math.random() - 0.5) * 76;
      this.dustPositions[i * 3 + 1] = Math.random() * 14;
      this.dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 76;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xe8c796,
      map: mats.smokeSpriteMap,
      size: 0.55,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    this.dustPoints = new THREE.Points(dustGeo, dustMat);
    this.dustPoints.frustumCulled = false;
    this.scene.add(this.dustPoints);

    // Ambient Patrol Helicopter flying overhead across Desert Outpost & Blacksite skies
    this.patrolHeli = buildPatrolHelicopterModel(mats);
    this.patrolHeli.group.position.set(350, 74, -120);
    this.scene.add(this.patrolHeli.group);

    this.buildGlobalLandmarks();
  }

  public applyGraphicsPreset(preset: GraphicsPreset) {
    if (preset === this.graphicsPreset && this.sectors.size > 0) return;
    this.graphicsPreset = preset;

    const configureShadow = (enabled: boolean, res: number, frustumHalf: number) => {
      this.sunLight.castShadow = enabled && !this.isSoftwareGl;
      if (this.sunLight.castShadow) {
        this.sunLight.shadow.mapSize.set(res, res);
        this.sunLight.shadow.camera.left = -frustumHalf;
        this.sunLight.shadow.camera.right = frustumHalf;
        this.sunLight.shadow.camera.top = frustumHalf;
        this.sunLight.shadow.camera.bottom = -frustumHalf;
        this.sunLight.shadow.camera.updateProjectionMatrix();
        this.sunLight.shadow.map?.dispose();
        this.sunLight.shadow.map = null;
      }
    };

    if (preset === 'LOW') {
      configureShadow(false, 1024, 90);
    } else if (preset === 'MEDIUM') {
      configureShadow(true, 1024, 105);
    } else if (preset === 'HIGH') {
      configureShadow(true, 2048, 125);
    } else {
      configureShadow(true, 4096, 150);
    }

    for (const [k, s] of Array.from(this.sectors.entries())) {
      this.unloadSector(k, s);
    }
    this.lastPlayerSectorKey = '';
  }

  /**
   * Adjusts chunk streaming radius live (1..4 chunks around player) and immediately refreshes loaded chunks & end-of-chunk fog.
   */
  public setRenderDistanceChunks(chunks: number, playerPos?: THREE.Vector3) {
    const clamped = Math.max(1, Math.min(4, Math.round(chunks)));
    if (clamped === this.activeRadius && this.sectors.size > 0) return;
    this.activeRadius = clamped;
    this.lastPlayerSectorKey = '';
    if (playerPos) {
      this.updateStreaming(playerPos);
    }
    const targetFar = this.computeChunkFogFar();
    this.fog.far = targetFar;
    this.fog.near = targetFar * this.getFogNearRatio();
  }

  public isPositionInLoadedChunk(x: number, z: number): boolean {
    const sx = Math.floor(x / SECTOR_SIZE);
    const sz = Math.floor(z / SECTOR_SIZE);
    return this.sectors.has(`${sx},${sz}`);
  }

  private getFogNearRatio(): number {
    return this.weather === 'fog' ? 0.16 : this.weather === 'rain' ? 0.34 : this.weather === 'overcast' ? 0.44 : 0.54;
  }

  private computeChunkFogFar(): number {
    // End of the last loaded chunk in any cardinal direction is activeRadius * SECTOR_SIZE;
    // cap fogFar slightly inside that edge (0.92x) so chunks dissolve seamlessly into horizon sky with zero hard cutoff!
    const chunkEdgeDist = this.activeRadius * SECTOR_SIZE * 0.92;
    const weatherScale =
      this.weather === 'fog' ? 0.44 : this.weather === 'rain' ? 0.68 : this.weather === 'overcast' ? 0.86 : 1.0;
    return Math.max(85, chunkEdgeDist * weatherScale);
  }

  /**
   * Exact distance in meters at which actors remain visible to the player before dissolving into the end-of-chunk fog.
   */
  public getVisibleChunkRangeMeters(): number {
    return Math.max(65, this.fog.far * 0.94);
  }

  private buildGlobalLandmarks() {
    // Main Map: External 3D Industrial Map (/models/industrial_map.glb)
    this.buildIndustrialMapLandmark();

    // 1. Extraction Zone Helipads + Volumetric Animated Green Smoke Columns
    for (const ep of EXTRACTION_POINTS) {
      const y = this.terrain.getSurfaceHeightAt(ep.x, ep.z);
      const group = new THREE.Group();
      group.position.set(ep.x, y, ep.z);

      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(ep.radius * 0.68, ep.radius * 0.74, 0.28, 28),
        this.mats.concreteDark
      );
      pad.position.y = 0.14;
      pad.receiveShadow = true;
      group.add(pad);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(ep.radius * 0.54, ep.radius * 0.63, 28),
        new THREE.MeshBasicMaterial({ color: 0x35cf69, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.3;
      group.add(ring);

      const hBarMat = new THREE.MeshBasicMaterial({ color: 0xe3b43c });
      const hL = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 5.2), hBarMat);
      hL.rotation.x = -Math.PI / 2;
      hL.position.set(-1.6, 0.31, 0);
      const hR = hL.clone();
      hR.position.set(1.6, 0.31, 0);
      const hM = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.65), hBarMat);
      hM.rotation.x = -Math.PI / 2;
      hM.position.set(0, 0.31, 0);
      group.add(hL, hR, hM);

      for (let c = 0; c < 4; c++) {
        const ang = (c / 4) * Math.PI * 2 + Math.PI / 4;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.65, 6), this.mats.bunkerSteel);
        post.position.set(Math.cos(ang) * ep.radius * 0.62, 0.45, Math.sin(ang) * ep.radius * 0.62);
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.14, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0x42e67c })
        );
        bulb.position.set(post.position.x, 0.85, post.position.z);
        group.add(post, bulb);
      }

      const flare = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.16, 0.48, 10),
        new THREE.MeshStandardMaterial({ color: 0x265c34, emissive: 0x1ea84a, emissiveIntensity: 1.5 })
      );
      flare.position.set(2.4, 0.5, 2.4);
      group.add(flare);

      const smokeOrigin = new THREE.Vector3(ep.x + 2.4, y + 0.8, ep.z + 2.4);
      for (let p = 0; p < 9; p++) {
        const sMat = new THREE.SpriteMaterial({
          map: this.mats.smokeSpriteMap,
          color: 0x3ec96e,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        });
        const sprite = new THREE.Sprite(sMat);
        sprite.position.copy(smokeOrigin);
        this.scene.add(sprite);
        this.extractionSmokePuffs.push({
          sprite,
          origin: smokeOrigin.clone(),
          phase: p / 9,
          speed: 0.13 + (p % 3) * 0.015,
          swayOffset: p * 1.4,
        });
      }

      this.scene.add(group);
    }

    // 2. Underground Facility (Region 07)
    this.buildUndergroundFacility();

    // 3. Mission Interactive Terminals
    this.spawnMissionTerminal(
      'term_underground_intel',
      'Recuperar Dossiê Confidencial WILDLANDS',
      new THREE.Vector3(95, -8.5, -138),
      'mis_underground_intel'
    );
    this.spawnMissionTerminal(
      'term_mountain_radar',
      'Desativar Terminal de Radar Inimigo',
      new THREE.Vector3(340, this.terrain.getSurfaceHeightAt(340, -420), -420),
      'mis_mountain_radar'
    );
    this.spawnMissionTerminal(
      'term_rural_beacon',
      'Recuperar Transponder da Equipe Recon',
      new THREE.Vector3(-330, this.terrain.getSurfaceHeightAt(-330, 320), 320),
      'mis_rural_beacon'
    );

    // 4. Desert Supply Drop mission container (inside Desert Outpost courtyard!)
    const desertY = this.terrain.getSurfaceHeightAt(435, -105);
    this.loot.spawnContainer(
      'mission_desert_supply',
      'supply_drop',
      'desert_outpost',
      new THREE.Vector3(435, desertY, -105),
      'global',
      9911,
      undefined,
      'mis_desert_supply'
    );

    // 5. Industrial Valley Sabotage Targets
    const sabotageCoords = [
      [-378, -72],
      [-392, -84],
      [-384, -64],
    ];
    sabotageCoords.forEach(([x, z], idx) => {
      const y = this.terrain.getSurfaceHeightAt(x, z);
      this.spawnExplosiveBarrel(`sabotage_${idx}`, x, y, z, 'global', 'mis_industrial_sabotage');
    });
  }

  /**
   * Loads the external 3D Industrial Map (/models/industrial_map.glb) at Blacksite Center (0, 0, -48),
   * normalizes scale to ~115m tactical arena footprint, and generates AABB colliders + raycast targets.
   */
  private buildIndustrialMapLandmark() {
    void this.assetManager.loadByUrl('/models/industrial_map.glb').then((res) => {
      if (!res) return;
      const mapGroup = res.group;
      mapGroup.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mapGroup);
      const size = new THREE.Vector3();
      box.getSize(size);

      const maxSpan = Math.max(size.x, size.z, 1);
      const scale = 115 / maxSpan;
      mapGroup.scale.setScalar(scale);
      mapGroup.updateMatrixWorld(true);

      const scaledBox = new THREE.Box3().setFromObject(mapGroup);
      const center = new THREE.Vector3();
      scaledBox.getCenter(center);

      // Find true playable ground floor Y using median/low-percentile of normal meshes
      // (ignores deep outlier vertices like Powerpole_A_B extending to -2491)
      const meshBox = new THREE.Box3();
      const meshSize = new THREE.Vector3();
      const floorCandidates: number[] = [];
      mapGroup.traverse((obj) => {
        if (!(obj as THREE.Mesh).isMesh) return;
        meshBox.setFromObject(obj);
        meshBox.getSize(meshSize);
        if (meshSize.y > 0.05 && meshSize.y < 18 && meshSize.x < 90 && meshSize.z < 90) {
          floorCandidates.push(meshBox.min.y);
        }
      });
      floorCandidates.sort((a, b) => a - b);
      const groundY =
        floorCandidates.length > 0
          ? floorCandidates[Math.floor(floorCandidates.length * 0.12)]
          : 0;

      mapGroup.position.set(-center.x, -groundY + 0.04, -center.z - 48);
      mapGroup.updateMatrixWorld(true);

      this.scene.add(mapGroup);
      this.raycastMeshes.push(mapGroup);

      // Auto-generate AABB colliders for solid walls, containers, and props inside the GLB map
      mapGroup.traverse((obj) => {
        if (!(obj as THREE.Mesh).isMesh) return;
        const m = obj as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;

        meshBox.setFromObject(m);
        meshBox.getSize(meshSize);
        // Skip thin floor planes, tiny props, or massive outer skyboxes
        if (meshSize.y < 0.55 || meshSize.y > 22) return;
        if (meshSize.x > 42 && meshSize.z > 42) return;
        if (meshSize.x < 0.35 && meshSize.z < 0.35) return;

        this.allColliders.push({
          minX: meshBox.min.x,
          maxX: meshBox.max.x,
          minY: meshBox.min.y,
          maxY: meshBox.max.y,
          minZ: meshBox.min.z,
          maxZ: meshBox.max.z,
          material: 'concrete',
          sectorKey: 'global',
        });
      });
    });
  }

  /**
   * FIRST PRIORITY RECONSTRUCTION: Handcrafted DESERT OUTPOST Military Base
   * Directly inspired by the attached reference image: tall concrete control tower with lattice radio mast,
   * arched aircraft hangar, weathered modular admin/barracks buildings, Bremer concrete T-wall perimeter,
   * guard gate checkpoint, red/olive containers, comms relays, and tactical floodlight poles!
   */
  private buildDesertOutpostMasterCompound(group: THREE.Group, key: string, colliders: ColliderBox[]) {
    // 1. Tall Iconic Multi-Story Concrete Control & Comms Watchtower (Right flank landmark!)
    this.buildDesertControlTower(group, 434, -52, key, colliders);

    // 2. Large Arched Corrugated Military Aircraft Hangar (Center-right behind compound!)
    this.buildHangar(group, 404, -102, 0.12, key, colliders);

    // 3. Modular Concrete Operations Barracks & Admin Quarters (Right foreground beside tower)
    this.buildDesertBarracks(group, 420, -68, 0, key, colliders);
    this.buildDesertBarracks(group, 366, -98, Math.PI * 0.5, key, colliders);

    // 4. Maintenance Warehouse & Munitions Depot (Left flank)
    this.buildWarehouse(group, 356, -64, key, colliders);

    // 5. Sandbag Guard Bunker & Vehicle Entry Checkpoint Gate
    this.buildCheckpointGate(group, 386, -34);
    this.buildSandbagBunker(group, 372, -38, 0.25, key, colliders);
    this.buildSandbagBunker(group, 408, -36, -0.25, key, colliders);

    // 6. Concrete Bremer T-Wall Perimeter (Segmented reinforced blast walls surrounding the base!)
    this.buildBlastWallLine(group, 344, -34, 376, -34, key, colliders);
    this.buildBlastWallLine(group, 398, -34, 444, -34, key, colliders);
    this.buildBlastWallLine(group, 448, -36, 448, -118, key, colliders);
    this.buildBlastWallLine(group, 340, -36, 340, -116, key, colliders);
    this.buildBlastWallLine(group, 342, -122, 446, -122, key, colliders);

    // 7. Military Shipping Containers (Red/Olive/Slate clusters matching the reference base yard!)
    this.buildContainerCluster(group, 434, -39, key, colliders);
    this.buildContainerCluster(group, 378, -76, key, colliders);

    // 8. Floodlight Masts, Comms Relay & Explosive Fuel Barrels
    this.buildLightPole(group, 398, -46);
    this.buildLightPole(group, 376, -54);
    this.buildLightPole(group, 422, -88);
    this.buildSecurityCamera(group, 420, this.terrain.getSurfaceHeightAt(420, -68) + 6.5, -60, 0.2, key);
    this.spawnExplosiveBarrel('desert_bar_1', 392, this.terrain.getSurfaceHeightAt(392, -62), -62, key);
    this.spawnExplosiveBarrel('desert_bar_2', 416, this.terrain.getSurfaceHeightAt(416, -84), -84, key);
  }

  /**
   * Tall Multi-Story Reinforced Concrete Control Tower with exterior steel stairs,
   * cantilevered observation deck, overhanging steel roof, and tall lattice radio mast!
   */
  private buildDesertControlTower(group: THREE.Group, x: number, z: number, key: string, colliders: ColliderBox[]) {
    const y = this.terrain.getSurfaceHeightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);

    // Ground concrete plinth & blast base
    const base = new THREE.Mesh(new THREE.BoxGeometry(7.8, 2.2, 7.8), this.mats.concreteDark);
    base.position.y = 1.1;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    // 4-Story Reinforced Concrete Tower Shaft (6.2m x 15.5m x 6.2m)
    const shaftH = 15.5;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(6.2, shaftH, 6.2), this.desertConcreteMat);
    shaft.position.y = shaftH * 0.5 + 1.0;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    g.add(shaft);

    // Corner vertical concrete ribs & horizontal floor concrete bands
    for (const cx of [-3.1, 3.1]) {
      for (const cz of [-3.1, 3.1]) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.55, shaftH + 0.5, 0.55), this.mats.concreteDark);
        rib.position.set(cx, shaftH * 0.5 + 1.0, cz);
        g.add(rib);
      }
    }
    for (let fy = 4.6; fy <= 13.6; fy += 3.0) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(6.48, 0.28, 6.48), this.mats.concreteDark);
      band.position.y = fy;
      // Recessed dark tactical slit windows on all 4 facades
      const winX = new THREE.Mesh(new THREE.BoxGeometry(6.32, 0.95, 2.8), this.mats.glassTinted);
      winX.position.y = fy + 1.1;
      const winZ = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.95, 6.32), this.mats.glassTinted);
      winZ.position.y = fy + 1.1;
      g.add(band, winX, winZ);
    }

    // Steel entrance blast door & military stencil sign at base
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.4, 0.25), this.mats.bunkerSteel);
    door.position.set(0, 1.25, 3.92);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.1), this.mats.militarySign);
    sign.position.set(0, 3.4, 3.16);
    g.add(door, sign);

    // Exterior steel service stairs climbing the shaft side
    for (let s = 0; s < 3; s++) {
      const flight = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 5.2), this.mats.bunkerSteel);
      flight.position.set(-3.65, 3.6 + s * 4.4, 0);
      flight.rotation.x = s % 2 === 0 ? 0.55 : -0.55;
      const landing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 1.8), this.mats.bunkerSteel);
      landing.position.set(-3.7, 5.2 + s * 4.4, s % 2 === 0 ? -2.4 : 2.4);
      g.add(flight, landing);
    }

    // Cantilevered Upper Observation Deck + Wraparound Steel Catwalk & Handrails
    const obsY = 17.2;
    const deckFloor = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.45, 9.6), this.mats.concreteDark);
    deckFloor.position.y = obsY;
    deckFloor.castShadow = true;
    const obsCab = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.2, 7.2), this.mats.bunkerSteel);
    obsCab.position.y = obsY + 1.75;
    obsCab.castShadow = true;
    // 360-degree panoramic tinted observation glass
    const obsGlass = new THREE.Mesh(new THREE.BoxGeometry(7.35, 1.65, 7.35), this.mats.glassTinted);
    obsGlass.position.y = obsY + 2.0;

    // Steel wraparound railing around observation catwalk
    for (const side of [-1, 1]) {
      const railZ = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.1, 0.1), this.mats.bunkerSteel);
      railZ.position.set(0, obsY + 1.2, side * 4.7);
      const railX = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 9.6), this.mats.bunkerSteel);
      railX.position.set(side * 4.7, obsY + 1.2, 0);
      g.add(railZ, railX);
    }

    // Overhanging pitched steel roof + perimeter warm floodlights
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7.4, 2.2, 4), this.mats.rustedMetal);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = obsY + 4.45;
    roof.castShadow = true;
    for (let fl = 0; fl < 4; fl++) {
      const ang = (fl / 4) * Math.PI * 2;
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.25, 0.28), this.lampWarmMat);
      lamp.position.set(Math.cos(ang) * 4.3, obsY + 3.1, Math.sin(ang) * 4.3);
      g.add(lamp);
    }

    // Tall Lattice Comms & Radar Mast towering above roof (exact signature from the reference!)
    const mastBaseY = obsY + 5.2;
    const mastH = 12.5;
    for (const mx of [-0.55, 0.55]) {
      for (const mz of [-0.55, 0.55]) {
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, mastH, 5), this.mats.bunkerSteel);
        strut.position.set(mx * 0.65, mastBaseY + mastH * 0.5, mz * 0.65);
        g.add(strut);
      }
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.1, 6.5, 6), this.mats.bunkerSteel);
    spire.position.y = mastBaseY + mastH + 3.0;
    const dish1 = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.6, 12, 1, true), this.mats.corrugatedMetal);
    dish1.position.set(0.9, mastBaseY + 4.2, 0.4);
    dish1.rotation.z = -1.2;
    const dish2 = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.5, 12, 1, true), this.mats.corrugatedMetal);
    dish2.position.set(-0.9, mastBaseY + 7.2, -0.3);
    dish2.rotation.z = 1.25;
    const radarBar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.24, 0.35), this.mats.concrete);
    radarBar.position.set(0, mastBaseY + 10.6, 0);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), this.beaconRedMat);
    beacon.position.y = mastBaseY + mastH + 6.35;
    this.beaconMeshes.push(beacon);

    g.add(deckFloor, obsCab, obsGlass, roof, spire, dish1, dish2, radarBar, beacon);
    group.add(g);

    this.addStaticCollider(x, y + 6, z, 7.6, 12, 7.6, 'concrete', key, colliders);
  }

  /**
   * Weathered Multi-Module Concrete Military Barracks / Admin HQ (Desert Outpost style!)
   */
  private buildDesertBarracks(
    group: THREE.Group,
    x: number,
    z: number,
    rotY: number,
    key: string,
    colliders: ColliderBox[]
  ) {
    const y = this.terrain.getSurfaceHeightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;

    const w = 18;
    const h = 7.4;
    const d = 11.5;

    // Main weathered desert concrete block + recessed darker base foundation
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 1.1, d + 0.4), this.mats.concreteDark);
    base.position.y = 0.55;
    base.receiveShadow = true;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.desertConcreteMat);
    body.position.y = h * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(base, body);

    // Concrete roof parapet wall & cornice ledge
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.9, d + 0.5), this.mats.concreteDark);
    parapet.position.y = h + 0.45;
    g.add(parapet);

    // 2 floors of recessed framed dark glass windows & exterior concrete columns
    for (let wx = -6; wx <= 6; wx += 4) {
      for (const wy of [2.5, 5.4]) {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(2.35, 1.35, d + 0.16), this.mats.bunkerSteel);
        frame.position.set(wx, wy, 0);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.08, d + 0.24), this.mats.glassTinted);
        glass.position.set(wx, wy, 0);
        g.add(frame, glass);
      }
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.42, h + 0.3, d + 0.26), this.mats.concreteDark);
      pilaster.position.set(wx + 2.0, h * 0.5, 0);
      g.add(pilaster);
    }

    // Steel blast entry door, overhang awning & warm entry sconce light
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.6, 0.24), this.mats.bunkerSteel);
    door.position.set(-4.0, 1.35, d * 0.5 + 0.1);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.18, 1.2), this.mats.bunkerSteel);
    awning.position.set(-4.0, 2.85, d * 0.5 + 0.55);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.22), this.lampWarmMat);
    lamp.position.set(-4.0, 2.7, d * 0.5 + 0.4);

    // Rooftop HVAC units, exhaust ductwork & tactical radio aerial
    const hvac = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.3, 2.2), this.mats.bunkerSteel);
    hvac.position.set(4.2, h + 1.15, -1.5);
    hvac.castShadow = true;
    const hvac2 = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.0, 1.6), this.mats.rustedMetal);
    hvac2.position.set(-3.5, h + 1.0, 1.2);
    const roofAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 4.8, 6), this.mats.bunkerSteel);
    roofAnt.position.set(6.8, h + 2.8, 3.2);
    g.add(door, awning, lamp, hvac, hvac2, roofAnt);

    group.add(g);
    const colW = Math.abs(Math.sin(rotY)) < 0.5 ? w : d;
    const colD = Math.abs(Math.sin(rotY)) < 0.5 ? d : w;
    this.addStaticCollider(x, y + h * 0.5, z, colW, h, colD, 'concrete', key, colliders);
  }

  /**
   * Segmented Reinforced Concrete Military Blast Walls (Bremer T-Walls) with colliders!
   */
  private buildBlastWallLine(
    group: THREE.Group,
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    key: string,
    colliders: ColliderBox[]
  ) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const rotY = Math.atan2(dx, dz);
    const segLen = 4.2;
    const count = Math.max(1, Math.floor(len / segLen));

    const wallGeo = new THREE.BoxGeometry(0.65, 2.85, segLen - 0.16);
    const footGeo = new THREE.BoxGeometry(1.65, 0.45, segLen - 0.14);

    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const wx = x1 + dx * t;
      const wz = z1 + dz * t;
      const wy = this.terrain.getSurfaceHeightAt(wx, wz);

      const segGroup = new THREE.Group();
      segGroup.position.set(wx, wy, wz);
      segGroup.rotation.y = rotY;

      const slab = new THREE.Mesh(wallGeo, this.desertConcreteMat);
      slab.position.y = 1.45;
      slab.castShadow = true;
      slab.receiveShadow = true;
      const foot = new THREE.Mesh(footGeo, this.mats.concreteDark);
      foot.position.y = 0.22;
      segGroup.add(slab, foot);
      group.add(segGroup);
    }

    // Single clean axis-aligned collider along the blast wall run
    const midX = (x1 + x2) * 0.5;
    const midZ = (z1 + z2) * 0.5;
    const midY = this.terrain.getSurfaceHeightAt(midX, midZ);
    const cw = Math.max(1.2, Math.abs(dx));
    const cd = Math.max(1.2, Math.abs(dz));
    this.addStaticCollider(midX, midY + 1.5, midZ, cw, 3.0, cd, 'concrete', key, colliders);
  }

  private buildUndergroundFacility() {
    const group = new THREE.Group();
    const floorY = -8.5;
    const ceilY = -2.0;

    const archTop = new THREE.Mesh(new THREE.BoxGeometry(15.6, 2.4, 4.2), this.mats.hazardConcrete);
    archTop.position.set(95, 3.6, -74);
    archTop.castShadow = true;
    group.add(archTop);

    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), this.mats.militarySign);
    sign.position.set(95, 3.6, -71.85);
    group.add(sign);

    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.25), this.lampWarmMat);
      lamp.position.set(95 + side * 5.8, 2.9, -71.85);
      group.add(lamp);
    }

    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.4, 11, 34), this.mats.concreteDark);
      wall.position.set(95 + side * 7.2, -3.2, -91);
      group.add(wall);
      this.addStaticCollider(95 + side * 7.2, -3.2, -91, 1.4, 11, 34, 'concrete', 'global');

      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 33), this.mats.bunkerSteel);
      rail.position.set(95 + side * 6.3, 1.2, -91);
      group.add(rail);
    }

    const rampLen = Math.hypot(32, 8.5);
    const rampSlab = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.5, rampLen), this.mats.concrete);
    rampSlab.position.set(95, -4.45, -90);
    rampSlab.rotation.x = Math.atan2(8.5, 32);
    rampSlab.receiveShadow = true;
    group.add(rampSlab);

    const vaultFloor = new THREE.Mesh(new THREE.BoxGeometry(56, 0.6, 42), this.mats.concrete);
    vaultFloor.position.set(95, floorY - 0.3, -126);
    vaultFloor.receiveShadow = true;
    group.add(vaultFloor);

    const vaultCeil = new THREE.Mesh(new THREE.BoxGeometry(56, 0.8, 42), this.mats.concreteDark);
    vaultCeil.position.set(95, ceilY + 0.4, -126);
    group.add(vaultCeil);

    for (let dz = -114; dz >= -138; dz -= 12) {
      const duct = new THREE.Mesh(new THREE.BoxGeometry(46, 0.55, 0.9), this.mats.corrugatedMetal);
      duct.position.set(95, ceilY - 0.35, dz);
      group.add(duct);

      const lightStrip = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.35), this.lampCoolMat);
      lightStrip.position.set(95, ceilY - 0.1, dz + 2.5);
      group.add(lightStrip);
    }

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(56, 7.5, 1.5), this.mats.concreteDark);
    backWall.position.set(95, -5.0, -146.5);
    group.add(backWall);
    this.addStaticCollider(95, -5.0, -146.5, 56, 7.5, 1.5, 'concrete', 'global');

    for (const side of [-1, 1]) {
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(1.5, 7.5, 42), this.mats.concreteDark);
      sideWall.position.set(95 + side * 27.5, -5.0, -126);
      group.add(sideWall);
      this.addStaticCollider(95 + side * 27.5, -5.0, -126, 1.5, 7.5, 42, 'concrete', 'global');
    }

    const frontL = new THREE.Mesh(new THREE.BoxGeometry(20, 7.5, 1.5), this.mats.concreteDark);
    frontL.position.set(78, -5.0, -106);
    const frontR = new THREE.Mesh(new THREE.BoxGeometry(20, 7.5, 1.5), this.mats.concreteDark);
    frontR.position.set(112, -5.0, -106);
    group.add(frontL, frontR);
    this.addStaticCollider(78, -5.0, -106, 20, 7.5, 1.5, 'concrete', 'global');
    this.addStaticCollider(112, -5.0, -106, 20, 7.5, 1.5, 'concrete', 'global');

    const serverMat = new THREE.MeshStandardMaterial({ color: 0x1a2026, roughness: 0.42, metalness: 0.72 });
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x35e080 });
    for (let cx = 78; cx <= 112; cx += 17) {
      for (let cz = -116; cz >= -138; cz -= 11) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(1.8, 6.8, 1.8), this.mats.bunkerSteel);
        col.position.set(cx, -5.1, cz);
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.7, 2.05), this.mats.hazardConcrete);
        plinth.position.set(cx, floorY + 0.35, cz);
        group.add(col, plinth);
        this.addStaticCollider(cx, -5.1, cz, 1.8, 6.8, 1.8, 'metal', 'global');
      }
    }

    for (let sx = 82; sx <= 108; sx += 6) {
      if (Math.abs(sx - 95) < 4) continue;
      const rack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.6, 1.0), serverMat);
      rack.position.set(sx, floorY + 1.3, -141);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 0.06), ledMat);
      led.position.set(sx, floorY + 2.1, -140.46);
      group.add(rack, led);
    }

    const bLight1 = new THREE.PointLight(0xffb86b, 18, 42, 1.4);
    bLight1.position.set(95, -3.2, -118);
    const bLight2 = new THREE.PointLight(0x88c8ff, 20, 44, 1.4);
    bLight2.position.set(95, -3.2, -136);
    group.add(bLight1, bLight2);

    this.loot.spawnContainer(
      'vault_rare_weapons',
      'weapon_case',
      'underground_facility',
      new THREE.Vector3(82, floorY, -133),
      'global',
      7701,
      [
        createInventoryEntry('wpn_m700', 1),
        createInventoryEntry('wpn_scarh', 1),
        createInventoryEntry('ammo_762', 60),
        createInventoryEntry('armor_juggernaut', 1),
      ]
    );
    this.loot.spawnContainer(
      'vault_rare_gear',
      'supply_drop',
      'underground_facility',
      new THREE.Vector3(108, floorY, -133),
      'global',
      7702,
      [
        createInventoryEntry('helmet_ops', 1),
        createInventoryEntry('pack_expedition', 1),
        createInventoryEntry('key_bunker', 1),
        createInventoryEntry('val_intel', 2),
        createInventoryEntry('c4_charge', 2),
      ]
    );

    this.scene.add(group);
    this.raycastMeshes.push(group);
  }

  private spawnMissionTerminal(id: string, label: string, pos: THREE.Vector3, missionId: string) {
    const g = new THREE.Group();
    g.position.copy(pos);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.0, 0.85), this.mats.bunkerSteel);
    desk.position.y = 0.5;
    desk.castShadow = true;
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.96, 0.64, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x16382b, emissive: 0x26d97f, emissiveIntensity: 1.0 })
    );
    screen.position.set(0, 1.32, 0);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.72, 0.22), this.mats.polymerDark);
    hood.position.set(0, 1.32, -0.06);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 1.35, 6), this.mats.gunMetal);
    antenna.position.set(0.58, 1.55, -0.2);
    g.add(desk, hood, screen, antenna);
    this.scene.add(g);

    this.terminals.push({ id, label, position: pos.clone(), missionId, used: false, mesh: g });
  }

  private spawnExplosiveBarrel(id: string, x: number, y: number, z: number, sectorKey: string, missionId?: string) {
    const mesh = new THREE.Mesh(this.barrelGeo, this.barrelMat);
    mesh.position.set(x, y + 0.575, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { destructibleId: id };

    const band1 = new THREE.Mesh(new THREE.CylinderGeometry(0.375, 0.375, 0.06, 12), this.mats.bunkerSteel);
    band1.position.y = 0.22;
    const band2 = band1.clone();
    band2.position.y = -0.22;
    mesh.add(band1, band2);

    this.scene.add(mesh);
    this.raycastMeshes.push(mesh);
    this.destructibles.push({
      id,
      mesh,
      position: new THREE.Vector3(x, y + 0.575, z),
      health: 40,
      explosive: true,
      missionId,
      destroyed: false,
      sectorKey,
    });
  }

  private addStaticCollider(
    cx: number,
    cy: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    material: 'concrete' | 'metal' | 'wood',
    sectorKey: string,
    targetList?: ColliderBox[]
  ) {
    const box: ColliderBox = {
      minX: cx - w * 0.5,
      maxX: cx + w * 0.5,
      minY: cy - h * 0.5,
      maxY: cy + h * 0.5,
      minZ: cz - d * 0.5,
      maxZ: cz + d * 0.5,
      material,
      sectorKey,
    };
    this.allColliders.push(box);
    if (targetList) targetList.push(box);
  }

  public updateStreaming(playerPos: THREE.Vector3) {
    const psx = Math.floor(playerPos.x / SECTOR_SIZE);
    const psz = Math.floor(playerPos.z / SECTOR_SIZE);
    const key = `${psx},${psz}`;
    if (key === this.lastPlayerSectorKey) return;
    this.lastPlayerSectorKey = key;

    const needed = new Set<string>();
    const minS = -Math.ceil(WORLD_HALF_SIZE / SECTOR_SIZE) - 1;
    const maxS = Math.ceil(WORLD_HALF_SIZE / SECTOR_SIZE);

    for (let dx = -this.activeRadius; dx <= this.activeRadius; dx++) {
      for (let dz = -this.activeRadius; dz <= this.activeRadius; dz++) {
        const sx = psx + dx;
        const sz = psz + dz;
        if (sx < minS || sx > maxS || sz < minS || sz > maxS) continue;
        const sKey = `${sx},${sz}`;
        needed.add(sKey);
        if (!this.sectors.has(sKey)) {
          this.loadSector(sx, sz, sKey);
        }
      }
    }

    for (const [sKey, sector] of this.sectors.entries()) {
      if (!needed.has(sKey)) {
        this.unloadSector(sKey, sector);
      }
    }
  }

  private loadSector(sx: number, sz: number, key: string) {
    const group = new THREE.Group();
    const colliders: ColliderBox[] = [];
    const centerX = (sx + 0.5) * SECTOR_SIZE;
    const centerZ = (sz + 0.5) * SECTOR_SIZE;

    const distFromCenter = Math.hypot(centerX, centerZ);
    const baseSegs =
      this.graphicsPreset === 'ULTRA' ? 52 : this.graphicsPreset === 'HIGH' ? 44 : this.graphicsPreset === 'MEDIUM' ? 32 : 24;
    const segs = distFromCenter < 460 ? baseSegs : Math.max(20, Math.round(baseSegs * 0.72));
    const terrainMesh = this.terrain.createSectorTerrainMesh(
      centerX,
      centerZ,
      SECTOR_SIZE + 1.5,
      segs,
      this.mats
    );
    group.add(terrainMesh);

    const region = getRegionAt(centerX, centerZ);
    const lodHighObjects: THREE.Object3D[] = [];
    const lodLowObjects: THREE.Object3D[] = [];
    const nearClutterObjects: THREE.Object3D[] = [];
    // Old procedural map structures removed; industrial_map.glb is the main playable map.
    this.populateSectorNature(
      sx,
      sz,
      centerX,
      centerZ,
      region.id,
      group,
      lodHighObjects,
      lodLowObjects,
      nearClutterObjects
    );
    this.populateSectorLoot(sx, sz, centerX, centerZ, region.id, key);

    this.scene.add(group);
    this.raycastMeshes.push(group);
    this.sectors.set(key, {
      key,
      sx,
      sz,
      centerX,
      centerZ,
      group,
      colliders,
      lodHighObjects,
      lodLowObjects,
      nearClutterObjects,
      isFarLod: false,
    });
    this.onSectorLoaded?.(sx, sz, key);
  }

  private unloadSector(key: string, sector: SectorData) {
    this.scene.remove(sector.group);
    const idx = this.raycastMeshes.indexOf(sector.group);
    if (idx !== -1) this.raycastMeshes.splice(idx, 1);

    sector.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        if (m.userData.isTerrain) {
          m.geometry.dispose();
        }
      }
    });

    this.allColliders = this.allColliders.filter((c) => c.sectorKey !== key);
    this.destructibles = this.destructibles.filter((d) => {
      if (d.sectorKey === key) {
        this.scene.remove(d.mesh);
        return false;
      }
      return true;
    });
    this.securityCameras = this.securityCameras.filter((cam) => cam.sectorKey !== key);
    this.loot.unloadSector(key);
    this.sectors.delete(key);
    this.onSectorUnloaded?.(key);
  }

  private populateSectorStructures(
    sx: number,
    sz: number,
    cx: number,
    cz: number,
    regionId: RegionId,
    key: string,
    group: THREE.Group,
    colliders: ColliderBox[]
  ) {
    // Central Blacksite Outer Perimeter (Center [-65..65, -100..10] hosts the 3D Industrial Map GLB!)
    if (sx === -1 && sz === -1) {
      this.buildDesertControlTower(group, -95, -18, key, colliders);
      this.buildWarehouse(group, -110, -85, key, colliders);
      this.buildContainerCluster(group, -88, -52, key, colliders);
      this.buildPerimeterFence(group, -124, -55, 64, Math.PI / 2);
    }
    if (sx === 0 && sz === -1) {
      this.buildDesertControlTower(group, 86, -64, key, colliders);
      this.buildWarehouse(group, 94, -22, key, colliders);
      this.spawnExplosiveBarrel(`bar_${key}_1`, 72, 0, -42, key);
      this.buildLightPole(group, 72, -68);
      this.buildBlastWallLine(group, -58, -110, 58, -110, key, colliders);
    }
    if (sx === 0 && sz === 0) {
      this.buildRailYard(group, 48, 65, key, colliders);
      this.buildWarehouse(group, 108, 45, key, colliders);
      this.buildWatchtower(group, 14, 96, key, colliders);
      this.buildSandbagBunker(group, 16, 42, Math.PI, key, colliders);
      this.buildContainerCluster(group, 86, 105, key, colliders);
      this.spawnExplosiveBarrel(`bar_${key}_1`, 38, 0, 52, key);
      this.buildCheckpointGate(group, 0, 48);
      this.buildLightPole(group, 26, 24);
      this.buildJerseyBarrier(group, -8, 0, 14, -0.22, key, colliders);
      this.buildJerseyBarrier(group, 8, 0, 12, 0.2, key, colliders);
      this.buildJerseyBarrier(group, -10, 0, 38, 0.08, key, colliders);
      this.buildJerseyBarrier(group, 10, 0, 38, -0.08, key, colliders);
    }
    if (sx === -1 && sz === 0) {
      this.buildWarehouse(group, -52, 46, key, colliders);
      this.buildSandbagBunker(group, -26, 20, Math.PI * 0.5, key, colliders);
      this.buildContainerCluster(group, -96, 56, key, colliders);
      this.buildWatchtower(group, -82, 112, key, colliders);
      this.buildPerimeterFence(group, -118, 48, 52, Math.PI / 2);
      this.buildLightPole(group, -32, 34);
      this.buildJerseyBarrier(group, -16, 0, 12, Math.PI * 0.48, key, colliders);
      this.buildJerseyBarrier(group, -16, 0, 26, Math.PI * 0.52, key, colliders);
    }

    // Outer region procedural landmarks (keep handcrafted Desert Outpost master compound clear!)
    if (Math.abs(cx) > 150 || Math.abs(cz) > 150) {
      if (Math.max(Math.abs(cx), Math.abs(cz)) > WORLD_HALF_SIZE - 110) return;

      const count = regionId === 'abandoned_city' ? 5 : regionId === 'industrial_valley' ? 4 : 3;
      for (let i = 0; i < count; i++) {
        const rx = cx + (sectorHash(sx, sz, i * 11 + 1) - 0.5) * (SECTOR_SIZE - 44);
        const rz = cz + (sectorHash(sx, sz, i * 11 + 2) - 0.5) * (SECTOR_SIZE - 44);

        if (this.isNearRoad(rx, rz, 19)) continue;
        // Avoid overlapping our handcrafted Desert Outpost Master Compound!
        if (Math.hypot(rx - 395, rz + 78) < 88) continue;

        if (regionId === 'desert_outpost') {
          if (i === 0) this.buildSandbagBunker(group, rx, rz, sectorHash(sx, sz, i + 9) * Math.PI, key, colliders);
          else if (i === 1) this.buildWatchtower(group, rx, rz, key, colliders);
          else this.buildDesertBarracks(group, rx, rz, sectorHash(sx, sz, i + 12) * Math.PI, key, colliders);
        } else if (regionId === 'industrial_valley') {
          if (i === 0) this.buildIndustrialSilo(group, rx, rz, key, colliders);
          else if (i === 1) this.buildHangar(group, rx, rz, Math.PI / 2, key, colliders);
          else this.buildContainerCluster(group, rx, rz, key, colliders);
        } else if (regionId === 'abandoned_city') {
          this.buildUrbanBuilding(group, rx, rz, 2 + Math.floor(sectorHash(sx, sz, i + 40) * 3), key, colliders);
        } else if (regionId === 'mountain_range') {
          if (i === 0) this.buildRadarTower(group, rx, rz, key, colliders);
          else this.buildDesertControlTower(group, rx, rz, key, colliders);
        } else if (regionId === 'rural_settlement') {
          if (i === 0) this.buildRuralHouse(group, rx, rz, key, colliders);
          else this.buildWarehouse(group, rx, rz, key, colliders);
        } else {
          this.buildSandbagBunker(group, rx, rz, i * 1.1, key, colliders);
        }

        if (sectorHash(sx, sz, i + 80) > 0.55) {
          const by = this.terrain.getSurfaceHeightAt(rx + 8, rz + 6);
          this.spawnExplosiveBarrel(`bar_${key}_${i}`, rx + 8, by, rz + 6, key);
        }
      }
    }
  }

  private buildPerimeterFence(group: THREE.Group, x: number, z: number, length: number, rotY: number) {
    const y = this.terrain.getSurfaceHeightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(length, 3.2), this.mats.chainLink);
    mesh.position.y = 1.65;
    g.add(mesh);

    const posts = Math.max(2, Math.floor(length / 6));
    for (let i = 0; i <= posts; i++) {
      const px = -length / 2 + (i / posts) * length;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.4, 6), this.mats.bunkerSteel);
      post.position.set(px, 1.7, 0);
      g.add(post);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), this.mats.bunkerSteel);
      arm.position.set(px, 3.55, 0.16);
      arm.rotation.x = 0.55;
      g.add(arm);
    }

    const curb = new THREE.Mesh(new THREE.BoxGeometry(length, 0.45, 0.45), this.mats.concreteDark);
    curb.position.y = 0.22;
    g.add(curb);
    group.add(g);
  }

  private buildCheckpointGate(group: THREE.Group, x: number, z: number) {
    const y = this.terrain.getSurfaceHeightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);

    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 6.2, 1.1), this.mats.hazardConcrete);
      pillar.position.set(side * 8.2, 3.1, 0);
      pillar.castShadow = true;
      g.add(pillar);

      const guardBooth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.8, 2.4), this.desertConcreteMat);
      guardBooth.position.set(side * 10.6, 1.4, 0);
      guardBooth.castShadow = true;
      const boothWin = new THREE.Mesh(new THREE.BoxGeometry(2.48, 0.95, 2.48), this.mats.glassTinted);
      boothWin.position.set(side * 10.6, 2.0, 0);
      g.add(guardBooth, boothWin);
    }
    const truss = new THREE.Mesh(new THREE.BoxGeometry(17.8, 0.9, 1.2), this.mats.bunkerSteel);
    truss.position.set(0, 6.1, 0);
    truss.castShadow = true;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.5), this.mats.militarySign);
    sign.position.set(0, 6.1, 0.63);
    const signBack = sign.clone();
    signBack.rotation.y = Math.PI;
    signBack.position.z = -0.63;
    const lampL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.35), this.lampWarmMat);
    lampL.position.set(-4.2, 5.58, 0);
    const lampR = lampL.clone();
    lampR.position.x = 4.2;
    g.add(truss, sign, signBack, lampL, lampR);
    group.add(g);
  }

  private buildLightPole(group: THREE.Group, x: number, z: number) {
    const y = this.terrain.getSurfaceHeightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.85, 0.65), this.mats.hazardConcrete);
    plinth.position.y = 0.42;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 9.2, 8), this.mats.bunkerSteel);
    pole.position.y = 4.6;
    pole.castShadow = true;
    const crossBar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 0.16), this.mats.bunkerSteel);
    crossBar.position.y = 9.1;
    const lamp1 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.32), this.lampWarmMat);
    lamp1.position.set(-0.55, 8.95, 0.12);
    const lamp2 = lamp1.clone();
    lamp2.position.x = 0.55;
    g.add(plinth, pole, crossBar, lamp1, lamp2);
    group.add(g);
  }

  private buildHangar(group: THREE.Group, x: number, z: number, rotY: number, key: string, colliders: ColliderBox[]) {
    const y = this.terrain.getSurfaceHeightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;

    const w = 24;
    const h = 10;
    const d = 30;

    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, d), this.mats.concrete);
    floor.position.y = 0.175;
    floor.receiveShadow = true;
    g.add(floor);

    const wallGeo = new THREE.BoxGeometry(0.8, h, d);
    const leftW = new THREE.Mesh(wallGeo, this.mats.corrugatedMetal);
    leftW.position.set(-w / 2 + 0.4, h / 2, 0);
    leftW.castShadow = true;
    leftW.receiveShadow = true;

    const rightW = new THREE.Mesh(wallGeo, this.mats.corrugatedMetal);
    rightW.position.set(w / 2 - 0.4, h / 2, 0);
    rightW.castShadow = true;
    rightW.receiveShadow = true;
    g.add(leftW, rightW);

    for (const side of [-1, 1]) {
      const dado = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.65, d + 0.1), this.mats.hazardConcrete);
      dado.position.set(side * (w / 2 - 0.4), 0.85, 0);
      dado.receiveShadow = true;
      g.add(dado);

      for (let wz = -10; wz <= 10; wz += 6.5) {
        const winFrame = new THREE.Mesh(new THREE.BoxGeometry(0.96, 1.5, 4.2), this.mats.bunkerSteel);
        winFrame.position.set(side * (w / 2 - 0.4), 7.2, wz);
        const winGlass = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.22, 3.85), this.mats.glassTinted);
        winGlass.position.set(side * (w / 2 - 0.4), 7.2, wz);
        g.add(winFrame, winGlass);
      }

      for (let bz = -13; bz <= 13; bz += 6.5) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.45, h + 0.4, 0.45), this.mats.bunkerSteel);
        rib.position.set(side * (w / 2 + 0.12), h / 2, bz);
        rib.castShadow = true;
        g.add(rib);
      }

      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, h * 0.85, 8), this.mats.rustedMetal);
      pipe.position.set(side * (w / 2 + 0.4), h * 0.45, 7.5);
      g.add(pipe);
    }

    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(w / 2, w / 2, d, 16, 1, true, 0, Math.PI),
      this.mats.corrugatedMetal
    );
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.y = h;
    roof.castShadow = true;
    roof.receiveShadow = true;
    g.add(roof);

    for (const end of [-1, 1]) {
      const header = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 1.35, 0.85), this.mats.bunkerSteel);
      header.position.set(0, h - 0.5, end * (d / 2 - 0.3));
      g.add(header);

      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.5), this.mats.militarySign);
      sign.position.set(-6.5, h - 0.5, end * (d / 2 + 0.16));
      if (end < 0) sign.rotation.y = Math.PI;
      g.add(sign);

      for (const side of [-1, 1]) {
        const doorWing = new THREE.Mesh(new THREE.BoxGeometry(3.6, h - 1.2, 0.35), this.mats.rustedMetal);
        doorWing.position.set(side * (w / 2 - 2.3), (h - 1.2) / 2, end * (d / 2 + 0.25));
        doorWing.castShadow = true;
        g.add(doorWing);
      }
    }

    for (let rz = -10; rz <= 10; rz += 10) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.52, 0.52), this.mats.bunkerSteel);
      beam.position.set(0, h - 0.3, rz);
      g.add(beam);

      const fixture = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 0.55), this.lampWarmMat);
      fixture.position.set(0, h - 0.7, rz);
      g.add(fixture);

      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 1.2, 8), this.mats.bunkerSteel);
      vent.position.set(0, h + w * 0.5 + 0.3, rz);
      g.add(vent);
    }

    const cover1 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 2.2), this.mats.militaryCrate);
    cover1.position.set(-5, 1.0, 4);
    cover1.castShadow = true;
    cover1.receiveShadow = true;
    const cover2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 3.0), this.mats.woodCrate);
    cover2.position.set(5.5, 0.9, -5);
    cover2.castShadow = true;
    cover2.receiveShadow = true;
    g.add(cover1, cover2);

    group.add(g);

    if (Math.abs(Math.sin(rotY)) < 0.5) {
      this.addStaticCollider(x - w / 2 + 0.4, y + h / 2, z, 1.0, h, d, 'metal', key, colliders);
      this.addStaticCollider(x + w / 2 - 0.4, y + h / 2, z, 1.0, h, d, 'metal', key, colliders);
    } else {
      this.addStaticCollider(x, y + h / 2, z - w / 2 + 0.4, d, h, 1.0, 'metal', key, colliders);
      this.addStaticCollider(x, y + h / 2, z + w / 2 - 0.4, d, h, 1.0, 'metal', key, colliders);
    }
  }

  private buildJerseyBarrier(
    group: THREE.Group,
    x: number,
    y: number,
    z: number,
    rotY: number,
    key: string,
    colliders: ColliderBox[]
  ) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;

    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.34, 0.72), this.mats.concreteDark);
    base.position.y = 0.17;
    base.castShadow = true;
    base.receiveShadow = true;
    const mid = new THREE.Mesh(new THREE.BoxGeometry(3.18, 0.42, 0.48), this.mats.concrete);
    mid.position.y = 0.54;
    mid.castShadow = true;
    mid.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.16, 0.36, 0.28), this.mats.hazardConcrete);
    top.position.y = 0.92;
    top.castShadow = true;
    top.receiveShadow = true;

    g.add(base, mid, top);
    group.add(g);

    const isRotated = Math.abs(Math.sin(rotY)) > 0.7;
    this.addStaticCollider(
      x,
      y + 0.55,
      z,
      isRotated ? 0.75 : 3.2,
      1.1,
      isRotated ? 3.2 : 0.75,
      'concrete',
      key,
      colliders
    );
  }

  private buildDetailedWindowBay(
    parent: THREE.Group,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    rotY = 0
  ) {
    const bay = new THREE.Group();
    bay.position.set(x, y, z);
    bay.rotation.y = rotY;

    // Outer recessed steel frame
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(w + 0.18, 0.12, 0.26), this.mats.bunkerSteel);
    frameTop.position.set(0, h * 0.5 + 0.04, 0);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.28, 0.14, 0.36), this.mats.concreteDark);
    sill.position.set(0, -h * 0.5 - 0.05, 0.05);
    const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.11, h, 0.24), this.mats.bunkerSteel);
    frameL.position.set(-w * 0.5, 0, 0);
    const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.11, h, 0.24), this.mats.bunkerSteel);
    frameR.position.set(w * 0.5, 0, 0);
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.07, h, 0.2), this.mats.bunkerSteel);
    mullion.position.set(0, 0, 0.02);

    const glass = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, h - 0.08, 0.08), this.mats.glassTinted);
    glass.position.set(0, 0, -0.02);

    bay.add(frameTop, sill, frameL, frameR, mullion, glass);
    parent.add(bay);
  }

  private buildRooftopHVAC(parent: THREE.Group, x: number, y: number, z: number) {
    const hvac = new THREE.Group();
    hvac.position.set(x, y, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 2.0), this.mats.metalPanel);
    body.position.y = 0.65;
    body.castShadow = true;
    body.receiveShadow = true;
    const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.72, 0.24, 12), this.mats.bunkerSteel);
    shroud.position.set(-0.4, 1.42, 0);
    const louver = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.85, 0.08), this.mats.rustedMetal);
    louver.position.set(0.5, 0.65, 1.02);
    const duct = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 1.8), this.mats.corrugatedMetal);
    duct.position.set(1.55, 0.35, 0);
    hvac.add(body, shroud, louver, duct);
    parent.add(hvac);
  }

  private buildSteppedStaircase(
    parent: THREE.Group,
    x: number,
    y: number,
    z: number,
    height: number,
    run: number,
    width: number
  ) {
    const stairs = new THREE.Group();
    stairs.position.set(x, y, z);
    const steps = Math.max(8, Math.round(height / 0.38));
    const stepH = height / steps;
    const stepD = run / steps;

    for (let i = 0; i < steps; i++) {
      const tread = new THREE.Mesh(new THREE.BoxGeometry(width, 0.09, stepD + 0.06), this.mats.bunkerSteel);
      tread.position.set(0, (i + 0.5) * stepH, -run * 0.5 + (i + 0.5) * stepD);
      tread.castShadow = true;
      stairs.add(tread);
    }

    const diag = Math.hypot(height, run);
    const angle = Math.atan2(height, run);
    for (const sx of [-width * 0.5 - 0.04, width * 0.5 + 0.04]) {
      const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, diag), this.mats.rustedMetal);
      stringer.position.set(sx, height * 0.5, 0);
      stringer.rotation.x = -angle;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, diag), this.mats.bunkerSteel);
      rail.position.set(sx, height * 0.5 + 0.95, 0);
      rail.rotation.x = -angle;
      const postBot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.98, 0.06), this.mats.bunkerSteel);
      postBot.position.set(sx, 0.49, -run * 0.5);
      const postTop = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.98, 0.06), this.mats.bunkerSteel);
      postTop.position.set(sx, height + 0.49, run * 0.5);
      stairs.add(stringer, rail, postBot, postTop);
    }
    parent.add(stairs);
  }

  private buildWarehouse(group: THREE.Group, x: number, z: number, key: string, colliders: ColliderBox[]) {
    const y = this.terrain.getSurfaceHeightAt(x, z);
    const w = 16;
    const h = 7.4;
    const d = 20;
    const g = new THREE.Group();
    g.position.set(x, y, z);

    // Stepped reinforced concrete apron & foundation plinth
    const apron = new THREE.Mesh(new THREE.BoxGeometry(w + 2.4, 0.24, d + 2.8), this.mats.concreteDark);
    apron.position.y = 0.12;
    apron.receiveShadow = true;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.34, d), this.mats.concrete);
    floor.position.y = 0.17;
    floor.receiveShadow = true;
    g.add(apron, floor);

    // Lower concrete dado wall (2.8m) + upper corrugated steel cladding
    const dadoH = 2.8;
    const upperH = h - dadoH;
    const backDado = new THREE.Mesh(new THREE.BoxGeometry(w, dadoH, 0.72), this.desertConcreteMat);
    backDado.position.set(0, dadoH / 2, -d / 2);
    backDado.castShadow = true;
    backDado.receiveShadow = true;
    const backUpper = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, upperH, 0.58), this.mats.corrugatedMetal);
    backUpper.position.set(0, dadoH + upperH / 2, -d / 2);
    backUpper.castShadow = true;

    const leftDado = new THREE.Mesh(new THREE.BoxGeometry(0.72, dadoH, d), this.desertConcreteMat);
    leftDado.position.set(-w / 2, dadoH / 2, 0);
    leftDado.castShadow = true;
    leftDado.receiveShadow = true;
    const leftUpper = new THREE.Mesh(new THREE.BoxGeometry(0.58, upperH, d - 0.1), this.mats.corrugatedMetal);
    leftUpper.position.set(-w / 2, dadoH + upperH / 2, 0);
    leftUpper.castShadow = true;

    const rightDado = new THREE.Mesh(new THREE.BoxGeometry(0.72, dadoH, d), this.desertConcreteMat);
    rightDado.position.set(w / 2, dadoH / 2, 0);
    rightDado.castShadow = true;
    rightDado.receiveShadow = true;
    const rightUpper = new THREE.Mesh(new THREE.BoxGeometry(0.58, upperH, d - 0.1), this.mats.corrugatedMetal);
    rightUpper.position.set(w / 2, dadoH + upperH / 2, 0);
    rightUpper.castShadow = true;

    const frontL = new THREE.Mesh(new THREE.BoxGeometry(5.5, h, 0.72), this.desertConcreteMat);
    frontL.position.set(-5.25, h / 2, d / 2);
    frontL.castShadow = true;
    frontL.receiveShadow = true;
    const frontR = new THREE.Mesh(new THREE.BoxGeometry(5.5, h, 0.72), this.desertConcreteMat);
    frontR.position.set(5.25, h / 2, d / 2);
    frontR.castShadow = true;
    frontR.receiveShadow = true;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.5, 0.8), this.mats.hazardConcrete);
    lintel.position.set(0, h - 1.25, d / 2);

    // Cargo bay overhead door partially rolled up + steel guide tracks
    const rollDoor = new THREE.Mesh(new THREE.BoxGeometry(4.9, 1.35, 0.18), this.mats.metalPanel);
    rollDoor.position.set(0, h - 3.0, d / 2 + 0.08);
    for (const tx of [-2.55, 2.55]) {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.2, h - 2.2, 0.25), this.mats.bunkerSteel);
      track.position.set(tx, (h - 2.2) * 0.5, d / 2 + 0.15);
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.15, 8), this.mats.hazardConcrete);
      bollard.position.set(tx * 1.18, 0.58, d / 2 + 1.1);
      g.add(track, bollard);
    }

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.22, 2.1), this.mats.bunkerSteel);
    canopy.position.set(0, h - 2.25, d / 2 + 1.05);
    canopy.castShadow = true;
    const doorLamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.16, 0.26), this.lampWarmMat);
    doorLamp.position.set(0, h - 2.4, d / 2 + 0.75);

    for (const sx of [-w / 2, w / 2]) {
      for (const sz of [-d / 2, d / 2]) {
        const pilaster = new THREE.Mesh(new THREE.BoxGeometry(1.15, h + 0.6, 1.15), this.mats.concreteDark);
        pilaster.position.set(sx, (h + 0.2) / 2, sz);
        pilaster.castShadow = true;
        g.add(pilaster);
      }
    }

    // Individual clerestory window bays on left/right walls
    for (const side of [-1, 1]) {
      for (let wz = -6; wz <= 6; wz += 6) {
        this.buildDetailedWindowBay(g, side * (w / 2 + 0.22), 5.0, wz, 3.0, 1.3, Math.PI * 0.5);
      }
    }

    // Hollow 4-sided parapet + metal roof deck + HVAC & vents
    const roofDeck = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.35, d + 0.4), this.mats.concreteDark);
    roofDeck.position.set(0, h + 0.18, 0);
    roofDeck.castShadow = true;
    roofDeck.receiveShadow = true;
    for (const pz of [-d / 2 - 0.15, d / 2 + 0.15]) {
      const pWall = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.75, 0.35), this.mats.concrete);
      pWall.position.set(0, h + 0.58, pz);
      g.add(pWall);
    }
    for (const px of [-w / 2 - 0.15, w / 2 + 0.15]) {
      const pWall = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.75, d + 0.6), this.mats.concrete);
      pWall.position.set(px, h + 0.58, 0);
      g.add(pWall);
    }

    this.buildRooftopHVAC(g, -3.2, h + 0.35, -3.5);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 2.8, 10), this.mats.rustedMetal);
    pipe.position.set(4.5, h + 1.65, -6.2);

    // Real stepped exterior steel staircase to roof
    this.buildSteppedStaircase(g, w / 2 + 1.0, 0.2, -1.5, h + 0.15, 7.6, 1.15);

    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.3), this.mats.militarySign);
    sign.position.set(5.2, 3.8, d / 2 + 0.4);

    g.add(
      backDado,
      backUpper,
      leftDado,
      leftUpper,
      rightDado,
      rightUpper,
      frontL,
      frontR,
      lintel,
      rollDoor,
      canopy,
      doorLamp,
      roofDeck,
      pipe,
      sign
    );
    group.add(g);

    this.addStaticCollider(x, y + h / 2, z - d / 2, w, h, 1.0, 'concrete', key, colliders);
    this.addStaticCollider(x - w / 2, y + h / 2, z, 1.0, h, d, 'concrete', key, colliders);
    this.addStaticCollider(x + w / 2, y + h / 2, z, 1.0, h, d, 'concrete', key, colliders);
    this.addStaticCollider(x - 5.25, y + h / 2, z + d / 2, 5.5, h, 1.0, 'concrete', key, colliders);
    this.addStaticCollider(x + 5.25, y + h / 2, z + d / 2, 5.5, h, 1.0, 'concrete', key, colliders);
  }

  private buildCommandHQ(group: THREE.Group, x: number, z: number, key: string, colliders: ColliderBox[]) {
    const y = this.terrain.getSurfaceHeightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);

    // Stepped concrete courtyard plinth + armored lower base
    const apron = new THREE.Mesh(new THREE.BoxGeometry(25.6, 0.26, 19.6), this.mats.concrete);
    apron.position.y = 0.13;
    apron.receiveShadow = true;
    const basePodium = new THREE.Mesh(new THREE.BoxGeometry(22.8, 2.3, 16.8), this.mats.hazardConcrete);
    basePodium.position.y = 1.15;
    basePodium.castShadow = true;
    basePodium.receiveShadow = true;
    g.add(apron, basePodium);

    // Main reinforced concrete structure with horizontal floor belt courses
    const main = new THREE.Mesh(new THREE.BoxGeometry(22, 11.2, 16), this.mats.concreteDark);
    main.position.y = 5.6;
    main.castShadow = true;
    main.receiveShadow = true;
    g.add(main);

    const belt1 = new THREE.Mesh(new THREE.BoxGeometry(22.5, 0.42, 16.5), this.desertConcreteMat);
    belt1.position.y = 3.2;
    const belt2 = new THREE.Mesh(new THREE.BoxGeometry(22.5, 0.42, 16.5), this.desertConcreteMat);
    belt2.position.y = 7.0;
    g.add(belt1, belt2);

    // Architectural concrete pilasters & corner piers
    for (let fx = -10.6; fx <= 10.6; fx += 5.3) {
      const finF = new THREE.Mesh(new THREE.BoxGeometry(0.75, 11.4, 0.65), this.desertConcreteMat);
      finF.position.set(fx, 5.7, 8.15);
      finF.castShadow = true;
      const finB = finF.clone();
      finB.position.z = -8.15;
      g.add(finF, finB);
    }

    // Individual recessed window bays (Front, Back & Sides)
    for (const wy of [5.1, 9.0]) {
      for (const wx of [-7.9, -2.65, 2.65, 7.9]) {
        this.buildDetailedWindowBay(g, wx, wy, 8.05, 3.4, 1.85, 0);
        this.buildDetailedWindowBay(g, wx, wy, -8.05, 3.4, 1.85, Math.PI);
      }
      for (const wz of [-4.2, 4.2]) {
        this.buildDetailedWindowBay(g, -11.05, wy, wz, 3.4, 1.85, -Math.PI * 0.5);
        this.buildDetailedWindowBay(g, 11.05, wy, wz, 3.4, 1.85, Math.PI * 0.5);
      }
    }

    // Double armored blast entrance vestibule + overhead canopy + struts
    const vestibule = new THREE.Mesh(new THREE.BoxGeometry(5.8, 3.8, 1.4), this.mats.concreteDark);
    vestibule.position.set(0, 1.9, 8.4);
    vestibule.castShadow = true;
    const doorL = new THREE.Mesh(new THREE.BoxGeometry(1.9, 3.1, 0.25), this.mats.metalPanel);
    doorL.position.set(-1.0, 1.55, 9.12);
    const doorR = new THREE.Mesh(new THREE.BoxGeometry(1.9, 3.1, 0.25), this.mats.metalPanel);
    doorR.position.set(1.0, 1.55, 9.12);
    const pushBarL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.14), this.mats.bunkerSteel);
    pushBarL.position.set(-1.0, 1.4, 9.28);
    const pushBarR = pushBarL.clone();
    pushBarR.position.x = 1.0;

    const porch = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.34, 2.8), this.mats.bunkerSteel);
    porch.position.set(0, 3.7, 9.5);
    porch.castShadow = true;
    const porchLamp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.28), this.lampCoolMat);
    porchLamp.position.set(0, 3.5, 9.8);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.75), this.mats.militarySign);
    sign.position.set(0, 6.2, 8.26);
    g.add(vestibule, doorL, doorR, pushBarL, pushBarR, porch, porchLamp, sign);

    // Hollow 4-sided parapet walls + coping caps
    for (const pz of [-8.0, 8.0]) {
      const pWall = new THREE.Mesh(new THREE.BoxGeometry(22.6, 1.15, 0.48), this.desertConcreteMat);
      pWall.position.set(0, 11.75, pz);
      g.add(pWall);
    }
    for (const px of [-11.0, 11.0]) {
      const pWall = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.15, 16.5), this.desertConcreteMat);
      pWall.position.set(px, 11.75, 0);
      g.add(pWall);
    }

    // Rooftop helipad, penthouse comms bunker, dual HVAC units & lattice antenna mast
    const roofPad = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.18, 20), this.mats.asphalt);
    roofPad.position.set(-4.8, 11.28, 0);
    g.add(roofPad);

    const penthouse = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.8, 4.8), this.mats.metalPanel);
    penthouse.position.set(5.5, 12.6, -2.8);
    penthouse.castShadow = true;
    const pentDoor = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 0.18), this.mats.bunkerSteel);
    pentDoor.position.set(5.5, 12.3, -0.35);
    g.add(penthouse, pentDoor);

    this.buildRooftopHVAC(g, 3.6, 11.2, 4.2);
    this.buildRooftopHVAC(g, 7.2, 11.2, 4.2);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.42, 9.8, 8), this.mats.bunkerSteel);
    mast.position.set(6.5, 18.8, -3);
    mast.castShadow = true;
    const crossAnt = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.14, 0.14), this.mats.bunkerSteel);
    crossAnt.position.set(6.5, 21.2, -3);
    const dish = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.2, 14, 1, true), this.mats.corrugatedMetal);
    dish.position.set(6.5, 22.4, -3);
    dish.rotation.x = 0.8;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), this.beaconRedMat);
    beacon.position.set(6.5, 24.0, -3);
    this.beaconMeshes.push(beacon);
    g.add(mast, crossAnt, dish, beacon);

    group.add(g);
    this.addStaticCollider(x, y + 5.6, z, 22, 11.2, 16, 'concrete', key, colliders);
    // Flanking Jersey barriers at HQ entrance
    this.buildJerseyBarrier(group, x - 5.2, y, z + 11.2, 0.15, key, colliders);
    this.buildJerseyBarrier(group, x + 5.2, y, z + 11.2, -0.15, key, colliders);
  }

  private buildWatchtower(group: THREE.Group, x: number, z: number, key: string, colliders: ColliderBox[]) {
    const y = this.terrain.getSurfaceHeightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);

    const h = 11;
    const footing = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.55, 5.2), this.mats.concreteDark);
    footing.position.y = 0.27;
    footing.receiveShadow = true;
    g.add(footing);

    const legGeo = new THREE.BoxGeometry(0.38, h, 0.38);
    for (const lx of [-2.1, 2.1]) {
      for (const lz of [-2.1, 2.1]) {
        const leg = new THREE.Mesh(legGeo, this.mats.bunkerSteel);
        leg.position.set(lx, h / 2, lz);
        leg.castShadow = true;
        g.add(leg);
      }
    }

    for (let tier = 0; tier < 2; tier++) {
      const ty = 2.8 + tier * 4.8;
      const braceF = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.14, 0.14), this.mats.bunkerSteel);
      braceF.position.set(0, ty, 2.1);
      braceF.rotation.z = 0.72;
      const braceF2 = braceF.clone();
      braceF2.rotation.z = -0.72;
      const braceB = braceF.clone();
      braceB.position.z = -2.1;
      const braceL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 5.4), this.mats.bunkerSteel);
      braceL.position.set(-2.1, ty, 0);
      braceL.rotation.x = 0.72;
      const braceR = braceL.clone();
      braceR.position.x = 2.1;
      braceR.rotation.x = -0.72;
      g.add(braceF, braceF2, braceB, braceL, braceR);
    }

    for (const lx of [-0.35, 0.35]) {
      const lRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.08), this.mats.rustedMetal);
      lRail.position.set(lx, h / 2, 2.25);
      g.add(lRail);
    }

    const deck = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.42, 5.4), this.desertConcreteMat);
    deck.position.y = h;
    deck.castShadow = true;
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.25, 5.4), this.mats.sandbag);
    parapet.position.y = h + 0.82;
    const postGeo = new THREE.BoxGeometry(0.18, 2.4, 0.18);
    for (const px of [-2.4, 2.4]) {
      for (const pz of [-2.4, 2.4]) {
        const post = new THREE.Mesh(postGeo, this.mats.bunkerSteel);
        post.position.set(px, h + 2.4, pz);
        g.add(post);
      }
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.4, 1.85, 4), this.mats.rustedMetal);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = h + 4.25;
    roof.castShadow = true;
    const spotlight = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.35), this.lampWarmMat);
    spotlight.position.set(0, h + 3.2, 2.5);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), this.beaconRedMat);
    beacon.position.set(0, h + 5.25, 0);
    this.beaconMeshes.push(beacon);

    g.add(deck, parapet, roof, spotlight, beacon);
    group.add(g);
    this.addStaticCollider(x, y + 2.5, z, 4.4, 5, 4.4, 'metal', key, colliders);
  }

  private buildRailYard(group: THREE.Group, x: number, z: number, key: string, colliders: ColliderBox[]) {
    const y = this.terrain.getSurfaceHeightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);

    const ballast = new THREE.Mesh(new THREE.BoxGeometry(114, 0.12, 4.4), this.mats.railBed);
    ballast.position.y = 0.06;
    ballast.receiveShadow = true;
    g.add(ballast);

    for (const rz of [-1.2, 1.2]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(112, 0.18, 0.16), this.mats.bunkerSteel);
      rail.position.set(0, 0.2, rz);
      g.add(rail);
    }

    [0, 1, 2].forEach((ci, i) => {
      const cx = -28 + i * 26;
      const carMat = this.containerMats[ci % this.containerMats.length];
      const body = new THREE.Mesh(new THREE.BoxGeometry(16, 3.6, 3.2), carMat);
      body.position.set(cx, 2.45, 0);
      body.castShadow = true;
      body.receiveShadow = true;

      const roofCap = new THREE.Mesh(new THREE.BoxGeometry(16.2, 0.22, 3.35), this.mats.rustedMetal);
      roofCap.position.set(cx, 4.3, 0);
      const slidingDoor = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.8, 3.32), this.mats.bunkerSteel);
      slidingDoor.position.set(cx, 2.35, 0);
      const bogie = new THREE.Mesh(new THREE.BoxGeometry(15.4, 0.65, 2.8), this.mats.bunkerSteel);
      bogie.position.set(cx, 0.6, 0);

      for (const wx of [-5.8, -4.4, 4.4, 5.8]) {
        const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.9, 10), this.mats.gunMetal);
        axle.rotation.x = Math.PI / 2;
        axle.position.set(cx + wx, 0.45, 0);
        g.add(axle);
      }

      g.add(body, roofCap, slidingDoor, bogie);
      this.addStaticCollider(x + cx, y + 2.1, z, 16, 4.2, 3.3, 'metal', key, colliders);
    });

    group.add(g);
  }

  private buildSandbagBunker(group: THREE.Group, x: number, z: number, rotY: number, key: string, colliders: ColliderBox[]) {
    const y = this.terrain.getSurfaceHeightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;

    const front = new THREE.Mesh(new THREE.BoxGeometry(7.5, 1.35, 1.15), this.mats.sandbag);
    front.position.set(0, 0.68, -2.2);
    front.castShadow = true;
    front.receiveShadow = true;
    const left = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.35, 4.5), this.mats.sandbag);
    left.position.set(-3.4, 0.68, 0);
    left.castShadow = true;
    const right = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.35, 4.5), this.mats.sandbag);
    right.position.set(3.4, 0.68, 0);
    right.castShadow = true;

    for (const px of [-3.4, 3.4]) {
      for (const pz of [-2.1, 2.0]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 3.1, 6), this.mats.bunkerSteel);
        post.position.set(px, 1.55, pz);
        post.castShadow = true;
        g.add(post);
      }
    }

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.25, 5.4), this.mats.corrugatedMetal);
    canopy.position.set(0, 3.15, 0);
    canopy.castShadow = true;

    const ammoBox = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.7), this.mats.militaryCrate);
    ammoBox.position.set(-1.8, 0.33, 0.4);
    g.add(front, left, right, canopy, ammoBox);
    group.add(g);
    this.addStaticCollider(x, y + 0.7, z - 2.0, 7.2, 1.5, 1.4, 'concrete', key, colliders);
  }

  private buildContainerCluster(group: THREE.Group, x: number, z: number, key: string, colliders: ColliderBox[]) {
    const y = this.terrain.getSurfaceHeightAt(x, z);
    for (let i = 0; i < 3; i++) {
      const mat = this.containerMats[i % this.containerMats.length];
      const ox = (i - 1) * 3.6;
      const oz = i === 1 ? 1.5 : 0;

      const cGroup = new THREE.Group();
      cGroup.position.set(x + ox, y, z + oz);

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.7, 7.2), mat);
      mesh.position.y = 1.35;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const topTrim = new THREE.Mesh(new THREE.BoxGeometry(2.68, 0.16, 7.28), this.mats.bunkerSteel);
      topTrim.position.y = 2.66;
      const botTrim = new THREE.Mesh(new THREE.BoxGeometry(2.68, 0.16, 7.28), this.mats.bunkerSteel);
      botTrim.position.y = 0.08;
      const lockBar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6), this.mats.gunMetal);
      lockBar1.position.set(-0.35, 1.35, 3.64);
      const lockBar2 = lockBar1.clone();
      lockBar2.position.x = 0.35;

      cGroup.add(mesh, topTrim, botTrim, lockBar1, lockBar2);
      group.add(cGroup);
      this.addStaticCollider(x + ox, y + 1.35, z + oz, 2.6, 2.7, 7.2, 'metal', key, colliders);
    }
  }

  private buildIndustrialSilo(group: THREE.Group, x: number, z: number, key: string, colliders: ColliderBox[]) {
    const y = this.terrain.getSurfaceHeightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);

    for (let i = 0; i < 2; i++) {
      const ox = i * 11;
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 4.9, 1.2, 14), this.mats.hazardConcrete);
      plinth.position.set(ox, 0.6, 0);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 16, 16), this.mats.rustedMetal);
      cyl.position.set(ox, 8, 0);
      cyl.castShadow = true;
      cyl.receiveShadow = true;
      const dome = new THREE.Mesh(new THREE.ConeGeometry(4.55, 2.6, 16), this.mats.bunkerSteel);
      dome.position.set(ox, 17.3, 0);
      for (const ry of [4.5, 9.5, 14.2]) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(4.55, 4.55, 0.25, 16), this.mats.bunkerSteel);
        ring.position.set(ox, ry, 0);
        g.add(ring);
      }
      g.add(plinth, cyl, dome);
      this.addStaticCollider(x + ox, y + 8, z, 8.6, 16, 8.6, 'metal', key, colliders);
    }
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 11, 8), this.mats.bunkerSteel);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(5.5, 12.5, 0);
    const catwalk = new THREE.Mesh(new THREE.BoxGeometry(11, 0.25, 1.8), this.mats.bunkerSteel);
    catwalk.position.set(5.5, 15.6, 0);
    const railF = new THREE.Mesh(new THREE.BoxGeometry(11, 0.95, 0.08), this.mats.bunkerSteel);
    railF.position.set(5.5, 16.1, 0.88);
    g.add(pipe, catwalk, railF);

    group.add(g);
  }

  private buildUrbanBuilding(group: THREE.Group, x: number, z: number, floors: number, key: string, colliders: ColliderBox[]) {
    const y = this.terrain.getSurfaceHeightAt(x, z);
    const w = 14;
    const d = 14;
    const h = floors * 4.2;
    const g = new THREE.Group();
    g.position.set(x, y, z);

    // Concrete sidewalk plinth & ground-floor commercial/bunker base
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(w + 2.2, 0.22, d + 2.2), this.mats.concrete);
    sidewalk.position.y = 0.11;
    sidewalk.receiveShadow = true;
    const groundBase = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 3.6, d + 0.35), this.mats.concreteDark);
    groundBase.position.y = 1.8;
    groundBase.castShadow = true;
    groundBase.receiveShadow = true;
    g.add(sidewalk, groundBase);

    // Upper weathered brick structure + corner concrete pilasters
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mats.brickUrban);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    for (const cx of [-w / 2, w / 2]) {
      for (const cz of [-d / 2, d / 2]) {
        const pil = new THREE.Mesh(new THREE.BoxGeometry(0.75, h + 0.2, 0.75), this.desertConcreteMat);
        pil.position.set(cx, h / 2, cz);
        pil.castShadow = true;
        g.add(pil);
      }
    }

    // Ground floor steel entrance door + awning
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.7, 0.25), this.mats.metalPanel);
    door.position.set(0, 1.45, d / 2 + 0.2);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.18, 1.4), this.mats.bunkerSteel);
    awning.position.set(0, 3.05, d / 2 + 0.75);
    g.add(door, awning);

    for (let f = 0; f < floors; f++) {
      const fy = 2.4 + f * 4.2;
      const belt = new THREE.Mesh(new THREE.BoxGeometry(w + 0.45, 0.26, d + 0.45), this.desertConcreteMat);
      belt.position.y = fy - 1.15;
      g.add(belt);

      // Individual recessed window bays on all 4 facades
      for (const wx of [-4.1, 0, 4.1]) {
        if (f === 0 && wx === 0) continue; // front entrance door
        this.buildDetailedWindowBay(g, wx, fy, d / 2 + 0.08, 2.2, 1.5, 0);
        this.buildDetailedWindowBay(g, wx, fy, -d / 2 - 0.08, 2.2, 1.5, Math.PI);
      }
      for (const wz of [-4.1, 4.1]) {
        this.buildDetailedWindowBay(g, -w / 2 - 0.08, fy, wz, 2.2, 1.5, -Math.PI * 0.5);
        this.buildDetailedWindowBay(g, w / 2 + 0.08, fy, wz, 2.2, 1.5, Math.PI * 0.5);
      }

      if (f > 0) {
        const balc = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.22, 1.35), this.mats.concreteDark);
        balc.position.set(0, fy - 0.85, d / 2 + 0.65);
        balc.castShadow = true;
        const balcRail = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.9, 0.12), this.mats.bunkerSteel);
        balcRail.position.set(0, fy - 0.32, d / 2 + 1.26);
        const acUnit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.65, 0.42), this.mats.metalPanel);
        acUnit.position.set(4.8, fy - 0.5, d / 2 + 0.25);
        g.add(balc, balcRail, acUnit);
      }
    }

    // Hollow 4-sided parapet walls + rooftop HVAC + water tank + antenna
    for (const pz of [-d / 2 - 0.15, d / 2 + 0.15]) {
      const pWall = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.95, 0.36), this.mats.concreteDark);
      pWall.position.set(0, h + 0.48, pz);
      g.add(pWall);
    }
    for (const px of [-w / 2 - 0.15, w / 2 + 0.15]) {
      const pWall = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.95, d + 0.6), this.mats.concreteDark);
      pWall.position.set(px, h + 0.48, 0);
      g.add(pWall);
    }
    this.buildRooftopHVAC(g, -3.2, h, -2.5);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 12), this.mats.rustedMetal);
    tank.position.set(3.2, h + 1.4, -3.0);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 4.5, 6), this.mats.bunkerSteel);
    antenna.position.set(3.8, h + 2.8, 3.2);
    g.add(tank, antenna);

    group.add(g);
    this.addStaticCollider(x, y + h / 2, z, w, h, d, 'concrete', key, colliders);
  }

  private buildRadarTower(group: THREE.Group, x: number, z: number, key: string, colliders: ColliderBox[]) {
    const y = this.terrain.getSurfaceHeightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);

    const base = new THREE.Mesh(new THREE.BoxGeometry(8, 4.5, 8), this.mats.concreteDark);
    base.position.y = 2.25;
    base.castShadow = true;
    base.receiveShadow = true;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.25), this.mats.bunkerSteel);
    door.position.set(0, 1.2, 4.08);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.3, 14, 10), this.mats.bunkerSteel);
    tower.position.y = 11.5;
    tower.castShadow = true;
    const catwalkRing = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.3, 14), this.mats.bunkerSteel);
    catwalkRing.position.y = 17.6;
    const dome = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3.4, 1),
      new THREE.MeshStandardMaterial({ color: 0xbec4be, roughness: 0.58, metalness: 0.14 })
    );
    dome.position.y = 20.6;
    dome.castShadow = true;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), this.beaconRedMat);
    beacon.position.y = 24.3;
    this.beaconMeshes.push(beacon);

    g.add(base, door, tower, catwalkRing, dome, beacon);
    group.add(g);
    this.addStaticCollider(x, y + 2.25, z, 8, 4.5, 8, 'concrete', key, colliders);
  }

  private buildRuralHouse(group: THREE.Group, x: number, z: number, key: string, colliders: ColliderBox[]) {
    const y = this.terrain.getSurfaceHeightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);

    const foundation = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.65, 9.1), this.mats.concreteDark);
    foundation.position.y = 0.32;
    foundation.receiveShadow = true;

    const walls = new THREE.Mesh(new THREE.BoxGeometry(10, 4.2, 8.5), this.mats.desertStucco);
    walls.position.y = 2.4;
    walls.castShadow = true;
    walls.receiveShadow = true;

    // Pitched corrugated gable roof (2 sloped eaves + gable end triangles)
    const roofSlopeL = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.22, 5.4), this.mats.rustedMetal);
    roofSlopeL.position.set(0, 5.35, -2.3);
    roofSlopeL.rotation.x = 0.42;
    roofSlopeL.castShadow = true;
    const roofSlopeR = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.22, 5.4), this.mats.rustedMetal);
    roofSlopeR.position.set(0, 5.35, 2.3);
    roofSlopeR.rotation.x = -0.42;
    roofSlopeR.castShadow = true;
    const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(11.1, 0.26, 0.45), this.mats.bunkerSteel);
    ridgeCap.position.set(0, 6.4, 0);

    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.8, 0.95), this.mats.brickUrban);
    chimney.position.set(-2.6, 6.4, -1.4);
    chimney.castShadow = true;

    this.buildDetailedWindowBay(g, -2.7, 2.5, 4.28, 1.8, 1.25, 0);
    this.buildDetailedWindowBay(g, 2.7, 2.5, 4.28, 1.8, 1.25, 0);
    this.buildDetailedWindowBay(g, -2.7, 2.5, -4.28, 1.8, 1.25, Math.PI);
    this.buildDetailedWindowBay(g, 2.7, 2.5, -4.28, 1.8, 1.25, Math.PI);

    const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.35, 0.2), this.mats.woodCrate);
    door.position.set(0, 1.5, 4.28);
    const porch = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 2.2), this.mats.concrete);
    porch.position.set(0, 0.25, 5.3);
    const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.16, 2.4), this.mats.corrugatedMetal);
    porchRoof.position.set(0, 3.1, 5.35);
    porchRoof.rotation.x = 0.14;
    for (const px of [-2.0, 2.0]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.8, 0.16), this.mats.bunkerSteel);
      post.position.set(px, 1.65, 6.25);
      post.castShadow = true;
      g.add(post);
    }

    g.add(foundation, walls, roofSlopeL, roofSlopeR, ridgeCap, chimney, door, porch, porchRoof);
    group.add(g);
    this.addStaticCollider(x, y + 2.1, z, 10, 4.2, 8.5, 'concrete', key, colliders);
  }

  private buildSecurityCamera(group: THREE.Group, x: number, y: number, z: number, baseYaw: number, key: string) {
    const mount = new THREE.Group();
    mount.position.set(x, y, z);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.7), this.mats.bunkerSteel);
    mount.add(arm);

    const head = new THREE.Group();
    head.position.set(0, -0.1, 0.35);
    const camBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.45), this.mats.gunMetal);
    camBox.userData = { cameraId: `cam_${key}_${Math.round(x)}` };
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    led.position.set(0, 0.04, 0.24);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(4.5, 16, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff4433, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
    );
    cone.rotation.x = -Math.PI / 2 - 0.32;
    cone.position.set(0, -2.5, 7.8);
    head.add(camBox, led, cone);
    mount.add(head);
    group.add(mount);

    this.securityCameras.push({
      id: `cam_${key}_${Math.round(x)}`,
      position: new THREE.Vector3(x, y, z),
      baseYaw,
      currentYaw: baseYaw,
      headMesh: head,
      coneLight: cone,
      destroyed: false,
      alarmCooldown: 0,
      sectorKey: key,
    });
  }

  private populateSectorNature(
    sx: number,
    sz: number,
    cx: number,
    cz: number,
    regionId: RegionId,
    group: THREE.Group,
    lodHighObjects: THREE.Object3D[],
    lodLowObjects: THREE.Object3D[],
    nearClutterObjects: THREE.Object3D[]
  ) {
    const densityMult =
      this.graphicsPreset === 'ULTRA' ? 1.5 : this.graphicsPreset === 'HIGH' ? 1.0 : this.graphicsPreset === 'MEDIUM' ? 0.62 : 0.32;

    const basePines =
      regionId === 'mountain_range' ? 44 : regionId === 'rural_settlement' ? 28 : regionId === 'desert_outpost' ? 14 : regionId === 'blacksite' ? 14 : 20;
    const baseOaks =
      regionId === 'rural_settlement' ? 18 : regionId === 'desert_outpost' ? 8 : regionId === 'mountain_range' ? 8 : 11;
    const basePalms = regionId === 'desert_outpost' ? 24 : 0;
    const pineTarget = Math.max(4, Math.round(basePines * densityMult));
    const oakTarget = Math.max(2, Math.round(baseOaks * densityMult));
    const palmTarget = Math.round(basePalms * densityMult);
    const shrubTarget = Math.round((regionId === 'desert_outpost' ? 40 : 42) * densityMult);
    const grassTarget = Math.round((regionId === 'desert_outpost' ? 230 : regionId === 'blacksite' ? 85 : 260) * densityMult);
    const rockTarget = Math.round((regionId === 'mountain_range' || regionId === 'desert_outpost' ? 38 : 22) * densityMult);

    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const castSh = !this.isSoftwareGl && this.graphicsPreset !== 'LOW';

    const isInsideClearZone = (x: number, z: number, roadPad: number): boolean => {
      if (Math.hypot(x, z) < 134) return true; // Blacksite concrete apron
      if (Math.hypot(x - 395, z + 78) < 58) return true; // Inner Desert Outpost yard
      if (Math.abs(x) < 32 && z > 515 && z < 662) return true; // Dedicated Firing Range courtyard
      if (this.isNearRoad(x, z, roadPad)) return true;
      if (this.terrain.isInsideUndergroundRamp(x, z)) return true;
      return false;
    };

    // Helper: When a professional external .glb is configured in /public/models/manifest.json,
    // automatically render all instances via GPU InstancedMesh from the loaded GLB prototype!
    const tryAddExternalGlbInstances = (
      key: AssetCategory,
      transforms: { x: number; y: number; z: number; sx: number; sy: number; sz: number; rx: number; ry: number; rz: number }[],
      castShadow: boolean,
      targetList?: THREE.Object3D[]
    ): boolean => {
      const proto = this.assetManager.getCachedInstancedPrototype(key);
      if (!proto || transforms.length === 0) return false;
      for (const part of proto.parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, transforms.length);
        im.castShadow = castShadow;
        im.receiveShadow = true;
        transforms.forEach((tr, idx) => {
          dummy.position.set(tr.x, tr.y, tr.z);
          dummy.rotation.set(tr.rx, tr.ry, tr.rz);
          dummy.scale.set(tr.sx, tr.sy, tr.sz);
          dummy.updateMatrix();
          im.setMatrixAt(idx, dummy.matrix);
        });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        group.add(im);
        targetList?.push(im);
      }
      return true;
    };

    // 1A. Organic Highland Ponderosa Pine Trees (Curved trunks + cupped 3D boughs + LOD0/LOD1!)
    const pines: { x: number; y: number; z: number; s: number; rot: number; leanX: number; leanZ: number; tint: number }[] = [];
    for (let i = 0; i < pineTarget; i++) {
      const tx = cx + (sectorHash(sx, sz, 200 + i * 3) - 0.5) * (SECTOR_SIZE - 8);
      const tz = cz + (sectorHash(sx, sz, 201 + i * 3) - 0.5) * (SECTOR_SIZE - 8);
      if (isInsideClearZone(tx, tz, 9.5)) continue;
      const ty = this.terrain.getSurfaceHeightAt(tx, tz);
      const sizeRoll = sectorHash(sx, sz, 202 + i * 3);
      const scale = sizeRoll < 0.24 ? 0.42 + sizeRoll * 1.15 : 0.8 + sizeRoll * 0.65;
      pines.push({
        x: tx,
        y: ty,
        z: tz,
        s: scale,
        rot: sectorHash(sx, sz, 203 + i * 3) * Math.PI * 2,
        leanX: (sectorHash(sx, sz, 204 + i * 3) - 0.5) * 0.1,
        leanZ: (sectorHash(sx, sz, 205 + i * 3) - 0.5) * 0.1,
        tint: sizeRoll,
      });
    }

    if (pines.length > 0) {
      const usedGlb = tryAddExternalGlbInstances(
        'tree_pine',
        pines.map((p) => ({ x: p.x, y: p.y - 0.1, z: p.z, sx: p.s, sy: p.s, sz: p.s, rx: p.leanX, ry: p.rot, rz: p.leanZ })),
        castSh
      );
      if (!usedGlb) {
        const pTrunks = new THREE.InstancedMesh(this.veg.pineTrunkGeo, this.veg.pineBarkMat, pines.length);
        const pLeaves = new THREE.InstancedMesh(this.veg.pineFoliageGeo, this.veg.pineNeedleMat, pines.length);
        const pLodTrunks = new THREE.InstancedMesh(this.veg.pineLodTrunkGeo, this.veg.pineBarkMat, pines.length);
        const pLodLeaves = new THREE.InstancedMesh(this.veg.pineLodFoliageGeo, this.veg.pineNeedleMat, pines.length);

        pTrunks.castShadow = castSh;
        pLeaves.castShadow = castSh;
        pLeaves.receiveShadow = true;
        pLodTrunks.visible = false;
        pLodLeaves.visible = false;

        pines.forEach((p, idx) => {
          dummy.position.set(p.x, p.y - 0.1, p.z);
          dummy.rotation.set(p.leanX, p.rot, p.leanZ);
          dummy.scale.set(p.s, p.s * (0.94 + p.tint * 0.14), p.s);
          dummy.updateMatrix();
          pTrunks.setMatrixAt(idx, dummy.matrix);
          pLeaves.setMatrixAt(idx, dummy.matrix);
          pLodTrunks.setMatrixAt(idx, dummy.matrix);
          pLodLeaves.setMatrixAt(idx, dummy.matrix);

          col.setRGB(0.84 + p.tint * 0.28, 0.86 + p.tint * 0.24, 0.78 + p.tint * 0.18);
          pLeaves.setColorAt(idx, col);
          pLodLeaves.setColorAt(idx, col);
        });
        [pTrunks, pLeaves, pLodTrunks, pLodLeaves].forEach((im) => {
          im.instanceMatrix.needsUpdate = true;
          if (im.instanceColor) im.instanceColor.needsUpdate = true;
          im.computeBoundingSphere();
          group.add(im);
        });
        lodHighObjects.push(pTrunks, pLeaves);
        lodLowObjects.push(pLodTrunks, pLodLeaves);
      }
    }

    // 1B. Gnarled Steppe Olive / Oak Broadleaf Trees (Species variety + LOD0/LOD1!)
    const oaks: { x: number; y: number; z: number; s: number; rot: number; leanX: number; leanZ: number; tint: number }[] = [];
    for (let i = 0; i < oakTarget; i++) {
      const tx = cx + (sectorHash(sx, sz, 380 + i * 3) - 0.5) * (SECTOR_SIZE - 8);
      const tz = cz + (sectorHash(sx, sz, 381 + i * 3) - 0.5) * (SECTOR_SIZE - 8);
      if (isInsideClearZone(tx, tz, 10.5)) continue;
      const ty = this.terrain.getSurfaceHeightAt(tx, tz);
      const sc = 0.72 + sectorHash(sx, sz, 382 + i * 3) * 0.58;
      oaks.push({
        x: tx,
        y: ty,
        z: tz,
        s: sc,
        rot: sectorHash(sx, sz, 383 + i * 3) * Math.PI * 2,
        leanX: (sectorHash(sx, sz, 385 + i) - 0.5) * 0.12,
        leanZ: (sectorHash(sx, sz, 386 + i) - 0.5) * 0.12,
        tint: sectorHash(sx, sz, 384 + i),
      });
    }

    if (oaks.length > 0) {
      const usedGlb = tryAddExternalGlbInstances(
        'tree_oak',
        oaks.map((o) => ({ x: o.x, y: o.y - 0.1, z: o.z, sx: o.s, sy: o.s, sz: o.s, rx: o.leanX, ry: o.rot, rz: o.leanZ })),
        castSh
      );
      if (!usedGlb) {
        const oTrunks = new THREE.InstancedMesh(this.veg.oakTrunkGeo, this.veg.pineBarkMat, oaks.length);
        const oLeaves = new THREE.InstancedMesh(this.veg.oakFoliageGeo, this.veg.oakLeafMat, oaks.length);
        const oLodTrunks = new THREE.InstancedMesh(this.veg.oakLodTrunkGeo, this.veg.pineBarkMat, oaks.length);
        const oLodLeaves = new THREE.InstancedMesh(this.veg.oakLodFoliageGeo, this.veg.oakLeafMat, oaks.length);
        oTrunks.castShadow = castSh;
        oLeaves.castShadow = castSh;
        oLeaves.receiveShadow = true;
        oLodTrunks.visible = false;
        oLodLeaves.visible = false;

        oaks.forEach((o, idx) => {
          dummy.position.set(o.x, o.y - 0.1, o.z);
          dummy.rotation.set(o.leanX, o.rot, o.leanZ);
          dummy.scale.set(o.s, o.s * (0.92 + o.tint * 0.18), o.s);
          dummy.updateMatrix();
          oTrunks.setMatrixAt(idx, dummy.matrix);
          oLeaves.setMatrixAt(idx, dummy.matrix);
          oLodTrunks.setMatrixAt(idx, dummy.matrix);
          oLodLeaves.setMatrixAt(idx, dummy.matrix);

          col.setRGB(0.88 + o.tint * 0.26, 0.85 + o.tint * 0.22, 0.7 + o.tint * 0.16);
          oLeaves.setColorAt(idx, col);
          oLodLeaves.setColorAt(idx, col);
        });
        [oTrunks, oLeaves, oLodTrunks, oLodLeaves].forEach((im) => {
          im.instanceMatrix.needsUpdate = true;
          if (im.instanceColor) im.instanceColor.needsUpdate = true;
          im.computeBoundingSphere();
          group.add(im);
        });
        lodHighObjects.push(oTrunks, oLeaves);
        lodLowObjects.push(oLodTrunks, oLodLeaves);
      }
    }

    // 1C. Desert Oasis Date Palms (Clustered organically around Desert Outpost dunes & oasis depressions!)
    if (palmTarget > 0) {
      const palms: { x: number; y: number; z: number; s: number; rot: number; tint: number }[] = [];
      for (let i = 0; i < palmTarget; i++) {
        // Cluster palms in natural 3-5 tree oasis groves rather than uniform random dots!
        const clusterIdx = Math.floor(i / 4);
        const baseX = cx + (sectorHash(sx, sz, 710 + clusterIdx * 5) - 0.5) * (SECTOR_SIZE - 26);
        const baseZ = cz + (sectorHash(sx, sz, 711 + clusterIdx * 5) - 0.5) * (SECTOR_SIZE - 26);
        const offsetAng = sectorHash(sx, sz, 720 + i * 3) * Math.PI * 2;
        const offsetR = 2.5 + sectorHash(sx, sz, 721 + i * 3) * 10.5;
        const px = baseX + Math.cos(offsetAng) * offsetR;
        const pz = baseZ + Math.sin(offsetAng) * offsetR;
        if (isInsideClearZone(px, pz, 9.0)) continue;
        const py = this.terrain.getSurfaceHeightAt(px, pz);
        if (py > 18) continue; // Keep palms in warm desert basins & oasis slopes
        palms.push({
          x: px,
          y: py,
          z: pz,
          s: 0.74 + sectorHash(sx, sz, 722 + i * 3) * 0.52,
          rot: sectorHash(sx, sz, 723 + i * 3) * Math.PI * 2,
          tint: sectorHash(sx, sz, 724 + i * 3),
        });
      }

      if (palms.length > 0) {
        const usedGlb = tryAddExternalGlbInstances(
          'tree_palm',
          palms.map((p) => ({ x: p.x, y: p.y - 0.1, z: p.z, sx: p.s, sy: p.s, sz: p.s, rx: 0, ry: p.rot, rz: 0 })),
          castSh
        );
        if (!usedGlb) {
          const pmTrunks = new THREE.InstancedMesh(this.veg.palmTrunkGeo, this.veg.palmBarkMat, palms.length);
          const pmFronds = new THREE.InstancedMesh(this.veg.palmFoliageGeo, this.veg.palmFrondMat, palms.length);
          const pmLodFronds = new THREE.InstancedMesh(this.veg.palmLodFoliageGeo, this.veg.palmFrondMat, palms.length);
          pmTrunks.castShadow = castSh;
          pmFronds.castShadow = castSh;
          pmFronds.receiveShadow = true;
          pmLodFronds.visible = false;

          palms.forEach((p, idx) => {
            dummy.position.set(p.x, p.y - 0.1, p.z);
            dummy.rotation.set(0, p.rot, 0);
            dummy.scale.set(p.s, p.s * (0.9 + p.tint * 0.22), p.s);
            dummy.updateMatrix();
            pmTrunks.setMatrixAt(idx, dummy.matrix);
            pmFronds.setMatrixAt(idx, dummy.matrix);
            pmLodFronds.setMatrixAt(idx, dummy.matrix);

            col.setRGB(0.88 + p.tint * 0.24, 0.86 + p.tint * 0.22, 0.74 + p.tint * 0.14);
            pmFronds.setColorAt(idx, col);
            pmLodFronds.setColorAt(idx, col);
          });
          [pmTrunks, pmFronds, pmLodFronds].forEach((im) => {
            im.instanceMatrix.needsUpdate = true;
            if (im.instanceColor) im.instanceColor.needsUpdate = true;
            im.computeBoundingSphere();
            group.add(im);
          });
          lodHighObjects.push(pmFronds);
          lodLowObjects.push(pmLodFronds);
        }
      }
    }

    // 2. Organic Cupped Desert Sagebrush & Arid Scrub Bushes (Culled smoothly on far sectors)
    const shrubs: { x: number; y: number; z: number; s: number; rot: number; tint: number }[] = [];
    for (let i = 0; i < shrubTarget; i++) {
      const bx = cx + (sectorHash(sx, sz, 900 + i * 3) - 0.5) * (SECTOR_SIZE - 8);
      const bz = cz + (sectorHash(sx, sz, 901 + i * 3) - 0.5) * (SECTOR_SIZE - 8);
      if (isInsideClearZone(bx, bz, 6.2)) continue;
      const by = this.terrain.getSurfaceHeightAt(bx, bz);
      shrubs.push({
        x: bx,
        y: by,
        z: bz,
        s: 0.65 + sectorHash(sx, sz, 902 + i * 3) * 0.95,
        rot: sectorHash(sx, sz, 903 + i) * Math.PI * 2,
        tint: sectorHash(sx, sz, 904 + i),
      });
    }
    if (shrubs.length > 0) {
      const usedGlb = tryAddExternalGlbInstances(
        'bush_sage',
        shrubs.map((b) => ({ x: b.x, y: b.y - 0.05, z: b.z, sx: b.s, sy: b.s * 0.85, sz: b.s, rx: 0, ry: b.rot, rz: 0 })),
        false,
        nearClutterObjects
      );
      if (!usedGlb) {
        const bushMesh = new THREE.InstancedMesh(this.veg.shrubGeo, this.veg.shrubMat, shrubs.length);
        bushMesh.receiveShadow = true;
        shrubs.forEach((b, idx) => {
          dummy.position.set(b.x, b.y - 0.05, b.z);
          dummy.rotation.set(0, b.rot, 0);
          dummy.scale.set(b.s, b.s * 0.85, b.s);
          dummy.updateMatrix();
          bushMesh.setMatrixAt(idx, dummy.matrix);
          col.setRGB(0.84 + b.tint * 0.3, 0.82 + b.tint * 0.24, 0.65 + b.tint * 0.18);
          bushMesh.setColorAt(idx, col);
        });
        bushMesh.instanceMatrix.needsUpdate = true;
        if (bushMesh.instanceColor) bushMesh.instanceColor.needsUpdate = true;
        bushMesh.computeBoundingSphere();
        group.add(bushMesh);
        nearClutterObjects.push(bushMesh);
      }
    }

    // 3. TRUE 3D Individual Curved Wind-Swaying Grass Blade Clumps (With backlit sun glow & distance fade!)
    if (grassTarget > 0) {
      const grassList: { x: number; y: number; z: number; s: number; rot: number; tint: number }[] = [];
      for (let i = 0; i < grassTarget; i++) {
        const gx = cx + (sectorHash(sx, sz, 1400 + i * 3) - 0.5) * (SECTOR_SIZE - 6);
        const gz = cz + (sectorHash(sx, sz, 1401 + i * 3) - 0.5) * (SECTOR_SIZE - 6);
        if (Math.hypot(gx, gz) < 126) continue;
        if (Math.hypot(gx - 395, gz + 78) < 52) continue;
        if (this.isNearRoad(gx, gz, 3.8)) continue;
        if (this.terrain.isInsideUndergroundRamp(gx, gz)) continue;
        const gy = this.terrain.getSurfaceHeightAt(gx, gz);
        grassList.push({
          x: gx,
          y: gy,
          z: gz,
          s: 0.78 + sectorHash(sx, sz, 1402 + i * 3) * 1.05,
          rot: sectorHash(sx, sz, 1403 + i) * Math.PI * 2,
          tint: sectorHash(sx, sz, 1404 + i),
        });
      }
      if (grassList.length > 0) {
        const grassMesh = new THREE.InstancedMesh(this.veg.dryGrassGeo, this.veg.dryGrassMat, grassList.length);
        grassMesh.receiveShadow = true;
        grassList.forEach((gp, idx) => {
          dummy.position.set(gp.x, gp.y - 0.04, gp.z);
          dummy.rotation.set(0, gp.rot, 0);
          dummy.scale.set(gp.s, gp.s * (0.85 + gp.tint * 0.35), gp.s);
          dummy.updateMatrix();
          grassMesh.setMatrixAt(idx, dummy.matrix);
          const isDesert = regionId === 'desert_outpost';
          col.setRGB(
            (isDesert ? 1.02 : 0.86) + gp.tint * 0.22,
            (isDesert ? 0.92 : 0.92) + gp.tint * 0.18,
            (isDesert ? 0.64 : 0.68) + gp.tint * 0.14
          );
          grassMesh.setColorAt(idx, col);
        });
        grassMesh.instanceMatrix.needsUpdate = true;
        if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
        grassMesh.computeBoundingSphere();
        group.add(grassMesh);
        nearClutterObjects.push(grassMesh);
      }
    }

    // 4. Sculpted Geological Rock Formations (Split between 3-Stone Boulder Clusters & Stratified Canyon Outcrops!)
    const boulderList: { x: number; y: number; z: number; sx: number; sy: number; sz: number; rot: number; tint: number }[] = [];
    const outcropList: { x: number; y: number; z: number; sx: number; sy: number; sz: number; rot: number; tint: number }[] = [];
    for (let i = 0; i < rockTarget; i++) {
      const rx = cx + (sectorHash(sx, sz, 500 + i * 3) - 0.5) * (SECTOR_SIZE - 10);
      const rz = cz + (sectorHash(sx, sz, 501 + i * 3) - 0.5) * (SECTOR_SIZE - 10);
      if (isInsideClearZone(rx, rz, 6.2)) continue;
      const ry = this.terrain.getSurfaceHeightAt(rx, rz);
      const szRoll = sectorHash(sx, sz, 502 + i * 3);
      const isOutcrop = szRoll > 0.7;
      const sc = isOutcrop ? 1.15 + (szRoll - 0.7) * 3.8 : 0.45 + szRoll * 1.15;
      const item = {
        x: rx,
        y: ry,
        z: rz,
        sx: sc * (1.05 + sectorHash(sx, sz, 503 + i) * 0.45),
        sy: sc * (0.65 + sectorHash(sx, sz, 504 + i) * 0.35),
        sz: sc * (0.95 + sectorHash(sx, sz, 505 + i) * 0.4),
        rot: sectorHash(sx, sz, 506 + i) * Math.PI * 2,
        tint: sectorHash(sx, sz, 507 + i),
      };
      if (isOutcrop) outcropList.push(item);
      else boulderList.push(item);
    }

    const emitRockInstances = (
      key: AssetCategory,
      geo: THREE.BufferGeometry,
      list: typeof boulderList
    ) => {
      if (list.length === 0) return;
      const usedGlb = tryAddExternalGlbInstances(
        key,
        list.map((rk) => ({
          x: rk.x,
          y: rk.y + rk.sy * 0.14,
          z: rk.z,
          sx: rk.sx,
          sy: rk.sy,
          sz: rk.sz,
          rx: (rk.tint - 0.5) * 0.25,
          ry: rk.rot,
          rz: (rk.tint - 0.5) * 0.2,
        })),
        castSh
      );
      if (usedGlb) return;
      const rocks = new THREE.InstancedMesh(geo, this.veg.boulderMat, list.length);
      rocks.castShadow = castSh;
      rocks.receiveShadow = true;
      list.forEach((rk, idx) => {
        dummy.position.set(rk.x, rk.y + rk.sy * 0.14, rk.z);
        dummy.rotation.set((rk.tint - 0.5) * 0.25, rk.rot, (rk.tint - 0.5) * 0.2);
        dummy.scale.set(rk.sx, rk.sy, rk.sz);
        dummy.updateMatrix();
        rocks.setMatrixAt(idx, dummy.matrix);
        const shade = 0.72 + rk.tint * 0.36;
        col.setRGB(
          (regionId === 'desert_outpost' ? 1.02 : 0.86) * shade,
          (regionId === 'desert_outpost' ? 0.92 : 0.85) * shade,
          (regionId === 'desert_outpost' ? 0.74 : 0.82) * shade
        );
        rocks.setColorAt(idx, col);
      });
      rocks.instanceMatrix.needsUpdate = true;
      if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
      rocks.computeBoundingSphere();
      group.add(rocks);
    };

    emitRockInstances('rock_boulder', this.veg.craggyRockGeo, boulderList);
    emitRockInstances('rock_outcrop', this.veg.rockOutcropGeo, outcropList);

    // 5. Embedded Low-Profile Ground Cobbles & Desert Fieldstones (true 3D stony ground micro-detail near player!)
    if (this.graphicsPreset !== 'LOW') {
      const cobbleTarget = this.graphicsPreset === 'ULTRA' ? 56 : this.graphicsPreset === 'HIGH' ? 40 : 22;
      const cobbleList: { x: number; y: number; z: number; sx: number; sy: number; sz: number; rot: number; tint: number }[] = [];
      for (let i = 0; i < cobbleTarget; i++) {
        const cx2 = cx + (sectorHash(sx, sz, 1700 + i * 3) - 0.5) * (SECTOR_SIZE - 8);
        const cz2 = cz + (sectorHash(sx, sz, 1701 + i * 3) - 0.5) * (SECTOR_SIZE - 8);
        if (isInsideClearZone(cx2, cz2, 3.0)) continue;
        const cy2 = this.terrain.getSurfaceHeightAt(cx2, cz2);
        const sc = 0.14 + sectorHash(sx, sz, 1702 + i * 3) * 0.28;
        cobbleList.push({
          x: cx2,
          y: cy2,
          z: cz2,
          sx: sc * (1.1 + sectorHash(sx, sz, 1703 + i) * 0.55),
          sy: sc * (0.34 + sectorHash(sx, sz, 1704 + i) * 0.24),
          sz: sc * (0.95 + sectorHash(sx, sz, 1705 + i) * 0.5),
          rot: sectorHash(sx, sz, 1706 + i) * Math.PI * 2,
          tint: sectorHash(sx, sz, 1707 + i),
        });
      }
      if (cobbleList.length > 0) {
        const cobbles = new THREE.InstancedMesh(this.veg.craggyRockGeo, this.veg.boulderMat, cobbleList.length);
        cobbles.receiveShadow = true;
        cobbles.castShadow = false;
        cobbleList.forEach((cb, idx) => {
          dummy.position.set(cb.x, cb.y - cb.sy * 0.22, cb.z);
          dummy.rotation.set((cb.tint - 0.5) * 0.35, cb.rot, (cb.tint - 0.5) * 0.35);
          dummy.scale.set(cb.sx, cb.sy, cb.sz);
          dummy.updateMatrix();
          cobbles.setMatrixAt(idx, dummy.matrix);
          const shade = 0.72 + cb.tint * 0.32;
          col.setRGB(
            (regionId === 'desert_outpost' ? 1.05 : 0.9) * shade,
            (regionId === 'desert_outpost' ? 0.94 : 0.87) * shade,
            (regionId === 'desert_outpost' ? 0.74 : 0.8) * shade
          );
          cobbles.setColorAt(idx, col);
        });
        cobbles.instanceMatrix.needsUpdate = true;
        if (cobbles.instanceColor) cobbles.instanceColor.needsUpdate = true;
        cobbles.computeBoundingSphere();
        group.add(cobbles);
        nearClutterObjects.push(cobbles);
      }
    }
  }

  private populateSectorLoot(sx: number, sz: number, cx: number, cz: number, regionId: RegionId, key: string) {
    if (Math.max(Math.abs(cx), Math.abs(cz)) > WORLD_HALF_SIZE - 90) return;

    if (sx === 0 && sz === 0) {
      this.loot.spawnContainer(
        'starter_weapon_case',
        'weapon_case',
        'blacksite',
        new THREE.Vector3(6, this.terrain.getSurfaceHeightAt(6, 18), 18),
        key,
        101,
        [
          createInventoryEntry('wpn_ak74', 1),
          createInventoryEntry('wpn_mp5', 1),
          createInventoryEntry('ammo_545', 90),
          createInventoryEntry('ammo_9mm', 60),
          createInventoryEntry('armor_plate', 1),
        ]
      );
      this.loot.spawnContainer(
        'starter_med_box',
        'medical_box',
        'blacksite',
        new THREE.Vector3(-8, this.terrain.getSurfaceHeightAt(-8, 16), 16),
        key,
        102
      );
    }

    const crateCount = regionId === 'blacksite' || regionId === 'industrial_valley' ? 3 : 2;
    for (let i = 0; i < crateCount; i++) {
      const lx = cx + (sectorHash(sx, sz, 800 + i * 5) - 0.5) * (SECTOR_SIZE - 30);
      const lz = cz + (sectorHash(sx, sz, 801 + i * 5) - 0.5) * (SECTOR_SIZE - 30);
      if (this.isNearRoad(lx, lz, 8)) continue;
      const ly = this.terrain.getSurfaceHeightAt(lx, lz);
      const r = sectorHash(sx, sz, 802 + i * 5);
      const kind =
        regionId === 'rural_settlement'
          ? r < 0.5
            ? 'civilian_crate'
            : 'medical_box'
          : regionId === 'industrial_valley'
          ? r < 0.5
            ? 'industrial_locker'
            : 'military_crate'
          : r < 0.35
          ? 'weapon_case'
          : r < 0.72
          ? 'military_crate'
          : 'medical_box';

      this.loot.spawnContainer(
        `loot_${key}_${i}`,
        kind,
        regionId,
        new THREE.Vector3(lx, ly, lz),
        key,
        Math.floor(r * 99999) + i * 17
      );
    }
  }

  public isNearRoad(x: number, z: number, margin: number): boolean {
    if (distToSegment(x, z, 310, 35, 382, -36) < 4.5 + margin) return true;
    for (let i = 0; i < ROAD_NETWORK.length; i++) {
      const seg = ROAD_NETWORK[i];
      if (distToSegment(x, z, seg.x1, seg.z1, seg.x2, seg.z2) < seg.width * 0.5 + margin) {
        return true;
      }
    }
    return false;
  }

  public resolveHorizontalCollision(pos: THREE.Vector3, radius: number, height: number): boolean {
    let hit = false;
    const minY = pos.y + 0.25;
    const maxY = pos.y + height;

    for (let i = 0; i < this.allColliders.length; i++) {
      const b = this.allColliders[i];
      if (maxY < b.minY || minY > b.maxY) continue;

      const closestX = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const closestZ = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        hit = true;
        const dist = Math.sqrt(distSq);
        if (dist > 0.0001) {
          const push = radius - dist;
          pos.x += (dx / dist) * push;
          pos.z += (dz / dist) * push;
        } else {
          const penL = Math.abs(pos.x - b.minX);
          const penR = Math.abs(b.maxX - pos.x);
          const penF = Math.abs(pos.z - b.minZ);
          const penB = Math.abs(b.maxZ - pos.z);
          const minP = Math.min(penL, penR, penF, penB);
          if (minP === penL) pos.x = b.minX - radius;
          else if (minP === penR) pos.x = b.maxX + radius;
          else if (minP === penF) pos.z = b.minZ - radius;
          else pos.z = b.maxZ + radius;
        }
      }
    }

    const limit = WORLD_HALF_SIZE - 35;
    if (pos.x < -limit) pos.x = -limit;
    if (pos.x > limit) pos.x = limit;
    if (pos.z < -limit) pos.z = -limit;
    if (pos.z > limit) pos.z = limit;

    return hit;
  }

  public updateAtmosphere(dt: number, playerPos: THREE.Vector3, onCameraAlert?: (pos: THREE.Vector3) => void) {
    const windSpeed = this.weather === 'rain' ? 2.4 : this.weather === 'overcast' ? 1.45 : 1.0;
    this.windTimeUniform.value += dt * windSpeed;

    this.timeOfDay = (this.timeOfDay + dt * this.daySpeed) % 24;

    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = 115 + Math.random() * 75;
      const roll = Math.random();
      this.weather = roll < 0.56 ? 'clear' : roll < 0.78 ? 'overcast' : roll < 0.9 ? 'fog' : 'rain';
    }

    const atmo = this.sky.update(dt, this.timeOfDay, this.weather, playerPos);
    this.sunDirUniform.value.copy(atmo.sunDir);

    // Dynamic Sector Vegetation LOD & Far Clutter Optimization (LOD0 < 195m, LOD1 >= 195m)
    const lodDistSq = (this.graphicsPreset === 'ULTRA' ? 235 : this.graphicsPreset === 'HIGH' ? 195 : 155) ** 2;
    for (const sector of this.sectors.values()) {
      const dx = sector.centerX - playerPos.x;
      const dz = sector.centerZ - playerPos.z;
      const shouldBeFar = dx * dx + dz * dz > lodDistSq;
      if (shouldBeFar !== sector.isFarLod) {
        sector.isFarLod = shouldBeFar;
        for (const obj of sector.lodHighObjects) obj.visible = !shouldBeFar;
        for (const obj of sector.lodLowObjects) obj.visible = shouldBeFar;
        for (const obj of sector.nearClutterObjects) obj.visible = !shouldBeFar;
      }
    }

    // Shadow Texel-Snapping eliminates directional shadow edge shimmer when walking or driving!
    const shadowHalfExtent = Math.abs(this.sunLight.shadow.camera.right);
    const mapSize = Math.max(512, this.sunLight.shadow.mapSize.x);
    const texelWorldSize = (shadowHalfExtent * 2) / mapSize;
    const snapX = Math.round(playerPos.x / texelWorldSize) * texelWorldSize;
    const snapY = Math.round(playerPos.y / texelWorldSize) * texelWorldSize;
    const snapZ = Math.round(playerPos.z / texelWorldSize) * texelWorldSize;

    const sunDist = 175;
    const sunElevClamped = Math.max(0.22, Math.abs(atmo.sunDir.y));
    this.sunLight.target.position.set(snapX, snapY, snapZ);
    this.sunLight.position.set(
      snapX + atmo.sunDir.x * sunDist,
      snapY + sunElevClamped * sunDist,
      snapZ + atmo.sunDir.z * sunDist
    );
    this.sunLight.target.updateMatrixWorld();

    const weatherDim =
      this.weather === 'rain' ? 0.52 : this.weather === 'fog' ? 0.68 : this.weather === 'overcast' ? 0.78 : 1.0;

    this.lastAtmosphere = atmo;
    this.lastWeatherDim = weatherDim;

    this.scene.background = atmo.horizonColor;
    this.fog.color.copy(atmo.horizonColor);
    // Keep PBR environment reflections strictly coupled to sky dayFactor so terrain never glows in dark skies!
    this.scene.environmentIntensity = atmo.envIntensity * weatherDim;

    // Linear horizon fog anchored right at the outer edge of the last loaded chunk!
    const targetFogFar = this.computeChunkFogFar();
    const targetFogNear = targetFogFar * this.getFogNearRatio();
    if (dt <= 0) {
      this.fog.near = targetFogNear;
      this.fog.far = targetFogFar;
    } else {
      this.fog.near = THREE.MathUtils.damp(this.fog.near, targetFogNear, 2.2, dt);
      this.fog.far = THREE.MathUtils.damp(this.fog.far, targetFogFar, 2.2, dt);
    }

    // Coherent sunlight, sky-bounce rim fill & indirect hemisphere fill
    this.sunLight.color.copy(atmo.sunColor);
    this.sunLight.intensity = (0.28 + atmo.dayFactor * 2.4) * weatherDim;

    this.bounceLight.position.set(-atmo.sunDir.x * 120, 62, -atmo.sunDir.z * 120);
    this.bounceLight.color.copy(atmo.skyZenith).lerp(atmo.horizonColor, 0.32);
    this.bounceLight.intensity = (0.14 + atmo.dayFactor * 0.28) * weatherDim;

    this.hemiLight.color.copy(atmo.skyZenith).lerp(atmo.horizonColor, 0.52);
    this.hemiLight.groundColor.copy(atmo.groundBounce);
    this.hemiLight.intensity = (0.24 + atmo.dayFactor * 0.48) * weatherDim;

    // Artificial military base lights brighten smoothly during golden hour & night
    const nightBoost = 0.55 + (1 - atmo.dayFactor) * 2.3 + atmo.sunsetFactor * 0.65;
    for (const lm of this.artificialLampMats) {
      lm.emissiveIntensity = nightBoost;
    }

    const t = performance.now() * 0.001;
    const beaconBlink = Math.sin(t * 3.8) > -0.2;
    this.beaconRedMat.color.setHex(beaconBlink ? 0xff2b1f : 0x450b08);

    // Rain particles
    this.rainPoints.visible = this.weather === 'rain';
    if (this.rainPoints.visible) {
      this.rainPoints.position.set(playerPos.x, 0, playerPos.z);
      const posArr = this.rainPositions;
      for (let i = 0; i < posArr.length; i += 3) {
        posArr[i + 1] -= 36 * dt;
        if (posArr[i + 1] < playerPos.y - 4) {
          posArr[i + 1] = playerPos.y + 30 + Math.random() * 14;
        }
      }
      (this.rainPoints.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    // Ambient warm sunlit dust motes drifting across the battlefield (scaled off on LOW)
    this.dustPoints.visible =
      this.graphicsPreset !== 'LOW' && this.weather !== 'rain' && atmo.dayFactor > 0.25 && playerPos.y > -2;
    if (this.dustPoints.visible) {
      this.dustPoints.position.set(playerPos.x, Math.max(0, playerPos.y - 1), playerPos.z);
      const dArr = this.dustPositions;
      for (let i = 0; i < dArr.length; i += 3) {
        dArr[i] += 1.4 * dt;
        dArr[i + 1] += Math.sin(t + i) * 0.22 * dt;
        if (dArr[i] > 38) dArr[i] = -38;
      }
      (this.dustPoints.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    // Overhead Ambient Patrol Helicopter orbiting Desert Outpost & nearby region!
    this.heliAngle += dt * 0.14;
    const centerOrbX = playerPos.x > 160 ? 395 : 0;
    const centerOrbZ = playerPos.x > 160 ? -80 : -20;
    const orbR = 135;
    const hx = centerOrbX + Math.cos(this.heliAngle) * orbR;
    const hz = centerOrbZ + Math.sin(this.heliAngle) * orbR;
    const hy = 62 + Math.sin(this.heliAngle * 2.0) * 6;
    this.patrolHeli.group.position.set(hx, hy, hz);
    this.patrolHeli.group.rotation.y = -this.heliAngle;
    this.patrolHeli.group.rotation.z = 0.14; // Realistic bank angle into turn
    this.patrolHeli.mainRotor.rotation.y += dt * 24;
    this.patrolHeli.tailRotor.rotation.x += dt * 36;

    // Volumetric extraction smoke plumes
    for (let i = 0; i < this.extractionSmokePuffs.length; i++) {
      const puff = this.extractionSmokePuffs[i];
      puff.phase = (puff.phase + dt * puff.speed) % 1;
      const p = puff.phase;
      const height = p * 30;
      const windDrift = p * p * 7.5;
      puff.sprite.position.set(
        puff.origin.x + windDrift + Math.sin(t * 1.4 + puff.swayOffset) * (0.6 + p * 1.8),
        puff.origin.y + height,
        puff.origin.z + windDrift * 0.45 + Math.cos(t * 1.1 + puff.swayOffset) * (0.6 + p * 1.5)
      );
      const scale = 1.6 + p * 7.8;
      puff.sprite.scale.set(scale, scale, 1);
      const fadeIn = Math.min(1, p * 5);
      const fadeOut = Math.max(0, 1 - Math.pow(p, 1.6));
      (puff.sprite.material as THREE.SpriteMaterial).opacity = 0.48 * fadeIn * fadeOut;
    }

    // Security camera sweep & stealth detection
    for (const cam of this.securityCameras) {
      if (cam.destroyed) continue;
      cam.currentYaw = cam.baseYaw + Math.sin(t * 0.85) * 0.85;
      cam.headMesh.rotation.y = cam.currentYaw;
      if (cam.alarmCooldown > 0) cam.alarmCooldown -= dt;

      const dist = cam.position.distanceTo(playerPos);
      if (dist < 18 && cam.alarmCooldown <= 0 && playerPos.y > -2) {
        const toPlayer = new THREE.Vector3().subVectors(playerPos, cam.position).normalize();
        const camForward = new THREE.Vector3(Math.sin(cam.currentYaw), -0.25, Math.cos(cam.currentYaw)).normalize();
        if (toPlayer.dot(camForward) > 0.86) {
          cam.alarmCooldown = 14;
          onCameraAlert?.(cam.position.clone());
        }
      }
    }
  }

  public getRegionSummary() {
    return REGION_LIST;
  }

  public dispose() {
    for (const [k, s] of this.sectors.entries()) {
      this.unloadSector(k, s);
    }
    this.sky.dispose();
    this.terrain.dispose();
    this.veg.dispose();
    this.assetManager.dispose();
    this.barrelGeo.dispose();
    this.barrelMat.dispose();
    this.desertConcreteMat.dispose();
    this.lampWarmMat.dispose();
    this.lampCoolMat.dispose();
    this.beaconRedMat.dispose();
    this.containerMats.forEach((m) => m.dispose());
    this.extractionSmokePuffs.forEach((p) => {
      this.scene.remove(p.sprite);
      (p.sprite.material as THREE.Material).dispose();
    });
    this.rainPoints.geometry.dispose();
    (this.rainPoints.material as THREE.Material).dispose();
    this.dustPoints.geometry.dispose();
    (this.dustPoints.material as THREE.Material).dispose();
  }
}
