import * as THREE from 'three';
import { EnemyAIState, EnemyClass, RegionId } from '../types';
import { getRegionAt, SECTOR_SIZE } from '../data/worldConfig';
import { buildEnemyModel, BuiltEnemyModel } from './ProceduralModels';
import { ProceduralMaterials } from './TextureLibrary';
import { TerrainManager } from './TerrainManager';
import { WorldManager } from './WorldManager';
import { AudioManager } from './AudioManager';
import { AssetCategory } from './ModelAssetManager';

const SOLDIER_GLB_POOL: AssetCategory[] = ['soldier_trooper', 'soldier_heavy', 'soldier_sniper'];

export interface EnemyUnit {
  id: string;
  enemyClass: EnemyClass;
  regionId: RegionId;
  sectorKey: string;
  model: BuiltEnemyModel;
  glbRoot?: THREE.Group;
  glbBaseY?: number;
  position: THREE.Vector3;
  homePos: THREE.Vector3;
  patrolTarget: THREE.Vector3;
  investigatePos: THREE.Vector3 | null;
  yaw: number;
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  fireRate: number;
  detectRange: number;
  attackRange: number;
  state: EnemyAIState;
  alertMeter: number; // 0..100
  fireCooldown: number;
  stateTimer: number;
  hitFlashTimer: number;
  muzzleTimer: number;
  walkPhase: number;
  strafeDir: number;
  deathTilt: number;
  corpseLootSpawned: boolean;
}

export interface EnemyFireEvent {
  origin: THREE.Vector3;
  target: THREE.Vector3;
  damage: number;
  hitPlayer: boolean;
  suppression: number;
  shooterClass: EnemyClass;
}

const _dir = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

export class EnemyAI {
  public enemies = new Map<string, EnemyUnit>();
  public hitMeshes: THREE.Mesh[] = [];

  private scene: THREE.Scene;
  private terrain: TerrainManager;
  private world: WorldManager;
  private mats: ProceduralMaterials;
  private audio: AudioManager;
  private nextId = 1;

  constructor(
    scene: THREE.Scene,
    terrain: TerrainManager,
    world: WorldManager,
    mats: ProceduralMaterials,
    audio: AudioManager
  ) {
    this.scene = scene;
    this.terrain = terrain;
    this.world = world;
    this.mats = mats;
    this.audio = audio;

    // Preload all 3 soldier .glb models immediately so NPCs never show procedural placeholders
    void this.world.assetManager.loadNormalizedSoldier('soldier_trooper', 1.78);
    void this.world.assetManager.loadNormalizedSoldier('soldier_heavy', 1.94);
    void this.world.assetManager.loadNormalizedSoldier('soldier_sniper', 1.78);

    // Guaranteed underground facility elite guards
    this.spawnEnemy('elite', 'underground_facility', 'global', new THREE.Vector3(88, -8.5, -124));
    this.spawnEnemy('heavy', 'underground_facility', 'global', new THREE.Vector3(102, -8.5, -131));
    this.spawnEnemy('guard', 'underground_facility', 'global', new THREE.Vector3(95, -8.5, -114));
  }

