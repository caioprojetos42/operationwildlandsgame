import * as THREE from 'three';
import { InventoryEntry, LootContainerSnapshot, RegionId } from '../types';
import { generateContextualLoot } from '../data/items';
import { buildLootCrateModel } from './ProceduralModels';
import { ProceduralMaterials } from './TextureLibrary';

export type LootContainerType =
  | 'military_crate'
  | 'weapon_case'
  | 'medical_box'
  | 'industrial_locker'
  | 'civilian_crate'
  | 'supply_drop'
  | 'enemy_corpse';

export interface LootContainerEntity {
  id: string;
  name: string;
  type: LootContainerType;
  regionId: RegionId;
  position: THREE.Vector3;
  items: InventoryEntry[];
  mesh: THREE.Object3D;
  sectorKey: string;
  missionTag?: string;
}

const CONTAINER_LABELS: Record<LootContainerType, string> = {
  military_crate: 'Caixa Militar de Munição',
  weapon_case: 'Maleta Tática de Armamento',
  medical_box: 'Caixa Médica de Campo',
  industrial_locker: 'Armário Industrial',
  civilian_crate: 'Caixa de Suprimentos',
  supply_drop: 'Caixa de Suprimento Aéreo',
  enemy_corpse: 'Equipamento de Combatente',
};

export class LootSystem {
  public containers = new Map<string, LootContainerEntity>();
  private scene: THREE.Scene;
  private mats: ProceduralMaterials;

  constructor(scene: THREE.Scene, mats: ProceduralMaterials) {
    this.scene = scene;
    this.mats = mats;
  }

  public spawnContainer(
    id: string,
    type: LootContainerType,
    regionId: RegionId,
    pos: THREE.Vector3,
    sectorKey: string,
    seed: number,
    customItems?: InventoryEntry[],
    missionTag?: string
  ): LootContainerEntity {
    if (this.containers.has(id)) return this.containers.get(id)!;

    let mesh: THREE.Object3D;
    if (type === 'enemy_corpse') {
      const g = new THREE.Group();
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.28, 0.45),
        new THREE.MeshStandardMaterial({ color: 0x3f4335, roughness: 0.85 })
      );
      bag.position.y = 0.14;
      const strap = new THREE.Mesh(
        new THREE.BoxGeometry(0.64, 0.08, 0.12),
        new THREE.MeshStandardMaterial({ color: 0xc9a84a, roughness: 0.6 })
      );
      strap.position.y = 0.28;
      g.add(bag, strap);
      mesh = g;
    } else {
      mesh = buildLootCrateModel(type, this.mats);
    }

    mesh.position.copy(pos);
    mesh.rotation.y = (seed % 628) / 100;
    this.scene.add(mesh);

    const items = customItems ?? generateContextualLoot(type, regionId, seed);
    const entity: LootContainerEntity = {
      id,
      name: CONTAINER_LABELS[type],
      type,
      regionId,
      position: pos.clone(),
      items,
      mesh,
      sectorKey,
      missionTag,
    };
    this.containers.set(id, entity);
    return entity;
  }

  public unloadSector(sectorKey: string) {
    for (const [id, container] of this.containers.entries()) {
      if (container.sectorKey === sectorKey && container.type !== 'enemy_corpse' && !container.missionTag) {
        this.scene.remove(container.mesh);
        this.containers.delete(id);
      }
    }
  }

  public findNearestInteractable(playerPos: THREE.Vector3, maxDist = 3.2): LootContainerEntity | null {
    let best: LootContainerEntity | null = null;
    let bestD = maxDist;
    for (const c of this.containers.values()) {
      if (c.items.length === 0) continue;
      const d = c.position.distanceTo(playerPos);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  public getSnapshot(id: string): LootContainerSnapshot | null {
    const c = this.containers.get(id);
    if (!c) return null;
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      items: c.items.map((i) => ({ ...i })),
    };
  }

  public removeItemFromContainer(containerId: string, uid: string): InventoryEntry | null {
    const c = this.containers.get(containerId);
    if (!c) return null;
    const idx = c.items.findIndex((i) => i.uid === uid);
    if (idx === -1) return null;
    const [removed] = c.items.splice(idx, 1);
    return removed;
  }

  public clearTemporaryCorpseLoot() {
    for (const [id, container] of Array.from(this.containers.entries())) {
      if (container.type === 'enemy_corpse') {
        this.scene.remove(container.mesh);
        this.containers.delete(id);
      }
    }
  }

  public dispose() {
    for (const c of this.containers.values()) {
      this.scene.remove(c.mesh);
    }
    this.containers.clear();
  }
}
