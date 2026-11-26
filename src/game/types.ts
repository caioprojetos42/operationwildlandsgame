export type GamePhase =
  | 'title'
  | 'playing'
  | 'paused'
  | 'inventory'
  | 'map'
  | 'dead'
  | 'extracted';

export type WeaponId =
  | 'ar15'
  | 'ak74'
  | 'm4a1'
  | 'g36'
  | 'mp5'
  | 'mp7'
  | 'ump45'
  | 'm24'
  | 'm700'
  | 'scarh'
  | 'fal'
  | 'm870'
  | 'saiga12'
  | 'glock17'
  | 'm1911';

export type WeaponCategory =
  | 'assault'
  | 'smg'
  | 'sniper'
  | 'battle_rifle'
  | 'shotgun'
  | 'pistol';

export type AmmoCaliber =
  | '5.56x45'
  | '5.45x39'
  | '7.62x51'
  | '9x19'
  | '45acp'
  | '12gauge';

export type FireMode = 'AUTO' | 'SEMI' | 'BURST';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  category: WeaponCategory;
  caliber: AmmoCaliber;
  damage: number;
  headshotMult: number;
  rpm: number;
  magSize: number;
  reloadTime: number;
  range: number;
  muzzleVelocity: number; // m/s; < 600 uses physical ballistic drop
  bulletDrop: number;
  recoilPitch: number;
  recoilYaw: number;
  hipSpread: number;
  adsSpread: number;
  moveSpreadMult: number;
  pellets: number;
  fireModes: FireMode[];
  adsFov: number;
  hasScopeOverlay: boolean;
  suppressedByDefault?: boolean;
  canSuppress: boolean;
  weight: number;
  value: number;
  rarity: ItemRarity;
  description: string;
  // Visual proportions for procedural 3D model
  colorPrimary: number;
  colorSecondary: number;
  barrelLength: number;
  stockStyle: 'tactical' | 'wood' | 'folding' | 'sniper' | 'none';
  magStyle: 'curved' | 'straight' | 'box' | 'tube' | 'pistol';
  opticStyle: 'holo' | 'acog' | 'sniper' | 'iron';
}

export interface WeaponRuntimeState {
  weaponId: WeaponId;
  ammoInMag: number;
  fireModeIndex: number;
  suppressed: boolean;
}

export type ItemCategory =
  | 'weapon'
  | 'ammo'
  | 'armor'
  | 'helmet'
  | 'backpack'
  | 'medical'
  | 'throwable'
  | 'valuable'
  | 'key'
  | 'attachment'
  | 'supply';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface ItemTemplate {
  id: string;
  name: string;
  category: ItemCategory;
  weight: number;
  rarity: ItemRarity;
  value: number;
  description: string;
  stackable: boolean;
  maxStack: number;
  weaponId?: WeaponId;
  caliber?: AmmoCaliber;
  armorProtection?: number; // 0-100 max armor
  helmetReduction?: number; // 0-0.5 headshot reduction
  backpackCapacity?: number; // kg added
  healAmount?: number;
  staminaRestore?: number;
  iconKey: string;
}

export interface InventoryEntry {
  uid: string;
  templateId: string;
  quantity: number;
  ammoInMag?: number;
  suppressed?: boolean;
}

export interface EquipmentState {
  slots: [WeaponRuntimeState | null, WeaponRuntimeState | null, WeaponRuntimeState | null, WeaponRuntimeState | null];
  activeSlot: number; // 0..3
  armorId: string | null;
  armorDurability: number;
  maxArmorDurability: number;
  helmetId: string | null;
  backpackId: string | null;
}

export type RegionId =
  | 'blacksite'
  | 'desert_outpost'
  | 'industrial_valley'
  | 'abandoned_city'
  | 'mountain_range'
  | 'rural_settlement'
  | 'underground_facility';

export interface RegionInfo {
  id: RegionId;
  name: string;
  subtitle: string;
  centerX: number;
  centerZ: number;
  radius: number;
  threatLevel: 'BAIXA' | 'MÉDIA' | 'ALTA' | 'EXTREMA';
  biome: 'military' | 'desert' | 'industrial' | 'urban' | 'mountain' | 'rural' | 'underground';
  color: string;
}

export interface PointOfInterest {
  id: string;
  name: string;
  regionId: RegionId;
  x: number;
  z: number;
  type: 'base' | 'outpost' | 'industrial' | 'city' | 'comms' | 'village' | 'bunker' | 'extraction';
}

export type EnemyClass =
  | 'infantry'
  | 'sniper'
  | 'elite'
  | 'guard'
  | 'heavy';

export type EnemyAIState =
  | 'PATROL'
  | 'SUSPICIOUS'
  | 'INVESTIGATE'
  | 'COMBAT'
  | 'SEEK_COVER'
  | 'RETREAT'
  | 'DEAD';

export type VehicleType =
  | 'military_car'
  | 'jeep'
  | 'pickup'
  | 'cargo_truck'
  | 'apc';

export interface VehicleSpec {
  type: VehicleType;
  name: string;
  maxSpeed: number; // m/s
  reverseSpeed: number;
  acceleration: number;
  turnSpeed: number;
  maxHealth: number;
  maxFuel: number;
  fuelBurnRate: number;
  length: number;
  width: number;
  height: number;
  color: number;
}

