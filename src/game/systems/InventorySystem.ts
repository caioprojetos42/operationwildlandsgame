import { AmmoCaliber, EquipmentState, InventoryEntry, WeaponId, WeaponRuntimeState } from '../types';
import { CALIBER_TO_AMMO_ITEM, createInventoryEntry, ITEMS } from '../data/items';
import { WEAPONS } from '../data/weapons';

export class InventorySystem {
  public equipment: EquipmentState;
  public items: InventoryEntry[] = [];
  public stash: InventoryEntry[] = [];

  constructor() {
    this.equipment = this.createDefaultEquipment();
    this.items = this.createStarterItems();
  }

  public createDefaultEquipment(): EquipmentState {
    return {
      slots: [
        { weaponId: 'm4a1', ammoInMag: WEAPONS.m4a1.magSize, fireModeIndex: 0, suppressed: false },
        { weaponId: 'm24', ammoInMag: WEAPONS.m24.magSize, fireModeIndex: 0, suppressed: false },
        { weaponId: 'glock17', ammoInMag: WEAPONS.glock17.magSize, fireModeIndex: 0, suppressed: true },
        null,
      ],
      activeSlot: 0,
      armorId: 'armor_kevlar',
      armorDurability: 50,
      maxArmorDurability: 50,
      helmetId: 'helmet_ach',
      backpackId: 'pack_assault',
    };
  }

  public createStarterItems(): InventoryEntry[] {
    return [
      createInventoryEntry('ammo_556', 120),
      createInventoryEntry('ammo_762', 25),
      createInventoryEntry('ammo_9mm', 51),
      createInventoryEntry('med_ifak', 2),
      createInventoryEntry('med_bandage', 3),
      createInventoryEntry('grenade_frag', 3),
      createInventoryEntry('attach_suppressor', 1),
      createInventoryEntry('sup_ration', 2),
    ];
  }

  public resetToStarter() {
    this.equipment = this.createDefaultEquipment();
    this.items = this.createStarterItems();
  }

  public getMaxWeight(): number {
    const base = 15;
    if (this.equipment.backpackId && ITEMS[this.equipment.backpackId]) {
      return base + (ITEMS[this.equipment.backpackId].backpackCapacity ?? 25);
    }
    return base + 15;
  }

  public getCurrentWeight(): number {
    let w = 0;
    for (const item of this.items) {
      const tpl = ITEMS[item.templateId];
      if (tpl) w += tpl.weight * item.quantity;
    }
    return Math.round(w * 10) / 10;
  }

  public getTotalLootValue(): number {
    let v = 0;
    for (const item of this.items) {
      const tpl = ITEMS[item.templateId];
      if (tpl) v += tpl.value * item.quantity;
    }
    for (const slot of this.equipment.slots) {
      if (slot) v += WEAPONS[slot.weaponId].value;
    }
    return v;
  }

  public getStashValue(): number {
    let v = 0;
    for (const item of this.stash) {
      const tpl = ITEMS[item.templateId];
      if (tpl) v += tpl.value * item.quantity;
    }
    return v;
  }

  public getActiveWeapon(): WeaponRuntimeState | null {
    return this.equipment.slots[this.equipment.activeSlot] ?? null;
  }

  public getReserveAmmo(caliber: AmmoCaliber): number {
    const ammoId = CALIBER_TO_AMMO_ITEM[caliber];
    let total = 0;
    for (const item of this.items) {
      if (item.templateId === ammoId) total += item.quantity;
    }
    return total;
  }

  public consumeAmmo(caliber: AmmoCaliber, needed: number): number {
    const ammoId = CALIBER_TO_AMMO_ITEM[caliber];
    let taken = 0;
    for (let i = this.items.length - 1; i >= 0 && taken < needed; i--) {
      const entry = this.items[i];
      if (entry.templateId !== ammoId) continue;
      const take = Math.min(entry.quantity, needed - taken);
      entry.quantity -= take;
      taken += take;
      if (entry.quantity <= 0) this.items.splice(i, 1);
    }
    return taken;
  }

  public getItemCount(templateId: string): number {
    let total = 0;
    for (const item of this.items) {
      if (item.templateId === templateId) total += item.quantity;
    }
    return total;
  }

  public consumeItem(templateId: string, count = 1): boolean {
    if (this.getItemCount(templateId) < count) return false;
    let rem = count;
    for (let i = this.items.length - 1; i >= 0 && rem > 0; i--) {
      if (this.items[i].templateId !== templateId) continue;
      const take = Math.min(this.items[i].quantity, rem);
      this.items[i].quantity -= take;
      rem -= take;
      if (this.items[i].quantity <= 0) this.items.splice(i, 1);
    }
    return true;
  }

  public addItem(entry: InventoryEntry): { added: boolean; reason?: string } {
    const tpl = ITEMS[entry.templateId];
    if (!tpl) return { added: false, reason: 'Item inválido' };

    const extraWeight = tpl.weight * entry.quantity;
    if (this.getCurrentWeight() + extraWeight > this.getMaxWeight() + 0.05) {
      return { added: false, reason: 'Mochila cheia (excesso de peso)' };
    }

    if (tpl.stackable) {
      let remaining = entry.quantity;
      for (const existing of this.items) {
        if (existing.templateId === entry.templateId && existing.quantity < tpl.maxStack) {
          const canAdd = Math.min(remaining, tpl.maxStack - existing.quantity);
          existing.quantity += canAdd;
          remaining -= canAdd;
          if (remaining <= 0) break;
        }
      }
      while (remaining > 0) {
        const stackQty = Math.min(remaining, tpl.maxStack);
        this.items.push(createInventoryEntry(entry.templateId, stackQty));
        remaining -= stackQty;
      }
      return { added: true };
    }

    this.items.push({ ...entry });
    return { added: true };
  }

