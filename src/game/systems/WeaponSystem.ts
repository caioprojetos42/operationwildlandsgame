import * as THREE from 'three';
import { WeaponId, WeaponRuntimeState, WeaponSpec } from '../types';
import { WEAPONS } from '../data/weapons';
import { buildWeaponModel, BuiltWeaponModel } from './ProceduralModels';
import { ProceduralMaterials } from './TextureLibrary';
import { AudioManager } from './AudioManager';
import { EnemyAI } from './EnemyAI';
import { WorldManager } from './WorldManager';
import { VehicleSystem } from './VehicleSystem';

interface ActiveProjectile {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  drop: number;
  damage: number;
  headshotMult: number;
  life: number;
  fromEnemy: boolean;
}

interface ActiveGrenade {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
}

interface ActiveParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
  scaleRate: number;
}

interface ActiveSmokeSprite {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  baseOpacity: number;
  growRate: number;
}

interface ActiveShellCasing {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  life: number;
}

interface TracerLine {
  line: THREE.Line;
  life: number;
}

export interface CombatCallbacks {
  onHitEnemy: (enemyId: string, headshot: boolean, killed: boolean, regionId: string, pos: THREE.Vector3) => void;
  onDestroyProp: (propId: string, missionId: string | undefined, pos: THREE.Vector3) => void;
  onDestroyCamera: (camId: string) => void;
  onExplosion: (pos: THREE.Vector3, radius: number, maxDamage: number) => void;
  onCameraShake: (amount: number) => void;
  onHitstop: (durationSec: number) => void;
  onShotFired?: () => void;
  getTrainingHitMeshes?: () => THREE.Mesh[];
  onHitTrainingTarget?: (targetId: string, hitZone: 'head' | 'body', point: THREE.Vector3) => void;
}

const _raycaster = new THREE.Raycaster();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _camFwd = new THREE.Vector3();

const WEAPON_GLB_URLS: Record<WeaponId, string> = {
  ar15: '/models/weapon_m4a1.glb',
  m4a1: '/models/weapon_m4a1.glb',
  ak74: '/models/weapon_ak74.glb',
  fal: '/models/weapon_ak74.glb',
  g36: '/models/weapon_vsk.glb',
  scarh: '/models/weapon_vsk.glb',
  mp5: '/models/weapon_mp5.glb',
  mp7: '/models/weapon_smg_kdw.glb',
  ump45: '/models/weapon_smg_kdw.glb',
  m870: '/models/weapon_saiga12.glb',
  saiga12: '/models/weapon_saiga12.glb',
  m700: '/models/weapon_50cal.glb',
  m24: '/models/weapon_sniper.glb',
  glock17: '/models/weapon_pistol.glb',
  m1911: '/models/weapon_pistol.glb',
};

interface WeaponGlbAnimRig {
  mixer: THREE.AnimationMixer;
  idleAction: THREE.AnimationAction | null;
  fireAction: THREE.AnimationAction | null;
  reloadAction: THREE.AnimationAction | null;
  drawAction: THREE.AnimationAction | null;
}

export class WeaponSystem {
  public weaponRoot = new THREE.Group();
  public currentWeaponId: WeaponId | null = null;
  public reloading = false;
  public reloadTimer = 0;
  public reloadDuration = 1;
  public aiming = false;
  public adsBlend = 0;
  public recoilPitchOffset = 0;
  public recoilYawOffset = 0;
  public dynamicSpread = 0;

  private builtModels = new Map<WeaponId, BuiltWeaponModel>();
  private weaponAnimRigs = new Map<WeaponId, WeaponGlbAnimRig>();
  private glbWeaponIds = new Set<WeaponId>();
  private activeModel: BuiltWeaponModel | null = null;
  private muzzleLight: THREE.PointLight;
  private muzzleFlashTimer = 0;
  private fireCooldown = 0;
  private burstQueue = 0;
  private burstDelay = 0;
  private kickbackZ = 0;
  private kickRotX = 0;
  private recoilRollZ = 0;
  private boltKick = 0;
  private swayX = 0;
  private swayY = 0;
  private bobPhase = 0;
  private idlePhase = 0;
  private sprintBlend = 0;
  private switchAnim = 0;

  // Pooled projectiles, grenades, tracers, impact particles, smoke sprites, brass casings & bullet decals
  private projectiles: ActiveProjectile[] = [];
  private grenades: ActiveGrenade[] = [];
  private particles: ActiveParticle[] = [];
  private smokeSprites: ActiveSmokeSprite[] = [];
  private shellCasings: ActiveShellCasing[] = [];
  private tracers: TracerLine[] = [];
  private decals: THREE.Mesh[] = [];

