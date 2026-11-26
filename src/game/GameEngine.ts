import * as THREE from 'three';
import {
  DeploymentConfig,
  EnemyClass,
  GamePhase,
  GameSettings,
  GraphicsPreset,
  HUDState,
  KillFeedEntry,
  MinimapEntity,
  SaveData,
  WeatherType,
} from './types';
import { WEAPONS } from './data/weapons';
import { CALIBER_TO_AMMO_ITEM, createInventoryEntry, ITEMS } from './data/items';
import { getRegionAt, POINTS_OF_INTEREST } from './data/worldConfig';
import { TextureLibrary } from './systems/TextureLibrary';
import { TerrainManager } from './systems/TerrainManager';
import { AudioManager } from './systems/AudioManager';
import { InventorySystem } from './systems/InventorySystem';
import { LootSystem } from './systems/LootSystem';
import { WorldManager } from './systems/WorldManager';
import { VehicleSystem } from './systems/VehicleSystem';
import { EnemyAI } from './systems/EnemyAI';
import { WeaponSystem } from './systems/WeaponSystem';
import { PlayerController } from './systems/PlayerController';
import { MissionSystem } from './systems/MissionSystem';
import { SaveSystem } from './systems/SaveSystem';
import { RenderPipeline } from './systems/RenderPipeline';
import { TrainingRange } from './systems/TrainingRange';
import { buildPlayerOperatorModel, BuiltPlayerModel } from './systems/CharacterModels';
import { WeaponId } from './types';

export const DEFAULT_SETTINGS: GameSettings = {
  graphicsPreset: 'HIGH',
  renderDistanceChunks: 2,
  resolutionScale: 1.0,
  mouseSensitivity: 1.0,
  fov: 78,
  masterVolume: 0.75,
  sfxVolume: 0.85,
  ambientVolume: 0.65,
  muted: false,
  invertY: false,
};

