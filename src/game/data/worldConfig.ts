import {
  ExtractionPointState,
  MissionState,
  PointOfInterest,
  RegionId,
  RegionInfo,
  VehicleSpec,
  VehicleType,
} from '../types';

export const WORLD_HALF_SIZE = 760; // 1520m x 1520m playable open world (+ outer mountains)
export const SECTOR_SIZE = 190; // 8x8 sectors

export const REGIONS: Record<RegionId, RegionInfo> = {
  blacksite: {
    id: 'blacksite',
    name: 'Blacksite Military Complex',
    subtitle: 'Complexo Militar Industrial — Setor Central',
    centerX: 0,
    centerZ: 0,
    radius: 210,
    threatLevel: 'ALTA',
    biome: 'military',
    color: '#8f9e73',
  },
  desert_outpost: {
    id: 'desert_outpost',
    name: 'Desert Outpost',
    subtitle: 'Postos de Controle e Planalto Árido — Leste',
    centerX: 400,
    centerZ: -80,
    radius: 230,
    threatLevel: 'MÉDIA',
    biome: 'desert',
    color: '#c9a66b',
  },
  industrial_valley: {
    id: 'industrial_valley',
    name: 'Industrial Valley',
    subtitle: 'Fábricas, Silos e Pátio Ferroviário — Oeste',
    centerX: -390,
    centerZ: -60,
    radius: 220,
    threatLevel: 'ALTA',
    biome: 'industrial',
    color: '#8d857b',
  },
  abandoned_city: {
    id: 'abandoned_city',
    name: 'Abandoned City',
    subtitle: 'Zona Urbana Ocupada — Norte',
    centerX: -40,
    centerZ: -410,
    radius: 210,
    threatLevel: 'ALTA',
    biome: 'urban',
    color: '#7f8c96',
  },
  mountain_range: {
    id: 'mountain_range',
    name: 'Mountain Range',
    subtitle: 'Cordilheira e Base de Comunicações — Nordeste',
    centerX: 350,
    centerZ: -430,
    radius: 230,
    threatLevel: 'EXTREMA',
    biome: 'mountain',
    color: '#6b8274',
  },
  rural_settlement: {
    id: 'rural_settlement',
    name: 'Rural Settlement',
    subtitle: 'Vila Agrícola, Fazendas e Posto — Sudoeste',
    centerX: -340,
    centerZ: 340,
    radius: 220,
    threatLevel: 'BAIXA',
    biome: 'rural',
    color: '#7e9960',
  },
  underground_facility: {
    id: 'underground_facility',
    name: 'Underground Facility',
    subtitle: 'Bunker Subterrâneo de Acesso Restrito',
    centerX: 95,
    centerZ: -115,
    radius: 42,
    threatLevel: 'EXTREMA',
    biome: 'underground',
    color: '#c76846',
  },
};

export const REGION_LIST: RegionInfo[] = Object.values(REGIONS);

export const POINTS_OF_INTEREST: PointOfInterest[] = [
  { id: 'poi_hangar_alpha', name: 'Hangares Blacksite Alpha', regionId: 'blacksite', x: -35, z: -20, type: 'base' },
  { id: 'poi_rail_yard', name: 'Estação Ferroviária Militar', regionId: 'blacksite', x: 55, z: 58, type: 'base' },
  { id: 'poi_admin_hq', name: 'Prédio de Comando HQ', regionId: 'blacksite', x: 0, z: -85, type: 'base' },
  { id: 'poi_bunker_entry', name: 'Acesso Bunker Subterrâneo', regionId: 'underground_facility', x: 95, z: -115, type: 'bunker' },
  { id: 'poi_desert_checkpoint', name: 'Checkpoint Bravo-04', regionId: 'desert_outpost', x: 340, z: -60, type: 'outpost' },
  { id: 'poi_desert_depot', name: 'Depósito de Suprimentos Leste', regionId: 'desert_outpost', x: 455, z: -120, type: 'outpost' },
  { id: 'poi_industrial_silos', name: 'Silos de Processamento', regionId: 'industrial_valley', x: -380, z: -90, type: 'industrial' },
  { id: 'poi_industrial_foundry', name: 'Fundição e Carga', regionId: 'industrial_valley', x: -430, z: 20, type: 'industrial' },
  { id: 'poi_city_square', name: 'Praça Central Abandonada', regionId: 'abandoned_city', x: -40, z: -400, type: 'city' },
  { id: 'poi_city_precinct', name: 'Distrito Comercial Norte', regionId: 'abandoned_city', x: 45, z: -445, type: 'city' },
  { id: 'poi_mountain_radar', name: 'Estação Radar Pico Norte', regionId: 'mountain_range', x: 340, z: -420, type: 'comms' },
  { id: 'poi_rural_village', name: 'Vila e Posto de Combustível', regionId: 'rural_settlement', x: -330, z: 320, type: 'village' },
  { id: 'poi_rural_farm', name: 'Fazenda do Vale Sul', regionId: 'rural_settlement', x: -240, z: 390, type: 'village' },
];