export type MissionType =
  | 'eliminate'
  | 'intel'
  | 'destroy'
  | 'supply'
  | 'investigate'
  | 'defend'
  | 'extract';

export interface MissionState {
  id: string;
  title: string;
  description: string;
  regionId: RegionId;
  type: MissionType;
  targetX: number;
  targetZ: number;
  targetCount: number;
  progress: number;
  rewardCredits: number;
  rewardXp: number;
  completed: boolean;
  active: boolean;
}

export interface ExtractionPointState {
  id: string;
  name: string;
  regionId: RegionId;
  x: number;
  z: number;
  radius: number;
}

export interface LootContainerSnapshot {
  id: string;
  name: string;
  type: string;
  items: InventoryEntry[];
}

export type WeatherType = 'clear' | 'overcast' | 'fog' | 'rain';
export type GraphicsPreset = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';

export interface GameSettings {
  graphicsPreset: GraphicsPreset;
  renderDistanceChunks: number; // 1 to 4 chunks around player
  resolutionScale: number; // 0.6 to 1.0
  mouseSensitivity: number; // 0.2 to 2.5
  fov: number; // 65 to 105
  masterVolume: number; // 0 to 1
  sfxVolume: number; // 0 to 1
  ambientVolume: number; // 0 to 1
  muted: boolean;
  invertY: boolean;
}

export interface KillFeedEntry {
  id: number;
  text: string;
  accent: 'kill' | 'headshot' | 'loot' | 'mission' | 'alert' | 'system';
  timestamp: number;
}

export interface MinimapEntity {
  x: number;
  z: number;
  type: 'enemy' | 'vehicle' | 'extraction' | 'mission' | 'loot' | 'poi';
  alerted?: boolean;
  label?: string;
}

export interface HUDState {
  phase: GamePhase;
  pointerLocked: boolean;
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  stamina: number;
  maxStamina: number;
  crouching: boolean;
  sprinting: boolean;
  aiming: boolean;
  hasScopeOverlay: boolean;
  reloading: boolean;
  reloadProgress: number;
  flashlightOn: boolean;
  stealthVisibility: number; // 0..100
  alertLevel: 'OCULTO' | 'SUSPEITA' | 'COMBATE';
  maxEnemyAlert: number; // 0..100
  spreadPx: number;
  hitmarkerType: 'none' | 'body' | 'head' | 'kill';
  damageIndicatorAngle: number | null;
  damageFlash: number;
  suppressionLevel: number;
  playerX: number;
  playerY: number;
  playerZ: number;
  playerYaw: number;
  currentRegion: RegionInfo;
  weather: WeatherType;
  timeOfDay: number; // 0..24 hours
  activeWeapon: WeaponRuntimeState | null;
  activeWeaponSpec: WeaponSpec | null;
  reserveAmmo: number;
  equipment: EquipmentState;
  inventory: InventoryEntry[];
  inventoryWeight: number;
  maxWeight: number;
  grenadeCount: number;
  medkitCount: number;
  credits: number;
  xp: number;
  rank: number;
  kills: number;
  headshots: number;
  lootValue: number;
  interactionPrompt: string | null;
  openContainer: LootContainerSnapshot | null;
  inVehicle: boolean;
  vehicleName: string;
  vehicleSpeedKmh: number;
  vehicleFuel: number;
  vehicleMaxFuel: number;
  vehicleHealth: number;
  vehicleMaxHealth: number;
  missions: MissionState[];
  trackedMissionId: string | null;
  extractionActive: boolean;
  extractionName: string;
  extractionTimer: number;
  extractionTotalTime: number;
  extractionPoints: ExtractionPointState[];
  minimapEntities: MinimapEntity[];
  feed: KillFeedEntry[];
  loadedSectorsCount: number;
  fps: number;
  stashedItemsCount: number;
  stashedValue: number;
  hasSavedGame: boolean;
  lastExtractedLootValue: number;
  deathReason: string;
  killedBy: string;
  killedByWeapon: string;
  killedDistanceMeters: number;
  operationDurationSec: number;
  lootCollectedCount: number;
  spectatorLabel: string;
  // Firing range (Treinamento) live metrics
  isTrainingMode: boolean;
  trainingHits: number;
  trainingHeadshots: number;
  trainingShots: number;
  trainingLastDist: number;
  trainingStreak: number;
}

export interface SaveData {
  version: number;
  savedAt: number;
  playerPos: { x: number; y: number; z: number; yaw: number };
  health: number;
  equipment: EquipmentState;
  inventory: InventoryEntry[];
  stash: InventoryEntry[];
  completedMissionIds: string[];
  missionProgress: Record<string, number>;
  credits: number;
  xp: number;
  kills: number;
  headshots: number;
  timeOfDay: number;
  weather: WeatherType;
  settings: GameSettings;
}

export type DeploymentMode = 'open_world' | 'desert_op' | 'night_raid' | 'training';

export interface DeploymentConfig {
  mode: DeploymentMode;
  primaryWeapon: WeaponId;
  secondaryWeapon: WeaponId;
  sidearmWeapon: WeaponId;
  armorId: string;
  helmetId: string;
  bonusItems: { templateId: string; quantity: number }[];
  bonusCredits?: number;
}