  public spawnSectorEnemies(sx: number, sz: number, sectorKey: string) {
    const cx = (sx + 0.5) * SECTOR_SIZE;
    const cz = (sz + 0.5) * SECTOR_SIZE;
    if (Math.max(Math.abs(cx), Math.abs(cz)) > 690) return;

    const region = getRegionAt(cx, cz);
    const count =
      region.id === 'blacksite'
        ? 4
        : region.id === 'abandoned_city' || region.id === 'mountain_range'
        ? 4
        : region.id === 'rural_settlement'
        ? 2
        : 3;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 22 + Math.random() * 64;
      let ex = cx + Math.cos(angle) * radius;
      let ez = cz + Math.sin(angle) * radius;

      // Keep immediate spawn circle (0, 18) safe for 28m so player isn't insta-killed on load
      if (Math.hypot(ex - 0, ez - 18) < 28) {
        ex += (ex >= 0 ? 1 : -1) * 34;
        ez -= 34;
      }

      const ey = this.terrain.getSurfaceHeightAt(ex, ez);
      const classes: EnemyClass[] = ['infantry', 'guard', 'sniper', 'elite', 'heavy'];
      const cls = Math.random() < 0.55 ? this.pickClassForRegion(region.id, i) : classes[Math.floor(Math.random() * classes.length)];
      this.spawnEnemy(cls, region.id, sectorKey, new THREE.Vector3(ex, ey, ez));
    }
  }

  /**
   * Spawns randomized NPCs directly across the main Industrial Map arena (0, 0, -48),
   * each using a randomly selected character .glb model.
   */
  public spawnIndustrialArenaEnemies(count = 12) {
    const classes: EnemyClass[] = ['infantry', 'guard', 'sniper', 'elite', 'heavy'];
    let spawned = 0;
    let attempts = 0;
    while (spawned < count && attempts < count * 5) {
      attempts++;
      const ex = (Math.random() - 0.5) * 114; // [-57, +57]
      const ez = -48 + (Math.random() - 0.5) * 108; // [-102, +6]
      // Keep immediate spawn (0, 18) safe for 22m
      if (Math.hypot(ex - 0, ez - 18) < 22) continue;

      const testPos = new THREE.Vector3(ex, this.terrain.getSurfaceHeightAt(ex, ez), ez);
      if (this.world.resolveHorizontalCollision(testPos, 0.7, 1.8)) continue;

      const cls = classes[Math.floor(Math.random() * classes.length)];
      this.spawnEnemy(cls, 'blacksite', 'arena', testPos);
      spawned++;
    }
  }

  public spawnExtractionWave(center: THREE.Vector3, regionId: RegionId) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 42 + Math.random() * 14;
      const x = center.x + Math.cos(a) * dist;
      const z = center.z + Math.sin(a) * dist;
      const y = this.terrain.getSurfaceHeightAt(x, z);
      const cls: EnemyClass = i === 0 ? 'elite' : i === 1 ? 'heavy' : 'infantry';
      const unit = this.spawnEnemy(cls, regionId, 'extraction', new THREE.Vector3(x, y, z));
      unit.state = 'COMBAT';
      unit.alertMeter = 100;
      unit.investigatePos = center.clone();
    }
  }

  private pickClassForRegion(regionId: RegionId, idx: number): EnemyClass {
    if (regionId === 'mountain_range') return idx % 2 === 0 ? 'sniper' : 'elite';
    if (regionId === 'blacksite') return idx === 0 ? 'guard' : idx === 1 ? 'elite' : idx === 2 ? 'heavy' : 'infantry';
    if (regionId === 'desert_outpost') return idx === 0 ? 'sniper' : 'infantry';
    if (regionId === 'abandoned_city') return idx === 0 ? 'elite' : 'infantry';
    if (regionId === 'industrial_valley') return idx === 0 ? 'heavy' : 'guard';
    return 'infantry';
  }

  public spawnEnemy(enemyClass: EnemyClass, regionId: RegionId, sectorKey: string, pos: THREE.Vector3): EnemyUnit {
    const id = `enemy_${this.nextId++}`;
    const model = buildEnemyModel(enemyClass, id, this.mats);
    model.group.position.copy(pos);
    this.scene.add(model.group);

    // Set invisible hitboxes for raycasting; keep procedural meshes hidden once .glb loads
    const invisibleHitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const hitSet = new Set<THREE.Object3D>(model.hitMeshes);
    const proceduralMeshes: THREE.Mesh[] = [];
    model.group.traverse((obj) => {
      if (obj === model.group || obj === model.muzzleFlash) return;
      if (hitSet.has(obj)) {
        (obj as THREE.Mesh).material = invisibleHitMat;
        (obj as THREE.Mesh).castShadow = false;
        return;
      }
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.visible = false;
        proceduralMeshes.push(mesh);
      }
    });

    // Randomly assign one of the character .glb files to each NPC
    const assetKey = SOLDIER_GLB_POOL[Math.floor(Math.random() * SOLDIER_GLB_POOL.length)];
    const targetHeight = assetKey === 'soldier_heavy' ? 1.94 : 1.78;
    void this.world.assetManager.loadNormalizedSoldier(assetKey, targetHeight).then((glbSoldier) => {
      if (!glbSoldier) {
        // Fallback: if GLB ever fails to load, reveal procedural soldier so NPC is never invisible
        for (const m of proceduralMeshes) m.visible = true;
        return;
      }
      glbSoldier.visible = true;
      glbSoldier.traverse((o) => {
        o.visible = true;
      });
      model.group.add(glbSoldier);
      unit.glbRoot = glbSoldier;
      unit.glbBaseY = glbSoldier.position.y;
    });

    const stats: Record<
      EnemyClass,
      { hp: number; speed: number; dmg: number; rpm: number; detect: number; range: number }
    > = {
      infantry: { hp: 95, speed: 4.5, dmg: 10, rpm: 2.2, detect: 38, range: 52 },
      guard: { hp: 110, speed: 4.1, dmg: 11, rpm: 2.5, detect: 34, range: 46 },
      sniper: { hp: 85, speed: 3.6, dmg: 26, rpm: 0.65, detect: 66, range: 86 },
      elite: { hp: 145, speed: 5.3, dmg: 14, rpm: 3.2, detect: 46, range: 60 },
      heavy: { hp: 230, speed: 3.3, dmg: 15, rpm: 3.6, detect: 40, range: 52 },
    };

    const st = stats[enemyClass];
    const unit: EnemyUnit = {
      id,
      enemyClass,
      regionId,
      sectorKey,
      model,
      position: pos.clone(),
      homePos: pos.clone(),
      patrolTarget: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 28, 0, (Math.random() - 0.5) * 28)),
      investigatePos: null,
      yaw: Math.random() * Math.PI * 2,
      health: st.hp,
      maxHealth: st.hp,
      speed: st.speed,
      damage: st.dmg,
      fireRate: st.rpm,
      detectRange: st.detect,
      attackRange: st.range,
      state: 'PATROL',
      alertMeter: 0,
      fireCooldown: 0.5 + Math.random(),
      stateTimer: 3 + Math.random() * 4,
      hitFlashTimer: 0,
      muzzleTimer: 0,
      walkPhase: Math.random() * Math.PI * 2,
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      deathTilt: 0,
      corpseLootSpawned: false,
    };

    this.enemies.set(id, unit);
    for (const m of model.hitMeshes) this.hitMeshes.push(m);
    return unit;
  }

  public unloadSector(sectorKey: string) {
    for (const [id, unit] of this.enemies.entries()) {
      if (unit.sectorKey === sectorKey && unit.state !== 'DEAD') {
        this.removeEnemy(id, unit);
      }
    }
  }

  public clearEnemiesNear(pos: THREE.Vector3, minRadius: number) {
    for (const [id, unit] of Array.from(this.enemies.entries())) {
      if (unit.state !== 'DEAD' && Math.hypot(unit.position.x - pos.x, unit.position.z - pos.z) < minRadius) {
        this.removeEnemy(id, unit);
      }
    }
  }

  public clearAllEnemies() {
    for (const [id, unit] of Array.from(this.enemies.entries())) {
      this.removeEnemy(id, unit);
    }
    this.hitMeshes = [];
  }

  public ensureUndergroundGuards() {
    let hasGlobal = false;
    for (const unit of this.enemies.values()) {
      if (unit.sectorKey === 'global' && unit.state !== 'DEAD') {
        hasGlobal = true;
        break;
      }
    }
    if (!hasGlobal) {
      this.spawnEnemy('elite', 'underground_facility', 'global', new THREE.Vector3(88, -8.5, -124));
      this.spawnEnemy('heavy', 'underground_facility', 'global', new THREE.Vector3(102, -8.5, -131));
      this.spawnEnemy('guard', 'underground_facility', 'global', new THREE.Vector3(95, -8.5, -114));
    }
  }

  private removeEnemy(id: string, unit: EnemyUnit) {
    this.scene.remove(unit.model.group);
    const removeSet = new Set(unit.model.hitMeshes);
    this.hitMeshes = this.hitMeshes.filter((m) => !removeSet.has(m));
    this.enemies.delete(id);
  }

  public notifySound(sourcePos: THREE.Vector3, radius: number, immediateCombat = false) {
    const chunkVisRange = this.world.getVisibleChunkRangeMeters();
    const cappedRadius = Math.min(radius, chunkVisRange * 0.92);
    for (const unit of this.enemies.values()) {
      if (unit.state === 'DEAD') continue;
      if (unit.sectorKey !== 'global' && !this.world.isPositionInLoadedChunk(unit.position.x, unit.position.z)) {
        continue;
      }
      const dist = unit.position.distanceTo(sourcePos);
      if (dist <= cappedRadius) {
        unit.investigatePos = sourcePos.clone();
        if (immediateCombat && dist < cappedRadius * 0.6) {
          unit.state = 'COMBAT';
          unit.alertMeter = 100;
        } else if (unit.state === 'PATROL' || unit.state === 'SUSPICIOUS') {
          unit.state = 'INVESTIGATE';
          unit.alertMeter = Math.max(unit.alertMeter, 55);
          unit.stateTimer = 8;
        }
      }
    }
  }

  public applyDamage(
    enemyId: string,
    amount: number,
    hitZone: 'head' | 'torso' | 'limb',
    attackerPos: THREE.Vector3
  ): { killed: boolean; headshot: boolean; unit: EnemyUnit | null } {
    const unit = this.enemies.get(enemyId);
    if (!unit || unit.state === 'DEAD') return { killed: false, headshot: false, unit: null };

    const headshot = hitZone === 'head';
    const mult = headshot ? 1.0 : hitZone === 'limb' ? 0.72 : 1.0; // Headshot mult already applied by weapon
    const armorScale = unit.enemyClass === 'heavy' && !headshot ? 0.65 : 1.0;
    unit.health -= amount * mult * armorScale;
    unit.hitFlashTimer = 0.14;

    // Visual hit flash
    (unit.model.torsoMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x882211);

    if (unit.health <= 0) {
      unit.health = 0;
      unit.state = 'DEAD';
      unit.alertMeter = 0;
      unit.model.muzzleFlash.visible = false;
      // Alert nearby squadmates to fallen ally
      for (const ally of this.enemies.values()) {
        if (ally.state !== 'DEAD' && ally.position.distanceTo(unit.position) < 28) {
          ally.investigatePos = attackerPos.clone();
          ally.state = 'INVESTIGATE';
          ally.alertMeter = Math.max(ally.alertMeter, 70);
        }
      }
      return { killed: true, headshot, unit };
    }

    // Immediate reaction to taking fire
    unit.state = unit.health < unit.maxHealth * 0.28 ? 'SEEK_COVER' : 'COMBAT';
    unit.alertMeter = 100;
    unit.investigatePos = attackerPos.clone();
    this.alertNearbySquad(unit.position, attackerPos, 42);
    return { killed: false, headshot, unit };
  }

  private alertNearbySquad(origin: THREE.Vector3, targetPos: THREE.Vector3, radius: number) {
    for (const ally of this.enemies.values()) {
      if (ally.state === 'DEAD') continue;
      if (ally.position.distanceTo(origin) < radius) {
        ally.investigatePos = targetPos.clone();
        if (ally.state !== 'COMBAT') {
          ally.state = 'COMBAT';
          ally.alertMeter = 100;
        }
      }
    }
  }

  private hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3, maxVisibleDist: number): boolean {
    _dir.subVectors(to, from);
    const dist = _dir.length();
    if (dist > maxVisibleDist || dist > 110) return false;
    if (dist < 0.8) return true;
    _dir.divideScalar(dist);

    // 1. Terrain ridge / dune occlusion check (prevents spotting/shooting over hills the player cannot see past!)
    const steps = Math.min(10, Math.max(4, Math.ceil(dist / 9)));
    for (let s = 1; s < steps; s++) {
      const frac = s / steps;
      const sx = from.x + (to.x - from.x) * frac;
      const sy = from.y + (to.y - from.y) * frac;
      const sz = from.z + (to.z - from.z) * frac;
      if (from.y > -2 && to.y > -2) {
        const groundY = this.terrain.getSurfaceHeightAt(sx, sz);
        if (groundY > sy + 0.15) return false;
      }
    }

    // 2. Fast AABB slab check against loaded chunk building & cover colliders
    for (let i = 0; i < this.world.allColliders.length; i++) {
      const b = this.world.allColliders[i];
      const cx = (b.minX + b.maxX) * 0.5;
      const cz = (b.minZ + b.maxZ) * 0.5;
      if (Math.hypot(cx - from.x, cz - from.z) > dist + 25) continue;

      if (this.rayIntersectsAABB(from, _dir, dist - 0.5, b)) {
        return false;
      }
    }
    return true;
  }

  private rayIntersectsAABB(
    orig: THREE.Vector3,
    dir: THREE.Vector3,
    maxT: number,
    b: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }
  ): boolean {
    let tmin = 0;
    let tmax = maxT;
    const invX = Math.abs(dir.x) > 1e-6 ? 1 / dir.x : 1e9;
    const tx1 = (b.minX - orig.x) * invX;
    const tx2 = (b.maxX - orig.x) * invX;
    tmin = Math.max(tmin, Math.min(tx1, tx2));
    tmax = Math.min(tmax, Math.max(tx1, tx2));

    const invY = Math.abs(dir.y) > 1e-6 ? 1 / dir.y : 1e9;
    const ty1 = (b.minY - orig.y) * invY;
    const ty2 = (b.maxY - orig.y) * invY;
    tmin = Math.max(tmin, Math.min(ty1, ty2));
    tmax = Math.min(tmax, Math.max(ty1, ty2));

    const invZ = Math.abs(dir.z) > 1e-6 ? 1 / dir.z : 1e9;
    const tz1 = (b.minZ - orig.z) * invZ;
    const tz2 = (b.maxZ - orig.z) * invZ;
    tmin = Math.max(tmin, Math.min(tz1, tz2));
    tmax = Math.min(tmax, Math.max(tz1, tz2));

    return tmax >= tmin && tmax >= 0;
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    playerStealthFactor: number, // 0.35 (stealthy night crouch) to 1.3 (sprinting/vehicle)
    roadkillPos?: THREE.Vector3
  ): { fireEvents: EnemyFireEvent[]; maxAlert: number; inCombatCount: number; newlyDead: EnemyUnit[] } {
    const fireEvents: EnemyFireEvent[] = [];
    const newlyDead: EnemyUnit[] = [];
    let maxAlert = 0;
    let inCombatCount = 0;

    const playerEye = new THREE.Vector3(playerPos.x, playerPos.y + 1.4, playerPos.z);

    for (const unit of this.enemies.values()) {
      // Hit flash decay
      if (unit.hitFlashTimer > 0) {
        unit.hitFlashTimer -= dt;
        if (unit.hitFlashTimer <= 0) {
          (unit.model.torsoMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        }
      }
      if (unit.muzzleTimer > 0) {
        unit.muzzleTimer -= dt;
        if (unit.muzzleTimer <= 0) unit.model.muzzleFlash.visible = false;
      }

      if (unit.state === 'DEAD') {
        if (unit.deathTilt < Math.PI * 0.48) {
          unit.deathTilt = Math.min(Math.PI * 0.48, unit.deathTilt + dt * 5.2);
          unit.model.group.rotation.x = unit.deathTilt;
          unit.model.group.position.y = unit.position.y + 0.16;
        }
        if (!unit.corpseLootSpawned) {
          unit.corpseLootSpawned = true;
          newlyDead.push(unit);
        }
        continue;
      }

      // Vehicle roadkill check
      if (roadkillPos && unit.position.distanceTo(roadkillPos) < 2.8) {
        unit.health = 0;
        unit.state = 'DEAD';
        unit.alertMeter = 0;
        newlyDead.push(unit);
        continue;
      }

      const distToPlayer = unit.position.distanceTo(playerPos);
      // Chunk-based visibility lock: NPC is ONLY active & able to see the player if the NPC sits inside a currently loaded chunk
      // AND within the player's actual visible range before the end-of-chunk fog wall!
      const chunkVisRange = this.world.getVisibleChunkRangeMeters();
      const inLoadedChunk =
        unit.sectorKey === 'global'
          ? playerPos.y < -1.5 && distToPlayer <= chunkVisRange
          : unit.sectorKey === 'arena' || unit.sectorKey === 'extraction'
          ? distToPlayer <= chunkVisRange
          : this.world.isPositionInLoadedChunk(unit.position.x, unit.position.z);
      const visibleToPlayerInChunk = inLoadedChunk && distToPlayer <= chunkVisRange;

      unit.model.group.visible = inLoadedChunk && distToPlayer <= chunkVisRange * 1.04;

      if (!visibleToPlayerInChunk) {
        // Beyond loaded chunk or hidden in end-of-chunk fog: NPC cannot detect or shoot the player
        unit.alertMeter = Math.max(0, unit.alertMeter - 22 * dt);
        if (unit.state === 'COMBAT' && unit.alertMeter <= 0) {
          unit.state = 'PATROL';
        }
        continue;
      }

      const enemyEye = new THREE.Vector3(unit.position.x, unit.position.y + 1.55, unit.position.z);
      const effectiveDetectRange = Math.min(unit.detectRange * playerStealthFactor, chunkVisRange * 0.88);
      const effectiveAttackRange = Math.min(unit.attackRange, chunkVisRange * 0.92);

      // Mutual Chunk Vision & LOS detection: NPC can only spot the player if unobstructed in the loaded chunk!
      let canSeePlayer = false;
      if (distToPlayer < effectiveDetectRange) {
        const toPlayerXZ = new THREE.Vector2(playerPos.x - unit.position.x, playerPos.z - unit.position.z).normalize();
        const fwdXZ = new THREE.Vector2(-Math.sin(unit.yaw), -Math.cos(unit.yaw));
        const dot = toPlayerXZ.dot(fwdXZ);
        // Realistic ~130-degree forward vision cone (dot > 0.42), close-range awareness < 6.5m
        if (dot > 0.42 || distToPlayer < 6.5 || unit.state === 'COMBAT') {
          canSeePlayer = this.hasLineOfSight(enemyEye, playerEye, chunkVisRange * 0.92);
        }
      }

      // Update Alert Meter & FSM Transitions
      if (canSeePlayer) {
        const fillRate = (1 - distToPlayer / (effectiveDetectRange + 6)) * 66 + 18;
        unit.alertMeter = Math.min(100, unit.alertMeter + fillRate * dt);
        unit.investigatePos = playerPos.clone();
        if (unit.alertMeter >= 95 && unit.state !== 'COMBAT' && unit.state !== 'SEEK_COVER') {
          unit.state = 'COMBAT';
          this.audio.playRadioBeep();
          this.alertNearbySquad(unit.position, playerPos, 28);
        } else if (unit.alertMeter >= 35 && unit.state === 'PATROL') {
          unit.state = 'SUSPICIOUS';
        }
      } else {
        unit.alertMeter = Math.max(0, unit.alertMeter - 12 * dt);
        if (unit.state === 'COMBAT' && unit.alertMeter < 20) {
          unit.state = 'INVESTIGATE';
          unit.stateTimer = 8;
        } else if ((unit.state === 'SUSPICIOUS' || unit.state === 'INVESTIGATE') && unit.alertMeter <= 0) {
          unit.state = 'PATROL';
        }
      }

      if (unit.alertMeter > maxAlert) maxAlert = unit.alertMeter;
      if (unit.state === 'COMBAT' || unit.state === 'SEEK_COVER') inCombatCount++;

      // Movement & Action per FSM state
      let moveDirX = 0;
      let moveDirZ = 0;
      let moveSpeed = 0;
      let desiredYaw = unit.yaw;

      unit.stateTimer -= dt;

      if (unit.state === 'PATROL') {
        const toPatrol = _dir.subVectors(unit.patrolTarget, unit.position);
        toPatrol.y = 0;
        if (toPatrol.length() < 2.2 || unit.stateTimer <= 0) {
          unit.patrolTarget.set(
            unit.homePos.x + (Math.random() - 0.5) * 34,
            unit.homePos.y,
            unit.homePos.z + (Math.random() - 0.5) * 34
          );
          unit.stateTimer = 5 + Math.random() * 5;
        } else {
          toPatrol.normalize();
          moveDirX = toPatrol.x;
          moveDirZ = toPatrol.z;
          moveSpeed = unit.speed * 0.45;
          desiredYaw = Math.atan2(-moveDirX, -moveDirZ);
        }
      } else if (unit.state === 'SUSPICIOUS') {
        desiredYaw = Math.atan2(-(playerPos.x - unit.position.x), -(playerPos.z - unit.position.z));
      } else if (unit.state === 'INVESTIGATE' && unit.investigatePos) {
        const toInv = _dir.subVectors(unit.investigatePos, unit.position);
        toInv.y = 0;
        if (toInv.length() > 3.5) {
          toInv.normalize();
          moveDirX = toInv.x;
          moveDirZ = toInv.z;
          moveSpeed = unit.speed * 0.72;
          desiredYaw = Math.atan2(-moveDirX, -moveDirZ);
        } else if (unit.stateTimer <= 0) {
          unit.state = 'PATROL';
        }
      } else if (unit.state === 'COMBAT' || unit.state === 'SEEK_COVER') {
        const toP = new THREE.Vector3(playerPos.x - unit.position.x, 0, playerPos.z - unit.position.z);
        const horizDist = toP.length();
        if (horizDist > 0.1) toP.divideScalar(horizDist);
        desiredYaw = Math.atan2(-toP.x, -toP.z);

        if (unit.stateTimer <= 0) {
          unit.strafeDir = -unit.strafeDir;
          unit.stateTimer = 2.0 + Math.random() * 2.5;
        }

        const preferredDist = unit.enemyClass === 'sniper' ? 58 : unit.enemyClass === 'heavy' ? 22 : 28;
        if (unit.state === 'SEEK_COVER' || horizDist < preferredDist * 0.55) {
          // Tactical retreat / strafe to cover
          moveDirX = -toP.x * 0.55 + toP.z * unit.strafeDir * 0.85;
          moveDirZ = -toP.z * 0.55 - toP.x * unit.strafeDir * 0.85;
          moveSpeed = unit.speed * 0.88;
        } else if (!canSeePlayer || horizDist > preferredDist * 1.25) {
          // Advance / flank toward player
          moveDirX = toP.x * 0.85 + toP.z * unit.strafeDir * 0.4;
          moveDirZ = toP.z * 0.85 - toP.x * unit.strafeDir * 0.4;
          moveSpeed = unit.speed;
        } else {
          // Tactical combat strafe
          moveDirX = toP.z * unit.strafeDir;
          moveDirZ = -toP.x * unit.strafeDir;
          moveSpeed = unit.speed * 0.62;
        }

        // Fire at player ONLY if unobstructed LOS & within chunk-capped attack range
        unit.fireCooldown -= dt;
        if (canSeePlayer && distToPlayer <= effectiveAttackRange && unit.fireCooldown <= 0) {
          unit.fireCooldown = (1 / unit.fireRate) * (0.85 + Math.random() * 0.45);
          unit.model.muzzleFlash.visible = true;
          unit.muzzleTimer = 0.06;

          const accuracy =
            unit.enemyClass === 'sniper'
              ? 0.62
              : unit.enemyClass === 'elite'
              ? 0.5
              : 0.36;
          const distPenalty = Math.max(0.25, 1 - distToPlayer / (unit.attackRange * 1.35));
          const hitPlayer = Math.random() < accuracy * distPenalty;

          const aimSpread = hitPlayer ? 0.35 : 2.6;
          const targetPt = playerEye.clone().add(
            new THREE.Vector3(
              (Math.random() - 0.5) * aimSpread,
              (Math.random() - 0.5) * aimSpread * 0.6,
              (Math.random() - 0.5) * aimSpread
            )
          );

          this.audio.playGunshot(
            unit.enemyClass === 'sniper' ? 'sniper' : unit.enemyClass === 'heavy' ? 'battle_rifle' : 'assault',
            false,
            enemyEye
          );

          fireEvents.push({
            origin: enemyEye.clone(),
            target: targetPt,
            damage: unit.damage,
            hitPlayer,
            suppression: distToPlayer < 45 ? 0.25 : 0.12,
            shooterClass: unit.enemyClass,
          });
        }
      }

      // Smooth yaw rotation
      let diff = desiredYaw - unit.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      unit.yaw += diff * Math.min(1, dt * 7);

      // Apply horizontal movement, collision & realistic articulated human locomotion
      const inCombatStance = unit.state === 'COMBAT' || unit.state === 'SEEK_COVER';
      if (moveSpeed > 0.05) {
        const len = Math.hypot(moveDirX, moveDirZ);
        if (len > 0.001) {
          unit.position.x += (moveDirX / len) * moveSpeed * dt;
          unit.position.z += (moveDirZ / len) * moveSpeed * dt;
        }
        const collided = this.world.resolveHorizontalCollision(unit.position, 0.55, 1.8);
        if (collided) {
          unit.strafeDir = -unit.strafeDir;
          if (unit.state === 'PATROL') {
            unit.patrolTarget.copy(unit.homePos);
          }
        }
        unit.walkPhase += dt * moveSpeed * 2.55;
        const speedNorm = THREE.MathUtils.clamp(moveSpeed / Math.max(1, unit.speed), 0.35, 1.1);
        const swing = Math.sin(unit.walkPhase) * (0.64 * speedNorm);
        unit.model.leftLeg.rotation.x = swing;
        unit.model.rightLeg.rotation.x = -swing;

        // Realistic anatomical knee flexion on leg swing-through (just like real running stride!)
        const lKneeBend = Math.max(0.08, -Math.cos(unit.walkPhase) * 0.72 * speedNorm + 0.24);
        const rKneeBend = Math.max(0.08, Math.cos(unit.walkPhase) * 0.72 * speedNorm + 0.24);
        unit.model.leftShin.rotation.x = -lKneeBend;
        unit.model.rightShin.rotation.x = -rKneeBend;

        // Subtle athletic hip bob & forward combat torso lean
        unit.model.upperBody.position.y = 0.94 + Math.abs(Math.sin(unit.walkPhase)) * 0.032 * speedNorm;
        unit.model.upperBody.rotation.x = THREE.MathUtils.damp(
          unit.model.upperBody.rotation.x,
          inCombatStance ? 0.16 : 0.09,
          8,
          dt
        );
        unit.model.upperBody.rotation.y = Math.sin(unit.walkPhase) * 0.06 * speedNorm;
      } else {
        unit.walkPhase += dt * 1.8;
        unit.model.leftLeg.rotation.x = THREE.MathUtils.damp(unit.model.leftLeg.rotation.x, inCombatStance ? 0.14 : 0.0, 8, dt);
        unit.model.rightLeg.rotation.x = THREE.MathUtils.damp(unit.model.rightLeg.rotation.x, inCombatStance ? -0.14 : 0.0, 8, dt);
        unit.model.leftShin.rotation.x = THREE.MathUtils.damp(unit.model.leftShin.rotation.x, inCombatStance ? -0.22 : -0.04, 8, dt);
        unit.model.rightShin.rotation.x = THREE.MathUtils.damp(unit.model.rightShin.rotation.x, inCombatStance ? -0.16 : -0.04, 8, dt);
        // Subtle idle breathing & combat ready stance
        unit.model.upperBody.position.y = 0.94 + Math.sin(unit.walkPhase) * 0.008;
        unit.model.upperBody.rotation.x = THREE.MathUtils.damp(
          unit.model.upperBody.rotation.x,
          inCombatStance ? 0.14 : 0.05,
          8,
          dt
        );
        unit.model.upperBody.rotation.y = THREE.MathUtils.damp(unit.model.upperBody.rotation.y, 0, 8, dt);
      }

      // Realistic head scanning when patrolling vs locked-on target in combat
      const targetHeadYaw = inCombatStance ? 0 : Math.sin(unit.walkPhase * 0.45) * 0.24;
      unit.model.headPivot.rotation.y = THREE.MathUtils.damp(unit.model.headPivot.rotation.y, targetHeadYaw, 6, dt);

      // Rifle recoil kick feedback on muzzle flash
      const targetRiflePitch = unit.muzzleTimer > 0 ? 0.18 : 0.0;
      const targetRifleZ = unit.muzzleTimer > 0 ? -0.2 : -0.24;
      unit.model.weaponPivot.rotation.x = THREE.MathUtils.damp(unit.model.weaponPivot.rotation.x, targetRiflePitch, 20, dt);
      unit.model.weaponPivot.position.z = THREE.MathUtils.damp(unit.model.weaponPivot.position.z, targetRifleZ, 20, dt);

      // Keep grounded on terrain or bunker floor
      if (unit.regionId === 'underground_facility' && unit.position.y < -2) {
        unit.position.y = -8.5;
      } else {
        unit.position.y = this.terrain.getSurfaceHeightAt(unit.position.x, unit.position.z);
      }

      if (unit.glbRoot && unit.glbBaseY !== undefined) {
        const movingBob = moveSpeed > 0.05 ? Math.abs(Math.sin(unit.walkPhase)) * 0.055 : Math.sin(unit.walkPhase) * 0.008;
        unit.glbRoot.position.y = unit.glbBaseY + movingBob;
        unit.glbRoot.rotation.z = moveSpeed > 0.05 ? Math.sin(unit.walkPhase) * 0.035 : 0;
      }

      unit.model.group.position.copy(unit.position);
      unit.model.group.rotation.y = unit.yaw;
    }

    return { fireEvents, maxAlert, inCombatCount, newlyDead };
  }

  public dispose() {
    for (const unit of this.enemies.values()) {
      this.scene.remove(unit.model.group);
    }
    this.enemies.clear();
    this.hitMeshes = [];
  }
}