  private particleGeo = new THREE.BoxGeometry(0.075, 0.075, 0.075);
  private shellGeo = new THREE.CylinderGeometry(0.005, 0.0055, 0.024, 6);
  private shellMat = new THREE.MeshStandardMaterial({ color: 0xd4a64a, roughness: 0.28, metalness: 0.92 });
  private projGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.72, 5);
  private decalGeo = new THREE.CircleGeometry(0.085, 8);
  private decalMat = new THREE.MeshBasicMaterial({
    color: 0x141516,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private audio: AudioManager;
  private enemies: EnemyAI;
  private world: WorldManager;
  private vehicles: VehicleSystem;
  private mats: ProceduralMaterials;
  private callbacks: CombatCallbacks;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    audio: AudioManager,
    enemies: EnemyAI,
    world: WorldManager,
    vehicles: VehicleSystem,
    mats: ProceduralMaterials,
    callbacks: CombatCallbacks
  ) {
    this.scene = scene;
    this.camera = camera;
    this.audio = audio;
    this.enemies = enemies;
    this.world = world;
    this.vehicles = vehicles;
    this.mats = mats;
    this.callbacks = callbacks;

    this.projGeo.rotateX(Math.PI / 2);

    this.camera.add(this.weaponRoot);
    this.muzzleLight = new THREE.PointLight(0xffb85c, 0, 15, 2);
    this.muzzleLight.position.set(0.18, -0.05, -0.82);
    this.camera.add(this.muzzleLight);

    // Preload all unique FPS weapon .glb models in background so switching weapons is instant
    for (const url of new Set(Object.values(WEAPON_GLB_URLS))) {
      void this.world.assetManager.loadByUrl(url);
    }
  }

  public equipWeapon(state: WeaponRuntimeState | null) {
    this.reloading = false;
    this.burstQueue = 0;
    this.boltKick = 0;
    if (this.activeModel) {
      // Reset magazine, bolt & gloved left hand back to rest before unequipping
      this.activeModel.magMesh.position.copy(this.activeModel.magRestPos);
      this.activeModel.boltMesh.position.copy(this.activeModel.boltRestPos);
      this.activeModel.leftArmGroup.position.copy(this.activeModel.leftArmRestPos);
      this.activeModel.leftArmGroup.rotation.copy(this.activeModel.leftArmRestRot);
      this.weaponRoot.remove(this.activeModel.group);
      this.activeModel = null;
    }
    if (!state) {
      this.currentWeaponId = null;
      return;
    }
    this.currentWeaponId = state.weaponId;
    let built = this.builtModels.get(state.weaponId);
    if (!built) {
      built = buildWeaponModel(state.weaponId, this.mats);
      const glbUrl = WEAPON_GLB_URLS[state.weaponId];
      if (glbUrl) {
        const wId = state.weaponId;
        const targetBuilt = built;
        void this.world.assetManager.loadByUrl(glbUrl).then((res) => {
          if (!res) return;
          const glbGroup = res.group;
          // All FPS weapon .glb packs are authored facing +Z; rotate 180 deg so barrel & arms face -Z (away from camera)
          glbGroup.rotation.y = Math.PI;
          glbGroup.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(glbGroup);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);
          const maxDim = Math.max(size.x, size.y, size.z, 0.001);
          const targetLen = WEAPONS[wId].category === 'pistol' ? 0.52 : 0.82;
          const normScale = targetLen / maxDim;
          glbGroup.scale.setScalar(normScale);
          // Re-measure after scale + 180deg rotation so shoulders stay behind camera and barrel extends forward (-Z)
          glbGroup.updateMatrixWorld(true);
          const scaledBox = new THREE.Box3().setFromObject(glbGroup);
          const scaledCenter = new THREE.Vector3();
          scaledBox.getCenter(scaledCenter);
          glbGroup.position.set(
            -scaledCenter.x,
            -scaledCenter.y - 0.05,
            -scaledBox.max.z + 0.14
          );

          // Hide procedural meshes while preserving muzzlePoint, ejectionPort & muzzleFlash
          const keepNodes = new Set<THREE.Object3D>([
            targetBuilt.muzzlePoint,
            targetBuilt.ejectionPort,
            targetBuilt.muzzleFlash,
          ]);
          targetBuilt.group.traverse((obj) => {
            if (obj === targetBuilt.group || keepNodes.has(obj)) return;
            if ((obj as THREE.Mesh).isMesh) {
              obj.visible = false;
            }
          });
          targetBuilt.group.add(glbGroup);
          this.glbWeaponIds.add(wId);

          if (res.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(glbGroup);
            const findClip = (patterns: RegExp[]) =>
              res.animations.find((c) => patterns.some((p) => p.test(c.name))) ?? null;
            const idleClip = findClip([/idle/i, /dpose/i]) ?? res.animations[0];
            const fireClip = findClip([/fire/i, /shot/i, /shoot/i]);
            const reloadClip = findClip([/reload/i]);
            const drawClip = findClip([/draw/i, /equip/i]);

            const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
            if (idleAction) idleAction.play();
            const fireAction = fireClip ? mixer.clipAction(fireClip) : null;
            if (fireAction) {
              fireAction.setLoop(THREE.LoopOnce, 1);
              fireAction.clampWhenFinished = false;
            }
            const reloadAction = reloadClip ? mixer.clipAction(reloadClip) : null;
            if (reloadAction) {
              reloadAction.setLoop(THREE.LoopOnce, 1);
              reloadAction.clampWhenFinished = false;
            }
            const drawAction = drawClip ? mixer.clipAction(drawClip) : null;
            if (drawAction) {
              drawAction.setLoop(THREE.LoopOnce, 1);
              drawAction.clampWhenFinished = false;
            }
            this.weaponAnimRigs.set(wId, { mixer, idleAction, fireAction, reloadAction, drawAction });
          }
        });
      }
      this.builtModels.set(state.weaponId, built);
    }
    const animRig = this.weaponAnimRigs.get(state.weaponId);
    if (animRig?.drawAction) {
      animRig.drawAction.reset().play();
    }
    built.suppressorMesh.visible = state.suppressed;
    built.magMesh.position.copy(built.magRestPos);
    built.boltMesh.position.copy(built.boltRestPos);
    built.leftArmGroup.position.copy(built.leftArmRestPos);
    built.leftArmGroup.rotation.copy(built.leftArmRestRot);
    this.activeModel = built;
    this.weaponRoot.add(built.group);
    this.switchAnim = 1.0;
    this.audio.playReload('start');
  }

  public syncSuppressorVisual(suppressed: boolean) {
    if (this.activeModel) {
      this.activeModel.suppressorMesh.visible = suppressed;
    }
  }

  public startReload(state: WeaponRuntimeState, reserveAmmo: number) {
    if (this.reloading) return;
    const spec = WEAPONS[state.weaponId];
    if (state.ammoInMag >= spec.magSize || reserveAmmo <= 0) return;
    this.reloading = true;
    this.reloadDuration = spec.reloadTime;
    this.reloadTimer = spec.reloadTime;
    this.burstQueue = 0;
    this.audio.playReload('start');
    const animRig = this.weaponAnimRigs.get(state.weaponId);
    if (animRig?.reloadAction) {
      animRig.reloadAction.reset().play();
    }
  }

  public triggerFire(
    state: WeaponRuntimeState,
    justPressed: boolean,
    held: boolean,
    isMoving: boolean,
    crouching: boolean,
    playerPos: THREE.Vector3
  ): boolean {
    if (this.reloading || this.fireCooldown > 0 || this.switchAnim > 0.35) return false;
    const spec = WEAPONS[state.weaponId];
    const mode = spec.fireModes[state.fireModeIndex] ?? spec.fireModes[0];

    if (mode === 'SEMI' && !justPressed) return false;
    if (mode === 'AUTO' && !held) return false;
    if (mode === 'BURST') {
      if (justPressed && this.burstQueue <= 0) {
        this.burstQueue = 3;
      }
      if (this.burstQueue <= 0) return false;
    }

    if (state.ammoInMag <= 0) {
      if (justPressed) this.audio.playReload('start');
      this.burstQueue = 0;
      return false;
    }

    this.executeShot(state, spec, isMoving, crouching, playerPos);
    if (mode === 'BURST') {
      this.burstQueue = Math.max(0, this.burstQueue - 1);
      this.burstDelay = 60 / spec.rpm;
    }
    return true;
  }

  private executeShot(
    state: WeaponRuntimeState,
    spec: WeaponSpec,
    isMoving: boolean,
    crouching: boolean,
    playerPos: THREE.Vector3
  ) {
    state.ammoInMag = Math.max(0, state.ammoInMag - 1);
    this.fireCooldown = 60 / spec.rpm;
    this.callbacks.onShotFired?.();

    // Audio & AI stealth noise alert
    this.audio.playGunshot(spec.category, state.suppressed);
    this.enemies.notifySound(playerPos, state.suppressed ? 16 : 95, !state.suppressed);

    const camPos = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    this.camera.getWorldPosition(camPos);
    this.camera.getWorldDirection(camDir);

    const muzzleWorld = new THREE.Vector3();
    if (this.activeModel) {
      this.activeModel.muzzlePoint.getWorldPosition(muzzleWorld);
    } else {
      muzzleWorld.copy(camPos);
    }

    // Muzzle flash, light pulse, reciprocating bolt & brass shell ejection
    if (this.activeModel) {
      this.boltKick = 1.0;
      const animRig = this.weaponAnimRigs.get(state.weaponId);
      if (animRig?.fireAction) {
        animRig.fireAction.reset().play();
      }
      if (!state.suppressed) {
        this.activeModel.muzzleFlash.visible = true;
        this.activeModel.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
        this.muzzleFlashTimer = 0.045;
        this.muzzleLight.intensity = 11;
      }
      // Subtle barrel gunsmoke wisp
      this.spawnSmokeSprite(muzzleWorld, camDir.clone().multiplyScalar(1.1).add(new THREE.Vector3(0, 0.35, 0)), 0.22, 0.34, 0xc8cdc8, 0.22, 0.75);

      // Eject spinning brass casing (when not hidden in full-screen sniper scope)
      if (this.weaponRoot.visible) {
        this.ejectShellCasing();
      }
    }

    this.kickbackZ = Math.min(0.11, this.kickbackZ + (spec.category === 'sniper' || spec.category === 'shotgun' ? 0.085 : 0.038));
    this.kickRotX = Math.min(0.24, this.kickRotX + spec.recoilPitch * 2.6);
    this.recoilRollZ = (Math.random() - 0.5) * (spec.category === 'sniper' || spec.category === 'shotgun' ? 0.08 : 0.042) * (1 - this.adsBlend * 0.55);

    // Camera recoil
    const stanceMult = crouching ? 0.72 : 1.0;
    const adsMult = this.aiming ? 0.65 : 1.0;
    this.recoilPitchOffset += spec.recoilPitch * stanceMult * adsMult;
    this.recoilYawOffset += (Math.random() - 0.5) * 2 * spec.recoilYaw * stanceMult * adsMult;

    // Spread calculation
    let spread = THREE.MathUtils.lerp(spec.hipSpread, spec.adsSpread, this.adsBlend);
    if (isMoving) spread *= spec.moveSpreadMult;
    if (crouching) spread *= 0.75;
    spread += this.dynamicSpread;
    this.dynamicSpread = Math.min(0.055, this.dynamicSpread + spec.recoilPitch * 0.42);

    const usePhysicalProjectile = spec.category === 'sniper';

    for (let p = 0; p < spec.pellets; p++) {
      const dir = camDir.clone();
      dir.x += (Math.random() - 0.5) * spread * 2;
      dir.y += (Math.random() - 0.5) * spread * 2;
      dir.z += (Math.random() - 0.5) * spread * 2;
      dir.normalize();

      if (usePhysicalProjectile) {
        this.spawnBallisticProjectile(camPos.clone().addScaledVector(dir, 0.8), dir, spec);
      } else {
        this.fireHitscanRay(camPos, dir, muzzleWorld, spec, playerPos);
      }
    }
  }

  private ejectShellCasing() {
    if (!this.activeModel || this.shellCasings.length > 22) return;
    const portPos = new THREE.Vector3();
    this.activeModel.ejectionPort.getWorldPosition(portPos);

    this.camera.getWorldDirection(_camFwd);
    _camUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    _camRight.crossVectors(_camFwd, _camUp).normalize();

    const mesh = new THREE.Mesh(this.shellGeo, this.shellMat);
    mesh.position.copy(portPos);
    mesh.quaternion.copy(this.camera.quaternion);
    this.scene.add(mesh);

    const vel = _camRight
      .clone()
      .multiplyScalar(1.6 + Math.random() * 0.9)
      .addScaledVector(_camUp, 1.0 + Math.random() * 0.55)
      .addScaledVector(_camFwd, -0.35 + Math.random() * 0.35);

    this.shellCasings.push({
      mesh,
      vel,
      angVel: new THREE.Vector3(14 + Math.random() * 14, 10 + Math.random() * 12, 16 + Math.random() * 14),
      life: 0.75,
    });
  }

  private spawnBallisticProjectile(origin: THREE.Vector3, dir: THREE.Vector3, spec: WeaponSpec) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe49c });
    const mesh = new THREE.Mesh(this.projGeo, mat);
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      pos: origin,
      vel: dir.multiplyScalar(spec.muzzleVelocity * 0.42),
      drop: spec.bulletDrop * 2.2,
      damage: spec.damage,
      headshotMult: spec.headshotMult,
      life: 3.0,
      fromEnemy: false,
    });
  }

  public spawnEnemyTracer(origin: THREE.Vector3, target: THREE.Vector3) {
    this.spawnTracerLine(origin, target, 0xffaa44);
  }

  public spawnDustPuff(pos: THREE.Vector3, scale = 0.85, color = 0x9c8e74) {
    if (this.smokeSprites.length > 55) return;
    this.spawnSmokeSprite(
      pos,
      new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.55 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8),
      scale,
      0.85,
      color,
      0.24,
      1.25
    );
  }

  private spawnSmokeSprite(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    startScale: number,
    life: number,
    color: number,
    baseOpacity: number,
    growRate: number
  ) {
    if (this.smokeSprites.length > 68) {
      const oldest = this.smokeSprites.shift()!;
      this.scene.remove(oldest.sprite);
      (oldest.sprite.material as THREE.Material).dispose();
    }
    const mat = new THREE.SpriteMaterial({
      map: this.mats.smokeSpriteMap,
      color,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.scale.set(startScale, startScale, 1);
    this.scene.add(sprite);
    this.smokeSprites.push({ sprite, vel, life, maxLife: life, baseOpacity, growRate });
  }

  private fireHitscanRay(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    muzzleWorld: THREE.Vector3,
    spec: WeaponSpec,
    playerPos: THREE.Vector3
  ) {
    _raycaster.set(origin, dir);
    _raycaster.far = spec.range;

    const enemyHits = _raycaster.intersectObjects(this.enemies.hitMeshes, false);
    const trainingMeshes = this.callbacks.getTrainingHitMeshes?.() ?? [];
    const trainingHits = trainingMeshes.length > 0 ? _raycaster.intersectObjects(trainingMeshes, false) : [];
    const worldHits = _raycaster.intersectObjects(this.world.raycastMeshes, true);

    const enemyDist = enemyHits.length > 0 ? enemyHits[0].distance : Infinity;
    const trainingDist = trainingHits.length > 0 ? trainingHits[0].distance : Infinity;
    const worldDist = worldHits.length > 0 ? worldHits[0].distance : Infinity;

    if (trainingDist < worldDist && trainingDist <= enemyDist && trainingHits.length > 0) {
      const hit = trainingHits[0];
      const { trainingTargetId, hitZone } = hit.object.userData as {
        trainingTargetId: string;
        hitZone: 'head' | 'body';
      };
      this.spawnImpactParticles(hit.point, 'metal', 9);
      this.audio.playImpact('metal', hit.point);
      this.audio.playHitmarker(hitZone === 'head', hitZone === 'head');
      this.spawnTracerLine(muzzleWorld, hit.point, 0xffe8a6);
      this.callbacks.onHitTrainingTarget?.(trainingTargetId, hitZone, hit.point);
      return;
    }

    if (enemyDist < worldDist && enemyHits.length > 0) {
      const hit = enemyHits[0];
      const { enemyId, hitZone } = hit.object.userData as { enemyId: string; hitZone: 'head' | 'torso' | 'limb' };
      const falloff = THREE.MathUtils.clamp(1 - (enemyDist / spec.range) * 0.35, 0.55, 1.0);
      const rawDmg = spec.damage * falloff * (hitZone === 'head' ? spec.headshotMult : 1.0);
      const res = this.enemies.applyDamage(enemyId, rawDmg, hitZone, playerPos);

      this.spawnImpactParticles(hit.point, 'flesh', 8);
      this.audio.playImpact('flesh', hit.point);
      this.spawnTracerLine(muzzleWorld, hit.point, 0xffe8a6);

      if (res.unit) {
        this.audio.playHitmarker(res.headshot, res.killed);
        if (res.killed && res.headshot) this.callbacks.onHitstop(0.035);
        this.callbacks.onHitEnemy(enemyId, res.headshot, res.killed, res.unit.regionId, hit.point);
      }
      return;
    }

    if (worldHits.length > 0) {
      const hit = worldHits[0];
      const ud = hit.object.userData;

      if (ud?.destructibleId) {
        const prop = this.world.destructibles.find((d) => d.id === ud.destructibleId && !d.destroyed);
        if (prop) {
          prop.health -= spec.damage;
          this.spawnImpactParticles(hit.point, 'metal', 10);
          this.audio.playImpact('metal', hit.point);
          if (prop.health <= 0) {
            prop.destroyed = true;
            this.scene.remove(prop.mesh);
            this.triggerExplosion(prop.position, 11, 165);
            this.callbacks.onDestroyProp(prop.id, prop.missionId, prop.position);
          }
        }
      } else if (ud?.cameraId) {
        const cam = this.world.securityCameras.find((c) => c.id === ud.cameraId && !c.destroyed);
        if (cam) {
          cam.destroyed = true;
          cam.coneLight.visible = false;
          this.spawnImpactParticles(hit.point, 'metal', 12);
          this.audio.playImpact('metal', hit.point);
          this.callbacks.onDestroyCamera(cam.id);
        }
      } else if (ud?.vehicleId) {
        const res = this.vehicles.damageVehicle(ud.vehicleId, spec.damage * 0.9);
        this.spawnImpactParticles(hit.point, 'metal', 9);
        this.audio.playImpact('metal', hit.point);
        if (res.destroyed && res.position) {
          this.triggerExplosion(res.position, 12, 180);
        }
      } else if (ud?.isTerrain) {
        this.spawnImpactParticles(hit.point, 'dirt', 6);
        this.audio.playImpact('concrete', hit.point);
      } else {
        this.spawnImpactParticles(hit.point, 'concrete', 6);
        this.audio.playImpact('concrete', hit.point);
        if (hit.face) {
          this.spawnBulletDecal(hit.point, hit.face.normal);
        }
      }

      this.spawnTracerLine(muzzleWorld, hit.point, 0xffe8a6);
    } else {
      const endPt = origin.clone().addScaledVector(dir, Math.min(spec.range, 130));
      this.spawnTracerLine(muzzleWorld, endPt, 0xffe8a6);
    }
  }

  public throwGrenade(origin: THREE.Vector3, dir: THREE.Vector3) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x3b4831, roughness: 0.7, metalness: 0.3 })
    );
    mesh.position.copy(origin);
    this.scene.add(mesh);

    this.grenades.push({
      mesh,
      pos: origin.clone(),
      vel: dir.clone().multiplyScalar(22).add(new THREE.Vector3(0, 5.5, 0)),
      fuse: 2.4,
    });
  }

  public triggerExplosion(pos: THREE.Vector3, radius: number, maxDamage: number) {
    this.audio.playExplosion(pos);
    this.enemies.notifySound(pos, 150, true);
    this.callbacks.onCameraShake(0.68);
    this.callbacks.onHitstop(0.045);

    // Volumetric billowing smoke & fire sprites + high-velocity sparks
    for (let i = 0; i < 12; i++) {
      const isCoreFire = i < 5;
      this.spawnSmokeSprite(
        pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 1.4)),
        new THREE.Vector3((Math.random() - 0.5) * 4.5, 2.2 + Math.random() * 5.2, (Math.random() - 0.5) * 4.5),
        isCoreFire ? 2.4 : 2.8,
        isCoreFire ? 0.55 : 2.1,
        isCoreFire ? 0xff9a38 : 0x2f3133,
        isCoreFire ? 0.92 : 0.72,
        isCoreFire ? 7.5 : 4.2
      );
    }

    for (let i = 0; i < 20; i++) {
      const isSpark = i < 14;
      const mat = new THREE.MeshBasicMaterial({
        color: isSpark ? (i % 2 === 0 ? 0xffa030 : 0xffe066) : 0x3a3732,
        transparent: true,
        opacity: 0.95,
      });
      const m = new THREE.Mesh(this.particleGeo, mat);
      m.position.copy(pos);
      m.scale.setScalar(isSpark ? 1.4 : 2.6);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 20,
          5 + Math.random() * 14,
          (Math.random() - 0.5) * 20
        ),
        life: isSpark ? 0.65 : 1.05,
        maxLife: isSpark ? 0.65 : 1.05,
        gravity: 16,
        scaleRate: -0.6,
      });
    }

    for (const unit of this.enemies.enemies.values()) {
      if (unit.state === 'DEAD') continue;
      const d = unit.position.distanceTo(pos);
      if (d <= radius) {
        const dmg = maxDamage * (1 - d / radius);
        const res = this.enemies.applyDamage(unit.id, dmg, 'torso', pos);
        if (res.killed && res.unit) {
          this.callbacks.onHitEnemy(unit.id, false, true, res.unit.regionId, unit.position);
        }
      }
    }

    this.callbacks.onExplosion(pos, radius, maxDamage);
  }

  private spawnImpactParticles(pos: THREE.Vector3, type: 'metal' | 'concrete' | 'dirt' | 'flesh', count: number) {
    // Volumetric dust / blood / spark puff sprite at impact point
    if (type === 'concrete' || type === 'dirt') {
      this.spawnSmokeSprite(
        pos,
        new THREE.Vector3((Math.random() - 0.5) * 0.9, 0.8 + Math.random() * 0.6, (Math.random() - 0.5) * 0.9),
        type === 'dirt' ? 0.55 : 0.42,
        0.7,
        type === 'dirt' ? 0x8f7e62 : 0xb5b2a8,
        0.46,
        1.5
      );
    } else if (type === 'metal') {
      this.spawnSmokeSprite(
        pos,
        new THREE.Vector3(0, 0.5, 0),
        0.34,
        0.26,
        0xffc45e,
        0.65,
        1.2
      );
    } else if (type === 'flesh') {
      this.spawnSmokeSprite(
        pos,
        new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6),
        0.38,
        0.38,
        0x7a1616,
        0.52,
        0.9
      );
    }

    const color =
      type === 'metal' ? 0xffcc55 : type === 'flesh' ? 0x9e1818 : type === 'dirt' ? 0x7d6b4e : 0x9b988e;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(
        this.particleGeo,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 })
      );
      m.position.copy(pos);
      m.scale.setScalar(type === 'metal' ? 0.65 : 1.15);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * (type === 'metal' ? 9.5 : 6.2),
          1.8 + Math.random() * 4.8,
          (Math.random() - 0.5) * (type === 'metal' ? 9.5 : 6.2)
        ),
        life: 0.32 + Math.random() * 0.25,
        maxLife: 0.55,
        gravity: 15,
        scaleRate: -0.5,
      });
    }
  }

  private spawnBulletDecal(point: THREE.Vector3, normal: THREE.Vector3) {
    const mesh = new THREE.Mesh(this.decalGeo, this.decalMat);
    mesh.position.copy(point).addScaledVector(normal, 0.015);
    mesh.lookAt(point.clone().add(normal));
    this.scene.add(mesh);
    this.decals.push(mesh);
    if (this.decals.length > 56) {
      const oldest = this.decals.shift()!;
      this.scene.remove(oldest);
    }
  }

  private spawnTracerLine(start: THREE.Vector3, end: THREE.Vector3, color: number) {
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.72 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.055 });
  }

  public addLookSway(dx: number, dy: number) {
    this.swayX = THREE.MathUtils.clamp(this.swayX - dx * 0.00018, -0.04, 0.04);
    this.swayY = THREE.MathUtils.clamp(this.swayY + dy * 0.00018, -0.04, 0.04);
  }

  public update(
    dt: number,
    activeState: WeaponRuntimeState | null,
    reserveAmmo: number,
    consumeAmmo: (caliber: WeaponSpec['caliber'], needed: number) => number,
    moveSpeedRatio: number,
    sprinting: boolean,
    crouching: boolean,
    playerPos: THREE.Vector3,
    baseFov: number
  ) {
    if (this.fireCooldown > 0) this.fireCooldown -= dt;

    // Handle burst queue
    if (this.burstQueue > 0 && activeState && !this.reloading) {
      this.burstDelay -= dt;
      if (this.burstDelay <= 0) {
        const spec = WEAPONS[activeState.weaponId];
        if (activeState.ammoInMag > 0) {
          this.executeShot(activeState, spec, moveSpeedRatio > 0.1, crouching, playerPos);
          this.burstQueue--;
          this.burstDelay = 60 / spec.rpm;
        } else {
          this.burstQueue = 0;
        }
      }
    }

    // Handle reload completion
    if (this.reloading && activeState) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const spec = WEAPONS[activeState.weaponId];
        const needed = spec.magSize - activeState.ammoInMag;
        const loaded = consumeAmmo(spec.caliber, Math.min(needed, reserveAmmo));
        activeState.ammoInMag += loaded;
        this.reloading = false;
        this.audio.playReload('end');
      }
    }

    // Muzzle flash fade
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0 && this.activeModel) {
        this.activeModel.muzzleFlash.visible = false;
        this.muzzleLight.intensity = 0;
      }
    }

    // Smooth ADS zoom, FOV, weapon viewmodel position, sway, bob & recoil recovery
    if (activeState) {
      const animRig = this.weaponAnimRigs.get(activeState.weaponId);
      if (animRig) animRig.mixer.update(dt);
    }
    const spec = activeState ? WEAPONS[activeState.weaponId] : null;
    const targetAds = this.aiming && !this.reloading && !sprinting && spec ? 1 : 0;
    this.adsBlend = THREE.MathUtils.damp(this.adsBlend, targetAds, 14, dt);

    const targetFov = spec ? THREE.MathUtils.lerp(baseFov, spec.adsFov, this.adsBlend) : baseFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14, dt);
      this.camera.updateProjectionMatrix();
    }

    this.weaponRoot.visible = !(spec?.hasScopeOverlay && this.adsBlend > 0.72);

    this.kickbackZ = THREE.MathUtils.damp(this.kickbackZ, 0, 14, dt);
    this.kickRotX = THREE.MathUtils.damp(this.kickRotX, 0, 14, dt);
    this.recoilRollZ = THREE.MathUtils.damp(this.recoilRollZ, 0, 16, dt);
    this.boltKick = THREE.MathUtils.damp(this.boltKick, 0, 22, dt);
    this.swayX = THREE.MathUtils.damp(this.swayX, 0, 11, dt);
    this.swayY = THREE.MathUtils.damp(this.swayY, 0, 11, dt);
    this.dynamicSpread = THREE.MathUtils.damp(this.dynamicSpread, 0, 7, dt);
    this.switchAnim = THREE.MathUtils.damp(this.switchAnim, 0, 10, dt);

    const targetSprint = sprinting && this.adsBlend < 0.12 && !this.reloading ? 1 : 0;
    this.sprintBlend = THREE.MathUtils.damp(this.sprintBlend, targetSprint, 10, dt);
    this.idlePhase += dt * 1.65;

    if (moveSpeedRatio > 0.05) {
      this.bobPhase += dt * (sprinting ? 12.5 : 8.2) * moveSpeedRatio;
    }

    const idleScale = (1 - this.adsBlend * 0.85) * (1 - moveSpeedRatio * 0.6);
    const idleX = Math.sin(this.idlePhase) * 0.0016 * idleScale;
    const idleY = Math.sin(this.idlePhase * 2.0) * 0.0012 * idleScale;
    const bobAmp = (1 - this.adsBlend * 0.85) * moveSpeedRatio * (sprinting ? 0.019 : 0.0088);
    const cat = spec?.category ?? 'assault';
    const hasGlbRig = activeState ? this.glbWeaponIds.has(activeState.weaponId) : false;
    // Symmetric 2-arm FPS GLB rigs center around X=0; procedural single-arm rigs sit bottom-right
    const hipX = hasGlbRig
      ? 0.02
      : cat === 'pistol'
      ? 0.165
      : cat === 'smg'
      ? 0.172
      : cat === 'sniper'
      ? 0.178
      : 0.176;
    const hipY = hasGlbRig
      ? -0.02
      : cat === 'pistol'
      ? -0.162
      : cat === 'sniper'
      ? -0.150
      : cat === 'shotgun'
      ? -0.158
      : -0.156;
    const hipZ = hasGlbRig
      ? -0.02
      : cat === 'pistol'
      ? -0.352
      : cat === 'sniper'
      ? -0.292
      : cat === 'smg'
      ? -0.312
      : cat === 'shotgun'
      ? -0.316
      : -0.308;
    const hipYawRest = hasGlbRig
      ? 0.0
      : cat === 'pistol'
      ? 0.032
      : cat === 'sniper'
      ? 0.048
      : cat === 'smg'
      ? 0.042
      : 0.045;
    const adsX = hasGlbRig ? -0.02 : 0.0;
    const adsY = hasGlbRig ? 0.02 : this.activeModel ? this.activeModel.adsOffsetY : -0.092;
    const adsZ = hasGlbRig ? 0.04 : cat === 'pistol' ? -0.295 : -0.275;

    // 3-Stage Natural Tactical Reload Animation (Weapon Cant + Gloved Left Hand Mag Swap + Bolt Rack)
    let reloadDip = 0;
    let reloadRollZ = 0;
    let reloadPitchX = 0;
    let magOffsetY = 0;
    let reloadBoltZ = 0;
    let handTargetOffX = 0;
    let handTargetOffY = 0;
    let handTargetOffZ = 0;

    if (this.reloading) {
      const prog = THREE.MathUtils.clamp(1 - this.reloadTimer / Math.max(0.01, this.reloadDuration), 0, 1);
      const envelope = Math.sin(prog * Math.PI);
      reloadDip = envelope * 0.085;
      reloadRollZ = envelope * 0.44;
      reloadPitchX = envelope * 0.24;

      const magReachZ = cat === 'pistol' ? 0.02 : 0.065;
      if (prog < 0.34) {
        // Stage 1: Left gloved hand reaches to magwell & pulls empty magazine downward
        const p = prog / 0.34;
        magOffsetY = -Math.sin(p * Math.PI * 0.5) * 0.26;
        handTargetOffY = magOffsetY - 0.035;
        handTargetOffZ = magReachZ;
      } else if (prog < 0.68) {
        // Stage 2: Left gloved hand drives fresh magazine firmly upward into magwell
        const p = (prog - 0.34) / 0.34;
        magOffsetY = -(1 - p) * 0.26;
        handTargetOffY = magOffsetY - 0.025;
        handTargetOffZ = magReachZ;
      } else if (prog < 0.92) {
        // Stage 3: Left gloved hand slides up to rack charging handle / bolt carrier
        const p = (prog - 0.68) / 0.24;
        reloadBoltZ = Math.sin(p * Math.PI) * 0.068;
        reloadPitchX += Math.sin(p * Math.PI) * 0.09;
        handTargetOffX = 0.025;
        handTargetOffY = 0.048;
        handTargetOffZ = magReachZ + 0.02 + reloadBoltZ;
      }
    }

    if (this.activeModel) {
      this.activeModel.magMesh.position.set(
        this.activeModel.magRestPos.x,
        this.activeModel.magRestPos.y + magOffsetY,
        this.activeModel.magRestPos.z
      );
      this.activeModel.boltMesh.position.set(
        this.activeModel.boltRestPos.x,
        this.activeModel.boltRestPos.y,
        this.activeModel.boltRestPos.z + this.boltKick * 0.055 + reloadBoltZ
      );
      // Smooth damped left gloved hand motion during reload & return to handguard support grip
      const lArm = this.activeModel.leftArmGroup;
      const lRest = this.activeModel.leftArmRestPos;
      lArm.position.x = THREE.MathUtils.damp(lArm.position.x, lRest.x + handTargetOffX, 16, dt);
      lArm.position.y = THREE.MathUtils.damp(lArm.position.y, lRest.y + handTargetOffY, 16, dt);
      lArm.position.z = THREE.MathUtils.damp(lArm.position.z, lRest.z + handTargetOffZ, 16, dt);
    }

    const sprintTilt = this.sprintBlend * 0.36;
    const swayRotFactor = 1 - this.adsBlend * 0.68;

    this.weaponRoot.position.set(
      THREE.MathUtils.lerp(hipX, adsX, this.adsBlend) +
        this.swayX +
        idleX +
        Math.cos(this.bobPhase * 0.5) * bobAmp -
        this.sprintBlend * 0.045,
      THREE.MathUtils.lerp(hipY, adsY, this.adsBlend) +
        this.swayY +
        idleY +
        Math.abs(Math.sin(this.bobPhase)) * bobAmp -
        reloadDip -
        this.switchAnim * 0.28 -
        this.sprintBlend * 0.028,
      THREE.MathUtils.lerp(hipZ, adsZ, this.adsBlend) + this.kickbackZ
    );
    const hipYawBias = THREE.MathUtils.lerp(hipYawRest, 0, this.adsBlend);
    this.weaponRoot.rotation.set(
      this.kickRotX + reloadPitchX - sprintTilt * 0.48 + this.swayY * 1.45 * swayRotFactor - this.switchAnim * 0.35,
      hipYawBias + sprintTilt * 0.88 - this.swayX * 1.55 * swayRotFactor,
      sprintTilt * 0.38 + reloadRollZ + this.recoilRollZ - this.swayX * 2.1 * swayRotFactor
    );

    // Update physical ballistic projectiles (Sniper rifles)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      _v1.copy(pr.pos);
      pr.vel.y -= pr.drop * dt;
      pr.pos.addScaledVector(pr.vel, dt);
      _v2.subVectors(pr.pos, _v1);
      const stepDist = _v2.length();

      if (stepDist > 0.001) {
        _raycaster.set(_v1, _v2.divideScalar(stepDist));
        _raycaster.far = stepDist + 0.2;

        const tMeshes = this.callbacks.getTrainingHitMeshes?.() ?? [];
        if (tMeshes.length > 0) {
          const tHits = _raycaster.intersectObjects(tMeshes, false);
          if (tHits.length > 0) {
            const hit = tHits[0];
            const { trainingTargetId, hitZone } = hit.object.userData as {
              trainingTargetId: string;
              hitZone: 'head' | 'body';
            };
            this.spawnImpactParticles(hit.point, 'metal', 10);
            this.audio.playImpact('metal', hit.point);
            this.audio.playHitmarker(hitZone === 'head', hitZone === 'head');
            this.callbacks.onHitTrainingTarget?.(trainingTargetId, hitZone, hit.point);
            this.scene.remove(pr.mesh);
            this.projectiles.splice(i, 1);
            continue;
          }
        }

        const eHits = _raycaster.intersectObjects(this.enemies.hitMeshes, false);
        if (eHits.length > 0) {
          const hit = eHits[0];
          const { enemyId, hitZone } = hit.object.userData as { enemyId: string; hitZone: 'head' | 'torso' | 'limb' };
          const dmg = pr.damage * (hitZone === 'head' ? pr.headshotMult : 1.0);
          const res = this.enemies.applyDamage(enemyId, dmg, hitZone, playerPos);
          this.spawnImpactParticles(hit.point, 'flesh', 10);
          this.audio.playImpact('flesh', hit.point);
          if (res.unit) {
            this.audio.playHitmarker(res.headshot, res.killed);
            this.callbacks.onHitstop(res.killed ? 0.045 : 0.02);
            this.callbacks.onHitEnemy(enemyId, res.headshot, res.killed, res.unit.regionId, hit.point);
          }
          this.scene.remove(pr.mesh);
          this.projectiles.splice(i, 1);
          continue;
        }
        const wHits = _raycaster.intersectObjects(this.world.raycastMeshes, true);
        if (wHits.length > 0) {
          const hitType = wHits[0].object.userData?.isTerrain ? 'dirt' : 'concrete';
          this.spawnImpactParticles(wHits[0].point, hitType, 7);
          this.audio.playImpact('concrete', wHits[0].point);
          this.scene.remove(pr.mesh);
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      pr.mesh.position.copy(pr.pos);
      if (pr.life <= 0) {
        this.scene.remove(pr.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    // Update grenades
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const gr = this.grenades[i];
      gr.fuse -= dt;
      gr.vel.y -= 18 * dt;
      gr.pos.addScaledVector(gr.vel, dt);
      const groundY = this.world.terrain.getHeightAt(gr.pos.x, gr.pos.z, gr.pos.y) + 0.12;
      if (gr.pos.y < groundY) {
        gr.pos.y = groundY;
        gr.vel.y = Math.abs(gr.vel.y) * 0.35;
        gr.vel.x *= 0.65;
        gr.vel.z *= 0.65;
      }
      gr.mesh.position.copy(gr.pos);
      if (gr.fuse <= 0) {
        this.scene.remove(gr.mesh);
        this.triggerExplosion(gr.pos, 11, 185);
        this.grenades.splice(i, 1);
      }
    }

    // Update spinning ejected brass shell casings
    for (let i = this.shellCasings.length - 1; i >= 0; i--) {
      const sh = this.shellCasings[i];
      sh.life -= dt;
      sh.vel.y -= 11.5 * dt;
      sh.mesh.position.addScaledVector(sh.vel, dt);
      sh.mesh.rotation.x += sh.angVel.x * dt;
      sh.mesh.rotation.y += sh.angVel.y * dt;
      sh.mesh.rotation.z += sh.angVel.z * dt;
      if (sh.life <= 0) {
        this.scene.remove(sh.mesh);
        this.shellCasings.splice(i, 1);
      }
    }

    // Update tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        this.scene.remove(tr.line);
        tr.line.geometry.dispose();
        (tr.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }

    // Update debris/spark particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      pt.vel.y -= pt.gravity * dt;
      pt.mesh.position.addScaledVector(pt.vel, dt);
      pt.mesh.scale.addScalar(pt.scaleRate * dt);
      if (pt.mesh.scale.x < 0.05) pt.mesh.scale.setScalar(0.05);
      (pt.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, pt.life / pt.maxLife);
      if (pt.life <= 0) {
        this.scene.remove(pt.mesh);
        (pt.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }

    // Update volumetric smoke & dust sprites
    for (let i = this.smokeSprites.length - 1; i >= 0; i--) {
      const sp = this.smokeSprites[i];
      sp.life -= dt;
      sp.vel.multiplyScalar(1 - Math.min(0.9, dt * 1.4));
      sp.sprite.position.addScaledVector(sp.vel, dt);
      const nextS = sp.sprite.scale.x + sp.growRate * dt;
      sp.sprite.scale.set(nextS, nextS, 1);
      const ratio = Math.max(0, sp.life / sp.maxLife);
      (sp.sprite.material as THREE.SpriteMaterial).opacity = sp.baseOpacity * ratio;
      if (sp.life <= 0) {
        this.scene.remove(sp.sprite);
        (sp.sprite.material as THREE.Material).dispose();
        this.smokeSprites.splice(i, 1);
      }
    }
  }

  public dispose() {
    this.particleGeo.dispose();
    this.shellGeo.dispose();
    this.shellMat.dispose();
    this.projGeo.dispose();
    this.decalGeo.dispose();
    this.decalMat.dispose();
    this.smokeSprites.forEach((s) => {
      this.scene.remove(s.sprite);
      (s.sprite.material as THREE.Material).dispose();
    });
    this.shellCasings.forEach((s) => this.scene.remove(s.mesh));
  }
}
