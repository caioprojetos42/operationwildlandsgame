import React from 'react';
import { HUDState, ItemRarity } from '../game/types';
import { ITEMS } from '../game/data/items';
import { WEAPONS } from '../game/data/weapons';
import { Backpack, Package, Shield, Trash2, X } from 'lucide-react';

interface InventoryModalProps {
  hud: HUDState;
  onClose: () => void;
  onEquipOrUse: (uid: string) => void;
  onDrop: (uid: string) => void;
  onTakeItem: (uid: string) => void;
  onTakeAll: () => void;
}

const RARITY_BORDER: Record<ItemRarity, string> = {
  common: 'border-[#4a5448]',
  uncommon: 'border-[#5a9e68]',
  rare: 'border-[#4d8ec9]',
  epic: 'border-[#9c63cc]',
  legendary: 'border-[#d9a23b]',
};

const RARITY_TEXT: Record<ItemRarity, string> = {
  common: 'text-[#a6b2a2]',
  uncommon: 'text-[#73c984]',
  rare: 'text-[#6cb2f0]',
  epic: 'text-[#c28cf0]',
  legendary: 'text-[#f0bc54]',
};

export const InventoryModal: React.FC<InventoryModalProps> = ({
  hud,
  onClose,
  onEquipOrUse,
  onDrop,
  onTakeItem,
  onTakeAll,
}) => {
  const weightPct = Math.min(100, (hud.inventoryWeight / Math.max(1, hud.maxWeight)) * 100);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 md:p-8 bg-[#070a08]/88 pointer-events-auto">
      <div className="w-full max-w-6xl max-h-[88vh] flex flex-col bg-[#101612] border border-[#3d4a3a] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#161e19] border-b border-[#344032]">
          <div className="flex items-center gap-4">
            <Backpack className="w-5 h-5 text-[#9fb87a]" />
            <div>
              <h2 className="font-tactical font-bold text-lg tracking-wider uppercase text-[#edf4ea]">
                INVENTÁRIO TÁTICO & EQUIPAMENTOS
              </h2>
              <div className="text-[11px] font-mono-hud text-[#93a38d]">
                PESO: {hud.inventoryWeight.toFixed(1)} / {hud.maxWeight.toFixed(1)} KG · VALOR DE EXTRAÇÃO: ${hud.lootValue} · CRÉDITOS: ${hud.credits}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1f2922] hover:bg-[#2a372e] border border-[#495946] text-xs font-mono-hud text-[#dce6d8] cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>FECHAR [TAB]</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-5 overflow-y-auto">
          {/* LEFT: Equipped Loadout */}
          <div className="lg:col-span-4 flex flex-col gap-3">
            <div className="text-xs font-mono-hud tracking-widest text-[#9fb87a] uppercase">
              ARMAMENTO EQUIPADO (1–4)
            </div>
            <div className="space-y-2">
              {hud.equipment.slots.map((slot, idx) => {
                const spec = slot ? WEAPONS[slot.weaponId] : null;
                return (
                  <div
                    key={idx}
                    className={`p-2.5 border ${
                      hud.equipment.activeSlot === idx
                        ? 'bg-[#1a241d] border-[#9fb87a]'
                        : 'bg-[#131915] border-[#2e382c]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono-hud text-[#8e9e89]">
                      <span>SLOT {idx + 1}</span>
                      <span>{spec ? `${spec.caliber} ${slot?.suppressed ? '· SILENCIADA' : ''}` : 'VAZIO'}</span>
                    </div>
                    <div className="text-sm font-tactical font-bold text-[#edf2ea] mt-0.5">
                      {spec ? spec.name : '— Sem arma equipada —'}
                    </div>
                    {spec && slot && (
                      <div className="text-[11px] font-mono-hud text-[#c79b4b] mt-0.5">
                        DANO {spec.damage} · {slot.ammoInMag}/{spec.magSize} NO CARREGADOR
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="text-xs font-mono-hud tracking-widest text-[#9fb87a] uppercase mt-2">
              PROTEÇÃO & MOCHILA
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div className="p-2.5 bg-[#131915] border border-[#2e382c] flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono-hud text-[#8d9c88]">COLETE BALÍSTICO</div>
                  <div className="text-xs font-semibold text-[#e6ede3]">
                    {hud.equipment.armorId ? ITEMS[hud.equipment.armorId]?.name : 'Nenhum'}
                  </div>
                </div>
                <span className="text-xs font-mono-hud text-[#7ab4d6]">
                  {hud.armor}/{hud.maxArmor}
                </span>
              </div>
              <div className="p-2.5 bg-[#131915] border border-[#2e382c] flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono-hud text-[#8d9c88]">CAPACETE</div>
                  <div className="text-xs font-semibold text-[#e6ede3]">
                    {hud.equipment.helmetId ? ITEMS[hud.equipment.helmetId]?.name : 'Nenhum'}
                  </div>
                </div>
                <Shield className="w-4 h-4 text-[#9fb87a]" />
              </div>
              <div className="p-2.5 bg-[#131915] border border-[#2e382c]">
                <div className="flex justify-between text-[10px] font-mono-hud text-[#8d9c88] mb-1">
                  <span>{hud.equipment.backpackId ? ITEMS[hud.equipment.backpackId]?.name : 'Mochila Padrão'}</span>
                  <span>{Math.round(weightPct)}%</span>
                </div>
                <div className="w-full h-1.5 bg-[#222c24]">
                  <div
                    className="h-full"
                    style={{
                      width: `${weightPct}%`,
                      backgroundColor: weightPct > 90 ? '#e34b3c' : '#9fb87a',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* CENTER: Player Backpack Grid */}
          <div className={`${hud.openContainer ? 'lg:col-span-4' : 'lg:col-span-8'} flex flex-col gap-3`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono-hud tracking-widest text-[#9fb87a] uppercase">
                MOCHILA ({hud.inventory.length} SLOTS EM USO)
              </span>
              <span className="text-[11px] font-mono-hud text-[#8d9c88]">
                CLIQUE PARA EQUIPAR / USAR
              </span>
            </div>

            <div
              className={`grid gap-2 ${
                hud.openContainer ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
              }`}
            >
              {hud.inventory.map((entry) => {
                const tpl = ITEMS[entry.templateId];
                if (!tpl) return null;
                const actionLabel =
                  tpl.category === 'weapon' ||
                  tpl.category === 'armor' ||
                  tpl.category === 'helmet' ||
                  tpl.category === 'backpack'
                    ? 'EQUIPAR'
                    : tpl.category === 'medical' || tpl.category === 'supply' || tpl.category === 'attachment'
                    ? 'USAR'
                    : null;

                return (
                  <div
                    key={entry.uid}
                    className={`p-2.5 bg-[#141b16] border ${RARITY_BORDER[tpl.rarity]} flex flex-col justify-between gap-2`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-mono-hud">
                        <span className={RARITY_TEXT[tpl.rarity]}>{tpl.category.toUpperCase()}</span>
                        <span className="text-[#dce4d8] font-bold">x{entry.quantity}</span>
                      </div>
                      <div className="text-xs font-tactical font-bold text-[#eef4eb] mt-0.5 leading-snug">
                        {tpl.name}
                      </div>
                      <div className="text-[10px] text-[#8d9b88] mt-1 line-clamp-2">{tpl.description}</div>
                    </div>

                    <div className="flex items-center justify-between pt-1.5 border-t border-[#263026] text-[10px] font-mono-hud">
                      <span className="text-[#99a894]">
                        {(tpl.weight * entry.quantity).toFixed(1)}kg · ${tpl.value * entry.quantity}
                      </span>
                      <div className="flex items-center gap-1">
                        {actionLabel && (
                          <button
                            onClick={() => onEquipOrUse(entry.uid)}
                            className="px-2 py-0.5 bg-[#293827] hover:bg-[#3a4f37] text-[#dcead4] cursor-pointer"
                          >
                            {actionLabel}
                          </button>
                        )}
                        <button
                          onClick={() => onDrop(entry.uid)}
                          title="Descartar item"
                          className="p-1 bg-[#261a19] hover:bg-[#402320] text-[#e07063] cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Open Loot Container (when looting a crate or enemy body) */}
          {hud.openContainer && (
            <div className="lg:col-span-4 flex flex-col gap-3 bg-[#141c17] border border-[#56684f] p-3">
              <div className="flex items-center justify-between border-b border-[#344231] pb-2">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#e3b552]" />
                  <span className="text-xs font-tactical font-bold uppercase text-[#f0e1b8]">
                    {hud.openContainer.name}
                  </span>
                </div>
                {hud.openContainer.items.length > 0 && (
                  <button
                    onClick={onTakeAll}
                    className="px-2.5 py-1 bg-[#9fb87a] hover:bg-[#b5ce8e] text-[#0c110d] font-mono-hud font-bold text-[10px] cursor-pointer"
                  >
                    COLETAR TUDO
                  </button>
                )}
              </div>

              {hud.openContainer.items.length === 0 ? (
                <div className="py-10 text-center text-xs font-mono-hud text-[#82917e]">
                  CONTÊINER VAZIO
                </div>
              ) : (
                <div className="space-y-2">
                  {hud.openContainer.items.map((entry) => {
                    const tpl = ITEMS[entry.templateId];
                    if (!tpl) return null;
                    return (
                      <button
                        key={entry.uid}
                        onClick={() => onTakeItem(entry.uid)}
                        className={`w-full text-left p-2.5 bg-[#101612] hover:bg-[#1a241d] border ${RARITY_BORDER[tpl.rarity]} transition-colors cursor-pointer`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono-hud">
                          <span className={RARITY_TEXT[tpl.rarity]}>{tpl.category.toUpperCase()}</span>
                          <span className="text-[#e3b552]">+ COLETAR (x{entry.quantity})</span>
                        </div>
                        <div className="text-xs font-tactical font-bold text-[#edf2ea] mt-0.5">
                          {tpl.name}
                        </div>
                        <div className="text-[10px] font-mono-hud text-[#8b9a86] mt-0.5">
                          {(tpl.weight * entry.quantity).toFixed(1)}kg · Valor ${tpl.value * entry.quantity}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