export const EXTRACTION_POINTS: ExtractionPointState[] = [
  { id: 'ext_alpha', name: 'LZ ALPHA — Pátio Sul', regionId: 'blacksite', x: 125, z: 165, radius: 14 },
  { id: 'ext_rail', name: 'EXTRAÇÃO FERROVIÁRIA — Oeste', regionId: 'industrial_valley', x: -475, z: -165, radius: 14 },
  { id: 'ext_desert', name: 'COMBOIO DESERTO — Leste', regionId: 'desert_outpost', x: 525, z: 35, radius: 14 },
  { id: 'ext_ridge', name: 'HELIPONTO CORDILHEIRA — Norte', regionId: 'mountain_range', x: 255, z: -495, radius: 14 },
];

// Road network segments connecting all 7 regions (used by TerrainManager, WorldManager, and Tactical Map)
export interface RoadSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  width: number;
  kind: 'asphalt' | 'dirt' | 'rail';
}

export const ROAD_NETWORK: RoadSegment[] = [
  // Central East-West Highway: Industrial Valley <-> Blacksite <-> Desert Outpost
  { x1: -560, z1: 25, x2: -190, z2: 25, width: 11, kind: 'asphalt' },
  { x1: -190, z1: 25, x2: 200, z2: 25, width: 12, kind: 'asphalt' },
  { x1: 200, z1: 25, x2: 560, z2: -75, width: 10, kind: 'dirt' },
  // Central North-South Highway: South Entry <-> Blacksite <-> Abandoned City
  { x1: 0, z1: 420, x2: 0, z2: 25, width: 11, kind: 'asphalt' },
  { x1: 0, z1: 25, x2: -40, z2: -470, width: 11, kind: 'asphalt' },
  // Mountain Winding Road: Desert Outpost <-> Mountain Comms <-> Abandoned City
  { x1: 390, z1: -65, x2: 340, z2: -420, width: 9, kind: 'dirt' },
  { x1: 340, z1: -420, x2: -40, z2: -420, width: 9, kind: 'asphalt' },
  // Rural Settlement Road: Blacksite South <-> Rural Village <-> Industrial Valley
  { x1: 0, z1: 230, x2: -330, z2: 320, width: 9, kind: 'dirt' },
  { x1: -330, z1: 320, x2: -390, z2: 25, width: 9, kind: 'dirt' },
  // Military Railway Line: Industrial Valley <-> Blacksite Rail Yard <-> South-East
  { x1: -580, z1: -155, x2: -160, z2: 65, width: 6, kind: 'rail' },
  { x1: -160, z1: 65, x2: 260, z2: 65, width: 6, kind: 'rail' },
  { x1: 260, z1: 65, x2: 580, z2: 195, width: 6, kind: 'rail' },
];

export const VEHICLE_SPECS: Record<VehicleType, VehicleSpec> = {
  military_car: {
    type: 'military_car',
    name: 'Sedan Tático M-12',
    maxSpeed: 34,
    reverseSpeed: 12,
    acceleration: 18,
    turnSpeed: 2.2,
    maxHealth: 260,
    maxFuel: 100,
    fuelBurnRate: 0.75,
    length: 4.5,
    width: 2.0,
    height: 1.55,
    color: 0x3b4238,
  },
  jeep: {
    type: 'jeep',
    name: 'Jipe Militar 4x4 HMMWV',
    maxSpeed: 30,
    reverseSpeed: 11,
    acceleration: 16,
    turnSpeed: 2.1,
    maxHealth: 420,
    maxFuel: 120,
    fuelBurnRate: 0.85,
    length: 4.8,
    width: 2.35,
    height: 2.05,
    color: 0x6b674f,
  },
  pickup: {
    type: 'pickup',
    name: 'Caminhonete Off-Road',
    maxSpeed: 32,
    reverseSpeed: 11,
    acceleration: 17,
    turnSpeed: 2.0,
    maxHealth: 310,
    maxFuel: 110,
    fuelBurnRate: 0.8,
    length: 5.1,
    width: 2.15,
    height: 1.85,
    color: 0x7c4f35,
  },
  cargo_truck: {
    type: 'cargo_truck',
    name: 'Caminhão Militar 6x6',
    maxSpeed: 22,
    reverseSpeed: 8,
    acceleration: 10,
    turnSpeed: 1.45,
    maxHealth: 650,
    maxFuel: 180,
    fuelBurnRate: 1.1,
    length: 7.4,
    width: 2.6,
    height: 3.1,
    color: 0x454f3d,
  },
  apc: {
    type: 'apc',
    name: 'Blindado APC 8x8 Striker',
    maxSpeed: 24,
    reverseSpeed: 9,
    acceleration: 11,
    turnSpeed: 1.55,
    maxHealth: 1100,
    maxFuel: 200,
    fuelBurnRate: 1.25,
    length: 6.8,
    width: 2.85,
    height: 2.6,
    color: 0x4f5449,
  },
};

