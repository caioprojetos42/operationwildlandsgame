import React, { useMemo, useState } from 'react';
import { Award, Camera, Eye, FileText, Globe, Home, RotateCcw } from 'lucide-react';
import { HUDState } from '../game/types';
import { WEAPONS } from '../game/data/weapons';
import { ITEMS } from '../game/data/items';

interface EndScreenModalProps {
  hud: HUDState;
  onRedeploy: () => void;
  onContinueExplore: () => void;
  onReturnToMenu: () => void;
  onCycleSpectator: () => void;
}

interface LostGearTile {
  id: string;
  kind: 'weapon' | 'armor' | 'backpack';
  name: string;
  detail: string;
  value: number;
}

function formatOperationDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}min ${secs.toString().padStart(2, '0')}s`;
}

// Detailed tactical SVG silhouettes matching the reference lost-gear slots
const RifleSilhouetteIcon = () => (
  <svg viewBox="0 0 116 42" className="w-[88px] h-[34px]" fill="none">
    {/* Receiver & upper rail */}
    <path
      d="M36 16h34l3 3v7H56l-2 4h-8l-2-4H36v-10z"
      fill="#777e86"
      stroke="#c7cfd6"
      strokeWidth="1.2"
    />
    {/* Picatinny top rail & optic */}
    <rect x="40" y="13" width="28" height="3" fill="#525860" stroke="#aeb6be" strokeWidth="0.8" />
    <rect x="49" y="9" width="11" height="4" rx="1" fill="#3a4046" stroke="#b5bdc4" strokeWidth="0.9" />
    {/* Handguard & barrel */}
    <rect x="73" y="17" width="22" height="6" rx="1" fill="#5a6169" stroke="#bcc4cc" strokeWidth="1" />
    <line x1="76" y1="20" x2="92" y2="20" stroke="#22262a" strokeWidth="1.5" strokeDasharray="3 2" />
    <rect x="95" y="18.5" width="14" height="3" fill="#899199" />
    <rect x="108" y="17.5" width="5" height="5" rx="0.6" fill="#687078" stroke="#c3cbd2" strokeWidth="0.8" />
    {/* Front sight post */}
    <path d="M94 17l2-5h2l1 5" fill="#6d747c" stroke="#c3cbd2" strokeWidth="0.8" />
    {/* Tactical stock */}
    <path
      d="M8 14h28v6H24l-5 10H8V14z"
      fill="#525860"
      stroke="#b7bfc6"
      strokeWidth="1.1"
    />
    {/* Pistol grip */}
    <path d="M44 26l-4 11h6l4-11h-6z" fill="#434950" stroke="#a6aeb6" strokeWidth="1" />
    {/* Curved magazine */}
    <path d="M58 26h8l2 12-7 1-3-13z" fill="#636b73" stroke="#bcc4cc" strokeWidth="1" />
  </svg>
);

const PlateCarrierIcon = () => (
  <svg viewBox="0 0 54 58" className="w-[40px] h-[44px]" fill="none">
    {/* Shoulder straps */}
    <path
      d="M15 6h7l2 8h6l2-8h7l3 12 4 4v26l-5 4H13l-5-4V22l4-4 3-12z"
      fill="#5b6168"
      stroke="#c2cad1"
      strokeWidth="1.4"
    />
    {/* Inner plate panel */}
    <path d="M18 16h18l2 10v20H16V26l2-10z" fill="#464c52" stroke="#9ea6ae" strokeWidth="1" />
    {/* MOLLE webbing rows */}
    <line x1="18" y1="22" x2="36" y2="22" stroke="#aeb6be" strokeWidth="1.3" />
    <line x1="18" y1="27" x2="36" y2="27" stroke="#aeb6be" strokeWidth="1.3" />
    {/* 3 Magazine pouches */}
    <rect x="17.5" y="31" width="5.5" height="13" rx="1" fill="#3a4046" stroke="#b8c0c8" strokeWidth="0.9" />
    <rect x="24.25" y="31" width="5.5" height="13" rx="1" fill="#3a4046" stroke="#b8c0c8" strokeWidth="0.9" />
    <rect x="31" y="31" width="5.5" height="13" rx="1" fill="#3a4046" stroke="#b8c0c8" strokeWidth="0.9" />
  </svg>
);

const BackpackSilhouetteIcon = () => (
  <svg viewBox="0 0 54 58" className="w-[40px] h-[44px]" fill="none">
    {/* Top handle */}
    <path d="M21 10c0-3 2.5-4.5 6-4.5s6 1.5 6 4.5" stroke="#c2cad1" strokeWidth="2" />
    {/* Main rucksack body */}
    <rect x="11" y="10" width="32" height="41" rx="8" fill="#596067" stroke="#c2cad1" strokeWidth="1.4" />
    {/* Top pocket */}
    <rect x="15" y="15" width="24" height="12" rx="3" fill="#444a50" stroke="#a6aeb6" strokeWidth="1" />
    {/* Lower utility pouch */}
    <rect x="14" y="30" width="26" height="17" rx="3" fill="#3e444a" stroke="#b5bdc4" strokeWidth="1" />
    {/* Compression straps & buckles */}
    <line x1="14" y1="35" x2="40" y2="35" stroke="#b5bdc4" strokeWidth="1.2" />
    <line x1="14" y1="40" x2="40" y2="40" stroke="#b5bdc4" strokeWidth="1.2" />
    <rect x="23" y="21" width="8" height="3" rx="0.8" fill="#c7cfd6" />
  </svg>
);

export const EndScreenModal: React.FC<EndScreenModalProps> = ({
  hud,
  onRedeploy,
  onContinueExplore,
  onReturnToMenu,
  onCycleSpectator,
}) => {
  const isExtracted = hud.phase === 'extracted';
  const [spectating, setSpectating] = useState(false);
  const [selectedGearId, setSelectedGearId] = useState<string | null>(null);

  const lostGear: LostGearTile[] = useMemo(() => {
    const list: LostGearTile[] = [];
    const primarySlot = hud.equipment.slots[hud.equipment.activeSlot] ?? hud.equipment.slots.find(Boolean);
    const primarySpec = primarySlot ? WEAPONS[primarySlot.weaponId] : WEAPONS.m4a1;
    list.push({
      id: 'lost_weapon',
      kind: 'weapon',
      name: primarySpec.name,
      detail: `${primarySpec.caliber} · ${primarySpec.rpm} RPM`,
      value: primarySpec.value,
    });

    const armorTpl = hud.equipment.armorId ? ITEMS[hud.equipment.armorId] : ITEMS.armor_plate;
    list.push({
      id: 'lost_armor',
      kind: 'armor',
      name: armorTpl?.name ?? 'Plate Carrier Tático',
      detail: `Proteção ${armorTpl?.armorProtection ?? 85} pts`,
      value: armorTpl?.value ?? 1200,
    });

    const packTpl = hud.equipment.backpackId ? ITEMS[hud.equipment.backpackId] : ITEMS.pack_assault;
    list.push({
      id: 'lost_backpack',
      kind: 'backpack',
      name: packTpl?.name ?? 'Mochila de Assalto',
      detail: `${hud.inventory.length} itens carregados (${hud.inventoryWeight}kg)`,
      value: (packTpl?.value ?? 450) + hud.lootValue,
    });

    return list;
  }, [hud.equipment, hud.inventory.length, hud.inventoryWeight, hud.lootValue]);

  const activeGear = lostGear.find((g) => g.id === selectedGearId) ?? null;

  // === LIVE 3D SPECTATOR MODE OVERLAY ("ASSISTIR COMBATE") ===
  if (!isExtracted && spectating) {
    return (
      <div className="fixed inset-0 z-40 pointer-events-none flex flex-col justify-between p-5">
        {/* Top spectator status ribbon */}
        <div className="flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-3 px-4 py-2 bg-[#121417]/88 border border-[#e1493c]/50 shadow-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-[#e1493c] animate-pulse" />
            <div>
              <div className="text-[10px] font-mono-hud tracking-[0.18em] uppercase text-[#e5be6a]">
                CÂMERA DE COMBATE AO VIVO
              </div>
              <div className="font-military font-bold text-lg tracking-wider text-white uppercase leading-tight">
                {hud.spectatorLabel}
              </div>
            </div>
          </div>

          <button
            onClick={() => setSpectating(false)}
            className="flex items-center gap-2 px-4 py-2 bg-[#14171a]/90 hover:bg-[#1f2429] border border-white/25 hover:border-[#e5be6a] text-xs font-military font-bold tracking-[0.1em] uppercase text-white cursor-pointer transition-colors"
          >
            <FileText className="w-4 h-4 text-[#e5be6a]" />
            <span>RELATÓRIO DE COMBATE</span>
          </button>
        </div>

        {/* Bottom spectator tactical dock */}
        <div className="mx-auto mb-4 flex flex-wrap items-center justify-center gap-2.5 px-4 py-3 bg-[#121417]/90 border border-white/15 shadow-2xl pointer-events-auto">
          <button
            onClick={onCycleSpectator}
            className="flex items-center gap-2 px-4 py-2 bg-[#1d2227] hover:bg-[#293038] border border-white/20 hover:border-[#e5be6a] text-xs font-military font-bold tracking-[0.08em] uppercase text-white cursor-pointer transition-colors"
          >
            <Camera className="w-4 h-4 text-[#e5be6a]" />
            <span>TROCAR CÂMERA</span>
          </button>
          <button
            onClick={onRedeploy}
            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-[#d4a536] via-[#dcae42] to-[#c9982c] hover:brightness-110 text-[#141414] text-sm font-military font-extrabold tracking-[0.1em] uppercase cursor-pointer transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            <span>REAPARECER (SPAWN ALEATÓRIO)</span>
          </button>
          <button
            onClick={onReturnToMenu}
            className="flex items-center gap-2 px-4 py-2 bg-[#1d2227] hover:bg-[#293038] border border-white/20 text-xs font-military font-bold tracking-[0.08em] uppercase text-[#dde2e6] cursor-pointer transition-colors"
          >
            <Home className="w-4 h-4 text-[#b7bfc6]" />
            <span>VOLTAR AO MENU</span>
          </button>
        </div>
      </div>
    );
  }

  // === EXTRACTED SUCCESS MODAL (consistent AAA military visual language) ===
  if (isExtracted) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col justify-between bg-[#090d0b]/82 pointer-events-auto">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-[640px] rounded-[12px] bg-[#141618]/92 border border-[#5ec260]/45 shadow-[0_28px_80px_rgba(0,0,0,0.85)] px-7 py-6">
            <div className="flex justify-end">
              <span className="text-[11px] font-medium tracking-[0.08em] text-[#9ea3a8] uppercase">
                RELATÓRIO DE EXTRAÇÃO
              </span>
            </div>

            <div className="text-center mt-1">
              <div className="inline-flex items-center justify-center gap-2.5">
                <Award className="w-7 h-7 text-[#5ec260]" />
                <h2 className="font-military font-bold text-[34px] tracking-[0.06em] uppercase text-[#5ec260] leading-none">
                  EXTRAÇÃO CONCLUÍDA
                </h2>
              </div>
              <p className="text-[14px] text-[#cfd3d7] mt-1">
                Todos os equipamentos e documentos foram transferidos para o depósito da base.
              </p>
            </div>

            <div className="border-t border-white/12 my-5" />

            <div className="font-military font-bold text-[16px] tracking-[0.06em] text-[#e5be6a] uppercase mb-3">
              ESTATÍSTICAS DA OPERAÇÃO
            </div>
            <div className="grid grid-cols-3 gap-4 text-center py-1">
              <div>
                <div className="text-[28px] font-bold text-white leading-none tabular-nums">
                  {hud.kills}
                </div>
                <div className="text-[12px] text-[#9fa5ab] mt-1.5">Eliminações ({hud.headshots} HS)</div>
              </div>
              <div>
                <div className="text-[28px] font-bold text-[#5ec260] leading-none tabular-nums">
                  ${hud.lastExtractedLootValue.toLocaleString('pt-BR')}
                </div>
                <div className="text-[12px] text-[#9fa5ab] mt-1.5">Loot extraído</div>
              </div>
              <div>
                <div className="text-[28px] font-bold text-white leading-none tabular-nums">
                  {hud.xp.toLocaleString('pt-BR')}
                </div>
                <div className="text-[12px] text-[#9fa5ab] mt-1.5">XP obtido</div>
              </div>
            </div>

            <div className="mt-7 space-y-2.5">
              <button
                onClick={onContinueExplore}
                className="w-full h-[46px] rounded-[4px] bg-gradient-to-r from-[#d4a536] via-[#dcae42] to-[#c9982c] hover:brightness-110 text-[#141414] font-military font-bold text-[18px] tracking-[0.1em] uppercase cursor-pointer transition-all"
              >
                CONTINUAR EM WILDLANDS
              </button>
              <button
                onClick={onRedeploy}
                className="w-full h-[46px] rounded-[4px] bg-[#171a1e]/80 hover:bg-[#23282e] border border-white/30 hover:border-[#e5be6a] text-white font-military font-bold text-[17px] tracking-[0.1em] uppercase cursor-pointer transition-colors"
              >
                NOVA INSERÇÃO ALEATÓRIA
              </button>
              <button
                onClick={onReturnToMenu}
                className="w-full h-[46px] rounded-[4px] bg-[#171a1e]/80 hover:bg-[#23282e] border border-white/30 hover:border-white/55 text-white font-military font-bold text-[17px] tracking-[0.1em] uppercase cursor-pointer transition-colors"
              >
                VOLTAR AO MENU
              </button>
            </div>
          </div>
        </div>

        {/* Bottom slim status bar */}
        <div className="h-[34px] px-5 bg-[#0b0e11]/90 border-t border-white/10 flex items-center justify-end gap-3 text-[11px] text-[#c7cfd4]">
          <div className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-[#dce3e8]" />
            <span>Servidor: América do Sul</span>
          </div>
          <div className="flex items-end gap-[2px] h-3">
            <span className="w-[3px] h-[5px] bg-[#5ed162]" />
            <span className="w-[3px] h-[8px] bg-[#5ed162]" />
            <span className="w-[3px] h-[11px] bg-[#5ed162]" />
            <span className="w-[3px] h-[13px] bg-[#5ed162]" />
          </div>
          <span className="font-mono-hud text-[#99a3ab] ml-2">v1.0.0</span>
        </div>
      </div>
    );
  }

  // === OPERADOR ELIMINADO — EXACT REFERENCE MATCH ===
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-between pointer-events-auto select-none"
      style={{
        background:
          'radial-gradient(ellipse at center, rgba(24,14,15,0.68) 0%, rgba(56,14,16,0.78) 62%, rgba(28,8,10,0.92) 100%)',
      }}
    >
      {/* Center Combat Report Card */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
        <div className="relative w-full max-w-[660px] rounded-[12px] bg-[#141416]/88 border border-white/14 shadow-[0_28px_90px_rgba(0,0,0,0.88)] px-6 sm:px-8 py-5 sm:py-6">
          {/* Top-right micro kicker */}
          <div className="flex justify-end">
            <span className="text-[11px] font-medium tracking-[0.06em] text-[#9ea3a8] uppercase">
              RELATÓRIO DE COMBATE
            </span>
          </div>

          {/* Centered Red Header */}
          <div className="text-center mt-0.5">
            <h1 className="font-military font-bold text-[34px] sm:text-[38px] tracking-[0.06em] uppercase text-[#e1493c] leading-none">
              OPERADOR ELIMINADO
            </h1>
            <p className="text-[14px] text-[#cfd3d7] mt-1.5">
              Sua operação foi interrompida
            </p>
          </div>

          <div className="border-t border-white/14 my-4" />

          {/* Section 1: RESUMO DA ELIMINAÇÃO */}
          <div>
            <h2 className="font-military font-bold text-[16px] tracking-[0.06em] uppercase text-[#e5be6a] mb-3">
              RESUMO DA ELIMINAÇÃO
            </h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <div>
                <div className="text-[11px] tracking-[0.05em] uppercase text-[#989ea4]">
                  ELIMINADO POR
                </div>
                <div className="text-[16px] font-semibold text-white mt-0.5">
                  {hud.killedBy || 'Soldado Inimigo'}
                </div>
              </div>
              <div>
                <div className="text-[11px] tracking-[0.05em] uppercase text-[#989ea4]">
                  DISTÂNCIA
                </div>
                <div className="text-[16px] font-semibold text-white mt-0.5 tabular-nums">
                  {hud.killedDistanceMeters > 0 ? `${hud.killedDistanceMeters} metros` : 'Curta distância'}
                </div>
              </div>
              <div>
                <div className="text-[11px] tracking-[0.05em] uppercase text-[#989ea4]">
                  ARMA UTILIZADA
                </div>
                <div className="text-[16px] font-semibold text-white mt-0.5">
                  {hud.killedByWeapon || 'Rifle de assalto'}
                </div>
              </div>
              <div>
                <div className="text-[11px] tracking-[0.05em] uppercase text-[#989ea4]">
                  TEMPO DE OPERAÇÃO
                </div>
                <div className="text-[16px] font-semibold text-white mt-0.5 tabular-nums">
                  {formatOperationDuration(hud.operationDurationSec)}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/14 my-4" />

          {/* Section 2: ESTATÍSTICAS */}
          <div>
            <h2 className="font-military font-bold text-[16px] tracking-[0.06em] uppercase text-[#e5be6a] mb-3">
              ESTATÍSTICAS
            </h2>
            <div className="grid grid-cols-3 gap-4 text-center py-0.5">
              <div>
                <div className="text-[28px] font-bold text-white leading-none tabular-nums">
                  {hud.kills}
                </div>
                <div className="text-[12px] text-[#9fa5ab] mt-1.5">Eliminações</div>
              </div>
              <div>
                <div className="text-[28px] font-bold text-white leading-none tabular-nums">
                  {hud.lootCollectedCount}
                </div>
                <div className="text-[12px] text-[#9fa5ab] mt-1.5">Loot coletado</div>
              </div>
              <div>
                <div className="text-[28px] font-bold text-white leading-none tabular-nums">
                  {hud.xp.toLocaleString('pt-BR')}
                </div>
                <div className="text-[12px] text-[#9fa5ab] mt-1.5">XP obtido</div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/14 my-4" />

          {/* Section 3: EQUIPAMENTOS PERDIDOS (Interactive Inspectable Gear Slots) */}
          <div>
            <h2 className="font-military font-bold text-[16px] tracking-[0.06em] uppercase text-[#e5be6a] mb-3">
              EQUIPAMENTOS PERDIDOS
            </h2>
            <div className="flex flex-wrap items-center gap-2.5">
              {lostGear.map((item) => {
                const isSelected = selectedGearId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedGearId(isSelected ? null : item.id)}
                    onMouseEnter={() => setSelectedGearId(item.id)}
                    title={`${item.name} — ${item.detail}`}
                    className={`flex items-center justify-center rounded-[8px] border transition-all cursor-pointer ${
                      item.kind === 'weapon' ? 'w-[114px] h-[64px]' : 'w-[66px] h-[64px]'
                    } ${
                      isSelected
                        ? 'bg-[#2a2d31] border-[#e5be6a] shadow-[0_0_16px_rgba(229,190,106,0.22)]'
                        : 'bg-[#222528]/90 border-white/15 hover:border-white/40'
                    }`}
                  >
                    {item.kind === 'weapon' && <RifleSilhouetteIcon />}
                    {item.kind === 'armor' && <PlateCarrierIcon />}
                    {item.kind === 'backpack' && <BackpackSilhouetteIcon />}
                  </button>
                );
              })}

              {/* Interactive detail readout when hovering/selecting any lost equipment slot */}
              {activeGear && (
                <div className="flex-1 min-w-[200px] px-3 py-2 rounded-[6px] bg-[#1b1e22]/90 border border-[#e5be6a]/30 text-left">
                  <div className="font-military font-bold text-[15px] tracking-wide text-white uppercase leading-tight">
                    {activeGear.name}
                  </div>
                  <div className="text-[11px] font-mono-hud text-[#aeb5bc] mt-0.5">
                    {activeGear.detail} · <span className="text-[#e5be6a]">${activeGear.value.toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3 Full-Width Stacked Interactive Buttons */}
          <div className="mt-6 space-y-2.5">
            <button
              onClick={onRedeploy}
              className="w-full h-[46px] rounded-[4px] bg-gradient-to-r from-[#d4a536] via-[#dcae42] to-[#c9982c] hover:brightness-110 active:brightness-95 text-[#141414] font-military font-bold text-[18px] tracking-[0.1em] uppercase cursor-pointer transition-all shadow-[0_6px_22px_rgba(217,168,58,0.25)]"
            >
              REAPARECER
            </button>

            <button
              onClick={() => setSpectating(true)}
              className="w-full h-[46px] rounded-[4px] bg-[#16191d]/75 hover:bg-[#23282e] border border-white/30 hover:border-[#e5be6a] text-white font-military font-bold text-[17px] tracking-[0.1em] uppercase flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Eye className="w-4 h-4 text-[#d5dce2] opacity-80" />
              <span>ASSISTIR COMBATE</span>
            </button>

            <button
              onClick={onReturnToMenu}
              className="w-full h-[46px] rounded-[4px] bg-[#16191d]/75 hover:bg-[#23282e] border border-white/30 hover:border-white/55 text-white font-military font-bold text-[17px] tracking-[0.1em] uppercase cursor-pointer transition-colors"
            >
              VOLTAR AO MENU
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Slim Status Footer Bar (Matches Main Menu & Reference) */}
      <div className="h-[34px] px-4 lg:px-6 bg-[#0b0e11]/90 border-t border-white/10 flex items-center justify-between text-[11px] text-[#c7cfd4]">
        <span className="font-mono-hud text-[10px] text-[#98a1a8]">
          REAPARECER insere você em um setor aleatório do mapa
        </span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-[#dce3e8]" />
            <span className="text-[#e3e8ec]">Servidor: América do Sul</span>
          </div>
          <div className="flex items-end gap-[2px] h-3" aria-label="Sinal excelente">
            <span className="w-[3px] h-[5px] bg-[#5ed162]" />
            <span className="w-[3px] h-[8px] bg-[#5ed162]" />
            <span className="w-[3px] h-[11px] bg-[#5ed162]" />
            <span className="w-[3px] h-[13px] bg-[#5ed162]" />
          </div>
          <span className="font-mono-hud text-[#99a3ab] ml-2">v1.0.0</span>
        </div>
      </div>
    </div>
  );
};
