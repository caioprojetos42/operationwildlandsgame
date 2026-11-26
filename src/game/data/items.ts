import { AmmoCaliber, InventoryEntry, ItemTemplate, RegionId, WeaponId } from '../types';
import { WEAPONS } from './weapons';

const weaponItems: Record<string, ItemTemplate> = {};
for (const [id, spec] of Object.entries(WEAPONS)) {
  weaponItems[`wpn_${id}`] = {
    id: `wpn_${id}`,
    name: spec.name,
    category: 'weapon',
    weight: spec.weight,
    rarity: spec.rarity,
    value: spec.value,
    description: spec.description,
    stackable: false,
    maxStack: 1,
    weaponId: id as WeaponId,
    caliber: spec.caliber,
    iconKey: spec.category,
  };
}

export const ITEMS: Record<string, ItemTemplate> = {
  ...weaponItems,

  // === AMMUNITION ===
  ammo_556: {
    id: 'ammo_556',
    name: 'Munição 5.56x45mm NATO',
    category: 'ammo',
    weight: 0.012,
    rarity: 'common',
    value: 6,
    description: 'Cartuchos padrão OTAN para AR-15, M4A1 e G36K.',
    stackable: true,
    maxStack: 180,
    caliber: '5.56x45',
    iconKey: 'ammo',
  },
  ammo_545: {
    id: 'ammo_545',
    name: 'Munição 5.45x39mm',
    category: 'ammo',
    weight: 0.011,
    rarity: 'common',
    value: 5,
    description: 'Cartuchos de alta velocidade para plataforma AK-74.',
    stackable: true,
    maxStack: 180,
    caliber: '5.45x39',
    iconKey: 'ammo',
  },
  ammo_762: {
    id: 'ammo_762',
    name: 'Munição 7.62x51mm Match',
    category: 'ammo',
    weight: 0.024,
    rarity: 'uncommon',
    value: 14,
    description: 'Munição pesada de precisão para SCAR-H, FAL, M24 e M700.',
    stackable: true,
    maxStack: 100,
    caliber: '7.62x51',
    iconKey: 'ammo',
  },
  ammo_9mm: {
    id: 'ammo_9mm',
    name: 'Munição 9x19mm Parabellum',
    category: 'ammo',
    weight: 0.008,
    rarity: 'common',
    value: 4,
    description: 'Cartuchos 9mm para MP5, MP7 e Glock 17.',
    stackable: true,
    maxStack: 200,
    caliber: '9x19',
    iconKey: 'ammo',
  },
  ammo_45acp: {
    id: 'ammo_45acp',
    name: 'Munição .45 ACP',
    category: 'ammo',
    weight: 0.014,
    rarity: 'common',
    value: 7,
    description: 'Cartuchos subsônicos pesados para UMP45 e M1911.',
    stackable: true,
    maxStack: 140,
    caliber: '45acp',
    iconKey: 'ammo',
  },
  ammo_12g: {
    id: 'ammo_12g',
    name: 'Cartuchos 12 Gauge Buckshot',
    category: 'ammo',
    weight: 0.045,
    rarity: 'common',
    value: 10,
    description: 'Cartuchos 00 Buckshot para M870 e Saiga-12K.',
    stackable: true,
    maxStack: 64,
    caliber: '12gauge',
    iconKey: 'ammo',
  },

  // === ARMOR & HELMETS ===
  armor_kevlar: {
    id: 'armor_kevlar',
    name: 'Colete Kevlar Nível II',
    category: 'armor',
    weight: 3.5,
    rarity: 'common',
    value: 750,
    description: 'Proteção balística leve contra calibres de pistola e estilhaços.',
    stackable: false,
    maxStack: 1,
    armorProtection: 50,
    iconKey: 'armor',
  },
  armor_plate: {
    id: 'armor_plate',
    name: 'Plate Carrier Tático Nível III',
    category: 'armor',
    weight: 5.2,
    rarity: 'rare',
    value: 1650,
    description: 'Colete com placas cerâmicas capaz de absorver disparos de fuzil.',
    stackable: false,
    maxStack: 1,
    armorProtection: 85,
    iconKey: 'armor',
  },
  armor_juggernaut: {
    id: 'armor_juggernaut',
    name: 'Blindagem Pesada Spec-Ops IV',
    category: 'armor',
    weight: 7.5,
    rarity: 'epic',
    value: 3200,
    description: 'Sistema modular de placas classe IV usado em instalações subterrâneas.',
    stackable: false,
    maxStack: 1,
    armorProtection: 120,
    iconKey: 'armor',
  },
  helmet_ach: {
    id: 'helmet_ach',
    name: 'Capacete Balístico ACH',
    category: 'helmet',
    weight: 1.5,
    rarity: 'uncommon',
    value: 680,
    description: 'Reduz o dano recebido em tiros na cabeça em 25%.',
    stackable: false,
    maxStack: 1,
    helmetReduction: 0.25,
    iconKey: 'helmet',
  },
  helmet_ops: {
    id: 'helmet_ops',
    name: 'Capacete Ops-Core FAST',
    category: 'helmet',
    weight: 1.7,
    rarity: 'epic',
    value: 1750,
    description: 'Proteção craniana avançada de fibra composta (-40% dano headshot).',
    stackable: false,
    maxStack: 1,
    helmetReduction: 0.4,
    iconKey: 'helmet',
  },

  // === BACKPACKS ===
  pack_assault: {
    id: 'pack_assault',
    name: 'Mochila de Assalto (30kg)',
    category: 'backpack',
    weight: 1.2,
    rarity: 'common',
    value: 450,
    description: 'Mochila militar padrão com capacidade total de 30 kg.',
    stackable: false,
    maxStack: 1,
    backpackCapacity: 30,
    iconKey: 'backpack',
  },
  pack_tactical: {
    id: 'pack_tactical',
    name: 'Mochila Tática Recon (45kg)',
    category: 'backpack',
    weight: 1.8,
    rarity: 'rare',
    value: 1300,
    description: 'Mochila reforçada para longas expedições e extração de alto valor (45 kg).',
    stackable: false,
    maxStack: 1,
    backpackCapacity: 45,
    iconKey: 'backpack',
  },
  pack_expedition: {
    id: 'pack_expedition',
    name: 'Cargueiro Militar 65L (65kg)',
    category: 'backpack',
    weight: 2.5,
    rarity: 'epic',
    value: 2600,
    description: 'Armação rígida de alta carga para transportar armamento pesado e suprimentos.',
    stackable: false,
    maxStack: 1,
    backpackCapacity: 65,
    iconKey: 'backpack',
  },

  // === MEDICAL ===
  med_bandage: {
    id: 'med_bandage',
    name: 'Bandagem Hemostática',
    category: 'medical',
    weight: 0.2,
    rarity: 'common',
    value: 120,
    description: 'Estanca ferimentos rapidamente e restaura +25 HP.',
    stackable: true,
    maxStack: 6,
    healAmount: 25,
    iconKey: 'medical',
  },
  med_ifak: {
    id: 'med_ifak',
    name: 'Kit Médico Militar IFAK',
    category: 'medical',
    weight: 0.7,
    rarity: 'uncommon',
    value: 380,
    description: 'Kit completo de trauma de campo. Restaura +65 HP.',
    stackable: true,
    maxStack: 4,
    healAmount: 65,
    iconKey: 'medical',
  },
  med_painkiller: {
    id: 'med_painkiller',
    name: 'Analgésico Tático',
    category: 'medical',
    weight: 0.15,
    rarity: 'common',
    value: 160,
    description: 'Restaura +15 HP e recupera 100% da stamina imediatamente.',
    stackable: true,
    maxStack: 6,
    healAmount: 15,
    staminaRestore: 100,
    iconKey: 'medical',
  },

  // === THROWABLES & ATTACHMENTS ===
  grenade_frag: {
    id: 'grenade_frag',
    name: 'Granada M67 Frag',
    category: 'throwable',
    weight: 0.45,
    rarity: 'uncommon',
    value: 260,
    description: 'Granada de fragmentação com pavio de 2.5s e raio letal de 10 metros.',
    stackable: true,
    maxStack: 6,
    iconKey: 'grenade',
  },
  c4_charge: {
    id: 'c4_charge',
    name: 'Carga Explosiva C4',
    category: 'throwable',
    weight: 1.1,
    rarity: 'rare',
    value: 780,
    description: 'Explosivo plástico militar para neutralizar radares, blindados e fortificações.',
    stackable: true,
    maxStack: 3,
    iconKey: 'grenade',
  },
  attach_suppressor: {
    id: 'attach_suppressor',
    name: 'Silenciador Tático QD',
    category: 'attachment',
    weight: 0.4,
    rarity: 'rare',
    value: 950,
    description: 'Use no inventário para acoplar/remover silenciador na arma equipada.',
    stackable: true,
    maxStack: 3,
    iconKey: 'attachment',
  },

  // === VALUABLES, KEYS & SUPPLIES ===
  val_cash: {
    id: 'val_cash',
    name: 'Maço de Dólares Operacionais',
    category: 'valuable',
    weight: 0.1,
    rarity: 'uncommon',
    value: 450,
    description: 'Dinheiro em espécie recuperado de oficiais inimigos.',
    stackable: true,
    maxStack: 10,
    iconKey: 'valuable',
  },
  val_intel: {
    id: 'val_intel',
    name: 'Dossiê Confidencial WILDLANDS',
    category: 'valuable',
    weight: 0.3,
    rarity: 'epic',
    value: 2400,
    description: 'Documentos criptografados sobre o desaparecimento da equipe de reconhecimento.',
    stackable: true,
    maxStack: 5,
    iconKey: 'intel',
  },
  val_electronics: {
    id: 'val_electronics',
    name: 'Módulo Eletrônico Militar',
    category: 'valuable',
    weight: 0.9,
    rarity: 'rare',
    value: 1150,
    description: 'Placa encriptada de radar e telemetria altamente valiosa na extração.',
    stackable: true,
    maxStack: 4,
    iconKey: 'electronics',
  },
  key_bunker: {
    id: 'key_bunker',
    name: 'Cartão de Acesso Subterrâneo',
    category: 'key',
    weight: 0.05,
    rarity: 'epic',
    value: 1500,
    description: 'Credencial biométrica de nível 4 para depósitos da Instalação Subterrânea.',
    stackable: false,
    maxStack: 1,
    iconKey: 'key',
  },
  sup_ration: {
    id: 'sup_ration',
    name: 'Ração Militar MRE',
    category: 'supply',
    weight: 0.5,
    rarity: 'common',
    value: 140,
    description: 'Restaura +20 HP e +60 Stamina em operações prolongadas.',
    stackable: true,
    maxStack: 6,
    healAmount: 20,
    staminaRestore: 60,
    iconKey: 'supply',
  },
};