export function createInitialMissions(): MissionState[] {
  return [
    {
      id: 'mis_blacksite_cmd',
      title: 'OPERAÇÃO CERBERUS: Neutralizar Guarnição Blacksite',
      description: 'Elimine 5 hostis ocupando o Blacksite Military Complex para abrir acesso ao pátio central.',
      regionId: 'blacksite',
      type: 'eliminate',
      targetX: 0,
      targetZ: -45,
      targetCount: 5,
      progress: 0,
      rewardCredits: 1500,
      rewardXp: 350,
      completed: false,
      active: true,
    },
    {
      id: 'mis_underground_intel',
      title: 'COFRE SUBTERRÂNEO: Recuperar Dossiê Recon',
      description: 'Infiltre-se na Instalação Subterrânea (rampa Leste do Blacksite) e recupere o dossiê secreto.',
      regionId: 'underground_facility',
      type: 'intel',
      targetX: 95,
      targetZ: -115,
      targetCount: 1,
      progress: 0,
      rewardCredits: 2800,
      rewardXp: 650,
      completed: false,
      active: false,
    },
    {
      id: 'mis_desert_supply',
      title: 'TEMPESTADE ÁRIDA: Capturar Caixa de Suprimentos',
      description: 'Viaje até o Desert Outpost e saqueie a caixa de suprimentos táticos no Checkpoint Leste.',
      regionId: 'desert_outpost',
      type: 'supply',
      targetX: 435,
      targetZ: -105,
      targetCount: 1,
      progress: 0,
      rewardCredits: 1800,
      rewardXp: 400,
      completed: false,
      active: false,
    },
    {
      id: 'mis_industrial_sabotage',
      title: 'VALE DE AÇO: Sabotar Depósito Industrial',
      description: 'Destrua os barris explosivos ou geradores inimigos em Industrial Valley (3 alvos).',
      regionId: 'industrial_valley',
      type: 'destroy',
      targetX: -385,
      targetZ: -75,
      targetCount: 3,
      progress: 0,
      rewardCredits: 2200,
      rewardXp: 500,
      completed: false,
      active: false,
    },
    {
      id: 'mis_city_recon',
      title: 'ZONA CINZENTA: Investigar Cidade Abandonada',
      description: 'Alcance a Praça Central da Abandoned City e elimine 4 combatentes urbanos.',
      regionId: 'abandoned_city',
      type: 'eliminate',
      targetX: -40,
      targetZ: -405,
      targetCount: 4,
      progress: 0,
      rewardCredits: 2400,
      rewardXp: 550,
      completed: false,
      active: false,
    },
    {
      id: 'mis_mountain_radar',
      title: 'SILÊNCIO DE RÁDIO: Neutralizar Base da Cordilheira',
      description: 'Escale a Mountain Range e desative o terminal de radar inimigo no topo.',
      regionId: 'mountain_range',
      type: 'intel',
      targetX: 340,
      targetZ: -420,
      targetCount: 1,
      progress: 0,
      rewardCredits: 3200,
      rewardXp: 750,
      completed: false,
      active: false,
    },
    {
      id: 'mis_rural_beacon',
      title: 'SINAL PERDIDO: Resgatar Transponder da Equipe Recon',
      description: 'Investigue o Rural Settlement no sudoeste e recupere o transponder de emergência.',
      regionId: 'rural_settlement',
      type: 'intel',
      targetX: -330,
      targetZ: 320,
      targetCount: 1,
      progress: 0,
      rewardCredits: 1600,
      rewardXp: 380,
      completed: false,
      active: false,
    },
    {
      id: 'mis_extract_protocol',
      title: 'PROTOCOLO DE EXTRAÇÃO: Retornar com Equipamentos',
      description: 'Dirija-se a qualquer Ponto de Extração (fumaça verde) e complete a contagem regressiva.',
      regionId: 'blacksite',
      type: 'extract',
      targetX: 125,
      targetZ: 165,
      targetCount: 1,
      progress: 0,
      rewardCredits: 2000,
      rewardXp: 500,
      completed: false,
      active: false,
    },
  ];
}

export function getRegionAt(x: number, z: number, y = 0): RegionInfo {
  // Check underground bunker first
  if (y < -2.2 && Math.hypot(x - 95, z + 115) < 55) {
    return REGIONS.underground_facility;
  }
  let best = REGIONS.blacksite;
  let bestScore = Infinity;
  for (const r of REGION_LIST) {
    if (r.id === 'underground_facility') continue;
    const d = Math.hypot(x - r.centerX, z - r.centerZ) / r.radius;
    if (d < bestScore) {
      bestScore = d;
      best = r;
    }
  }
  return best;
}