  public removeByUid(uid: string): InventoryEntry | null {
    const idx = this.items.findIndex((i) => i.uid === uid);
    if (idx === -1) return null;
    const [removed] = this.items.splice(idx, 1);
    return removed;
  }

  public equipItem(uid: string): { ok: boolean; message: string; heal?: number; stamina?: number; weaponChanged?: boolean } {
    const idx = this.items.findIndex((i) => i.uid === uid);
    if (idx === -1) return { ok: false, message: 'Item não encontrado' };
    const entry = this.items[idx];
    const tpl = ITEMS[entry.templateId];
    if (!tpl) return { ok: false, message: 'Item inválido' };

    if (tpl.category === 'weapon' && tpl.weaponId) {
      const targetSlot =
        WEAPONS[tpl.weaponId].category === 'pistol'
          ? 2
          : this.equipment.slots[0] === null
          ? 0
          : this.equipment.slots[1] === null
          ? 1
          : this.equipment.slots[3] === null
          ? 3
          : this.equipment.activeSlot;

      const previous = this.equipment.slots[targetSlot];
      this.items.splice(idx, 1);
      if (previous) {
        this.items.push(
          createInventoryEntry(`wpn_${previous.weaponId}`, 1, {
            ammoInMag: previous.ammoInMag,
            suppressed: previous.suppressed,
          })
        );
      }
      this.equipment.slots[targetSlot] = {
        weaponId: tpl.weaponId,
        ammoInMag: entry.ammoInMag ?? WEAPONS[tpl.weaponId].magSize,
        fireModeIndex: 0,
        suppressed: entry.suppressed ?? WEAPONS[tpl.weaponId].suppressedByDefault ?? false,
      };
      this.equipment.activeSlot = targetSlot;
      return { ok: true, message: `${tpl.name} equipada no Slot ${targetSlot + 1}`, weaponChanged: true };
    }

    if (tpl.category === 'armor') {
      const prevId = this.equipment.armorId;
      this.items.splice(idx, 1);
      if (prevId) this.items.push(createInventoryEntry(prevId, 1));
      this.equipment.armorId = tpl.id;
      this.equipment.maxArmorDurability = tpl.armorProtection ?? 50;
      this.equipment.armorDurability = this.equipment.maxArmorDurability;
      return { ok: true, message: `${tpl.name} equipado` };
    }

    if (tpl.category === 'helmet') {
      const prevId = this.equipment.helmetId;
      this.items.splice(idx, 1);
      if (prevId) this.items.push(createInventoryEntry(prevId, 1));
      this.equipment.helmetId = tpl.id;
      return { ok: true, message: `${tpl.name} equipado` };
    }

    if (tpl.category === 'backpack') {
      const prevId = this.equipment.backpackId;
      this.items.splice(idx, 1);
      if (prevId) this.items.push(createInventoryEntry(prevId, 1));
      this.equipment.backpackId = tpl.id;
      return { ok: true, message: `${tpl.name} equipada (${this.getMaxWeight()}kg max)` };
    }

    if (tpl.category === 'attachment' && tpl.id === 'attach_suppressor') {
      const active = this.getActiveWeapon();
      if (!active) return { ok: false, message: 'Nenhuma arma equipada' };
      const spec = WEAPONS[active.weaponId];
      if (!spec.canSuppress) return { ok: false, message: `${spec.name} não aceita silenciador` };
      active.suppressed = !active.suppressed;
      return {
        ok: true,
        message: active.suppressed ? `Silenciador acoplado na ${spec.name}` : `Silenciador removido da ${spec.name}`,
        weaponChanged: true,
      };
    }

    if (tpl.category === 'medical' || tpl.category === 'supply') {
      entry.quantity -= 1;
      if (entry.quantity <= 0) this.items.splice(idx, 1);
      return {
        ok: true,
        message: `${tpl.name} utilizado`,
        heal: tpl.healAmount ?? 0,
        stamina: tpl.staminaRestore ?? 0,
      };
    }

    return { ok: false, message: `${tpl.name} é um item de extração / recurso` };
  }

  public getHelmetReduction(): number {
    if (!this.equipment.helmetId) return 0;
    return ITEMS[this.equipment.helmetId]?.helmetReduction ?? 0;
  }

  public extractAllToStash(): number {
    let extractedValue = 0;
    for (const item of this.items) {
      const tpl = ITEMS[item.templateId];
      if (tpl) extractedValue += tpl.value * item.quantity;
      this.stash.push({ ...item });
    }
    this.items = this.createStarterItems();
    return extractedValue;
  }

  public selectSlot(slotIndex: number): WeaponId | null {
    if (slotIndex < 0 || slotIndex > 3) return null;
    if (!this.equipment.slots[slotIndex]) return null;
    this.equipment.activeSlot = slotIndex;
    return this.equipment.slots[slotIndex]!.weaponId;
  }
}