export const CALIBER_TO_AMMO_ITEM: Record<AmmoCaliber, string> = {
  '5.56x45': 'ammo_556',
  '5.45x39': 'ammo_545',
  '7.62x51': 'ammo_762',
  '9x19': 'ammo_9mm',
  '45acp': 'ammo_45acp',
  '12gauge': 'ammo_12g',
};

let uidCounter = 1;
export function createInventoryEntry(
  templateId: string,
  quantity = 1,
  extras?: { ammoInMag?: number; suppressed?: boolean }
): InventoryEntry {
  const tpl = ITEMS[templateId];
  const entry: InventoryEntry = {
    uid: `item_${Date.now().toString(36)}_${uidCounter++}`,
    templateId,
    quantity,
  };
  if (tpl?.weaponId) {
    entry.ammoInMag = extras?.ammoInMag ?? WEAPONS[tpl.weaponId].magSize;
    entry.suppressed = extras?.suppressed ?? WEAPONS[tpl.weaponId].suppressedByDefault ?? false;
  }
  return entry;
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

export function generateContextualLoot(
  containerType: 'military_crate' | 'weapon_case' | 'medical_box' | 'industrial_locker' | 'civilian_crate' | 'supply_drop' | 'enemy_corpse',
  regionId: RegionId,
  seed: number
): InventoryEntry[] {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };

  const items: InventoryEntry[] = [];
  const highTier = regionId === 'underground_facility' || regionId === 'blacksite' || regionId === 'mountain_range';

  if (containerType === 'weapon_case' || containerType === 'supply_drop') {
    const highWeapons: WeaponId[] = ['m4a1', 'g36', 'scarh', 'fal', 'm24', 'm700', 'saiga12', 'mp7'];
    const midWeapons: WeaponId[] = ['ar15', 'ak74', 'mp5', 'ump45', 'm870', 'm1911'];
    const chosen = highTier || containerType === 'supply_drop' ? pick(highWeapons, rand) : pick(midWeapons, rand);
    items.push(createInventoryEntry(`wpn_${chosen}`, 1));
    const ammoItem = CALIBER_TO_AMMO_ITEM[WEAPONS[chosen].caliber];
    items.push(createInventoryEntry(ammoItem, Math.min(WEAPONS[chosen].magSize * 2, 60)));
    if (rand() < 0.55) items.push(createInventoryEntry('attach_suppressor', 1));
    if (rand() < 0.5) items.push(createInventoryEntry('grenade_frag', 2));
    if (containerType === 'supply_drop') {
      items.push(createInventoryEntry(highTier ? 'armor_juggernaut' : 'armor_plate', 1));
      items.push(createInventoryEntry('med_ifak', 2));
      items.push(createInventoryEntry('val_intel', 1));
    }
  } else if (containerType === 'military_crate') {
    const ammoPool = ['ammo_556', 'ammo_545', 'ammo_762', 'ammo_9mm', 'ammo_45acp', 'ammo_12g'];
    items.push(createInventoryEntry(pick(ammoPool, rand), 24 + Math.floor(rand() * 36)));
    items.push(createInventoryEntry(pick(ammoPool, rand), 18 + Math.floor(rand() * 24)));
    if (rand() < 0.42) {
      const pool: WeaponId[] = highTier ? ['m4a1', 'g36', 'scarh', 'mp7', 'saiga12'] : ['ar15', 'ak74', 'mp5', 'ump45', 'm870'];
      items.push(createInventoryEntry(`wpn_${pick(pool, rand)}`, 1));
    }
    if (rand() < 0.45) items.push(createInventoryEntry('grenade_frag', 1 + Math.floor(rand() * 2)));
    if (rand() < 0.35) items.push(createInventoryEntry(highTier ? 'armor_plate' : 'armor_kevlar', 1));
    if (rand() < 0.3) items.push(createInventoryEntry('helmet_ach', 1));
  } else if (containerType === 'medical_box') {
    items.push(createInventoryEntry('med_ifak', 1 + Math.floor(rand() * 2)));
    items.push(createInventoryEntry('med_bandage', 2 + Math.floor(rand() * 2)));
    items.push(createInventoryEntry('med_painkiller', 1 + Math.floor(rand() * 2)));
  } else if (containerType === 'industrial_locker') {
    items.push(createInventoryEntry('val_electronics', 1 + Math.floor(rand() * 2)));
    if (rand() < 0.5) items.push(createInventoryEntry('c4_charge', 1));
    if (rand() < 0.45) items.push(createInventoryEntry('pack_tactical', 1));
    if (rand() < 0.4) items.push(createInventoryEntry('val_cash', 1 + Math.floor(rand() * 3)));
    items.push(createInventoryEntry('sup_ration', 1));
  } else if (containerType === 'civilian_crate') {
    items.push(createInventoryEntry('sup_ration', 1 + Math.floor(rand() * 2)));
    items.push(createInventoryEntry('med_bandage', 1 + Math.floor(rand() * 2)));
    if (rand() < 0.45) items.push(createInventoryEntry('val_cash', 1 + Math.floor(rand() * 2)));
    if (rand() < 0.3) items.push(createInventoryEntry('wpn_m870', 1));
    if (rand() < 0.4) items.push(createInventoryEntry('ammo_12g', 12));
    if (rand() < 0.35) items.push(createInventoryEntry('pack_assault', 1));
  } else {
    // enemy_corpse
    items.push(createInventoryEntry(pick(['ammo_556', 'ammo_545', 'ammo_762', 'ammo_9mm'], rand), 15 + Math.floor(rand() * 25)));
    if (rand() < 0.6) items.push(createInventoryEntry('med_bandage', 1));
    if (rand() < 0.45) items.push(createInventoryEntry('val_cash', 1));
    if (rand() < 0.25) items.push(createInventoryEntry('grenade_frag', 1));
    if (highTier && rand() < 0.3) items.push(createInventoryEntry('val_intel', 1));
  }

  return items;
}