function detectSoftwareGl(): boolean {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

const _camForward = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _shakeVec = new THREE.Vector3();

export class GameEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  public renderPipeline: RenderPipeline;

  private textures: TextureLibrary;
  private terrain: TerrainManager;
  public audio: AudioManager;
  public inventory: InventorySystem;
  public loot: LootSystem;
  public world: WorldManager;
  public vehicles: VehicleSystem;
  public enemies: EnemyAI;
  public weapons: WeaponSystem;
  public player: PlayerController;
  private playerBody: BuiltPlayerModel;
  private playerWalkPhase = 0;
  public missions: MissionSystem;
  public saveSystem: SaveSystem;
  public trainingRange: TrainingRange;

  public settings: GameSettings = { ...DEFAULT_SETTINGS };
  public phase: GamePhase = 'title';
  private isTrainingMode = false;
  private trainingWeaponCycleIdx = 0;
  private pointerLocked = false;
  private draggingLook = false; // Graceful fallback if pointer lock blocked

  // Operator progression & combat feedback
  private credits = 1200;
  private xp = 0;
  private kills = 0;
  private headshots = 0;
  private openContainerId: string | null = null;
  private lastExtractedLootValue = 0;
  private deathReason = '';
  private killedBy = 'Soldado Inimigo';
  private killedByWeapon = 'Rifle de assalto';
  private killedDistanceMeters = 0;
  private operationDurationSec = 0;
  private lootCollectedCount = 0;
  private lastDeploymentConfig?: DeploymentConfig;
  private lastRandomSpawnIndex = -1;
  private spectatorOrbitAngle = 0;
  private spectatorTargetIndex = 0;
  private spectatorLabel = 'Local da Eliminação';
  private hasSavedGame = false;

  private hitmarkerType: 'none' | 'body' | 'head' | 'kill' = 'none';
  private hitmarkerTimer = 0;
  private damageFlash = 0;
  private damageIndicatorAngle: number | null = null;
  private damageIndicatorTimer = 0;
  private suppressionLevel = 0;
  private cameraShake = 0;
  private hitstopTimer = 0;
  private maxEnemyAlert = 0;
  private inCombatCount = 0;
  private stealthVisibility = 45;

  private feed: KillFeedEntry[] = [];
  private feedCounter = 1;

  // Input state (continuous held vs edge-triggered)
  private heldKeys = new Set<string>();
  private jumpJustPressed = false;
  private fireHeld = false;
  private fireJustPressed = false;
  private aimHeld = false;

  // Render loop & HUD callback
  private frameId = 0;
  private lastTime = performance.now();
  private hudEmitAccum = 0;
  private autosaveAccum = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private currentFps = 60;
  private titleOrbitAngle = 0.6;
  private sprintDustAccum = 0;
  private disposed = false;

  private onHudUpdate: (state: HUDState) => void;

  constructor(container: HTMLElement, onHudUpdate: (state: HUDState) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.isSoftwareGl = detectSoftwareGl();

    // Renderer configured per Three.js studio PBR & software-WebGL guidelines
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      this.settings.fov,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.025,
      2200
    );
    this.scene.add(this.camera);

    // PHASE 1 AAA Render Pipeline: HDR Outdoor Sky IBL (PMREMGenerator) + HalfFloat EffectComposer (GTAO, Bloom, Grading, OutputPass)
    this.renderPipeline = new RenderPipeline(this.renderer, this.scene, this.camera, this.isSoftwareGl);

    // Initialize all modular systems
    this.textures = new TextureLibrary(this.renderer);
    this.terrain = new TerrainManager();
    this.audio = new AudioManager(this.settings);
    this.inventory = new InventorySystem();
    this.loot = new LootSystem(this.scene, this.textures.materials);
    this.missions = new MissionSystem();
    this.saveSystem = new SaveSystem();

    this.world = new WorldManager(this.scene, this.terrain, this.textures.materials, this.loot, this.isSoftwareGl, {
      onSectorLoaded: (sx, sz, key) => {
        if (!this.isTrainingMode) {
          this.enemies?.spawnSectorEnemies(sx, sz, key);
        }
      },
      onSectorUnloaded: (key) => {
        this.enemies?.unloadSector(key);
      },
    });

    this.trainingRange = new TrainingRange(this.scene, this.world, this.textures.materials);
    this.enemies = new EnemyAI(this.scene, this.terrain, this.world, this.textures.materials, this.audio);
    this.vehicles = new VehicleSystem(this.scene, this.terrain, this.world, this.textures.materials);
    this.player = new PlayerController(this.camera, this.terrain, this.world, this.audio);
    this.playerBody = buildPlayerOperatorModel(this.textures.materials);
    this.playerBody.group.visible = false;
    this.scene.add(this.playerBody.group);

    this.weapons = new WeaponSystem(
      this.scene,
      this.camera,
      this.audio,
      this.enemies,
      this.world,
      this.vehicles,
      this.textures.materials,
      {
        onHitEnemy: (_enemyId, headshot, killed, regionId, pos) => {
          this.hitmarkerType = killed ? 'kill' : headshot ? 'head' : 'body';
          this.hitmarkerTimer = 0.24;
          if (killed) {
            this.kills++;
            if (headshot) this.headshots++;
            this.xp += headshot ? 150 : 100;
            this.credits += headshot ? 180 : 110;
            this.pushFeed(
              headshot ? 'ELIMINAÇÃO HEADSHOT (+150 XP)' : 'HOSTIL ELIMINADO (+100 XP)',
              headshot ? 'headshot' : 'kill'
            );
            const completed = this.missions.recordEnemyKill(regionId as SaveData['weather'] & never | any);
            for (const m of completed) this.onMissionCompleted(m.title, m.rewardCredits, m.rewardXp);
            // Spawn lootable corpse container
            this.loot.spawnContainer(
              `corpse_${Date.now()}_${Math.floor(Math.random() * 999)}`,
              'enemy_corpse',
              regionId as any,
              pos.clone().setY(this.terrain.getHeightAt(pos.x, pos.z, pos.y)),
              'corpse',
              Math.floor(Math.random() * 99999)
            );
          }
        },
        onDestroyProp: (_propId, missionId) => {
          this.pushFeed('ALVO EXPLOSIVO DETONADO!', 'alert');
          if (missionId) {
            const done = this.missions.recordObjectiveAction(missionId, 1);
            if (done) this.onMissionCompleted(done.title, done.rewardCredits, done.rewardXp);
          }
        },
        onDestroyCamera: () => {
          this.xp += 60;
          this.pushFeed('CÂMERA DE SEGURANÇA NEUTRALIZADA (+60 XP)', 'system');
        },
        onExplosion: (pos, radius, maxDamage) => {
          if (this.isTrainingMode) return;
          const d = pos.distanceTo(this.player.position);
          if (d < radius) {
            this.applyPlayerDamage(maxDamage * (1 - d / radius) * 0.65, pos, 'Explosão letal');
          }
        },
        onCameraShake: (amt) => {
          this.cameraShake = Math.min(1.0, this.cameraShake + amt);
        },
        onHitstop: (sec) => {
          this.hitstopTimer = Math.max(this.hitstopTimer, sec);
        },
        onShotFired: () => {
          if (this.isTrainingMode) {
            this.trainingRange.recordShotFired();
          }
        },
        getTrainingHitMeshes: () => (this.isTrainingMode ? this.trainingRange.hitMeshes : []),
        onHitTrainingTarget: (targetId, hitZone) => {
          if (!this.isTrainingMode) return;
          const res = this.trainingRange.registerHit(targetId, hitZone, this.player.position);
          this.hitmarkerType = res.headshot ? 'head' : 'body';
          this.hitmarkerTimer = 0.24;
          if (res.plateRackCleared) {
            this.audio.playRadioBeep();
            this.pushFeed('SÉRIE DE 5 PLACAS CONCLUÍDA! REINICIANDO...', 'mission');
          } else if (!res.alreadyDown) {
            this.pushFeed(
              res.headshot
                ? `ALVO HEADSHOT · ${res.distanceMeters}M`
                : `ALVO ATINGIDO · ${res.distanceMeters}M`,
              res.headshot ? 'headshot' : 'kill'
            );
          }
        },
      }
    );

    // Load initial sectors around Blacksite Military Complex so the title flyover shows the real 3D base!
    this.world.updateStreaming(this.player.position);
    this.world.updateAtmosphere(0, this.player.position);
    this.renderPipeline.applyPreset(this.settings.graphicsPreset);
    if (this.world.lastAtmosphere) {
      this.renderPipeline.updateAtmosphere(this.world.lastAtmosphere, this.world.lastWeatherDim, 0);
    }
    this.weapons.equipWeapon(this.inventory.getActiveWeapon());

    // Pre-compile shaders on hardware GPUs
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Check if saved game exists
    this.saveSystem.hasSave().then((exists) => {
      this.hasSavedGame = exists;
      this.emitHud();
    });

    this.bindEvents();
    this.emitHud();
    this.startLoop();
  }

  private bindEvents() {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    this.renderer.domElement.addEventListener('mousedown', this.handleMouseDown);
    this.renderer.domElement.addEventListener('contextmenu', this.handleContextMenu);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
  }

  private handleResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const presetPrCap =
      this.settings.graphicsPreset === 'LOW'
        ? 1.0
        : this.settings.graphicsPreset === 'MEDIUM'
        ? 1.35
        : this.settings.graphicsPreset === 'HIGH'
        ? 1.75
        : 2.0;
    const basePr = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, presetPrCap);
    const effectivePr = basePr * this.settings.resolutionScale;
    this.renderer.setPixelRatio(effectivePr);
    this.renderer.setSize(w, h);
    this.renderPipeline.resize(w, h, effectivePr);
  };

  private handleBlur = () => {
    this.heldKeys.clear();
    this.fireHeld = false;
    this.aimHeld = false;
    this.draggingLook = false;
  };

  private handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private handlePointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    if (!this.pointerLocked && this.phase === 'playing') {
      this.fireHeld = false;
      this.aimHeld = false;
    }
    this.emitHud();
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (this.phase !== 'playing') return;
    this.audio.unlock();
    if (!this.pointerLocked) {
      this.requestPointerLock();
      this.draggingLook = true;
    }
    if (e.button === 0) {
      this.fireHeld = true;
      this.fireJustPressed = true;
    } else if (e.button === 2) {
      this.aimHeld = true;
      this.weapons.aiming = true;
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.fireHeld = false;
      this.draggingLook = false;
    } else if (e.button === 2) {
      this.aimHeld = false;
      this.weapons.aiming = false;
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (this.phase !== 'playing') return;
    if (!this.pointerLocked && !this.draggingLook) return;
    if (this.vehicles.activeVehicle) return;

    const adsScale = this.weapons.aiming ? 0.55 : 1.0;
    this.player.applyLookDelta(e.movementX, e.movementY, this.settings.mouseSensitivity, this.settings.invertY, adsScale);
    this.weapons.addLookSway(e.movementX, e.movementY);
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const code = e.code;

    // Title Screen quick start via Enter (ignore while typing in inputs or clicking buttons)
    if (this.phase === 'title') {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') {
        return;
      }
      if (code === 'Enter') {
        e.preventDefault();
        this.startNewOperation();
      }
      return;
    }

    if (code === 'Escape') {
      e.preventDefault();
      if (this.phase === 'playing') {
        this.setPhase('paused');
      } else if (this.phase === 'paused' || this.phase === 'inventory' || this.phase === 'map') {
        this.openContainerId = null;
        this.setPhase('playing');
      }
      return;
    }

    if (code === 'Tab') {
      e.preventDefault();
      if (this.phase === 'playing') {
        this.openContainerId = null;
        this.setPhase('inventory');
      } else if (this.phase === 'inventory') {
        this.openContainerId = null;
        this.setPhase('playing');
      }
      return;
    }

    if (code === 'KeyM') {
      e.preventDefault();
      if (this.phase === 'playing') {
        this.setPhase('map');
      } else if (this.phase === 'map') {
        this.setPhase('playing');
      }
      return;
    }

    if (this.phase !== 'playing') return;

    this.heldKeys.add(code);

    if (code === 'Space') {
      this.jumpJustPressed = true;
    } else if (code === 'KeyC') {
      if (this.vehicles.activeVehicle) {
        this.vehicles.thirdPerson = !this.vehicles.thirdPerson;
      } else {
        this.player.toggleCrouch();
      }
    } else if (code === 'KeyR') {
      const w = this.inventory.getActiveWeapon();
      if (w) {
        const reserve = this.inventory.getReserveAmmo(WEAPONS[w.weaponId].caliber);
        this.weapons.startReload(w, reserve);
      }
    } else if (code === 'KeyF') {
      if (this.vehicles.activeVehicle) {
        this.vehicles.toggleHeadlights();
      } else {
        this.player.toggleFlashlight();
      }
      this.audio.playReload('start');
    } else if (code === 'KeyV') {
      const w = this.inventory.getActiveWeapon();
      if (w) {
        const spec = WEAPONS[w.weaponId];
        if (spec.fireModes.length > 1) {
          w.fireModeIndex = (w.fireModeIndex + 1) % spec.fireModes.length;
          this.audio.playReload('start');
          this.pushFeed(`Modo de disparo: ${spec.fireModes[w.fireModeIndex]}`, 'system');
        }
      }
    } else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4') {
      const slot = Number(code.replace('Digit', '')) - 1;
      if (this.inventory.selectSlot(slot)) {
        this.weapons.equipWeapon(this.inventory.getActiveWeapon());
      }
    } else if (code === 'KeyE') {
      this.handleInteract();
    } else if (code === 'KeyG') {
      this.handleThrowGrenade();
    } else if (code === 'KeyH') {
      this.handleQuickHeal();
    } else if (code === 'KeyX') {
      this.handleThrowDistraction();
    } else if (code === 'KeyT' && this.isTrainingMode) {
      this.cycleTrainingWeapon();
    } else if (code === 'KeyB' && this.isTrainingMode) {
      this.trainingRange.resetTargetsAndStats();
      this.audio.playRadioBeep();
      this.pushFeed('ALVOS E ESTATÍSTICAS REINICIADOS', 'system');
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.heldKeys.delete(e.code);
  };

  public requestPointerLock() {
    try {
      this.renderer.domElement.requestPointerLock?.();
    } catch {
      // Fallback drag look remains active
    }
  }

  public setPhase(next: GamePhase) {
    this.phase = next;
    this.audio.setLobbyMusicActive(next === 'title');
    if (next === 'playing') {
      this.audio.unlock();
      this.requestPointerLock();
    } else {
      this.heldKeys.clear();
      this.fireHeld = false;
      this.aimHeld = false;
      this.weapons.aiming = false;
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
    }
    this.emitHud();
  }

  private pickRandomSafeSpawn(mode?: 'open_world' | 'desert_op' | 'night_raid' | 'training'): {
    x: number;
    z: number;
    yaw: number;
    regionName: string;
  } {
    const allCandidates: { x: number; z: number }[] = [
      { x: 14, z: 42 },       // Blacksite Sul
      { x: -72, z: 36 },      // Blacksite Oeste
      { x: 88, z: 120 },      // Estrada Sul Blacksite
      { x: 315, z: -38 },     // Desert Outpost Entrada
      { x: 420, z: -15 },     // Desert Outpost Dunas Sul
      { x: 485, z: -155 },    // Desert Outpost Planalto Leste
      { x: -320, z: -20 },    // Industrial Valley Acesso
      { x: -460, z: -120 },   // Industrial Valley Ferrovia
      { x: -290, z: -180 },   // Vale Norte Industrial
      { x: -115, z: -340 },   // Abandoned City Sul
      { x: 75, z: -365 },     // Abandoned City Leste
      { x: 265, z: -360 },    // Mountain Range Encosta Sul
      { x: 410, z: -470 },    // Mountain Range Vale Nordeste
      { x: -265, z: 275 },    // Rural Settlement Estrada
      { x: -395, z: 385 },    // Rural Settlement Fazenda Oeste
      { x: -175, z: 165 },    // Planície Sudoeste
    ];

    const desertCandidates: { x: number; z: number }[] = [
      { x: 315, z: -38 },
      { x: 420, z: -15 },
      { x: 485, z: -155 },
      { x: 360, z: 135 },
      { x: 265, z: -185 },
    ];

    const nightCandidates: { x: number; z: number }[] = [
      { x: -115, z: -340 },
      { x: 75, z: -365 },
      { x: -32, z: -285 },
      { x: -290, z: -180 },
      { x: -320, z: -20 },
    ];

    const candidates =
      mode === 'desert_op'
        ? desertCandidates
        : mode === 'night_raid'
        ? nightCandidates
        : allCandidates;

    let idx = Math.floor(Math.random() * candidates.length);
    if (candidates.length > 1 && idx === this.lastRandomSpawnIndex) {
      idx = (idx + 1 + Math.floor(Math.random() * (candidates.length - 1))) % candidates.length;
    }
    this.lastRandomSpawnIndex = idx;

    const base = candidates[idx];
    const jitterAngle = Math.random() * Math.PI * 2;
    const jitterRadius = 8 + Math.random() * 18;
    const probe = new THREE.Vector3(
      THREE.MathUtils.clamp(base.x + Math.cos(jitterAngle) * jitterRadius, -620, 620),
      0,
      THREE.MathUtils.clamp(base.z + Math.sin(jitterAngle) * jitterRadius, -620, 620)
    );

    this.world.updateStreaming(probe);
    probe.y = this.terrain.getSurfaceHeightAt(probe.x, probe.z);

    // Push clear of any nearby building/prop colliders
    for (let i = 0; i < 6; i++) {
      const hit = this.world.resolveHorizontalCollision(probe, 1.4, 2.0);
      if (!hit) break;
    }

    const region = getRegionAt(probe.x, probe.z);
    return {
      x: probe.x,
      z: probe.z,
      yaw: Math.random() * Math.PI * 2,
      regionName: region.name,
    };
  }

  public startNewOperation(config?: DeploymentConfig, isRespawn = false) {
    this.audio.unlock();
    this.inventory.resetToStarter();
    this.missions.reset();

    if (config) {
      this.lastDeploymentConfig = {
        ...config,
        bonusItems: config.bonusItems.map((b) => ({ ...b })),
      };
    }

    const activeConfig = config ?? this.lastDeploymentConfig;
    const mode = activeConfig?.mode ?? 'open_world';

    if (activeConfig) {
      // Apply custom Arsenal weapons
      const primary = WEAPONS[activeConfig.primaryWeapon] ?? WEAPONS.m4a1;
      const secondary = WEAPONS[activeConfig.secondaryWeapon] ?? WEAPONS.m24;
      const sidearm = WEAPONS[activeConfig.sidearmWeapon] ?? WEAPONS.glock17;

      this.inventory.equipment.slots[0] = {
        weaponId: primary.id,
        ammoInMag: primary.magSize,
        fireModeIndex: 0,
        suppressed: Boolean(primary.suppressedByDefault),
      };
      this.inventory.equipment.slots[1] = {
        weaponId: secondary.id,
        ammoInMag: secondary.magSize,
        fireModeIndex: 0,
        suppressed: Boolean(secondary.suppressedByDefault),
      };
      this.inventory.equipment.slots[2] = {
        weaponId: sidearm.id,
        ammoInMag: sidearm.magSize,
        fireModeIndex: 0,
        suppressed: Boolean(sidearm.suppressedByDefault),
      };
      this.inventory.equipment.activeSlot = 0;

      // Ensure matching reserve ammo is available for selected weapons
      const neededCalibers = [
        { cal: primary.caliber, qty: Math.min(120, primary.magSize * 4) },
        { cal: secondary.caliber, qty: Math.min(60, secondary.magSize * 4) },
        { cal: sidearm.caliber, qty: Math.min(60, sidearm.magSize * 3) },
      ];
      for (const { cal, qty } of neededCalibers) {
        const ammoId = CALIBER_TO_AMMO_ITEM[cal];
        if (this.inventory.getItemCount(ammoId) < qty) {
          this.inventory.addItem(createInventoryEntry(ammoId, qty - this.inventory.getItemCount(ammoId)));
        }
      }

      // Apply Operator specialization armor & helmet
      const armorTpl = ITEMS[activeConfig.armorId];
      if (armorTpl?.armorProtection) {
        this.inventory.equipment.armorId = armorTpl.id;
        this.inventory.equipment.maxArmorDurability = armorTpl.armorProtection;
        this.inventory.equipment.armorDurability = armorTpl.armorProtection;
      }
      const helmetTpl = ITEMS[activeConfig.helmetId];
      if (helmetTpl?.helmetReduction) {
        this.inventory.equipment.helmetId = helmetTpl.id;
      }

      // Add any tactical shop items purchased in menu
      for (const bonus of activeConfig.bonusItems) {
        if (ITEMS[bonus.templateId] && bonus.quantity > 0) {
          this.inventory.addItem(createInventoryEntry(bonus.templateId, bonus.quantity));
        }
      }

      // Apply deployment mode atmosphere
      if (mode === 'training') {
        this.world.timeOfDay = 13.5;
        this.world.weather = 'clear';
      } else if (mode === 'desert_op') {
        this.world.timeOfDay = 17.35;
        this.world.weather = 'clear';
      } else if (mode === 'night_raid') {
        this.world.timeOfDay = 21.2;
        this.world.weather = 'clear';
      } else {
        this.world.timeOfDay = 17.28;
        this.world.weather = 'clear';
      }
    }

    const enteringTraining = mode === 'training';
    this.isTrainingMode = enteringTraining;

    let spawnX = 0;
    let spawnZ = 24;
    let spawnYaw = 0;
    let deployBanner = 'OPERAÇÃO INICIADA';

    if (enteringTraining) {
      // Zero NPCs in Treinamento mode! Activate isolated Firing Range & stock abundant ammo for all calibers
      this.enemies.clearAllEnemies();
      this.trainingRange.activate();
      this.trainingWeaponCycleIdx = 0;
      const allCalibers = Object.keys(CALIBER_TO_AMMO_ITEM) as Array<keyof typeof CALIBER_TO_AMMO_ITEM>;
      for (const cal of allCalibers) {
        const ammoId = CALIBER_TO_AMMO_ITEM[cal];
        const cur = this.inventory.getItemCount(ammoId);
        if (cur < 600) {
          this.inventory.addItem(createInventoryEntry(ammoId, 600 - cur));
        }
      }
      spawnX = TrainingRange.CENTER_X;
      spawnZ = TrainingRange.SPAWN_Z;
      spawnYaw = 0; // Facing directly downrange (-Z) toward all targets!
      deployBanner = 'ESTANDE DE TIRO — TREINE SUA MIRA (SEM NPCS) · [T] TROCAR ARMA';
    } else if (mode === 'night_raid') {
      this.trainingRange.deactivate();
      this.world.setActiveMap('industrial');
      this.enemies.ensureUndergroundGuards();
      // Modo Incursão Noturna: sempre cai diretamente no Mapa Industrial (chicken_shoot_gun_-_industrial_map.glb)
      spawnX = 0;
      spawnZ = 18;
      spawnYaw = 0;
      deployBanner = isRespawn
        ? 'REINSERÇÃO — INCURSÃO NOTURNA (MAPA INDUSTRIAL)'
        : 'INCURSÃO NOTURNA — MAPA INDUSTRIAL';
    } else if (mode === 'desert_op') {
      this.trainingRange.deactivate();
      this.world.setActiveMap('industrial');
      this.enemies.ensureUndergroundGuards();
      const chosen = this.pickRandomSafeSpawn('desert_op');
      spawnX = chosen.x;
      spawnZ = chosen.z;
      spawnYaw = chosen.yaw;
      deployBanner = 'OPERAÇÃO DESERTO — POSTO ÁRIDO';
    } else {
      this.trainingRange.deactivate();
      this.world.setActiveMap('ancient_rome');
      this.enemies.ensureUndergroundGuards();
      // Modo Mundo Aberto: mapa Roma Antiga (massive_scale_model_of_ancient_rome.glb)
      spawnX = 0;
      spawnZ = 18;
      spawnYaw = 0;
      deployBanner = isRespawn
        ? 'REINSERÇÃO — MUNDO ABERTO (ROMA ANTIGA)'
        : 'MUNDO ABERTO — ROMA ANTIGA';
    }

    this.player.resetAtSpawn(spawnX, spawnZ);
    this.player.yaw = spawnYaw;
    if (this.vehicles.activeVehicle) this.vehicles.exitVehicle();
    this.credits = 1200 + (activeConfig?.bonusCredits ?? 0);
    this.xp = 0;
    this.kills = 0;
    this.headshots = 0;
    this.operationDurationSec = 0;
    this.lootCollectedCount = 0;
    this.spectatorTargetIndex = 0;
    this.openContainerId = null;
    this.world.updateStreaming(this.player.position);
    this.enemies.clearAllEnemies();
    if (!enteringTraining) {
      this.enemies.ensureUndergroundGuards();
      this.enemies.spawnIndustrialArenaEnemies(12);
    }
    this.weapons.equipWeapon(this.inventory.getActiveWeapon());
    this.pushFeed(deployBanner, 'mission');
    this.setPhase('playing');
  }

  public redeployRandomSpawn() {
    this.startNewOperation(this.lastDeploymentConfig, true);
  }

  public returnToMainMenu() {
    if (this.phase === 'dead') {
      this.inventory.resetToStarter();
      this.lootCollectedCount = 0;
      this.operationDurationSec = 0;
      this.weapons.equipWeapon(this.inventory.getActiveWeapon());
      this.hasSavedGame = false;
      void this.saveSystem.clear();
    }
    this.openContainerId = null;
    this.setPhase('title');
  }

  /**
   * Abandons the current match from the pause menu:
   * returns to the main menu and forfeits all unextracted raid loot/gear as if killed in action.
   */
  public abandonOperation() {
    this.missions.cancelExtraction();
    if (this.vehicles.activeVehicle) {
      this.vehicles.exitVehicle();
    }
    this.openContainerId = null;
    this.fireHeld = false;
    this.aimHeld = false;
    this.weapons.aiming = false;
    this.heldKeys.clear();

    if (this.isTrainingMode) {
      this.trainingRange.deactivate();
      this.isTrainingMode = false;
    } else {
      // Clear mid-raid save so forfeited raid loot cannot be reloaded
      this.hasSavedGame = false;
      void this.saveSystem.clear();
    }

    // Forfeit all collected raid loot & match equipment (identical to dying in action; extracted stash stays safe)
    this.inventory.resetToStarter();
    this.lootCollectedCount = 0;
    this.operationDurationSec = 0;
    this.kills = 0;
    this.headshots = 0;
    this.weapons.equipWeapon(this.inventory.getActiveWeapon());

    this.setPhase('title');
  }

  public cycleSpectatorTarget() {
    this.spectatorTargetIndex++;
    this.emitHud();
  }

  public async continueSavedOperation() {
    this.audio.unlock();
    const save = await this.saveSystem.load();
    if (!save) {
      this.startNewOperation();
      return;
    }
    this.isTrainingMode = false;
    this.trainingRange.deactivate();
    this.enemies.ensureUndergroundGuards();
    this.player.position.set(save.playerPos.x, save.playerPos.y, save.playerPos.z);
    this.player.yaw = save.playerPos.yaw;
    this.player.health = Math.max(25, save.health);
    const sanitizedSlots = save.equipment.slots.map((slot, idx) => {
      if (!slot) return null;
      if (WEAPONS[slot.weaponId]) return slot;
      const fallbackId: WeaponId = idx === 2 ? 'glock17' : 'm4a1';
      const fbSpec = WEAPONS[fallbackId];
      return {
        weaponId: fallbackId,
        ammoInMag: fbSpec.magSize,
        fireModeIndex: 0,
        suppressed: Boolean(fbSpec.suppressedByDefault),
      };
    }) as typeof save.equipment.slots;
    this.inventory.equipment = {
      ...save.equipment,
      slots: sanitizedSlots,
    };
    this.inventory.items = save.inventory.filter((entry) => {
      const tpl = ITEMS[entry.templateId];
      if (!tpl) return false;
      return !tpl.weaponId || Boolean(WEAPONS[tpl.weaponId]);
    });
    this.inventory.stash = save.stash ?? [];
    this.missions.loadProgress(save.completedMissionIds, save.missionProgress);
    this.credits = save.credits;
    this.xp = save.xp;
    this.kills = save.kills;
    this.headshots = save.headshots;
    this.world.timeOfDay = save.timeOfDay;
    this.world.weather = save.weather;
    if (save.settings) {
      this.updateSettings(save.settings);
    }

    this.world.updateStreaming(this.player.position);
    this.weapons.equipWeapon(this.inventory.getActiveWeapon());
    this.pushFeed('PROGRESSO CARREGADO COM SUCESSO', 'system');
    this.setPhase('playing');
  }

  public async saveCurrentGame(silent = false) {
    const progress: Record<string, number> = {};
    const completedIds: string[] = [];
    for (const m of this.missions.missions) {
      progress[m.id] = m.progress;
      if (m.completed) completedIds.push(m.id);
    }
    const data: SaveData = {
      version: 1,
      savedAt: Date.now(),
      playerPos: {
        x: this.player.position.x,
        y: this.player.position.y,
        z: this.player.position.z,
        yaw: this.player.yaw,
      },
      health: this.player.health,
      equipment: this.inventory.equipment,
      inventory: this.inventory.items,
      stash: this.inventory.stash,
      completedMissionIds: completedIds,
      missionProgress: progress,
      credits: this.credits,
      xp: this.xp,
      kills: this.kills,
      headshots: this.headshots,
      timeOfDay: this.world.timeOfDay,
      weather: this.world.weather,
      settings: this.settings,
    };
    await this.saveSystem.save(data);
    this.hasSavedGame = true;
    if (!silent) this.pushFeed('JOGO SALVO LOCALMENTE (INDEXEDDB)', 'system');
    this.emitHud();
  }

  public updateSettings(partial: Partial<GameSettings>) {
    this.settings = {
      ...this.settings,
      ...partial,
      renderDistanceChunks: Math.max(
        1,
        Math.min(4, Math.round(partial.renderDistanceChunks ?? this.settings.renderDistanceChunks ?? 2))
      ),
    };
    this.audio.applySettings(this.settings);
    this.world.applyGraphicsPreset(this.settings.graphicsPreset);
    this.world.setRenderDistanceChunks(this.settings.renderDistanceChunks, this.player.position);
    this.renderPipeline.applyPreset(this.settings.graphicsPreset);
    this.textures.setAnisotropyForPreset(
      this.settings.graphicsPreset,
      this.renderer.capabilities.getMaxAnisotropy()
    );
    // Keep sky dome & distant silhouette clean while horizon fog smoothly seals the last loaded chunk
    const chunkFar = Math.max(1250, (this.settings.renderDistanceChunks + 2) * 260);
    if (this.camera.far !== chunkFar) {
      this.camera.far = chunkFar;
      this.camera.updateProjectionMatrix();
    }
    this.world.updateStreaming(this.player.position);
    this.handleResize();
    this.emitHud();
  }

  public setWeatherManual(weather: WeatherType) {
    this.world.weather = weather;
    this.pushFeed(`Clima alterado: ${weather.toUpperCase()}`, 'system');
    this.emitHud();
  }

  public setTimeOfDayManual(hour: number) {
    this.world.timeOfDay = hour;
    this.emitHud();
  }

  public trackMission(id: string) {
    this.missions.trackMission(id);
    this.emitHud();
  }

  public fastTravelToPoi(x: number, z: number, label: string) {
    if (this.vehicles.activeVehicle) this.vehicles.exitVehicle();
    const y = this.terrain.getSurfaceHeightAt(x, z);
    this.player.position.set(x, y + 0.2, z);
    this.world.updateStreaming(this.player.position);
    this.pushFeed(`Deslocamento tático: ${label}`, 'system');
    this.setPhase('playing');
  }

  // Inventory actions called from UI
  public equipInventoryItem(uid: string) {
    const res = this.inventory.equipItem(uid);
    if (res.ok) {
      if (res.heal) this.player.health = Math.min(this.player.maxHealth, this.player.health + res.heal);
      if (res.stamina) this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + res.stamina);
      if (res.weaponChanged) {
        this.weapons.equipWeapon(this.inventory.getActiveWeapon());
      }
      this.audio.playLootPickup();
      this.pushFeed(res.message, 'loot');
    } else {
      this.pushFeed(res.message, 'system');
    }
    this.emitHud();
  }

  public dropInventoryItem(uid: string) {
    const removed = this.inventory.removeByUid(uid);
    if (removed) {
      this.pushFeed(`Descartado: ${ITEMS[removed.templateId]?.name ?? removed.templateId}`, 'system');
    }
    this.emitHud();
  }

  public takeItemFromOpenContainer(uid: string) {
    if (!this.openContainerId) return;
    const container = this.loot.containers.get(this.openContainerId);
    if (!container) return;
    const targetItem = container.items.find((i) => i.uid === uid);
    if (!targetItem) return;

    const addRes = this.inventory.addItem(targetItem);
    if (!addRes.added) {
      this.pushFeed(addRes.reason ?? 'Sem espaço na mochila', 'alert');
      this.emitHud();
      return;
    }
    this.loot.removeItemFromContainer(this.openContainerId, uid);
    this.lootCollectedCount += 1;
    this.audio.playLootPickup();
    this.pushFeed(`Coletado: ${ITEMS[targetItem.templateId]?.name ?? 'Item'}`, 'loot');

    if (container.missionTag) {
      const done = this.missions.recordObjectiveAction(container.missionTag, 1);
      if (done) this.onMissionCompleted(done.title, done.rewardCredits, done.rewardXp);
    }
    this.emitHud();
  }

  public takeAllFromOpenContainer() {
    if (!this.openContainerId) return;
    const container = this.loot.containers.get(this.openContainerId);
    if (!container) return;
    const uids = container.items.map((i) => i.uid);
    for (const uid of uids) {
      this.takeItemFromOpenContainer(uid);
    }
  }

  private cycleTrainingWeapon() {
    const allIds = Object.keys(WEAPONS) as WeaponId[];
    if (allIds.length === 0) return;
    this.trainingWeaponCycleIdx = (this.trainingWeaponCycleIdx + 1) % allIds.length;
    const nextId = allIds[this.trainingWeaponCycleIdx];
    const spec = WEAPONS[nextId];
    const slot = this.inventory.equipment.activeSlot;
    this.inventory.equipment.slots[slot] = {
      weaponId: nextId,
      ammoInMag: spec.magSize,
      fireModeIndex: 0,
      suppressed: Boolean(spec.suppressedByDefault),
    };
    const ammoId = CALIBER_TO_AMMO_ITEM[spec.caliber];
    if (this.inventory.getItemCount(ammoId) < 200) {
      this.inventory.addItem(createInventoryEntry(ammoId, 400));
    }
    this.weapons.equipWeapon(this.inventory.getActiveWeapon());
    this.audio.playLootPickup();
    this.pushFeed(`ARMAMENTO EQUIPADO: ${spec.name}`, 'loot');
    this.emitHud();
  }

  private handleInteract() {
    // 0. Training Range ARMAMENTO weapon bench interaction
    if (this.isTrainingMode && this.trainingRange.isNearWeaponBench(this.player.position)) {
      this.cycleTrainingWeapon();
      return;
    }

    // 1. If in vehicle, exit vehicle
    if (this.vehicles.activeVehicle) {
      const exitPos = this.vehicles.exitVehicle();
      if (exitPos) {
        this.player.position.copy(exitPos);
        this.weapons.weaponRoot.visible = true;
        this.pushFeed('Saiu do veículo', 'system');
      }
      return;
    }

    // 2. Check Extraction Zone request
    const nearExt = this.missions.getNearestExtractionPoint(this.player.position);
    if (nearExt && nearExt.dist < nearExt.point.radius && !this.missions.extractionActive) {
      this.missions.startExtraction(nearExt.point);
      this.audio.playRadioBeep();
      this.pushFeed(`EXTRAÇÃO SOLICITADA: ${nearExt.point.name} — MANTENHA POSIÇÃO!`, 'mission');
      return;
    }

    // 3. Check Mission Terminals
    for (const term of this.world.terminals) {
      if (!term.used && term.position.distanceTo(this.player.position) < 3.6) {
        term.used = true;
        this.audio.playRadioBeep();
        this.inventory.addItem(createInventoryEntry('val_intel', 1));
        const done = this.missions.recordObjectiveAction(term.missionId, 1);
        if (done) this.onMissionCompleted(done.title, done.rewardCredits, done.rewardXp);
        else this.pushFeed(`Objetivo concluído: ${term.label}`, 'mission');
        return;
      }
    }

    // 4. Check Loot Containers
    const nearLoot = this.loot.findNearestInteractable(this.player.position, 3.4);
    if (nearLoot) {
      this.openContainerId = nearLoot.id;
      this.audio.playLootPickup();
      this.setPhase('inventory');
      return;
    }

    // 5. Check Nearby Vehicle
    const nearVeh = this.vehicles.findNearestVehicle(this.player.position, 4.6);
    if (nearVeh) {
      this.vehicles.enterVehicle(nearVeh);
      this.weapons.weaponRoot.visible = false;
      this.pushFeed(`Dirigindo: ${nearVeh.spec.name}`, 'system');
      return;
    }
  }

  private handleThrowGrenade() {
    if (this.vehicles.activeVehicle) return;
    if (!this.inventory.consumeItem('grenade_frag', 1)) {
      this.pushFeed('Sem granadas no inventário', 'system');
      return;
    }
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = this.camera.position.clone().addScaledVector(dir, 0.7);
    this.weapons.throwGrenade(origin, dir);
    this.audio.playReload('start');
    this.pushFeed('Granada M67 lançada!', 'alert');
  }

  private handleQuickHeal() {
    if (this.player.health >= this.player.maxHealth) return;
    if (this.inventory.consumeItem('med_ifak', 1)) {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 65);
      this.audio.playLootPickup();
      this.pushFeed('Kit IFAK aplicado (+65 HP)', 'loot');
    } else if (this.inventory.consumeItem('med_bandage', 1)) {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 25);
      this.audio.playLootPickup();
      this.pushFeed('Bandagem aplicada (+25 HP)', 'loot');
    } else if (this.inventory.consumeItem('med_painkiller', 1)) {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 15);
      this.player.stamina = this.player.maxStamina;
      this.audio.playLootPickup();
      this.pushFeed('Analgésico utilizado (+15 HP / +Stamina)', 'loot');
    } else {
      this.pushFeed('Sem itens médicos disponíveis', 'system');
    }
  }

  private handleThrowDistraction() {
    if (this.vehicles.activeVehicle) return;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const landPos = this.player.position.clone().addScaledVector(dir, 18);
    landPos.y = this.terrain.getHeightAt(landPos.x, landPos.z, this.player.position.y);
    this.audio.playImpact('concrete', landPos);
    this.enemies.notifySound(landPos, 32, false);
    this.pushFeed('Objeto lançado para distrair patrulhas', 'system');
  }

  private applyPlayerDamage(
    amount: number,
    sourcePos: THREE.Vector3,
    reason: string,
    killerName = 'Soldado Inimigo',
    killerWeapon = 'Rifle de assalto'
  ) {
    if (this.phase !== 'playing') return;
    let remaining = amount;

    // Armor absorption
    if (this.inventory.equipment.armorDurability > 0) {
      const absorbed = Math.min(this.inventory.equipment.armorDurability, remaining * 0.58);
      this.inventory.equipment.armorDurability = Math.max(0, this.inventory.equipment.armorDurability - absorbed);
      remaining -= absorbed;
    }

    this.player.health = Math.max(0, this.player.health - remaining);
    this.damageFlash = Math.min(1, this.damageFlash + 0.65);
    this.cameraShake = Math.min(0.6, this.cameraShake + 0.25);

    // Directional damage indicator angle relative to player heading
    const dx = sourcePos.x - this.player.position.x;
    const dz = sourcePos.z - this.player.position.z;
    const worldAngle = Math.atan2(dx, -dz);
    this.damageIndicatorAngle = worldAngle + this.player.yaw;
    this.damageIndicatorTimer = 1.4;

    if (this.player.health <= 0) {
      this.deathReason = reason;
      this.killedBy = killerName;
      this.killedByWeapon = killerWeapon;
      this.killedDistanceMeters = Math.max(1, Math.round(sourcePos.distanceTo(this.player.position)));
      this.spectatorOrbitAngle = this.player.yaw;
      this.spectatorTargetIndex = 0;
      this.missions.cancelExtraction();
      this.setPhase('dead');
    }
  }

  private onMissionCompleted(title: string, credits: number, xp: number) {
    this.credits += credits;
    this.xp += xp;
    this.audio.playRadioBeep();
    this.pushFeed(`MISSÃO CONCLUÍDA: ${title} (+$${credits} / +${xp} XP)`, 'mission');
    this.saveCurrentGame(true);
  }

  private pushFeed(text: string, accent: KillFeedEntry['accent']) {
    this.feed.unshift({ id: this.feedCounter++, text, accent, timestamp: performance.now() });
    if (this.feed.length > 5) this.feed.pop();
  }

  private computeInteractionPrompt(): string | null {
    if (this.isTrainingMode && this.trainingRange.isNearWeaponBench(this.player.position)) {
      return '[E] Bancada de Armamento — Trocar Arma · [B] Reiniciar Alvos';
    }
    if (this.vehicles.activeVehicle) {
      return `[E] Sair de ${this.vehicles.activeVehicle.spec.name} · [C] Câmera · [F] Faróis`;
    }
    const nearExt = this.missions.getNearestExtractionPoint(this.player.position);
    if (nearExt && nearExt.dist < nearExt.point.radius && !this.missions.extractionActive) {
      return `[E] Solicitar Extração — ${nearExt.point.name}`;
    }
    for (const term of this.world.terminals) {
      if (!term.used && term.position.distanceTo(this.player.position) < 3.6) {
        return `[E] ${term.label}`;
      }
    }
    const nearLoot = this.loot.findNearestInteractable(this.player.position, 3.4);
    if (nearLoot) {
      return `[E] Saquear ${nearLoot.name} (${nearLoot.items.length} itens)`;
    }
    const nearVeh = this.vehicles.findNearestVehicle(this.player.position, 4.6);
    if (nearVeh) {
      return `[E] Entrar em ${nearVeh.spec.name}`;
    }
    return null;
  }

  private startLoop() {
    this.lastTime = performance.now();
    const tick = () => {
      if (this.disposed) return;

      const now = performance.now();
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      // FPS tracker
      this.fpsAccum += rawDt;
      this.fpsFrames++;
      if (this.fpsAccum >= 0.5) {
        this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
        this.fpsAccum = 0;
        this.fpsFrames = 0;
      }

      if (this.phase === 'title') {
        this.updateTitleFlyover(dt);
      } else if (this.phase === 'dead') {
        this.updateDeadSpectatorCamera(dt);
      } else if (this.phase === 'playing') {
        if (this.hitstopTimer > 0) {
          this.hitstopTimer -= dt;
        } else {
          this.updateGameplay(dt);
        }
      }

      if (this.world.lastAtmosphere) {
        this.renderPipeline.updateAtmosphere(this.world.lastAtmosphere, this.world.lastWeatherDim, dt);
      }
      this.renderPipeline.render();

      // Emit throttled HUD snapshot (~16 Hz)
      this.hudEmitAccum += dt;
      if (this.hudEmitAccum >= 0.06) {
        this.hudEmitAccum = 0;
        this.emitHud();
      }

      // Schedule next frame: use GPU fence sync + 80ms pause on software WebGL
      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = requestAnimationFrame(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updatePlayerBodyVisual(dt: number, moveSpeedRatio: number) {
    if (this.phase === 'title' || this.vehicles.activeVehicle) {
      this.playerBody.group.visible = false;
      return;
    }

    if (this.phase === 'dead') {
      // Reveal full 3D Special Ops operator (balaclava, assault backpack w/ OPO patch, weapon) on death camera
      this.playerBody.group.visible = true;
      this.playerBody.setFirstPersonMode(false);
      this.playerBody.group.position.set(
        this.player.position.x,
        this.player.position.y + 0.16,
        this.player.position.z
      );
      this.playerBody.group.rotation.set(-Math.PI * 0.48, this.player.yaw, 0);
      this.playerBody.leftLeg.rotation.x = 0.14;
      this.playerBody.rightLeg.rotation.x = -0.08;
      this.playerBody.leftShin.rotation.x = 0.22;
      this.playerBody.rightShin.rotation.x = 0.28;
      this.playerBody.upperBody.rotation.set(0.06, 0, 0);
      return;
    }

    // First-person grounded operator body: visible urban-camo legs, duty belt, thigh chemlights,
    // knee pads, ribbed shin guards & combat boots when looking down + realistic human shadow!
    this.playerBody.group.visible = true;
    this.playerBody.setFirstPersonMode(true);

    const backOffset = this.player.crouching ? 0.22 : 0.17;
    const bx = this.player.position.x + Math.sin(this.player.yaw) * backOffset;
    const bz = this.player.position.z + Math.cos(this.player.yaw) * backOffset;
    const crouchDrop = this.player.crouching ? 0.34 : 0;
    this.playerBody.group.position.set(bx, this.player.position.y - crouchDrop, bz);
    this.playerBody.group.rotation.set(0, this.player.yaw, 0);

    if (moveSpeedRatio > 0.05) {
      this.playerWalkPhase += dt * (this.player.sprinting ? 11.5 : 7.8) * Math.min(1.2, moveSpeedRatio);
    }
    const stride =
      moveSpeedRatio > 0.05
        ? Math.sin(this.playerWalkPhase) * (this.player.sprinting ? 0.56 : 0.38) * Math.min(1, moveSpeedRatio)
        : 0;
    const crouchHip = this.player.crouching ? -0.48 : 0;
    const crouchKnee = this.player.crouching ? 0.88 : 0;

    this.playerBody.leftLeg.rotation.x = THREE.MathUtils.damp(
      this.playerBody.leftLeg.rotation.x,
      crouchHip + stride,
      14,
      dt
    );
    this.playerBody.rightLeg.rotation.x = THREE.MathUtils.damp(
      this.playerBody.rightLeg.rotation.x,
      crouchHip - stride,
      14,
      dt
    );
    this.playerBody.leftShin.rotation.x = THREE.MathUtils.damp(
      this.playerBody.leftShin.rotation.x,
      crouchKnee + Math.max(0, -stride * 0.85),
      14,
      dt
    );
    this.playerBody.rightShin.rotation.x = THREE.MathUtils.damp(
      this.playerBody.rightShin.rotation.x,
      crouchKnee + Math.max(0, stride * 0.85),
      14,
      dt
    );
    this.playerBody.upperBody.rotation.set(this.player.crouching ? -0.18 : 0, 0, 0);
  }

  private updateTitleFlyover(dt: number) {
    this.titleOrbitAngle += dt * 0.065;
    const r = 98;
    const cx = Math.cos(this.titleOrbitAngle) * r;
    const cz = Math.sin(this.titleOrbitAngle) * r - 25;
    const groundY = this.terrain.getHeightAt(cx, cz);
    this.camera.position.set(cx, groundY + 18 + Math.sin(this.titleOrbitAngle * 1.4) * 3.5, cz);
    this.camera.lookAt(-8, 9, -28);
    this.weapons.weaponRoot.visible = false;
    this.updatePlayerBodyVisual(dt, 0);
    this.world.updateAtmosphere(dt * 0.3, new THREE.Vector3(0, 0, -25));
  }

  private updateDeadSpectatorCamera(dt: number) {
    this.spectatorOrbitAngle += dt * 0.24;
    this.weapons.weaponRoot.visible = false;
    this.updatePlayerBodyVisual(dt, 0);

    // Collect live nearby hostiles so ASSISTIR COMBATE can cycle real battlefield targets
    const aliveUnits = Array.from(this.enemies.enemies.values()).filter(
      (u) => u.state !== 'DEAD' && u.position.distanceTo(this.player.position) < 220
    );

    let focusX = this.player.position.x;
    let focusY = this.player.position.y + 1.4;
    let focusZ = this.player.position.z;
    let radius = 16;

    if (aliveUnits.length > 0 && this.spectatorTargetIndex % (aliveUnits.length + 1) !== 0) {
      const unit = aliveUnits[(this.spectatorTargetIndex - 1) % aliveUnits.length];
      focusX = unit.position.x;
      focusY = unit.position.y + 1.6;
      focusZ = unit.position.z;
      radius = 12;
      const classLabel = this.getEnemyClassLabel(unit.enemyClass).name;
      this.spectatorLabel = `${classLabel} · ${getRegionAt(focusX, focusZ).name}`;
    } else {
      this.spectatorLabel = `Local da Eliminação · ${getRegionAt(focusX, focusZ).name}`;
    }

    const camX = focusX + Math.cos(this.spectatorOrbitAngle) * radius;
    const camZ = focusZ + Math.sin(this.spectatorOrbitAngle) * radius;
    const groundY = this.terrain.getSurfaceHeightAt(camX, camZ);
    const camY = Math.max(groundY + 4.5, focusY + 6.5);

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, camX, 3.5, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, camY, 3.5, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, camZ, 3.5, dt);
    this.camera.lookAt(focusX, focusY, focusZ);
    this.world.updateAtmosphere(dt * 0.5, this.camera.position);
  }

  private getEnemyClassLabel(cls: EnemyClass): { name: string; weapon: string } {
    switch (cls) {
      case 'sniper':
        return { name: 'Sniper Inimigo', weapon: 'Rifle de precisão 7.62mm' };
      case 'elite':
        return { name: 'Operador de Elite', weapon: 'Carabina Tática M4' };
      case 'heavy':
        return { name: 'Soldado Blindado', weapon: 'Carabina VSK-94 Silenciada' };
      case 'guard':
        return { name: 'Guarda de Setor', weapon: 'Submetralhadora MP5' };
      default:
        return { name: 'Soldado Inimigo', weapon: 'Rifle de assalto' };
    }
  }

  private updateGameplay(dt: number) {
    this.operationDurationSec += dt;
    // Decay visual combat feedback timers
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
      if (this.hitmarkerTimer <= 0) this.hitmarkerType = 'none';
    }
    if (this.damageIndicatorTimer > 0) {
      this.damageIndicatorTimer -= dt;
      if (this.damageIndicatorTimer <= 0) this.damageIndicatorAngle = null;
    }
    this.damageFlash = THREE.MathUtils.damp(this.damageFlash, 0, 5.5, dt);
    this.suppressionLevel = THREE.MathUtils.damp(this.suppressionLevel, 0, 2.2, dt);
    this.cameraShake = THREE.MathUtils.damp(this.cameraShake, 0, 9.5, dt);

    _shakeVec.set(
      (Math.random() - 0.5) * this.cameraShake * 0.22,
      (Math.random() - 0.5) * this.cameraShake * 0.22,
      0
    );

    // Recoil recovery
    this.weapons.recoilPitchOffset = THREE.MathUtils.damp(this.weapons.recoilPitchOffset, 0, 10, dt);
    this.weapons.recoilYawOffset = THREE.MathUtils.damp(this.weapons.recoilYawOffset, 0, 10, dt);

    let moveSpeedRatio = 0;
    let vehicleSpeedRatio = 0;
    let roadkillPos: THREE.Vector3 | undefined;

    if (this.vehicles.activeVehicle) {
      const vehRes = this.vehicles.update(
        dt,
        {
          forward: this.heldKeys.has('KeyW'),
          backward: this.heldKeys.has('KeyS'),
          left: this.heldKeys.has('KeyA'),
          right: this.heldKeys.has('KeyD'),
          brake: this.heldKeys.has('Space'),
        },
        this.camera
      );
      vehicleSpeedRatio = vehRes.speedRatio;
      roadkillPos = vehRes.roadkillPos;
      this.player.position.copy(this.vehicles.activeVehicle.position);
      this.player.yaw = this.vehicles.activeVehicle.yaw;
      if (vehicleSpeedRatio > 0.25) {
        this.enemies.notifySound(this.player.position, 58, false);
      }
    } else {
      // Update idle vehicles so physics settle
      this.vehicles.update(
        dt,
        { forward: false, backward: false, left: false, right: false, brake: false },
        this.camera
      );

      const weightRatio = this.inventory.getCurrentWeight() / this.inventory.getMaxWeight();
      const overweightFactor = weightRatio > 0.9 ? 0.82 : 1.0;

      const moveRes = this.player.update(
        dt,
        {
          forward: this.heldKeys.has('KeyW'),
          backward: this.heldKeys.has('KeyS'),
          left: this.heldKeys.has('KeyA'),
          right: this.heldKeys.has('KeyD'),
          sprint: this.heldKeys.has('ShiftLeft') || this.heldKeys.has('ShiftRight'),
          crouchHold: this.heldKeys.has('ControlLeft') || this.heldKeys.has('ControlRight'),
          jumpJustPressed: this.jumpJustPressed,
        },
        this.camera,
        this.weapons.recoilPitchOffset,
        this.weapons.recoilYawOffset,
        _shakeVec,
        overweightFactor,
        (pos, radius) => this.enemies.notifySound(pos, radius, false)
      );
      moveSpeedRatio = moveRes.moveSpeedRatio;

      // Subtle ground dust puffs kicked up when sprinting across soil/sand/asphalt
      if (this.player.sprinting && moveSpeedRatio > 0.65 && this.player.position.y > -1.5) {
        this.sprintDustAccum += dt;
        if (this.sprintDustAccum >= 0.36) {
          this.sprintDustAccum = 0;
          this.weapons.spawnDustPuff(
            new THREE.Vector3(this.player.position.x, this.player.position.y + 0.14, this.player.position.z),
            0.78,
            0x9e8f75
          );
        }
      } else {
        this.sprintDustAccum = 0.2;
      }

      // Weapon fire & viewmodel update
      const activeWpn = this.inventory.getActiveWeapon();
      if (activeWpn && (this.fireHeld || this.fireJustPressed)) {
        this.weapons.triggerFire(
          activeWpn,
          this.fireJustPressed,
          this.fireHeld,
          moveSpeedRatio > 0.12,
          this.player.crouching,
          this.player.position
        );
      }
      const reserve = activeWpn
        ? this.isTrainingMode
          ? 999
          : this.inventory.getReserveAmmo(WEAPONS[activeWpn.weaponId].caliber)
        : 0;
      this.weapons.update(
        dt,
        activeWpn,
        reserve,
        (cal, needed) => (this.isTrainingMode ? needed : this.inventory.consumeAmmo(cal, needed)),
        moveSpeedRatio,
        this.player.sprinting,
        this.player.crouching,
        this.player.position,
        this.settings.fov
      );
    }

    // Sync 3D player operator body (visible legs/gear/shadow in 1P, hidden in vehicles)
    this.updatePlayerBodyVisual(dt, moveSpeedRatio);

    // Clear edge-triggered inputs
    this.jumpJustPressed = false;
    this.fireJustPressed = false;

    // Stream open-world sectors & update weather/day-night/security cameras
    this.world.updateStreaming(this.player.position);
    this.world.updateAtmosphere(dt, this.player.position, (camPos) => {
      this.audio.playAlarm(camPos);
      this.enemies.notifySound(this.player.position, 85, true);
      this.pushFeed('ALERTA: DETECTADO POR CÂMERA DE SEGURANÇA!', 'alert');
    });

    // Compute player stealth visibility factor (night + crouch + flashlight off = stealthy!)
    const isNight = this.world.timeOfDay < 6 || this.world.timeOfDay > 19.5;
    let stealthFactor = 1.0;
    if (this.vehicles.activeVehicle) stealthFactor = 1.4;
    else {
      if (this.player.crouching) stealthFactor *= 0.56;
      if (this.player.sprinting) stealthFactor *= 1.25;
      if (isNight && !this.player.flashlightOn) stealthFactor *= 0.65;
      if (this.world.weather === 'fog' || this.world.weather === 'rain') stealthFactor *= 0.78;
    }
    this.stealthVisibility = Math.round(THREE.MathUtils.clamp(stealthFactor * 68, 12, 100));

    // Update Training Range reactive targets OR open-world Enemy AI
    if (this.isTrainingMode) {
      this.trainingRange.update(dt);
      this.maxEnemyAlert = 0;
      this.inCombatCount = 0;
    } else {
      const aiRes = this.enemies.update(dt, this.player.position, stealthFactor, roadkillPos);
      this.maxEnemyAlert = aiRes.maxAlert;
      this.inCombatCount = aiRes.inCombatCount;

      for (const ev of aiRes.fireEvents) {
        this.weapons.spawnEnemyTracer(ev.origin, ev.target);
        this.suppressionLevel = Math.min(1, this.suppressionLevel + ev.suppression);
        if (!ev.hitPlayer && ev.suppression > 0.08) {
          this.audio.playBulletWhiz(ev.target);
        }
        if (ev.hitPlayer) {
          if (this.vehicles.activeVehicle) {
            this.vehicles.damageVehicle(this.vehicles.activeVehicle.id, ev.damage * 0.5);
            this.cameraShake = Math.min(0.4, this.cameraShake + 0.12);
          } else {
            const killerMeta = this.getEnemyClassLabel(ev.shooterClass);
            this.applyPlayerDamage(
              ev.damage,
              ev.origin,
              'Eliminado em combate por forças hostis',
              killerMeta.name,
              killerMeta.weapon
            );
          }
        }
      }

      // Roadkill loot corpses
      for (const deadUnit of aiRes.newlyDead) {
        if (roadkillPos) {
          this.kills++;
          this.xp += 100;
          this.pushFeed('HOSTIL NEUTRALIZADO POR VEÍCULO (+100 XP)', 'kill');
          const completed = this.missions.recordEnemyKill(deadUnit.regionId);
          for (const m of completed) this.onMissionCompleted(m.title, m.rewardCredits, m.rewardXp);
        }
      }
    }

    // Update active Extraction countdown
    if (this.missions.extractionActive) {
      const extRes = this.missions.updateExtraction(dt, this.player.position);
      if (extRes.interrupted) {
        this.pushFeed('EXTRAÇÃO INTERROMPIDA — VOCÊ SAIU DA ZONA DE POUSO!', 'alert');
      } else if (extRes.spawnWave && this.missions.activeExtractionPoint) {
        const ep = this.missions.activeExtractionPoint;
        this.enemies.spawnExtractionWave(
          new THREE.Vector3(ep.x, this.terrain.getSurfaceHeightAt(ep.x, ep.z), ep.z),
          ep.regionId
        );
        this.audio.playAlarm(this.player.position);
        this.pushFeed('ATENÇÃO: FORÇAS HOSTIS SE APROXIMANDO DA ZONA DE EXTRAÇÃO!', 'alert');
      } else if (extRes.completed) {
        this.lastExtractedLootValue = this.inventory.extractAllToStash();
        this.credits += this.lastExtractedLootValue;
        this.xp += 500;
        this.saveCurrentGame(true);
        this.setPhase('extracted');
      }
    }

    // Update spatial audio listener & weather/vehicle/combat audio
    this.camera.getWorldDirection(_camForward);
    _camUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.audio.updateListener(this.camera.position, _camForward, _camUp);
    this.audio.updateEnvironmentAudio(
      this.world.weather,
      this.inCombatCount > 0 ? 1 : this.maxEnemyAlert / 100,
      Boolean(this.vehicles.activeVehicle),
      vehicleSpeedRatio
    );

    // Periodic silent autosave every 45s
    this.autosaveAccum += dt;
    if (this.autosaveAccum >= 45) {
      this.autosaveAccum = 0;
      this.saveCurrentGame(true);
    }
  }

  private buildMinimapEntities(): MinimapEntity[] {
    const list: MinimapEntity[] = [];
    for (const ep of this.missions.extractionPoints) {
      list.push({ x: ep.x, z: ep.z, type: 'extraction', label: ep.name });
    }
    for (const v of this.vehicles.vehicles) {
      if (!v.destroyed) list.push({ x: v.position.x, z: v.position.z, type: 'vehicle' });
    }
    const tracked = this.missions.missions.find((m) => m.id === this.missions.trackedMissionId && !m.completed);
    if (tracked) {
      list.push({ x: tracked.targetX, z: tracked.targetZ, type: 'mission', label: tracked.title });
    }
    for (const u of this.enemies.enemies.values()) {
      if (u.state === 'DEAD') continue;
      const dist = u.position.distanceTo(this.player.position);
      if (dist < 130 && (u.state === 'COMBAT' || u.state === 'INVESTIGATE' || dist < 42)) {
        list.push({
          x: u.position.x,
          z: u.position.z,
          type: 'enemy',
          alerted: u.state === 'COMBAT',
        });
      }
    }
    return list;
  }

  public emitHud() {
    const activeWpn = this.inventory.getActiveWeapon();
    const spec = activeWpn ? WEAPONS[activeWpn.weaponId] : null;
    const reserve = spec ? this.inventory.getReserveAmmo(spec.caliber) : 0;
    const region = getRegionAt(this.player.position.x, this.player.position.z, this.player.position.y);

    const baseSpread = spec ? THREE.MathUtils.lerp(spec.hipSpread, spec.adsSpread, this.weapons.adsBlend) : 0.02;
    const spreadPx = Math.round((baseSpread + this.weapons.dynamicSpread) * 760);

    const veh = this.vehicles.activeVehicle;
    const state: HUDState = {
      phase: this.phase,
      pointerLocked: this.pointerLocked,
      health: Math.round(this.player.health),
      maxHealth: this.player.maxHealth,
      armor: Math.round(this.inventory.equipment.armorDurability),
      maxArmor: this.inventory.equipment.maxArmorDurability,
      stamina: Math.round(this.player.stamina),
      maxStamina: this.player.maxStamina,
      crouching: this.player.crouching,
      sprinting: this.player.sprinting,
      aiming: this.weapons.aiming && this.weapons.adsBlend > 0.3,
      hasScopeOverlay: Boolean(spec?.hasScopeOverlay && this.weapons.adsBlend > 0.72),
      reloading: this.weapons.reloading,
      reloadProgress: this.weapons.reloading
        ? 1 - this.weapons.reloadTimer / Math.max(0.01, this.weapons.reloadDuration)
        : 0,
      flashlightOn: this.player.flashlightOn,
      stealthVisibility: this.stealthVisibility,
      alertLevel: this.inCombatCount > 0 ? 'COMBATE' : this.maxEnemyAlert > 25 ? 'SUSPEITA' : 'OCULTO',
      maxEnemyAlert: Math.round(this.maxEnemyAlert),
      spreadPx,
      hitmarkerType: this.hitmarkerType,
      damageIndicatorAngle: this.damageIndicatorAngle,
      damageFlash: this.damageFlash,
      suppressionLevel: this.suppressionLevel,
      playerX: Math.round(this.player.position.x),
      playerY: Math.round(this.player.position.y),
      playerZ: Math.round(this.player.position.z),
      playerYaw: this.player.yaw,
      currentRegion: region,
      weather: this.world.weather,
      timeOfDay: this.world.timeOfDay,
      activeWeapon: activeWpn ? { ...activeWpn } : null,
      activeWeaponSpec: spec,
      reserveAmmo: this.isTrainingMode ? 999 : reserve,
      equipment: {
        ...this.inventory.equipment,
        slots: [...this.inventory.equipment.slots] as HUDState['equipment']['slots'],
      },
      inventory: this.inventory.items.map((i) => ({ ...i })),
      inventoryWeight: this.inventory.getCurrentWeight(),
      maxWeight: this.inventory.getMaxWeight(),
      grenadeCount: this.inventory.getItemCount('grenade_frag'),
      medkitCount:
        this.inventory.getItemCount('med_ifak') +
        this.inventory.getItemCount('med_bandage') +
        this.inventory.getItemCount('med_painkiller'),
      credits: this.credits,
      xp: this.xp,
      rank: Math.floor(this.xp / 500) + 1,
      kills: this.kills,
      headshots: this.headshots,
      lootValue: this.inventory.getTotalLootValue(),
      interactionPrompt: this.phase === 'playing' ? this.computeInteractionPrompt() : null,
      openContainer: this.openContainerId ? this.loot.getSnapshot(this.openContainerId) : null,
      inVehicle: Boolean(veh),
      vehicleName: veh ? veh.spec.name : '',
      vehicleSpeedKmh: veh ? Math.round(Math.abs(veh.speed) * 3.6) : 0,
      vehicleFuel: veh ? Math.round(veh.fuel) : 0,
      vehicleMaxFuel: veh ? veh.spec.maxFuel : 100,
      vehicleHealth: veh ? Math.round(veh.health) : 0,
      vehicleMaxHealth: veh ? veh.spec.maxHealth : 100,
      missions: this.missions.missions.map((m) => ({ ...m })),
      trackedMissionId: this.missions.trackedMissionId,
      extractionActive: this.missions.extractionActive,
      extractionName: this.missions.activeExtractionPoint?.name ?? '',
      extractionTimer: Math.ceil(this.missions.extractionTimer),
      extractionTotalTime: this.missions.extractionTotalTime,
      extractionPoints: this.missions.extractionPoints,
      minimapEntities: this.isTrainingMode ? [] : this.buildMinimapEntities(),
      minimapMap: this.isTrainingMode ? null : this.world.getActiveMinimapData(),
      feed: this.feed.filter((f) => performance.now() - f.timestamp < 5500),
      loadedSectorsCount: this.world.sectors.size,
      fps: this.currentFps,
      stashedItemsCount: this.inventory.stash.length,
      stashedValue: this.inventory.getStashValue(),
      hasSavedGame: this.hasSavedGame,
      lastExtractedLootValue: this.lastExtractedLootValue,
      deathReason: this.deathReason,
      killedBy: this.killedBy,
      killedByWeapon: this.killedByWeapon,
      killedDistanceMeters: this.killedDistanceMeters,
      operationDurationSec: Math.floor(this.operationDurationSec),
      lootCollectedCount: this.lootCollectedCount,
      spectatorLabel: this.spectatorLabel,
      isTrainingMode: this.isTrainingMode,
      trainingHits: this.trainingRange.getStats().hits,
      trainingHeadshots: this.trainingRange.getStats().headshots,
      trainingShots: this.trainingRange.getStats().shots,
      trainingLastDist: this.trainingRange.getStats().lastDist,
      trainingStreak: this.trainingRange.getStats().streak,
    };

    this.onHudUpdate(state);
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
    this.renderer.domElement.removeEventListener('mousedown', this.handleMouseDown);
    this.renderer.domElement.removeEventListener('contextmenu', this.handleContextMenu);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);

    this.trainingRange.dispose();
    this.world.dispose();
    this.enemies.dispose();
    this.vehicles.dispose();
    this.weapons.dispose();
    this.loot.dispose();
    this.textures.dispose();
    this.audio.dispose();
    this.renderPipeline.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
