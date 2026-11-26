import React, { useMemo, useState } from 'react';
import {
  Award,
  Backpack,
  Check,
  CheckCircle2,
  CloudRain,
  Crosshair,
  Flame,
  Lock,
  Play,
  Shield,
  ShoppingCart,
  Sliders,
  Sun,
  Target,
  TrendingUp,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  DeploymentConfig,
  DeploymentMode,
  GameSettings,
  GraphicsPreset,
  HUDState,
  WeaponCategory,
  WeaponId,
  WeatherType,
} from '../game/types';
import { ALL_WEAPON_IDS, WEAPONS } from '../game/data/weapons';
import { ITEMS } from '../game/data/items';
import { REGIONS } from '../game/data/worldConfig';

export type MenuTabId =
  | 'jogar'
  | 'operador'
  | 'arsenal'
  | 'inventario'
  | 'missoes'
  | 'progressao'
  | 'loja'
  | 'configuracoes'
  | 'desafios'
  | 'passe'
  | 'evento';

export interface DailyChallengeItem {
  id: string;
  label: string;
  current: number;
  target: number;
  rewardCp: number;
  claimed: boolean;
}

export interface OperatorPreset {
  id: string;
  name: string;
  role: string;
  unit: string;
  armorId: string;
  helmetId: string;
  perk: string;
  accent: string;
}

export const OPERATOR_PRESETS: OperatorPreset[] = [
  {
    id: 'multicam_assault',
    name: 'ASSALTO MULTICAM',
    role: 'Força-Tarefa Recon',
    unit: 'Esquadrão Alpha-1',
    armorId: 'armor_plate',
    helmetId: 'helmet_ops',
    perk: 'Plate Carrier Nível III + Capacete Ops-Core FAST',
    accent: '#d9a42a',
  },
  {
    id: 'desert_recon',
    name: 'RECON DESERTO',
    role: 'Operações Áridas',
    unit: 'Destacamento Duna',
    armorId: 'armor_kevlar',
    helmetId: 'helmet_ach',
    perk: 'Mobilidade tática + Kit de campo equilibrado',
    accent: '#c98e42',
  },
  {
    id: 'ghost_sniper',
    name: 'ATIRADOR FANTASMA',
    role: 'Reconhecimento Furtivo',
    unit: 'Unidade Sombra',
    armorId: 'armor_kevlar',
    helmetId: 'helmet_ops',
    perk: 'Proteção craniana -40% HS + postura silenciosa',
    accent: '#7aa885',
  },
  {
    id: 'heavy_vanguard',
    name: 'VANGUARDA BLINDADA',
    role: 'Breacher Pesado',
    unit: 'Blindagem Spec-Ops',
    armorId: 'armor_juggernaut',
    helmetId: 'helmet_ops',
    perk: 'Blindagem Spec-Ops IV (120 durabilidade)',
    accent: '#c45b43',
  },
];

export interface ShopBundle {
  id: string;
  name: string;
  subtitle: string;
  priceCp: number;
  rarity: 'RARO' | 'ÉPICO' | 'LENDÁRIO';
  items: { templateId: string; quantity: number }[];
}

export const SHOP_BUNDLES: ShopBundle[] = [
  {
    id: 'bundle_specops_armor',
    name: 'KIT BLINDAGEM SPEC-OPS IV',
    subtitle: 'Colete Blindado Classe IV + Capacete Ops-Core FAST + 2x IFAK',
    priceCp: 2400,
    rarity: 'ÉPICO',
    items: [
      { templateId: 'armor_juggernaut', quantity: 1 },
      { templateId: 'helmet_ops', quantity: 1 },
      { templateId: 'med_ifak', quantity: 2 },
    ],
  },
  {
    id: 'bundle_trauma_med',
    name: 'PACOTE MÉDICO TRAUMA DE CAMPO',
    subtitle: '3x Kit Médico IFAK + 4x Bandagens + 2x Analgésico Tático',
    priceCp: 950,
    rarity: 'RARO',
    items: [
      { templateId: 'med_ifak', quantity: 3 },
      { templateId: 'med_bandage', quantity: 4 },
      { templateId: 'med_painkiller', quantity: 2 },
    ],
  },
  {
    id: 'bundle_demolition',
    name: 'ARSENAL EXPLOSIVO & SUPRIMENTOS',
    subtitle: '4x Granada M67 Frag + 2x Carga C4 + 1x Silenciador QD',
    priceCp: 1650,
    rarity: 'ÉPICO',
    items: [
      { templateId: 'grenade_frag', quantity: 4 },
      { templateId: 'c4_charge', quantity: 2 },
      { templateId: 'attach_suppressor', quantity: 1 },
    ],
  },
  {
    id: 'bundle_expedition_pack',
    name: 'CARGUEIRO DE EXPEDIÇÃO 65L',
    subtitle: 'Mochila Militar 65kg + 60x 5.56mm + 40x 7.62mm + 2x MRE',
    priceCp: 1900,
    rarity: 'LENDÁRIO',
    items: [
      { templateId: 'pack_expedition', quantity: 1 },
      { templateId: 'ammo_556', quantity: 60 },
      { templateId: 'ammo_762', quantity: 40 },
      { templateId: 'sup_ration', quantity: 2 },
    ],
  },
];

const CATEGORY_LABELS: Record<WeaponCategory, string> = {
  assault: 'RIFLES DE ASSALTO',
  smg: 'SUBMETRALHADORAS',
  battle_rifle: 'RIFLES DE BATALHA',
  sniper: 'PRECISÃO / SNIPER',
  shotgun: 'ESCOPETAS',
  pistol: 'PISTOLAS',
};

const PRESETS: { id: GraphicsPreset; label: string }[] = [
  { id: 'LOW', label: 'BAIXO' },
  { id: 'MEDIUM', label: 'MÉDIO' },
  { id: 'HIGH', label: 'ALTO' },
  { id: 'ULTRA', label: 'ULTRA' },
];

const WEATHERS: { id: WeatherType; label: string }[] = [
  { id: 'clear', label: 'SOL' },
  { id: 'overcast', label: 'NUBLADO' },
  { id: 'fog', label: 'NEBLINA' },
  { id: 'rain', label: 'CHUVA' },
];

interface MenuDrawersProps {
  activeTab: MenuTabId;
  onClose: () => void;
  hud: HUDState;
  settings: GameSettings;
  callsign: string;
  onChangeCallsign: (v: string) => void;
  selectedOperatorId: string;
  onSelectOperator: (preset: OperatorPreset) => void;
  deployConfig: DeploymentConfig;
  onChangeDeployConfig: (partial: Partial<DeploymentConfig>) => void;
  cpBalance: number;
  purchasedBundleIds: string[];
  onPurchaseBundle: (bundle: ShopBundle) => void;
  challenges: DailyChallengeItem[];
  onClaimChallenge: (id: string) => void;
  onTrackMission: (id: string) => void;
  onUpdateSettings: (partial: Partial<GameSettings>) => void;
  onSetWeather: (w: WeatherType) => void;
  onSetTime: (h: number) => void;
  onDeployModeNow: (mode: DeploymentMode) => void;
  eventTitle: string;
  eventSubtitle: string;
  eventTimer: string;
  eventImage: string;
  playerLevel: number;
  currentXpDisplay: number;
  nextLevelXp: number;
}

export const MenuDrawers: React.FC<MenuDrawersProps> = ({
  activeTab,
  onClose,
  hud,
  settings,
  callsign,
  onChangeCallsign,
  selectedOperatorId,
  onSelectOperator,
  deployConfig,
  onChangeDeployConfig,
  cpBalance,
  purchasedBundleIds,
  onPurchaseBundle,
  challenges,
  onClaimChallenge,
  onTrackMission,
  onUpdateSettings,
  onSetWeather,
  onSetTime,
  onDeployModeNow,
  eventTitle,
  eventSubtitle,
  eventTimer,
  eventImage,
  playerLevel,
  currentXpDisplay,
  nextLevelXp,
}) => {
  const [weaponFilter, setWeaponFilter] = useState<WeaponCategory | 'all'>('all');
  const [focusedWeaponId, setFocusedWeaponId] = useState<WeaponId>(deployConfig.primaryWeapon);

  const filteredWeapons = useMemo(() => {
    return ALL_WEAPON_IDS.map((id) => WEAPONS[id]).filter(
      (w) => weaponFilter === 'all' || w.category === weaponFilter
    );
  }, [weaponFilter]);

  if (activeTab === 'jogar') return null;

  const focusedWeapon = WEAPONS[focusedWeaponId] ?? WEAPONS.m4a1;

  const drawerMeta: Record<Exclude<MenuTabId, 'jogar'>, { title: string; subtitle: string; icon: React.ReactNode }> = {
    operador: {
      title: 'OPERADOR & IDENTIFICAÇÃO',
      subtitle: 'Configure seu soldado, indicativo de chamada e blindagem de inserção',
      icon: <User className="w-5 h-5 text-[#f5c542]" />,
    },
    arsenal: {
      title: 'ARSENAL TÁTICO (15 ARMAS)',
      subtitle: 'Escolha seu armamento primário, secundário e pistola para a operação',
      icon: <Crosshair className="w-5 h-5 text-[#f5c542]" />,
    },
    inventario: {
      title: 'INVENTÁRIO & KIT DE CAMPO',
      subtitle: 'Equipamento de inserção, suprimentos adquiridos e cofre extraído',
      icon: <Backpack className="w-5 h-5 text-[#f5c542]" />,
    },
    missoes: {
      title: 'CONTRATOS & MISSÕES WILDLANDS',
      subtitle: 'Selecione o objetivo prioritário rastreado no HUD tático',
      icon: <Target className="w-5 h-5 text-[#f5c542]" />,
    },
    progressao: {
      title: 'PROGRESSÃO DE CARREIRA',
      subtitle: 'Patente militar, estatísticas de combate e marcos desbloqueados',
      icon: <TrendingUp className="w-5 h-5 text-[#f5c542]" />,
    },
    loja: {
      title: 'LOJA DE SUPRIMENTOS TÁTICOS',
      subtitle: 'Utilize seus Créditos Operacionais (CP) para reforçar sua inserção',
      icon: <ShoppingCart className="w-5 h-5 text-[#f5c542]" />,
    },
    configuracoes: {
      title: 'CONFIGURAÇÕES DO SISTEMA',
      subtitle: 'Gráficos AAA, câmera, áudio espacial e atmosfera em tempo real',
      icon: <Sliders className="w-5 h-5 text-[#f5c542]" />,
    },
    desafios: {
      title: 'DESAFIOS DIÁRIOS',
      subtitle: 'Complete objetivos operacionais para resgatar recompensas em CP',
      icon: <Award className="w-5 h-5 text-[#f5c542]" />,
    },
    passe: {
      title: 'PASSE DE BATALHA — TEMPORADA 01',
      subtitle: 'Nível 50 · Recompensas exclusivas da Operação Wildlands',
      icon: <Shield className="w-5 h-5 text-[#f5c542]" />,
    },
    evento: {
      title: eventTitle,
      subtitle: `Evento Especial · Termina em: ${eventTimer}`,
      icon: <Flame className="w-5 h-5 text-[#f5c542]" />,
    },
  };

  const meta = drawerMeta[activeTab];

  return (
    <div className="absolute inset-y-0 left-[306px] right-4 lg:right-6 top-[74px] bottom-[44px] z-30 flex flex-col bg-[#101417]/95 border border-[#f5c542]/35 shadow-[0_24px_60px_rgba(0,0,0,0.85)] overflow-hidden">
      {/* Top golden accent line */}
      <div className="h-[2px] w-full bg-gradient-to-r from-[#f5c542] via-[#d99b1e]/70 to-transparent shrink-0" />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-[#161b1f]/95 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center bg-[#f5c542]/12 border border-[#f5c542]/40">
            {meta.icon}
          </div>
          <div>
            <h2 className="font-military font-bold text-2xl tracking-[0.06em] uppercase text-white leading-none">
              {meta.title}
            </h2>
            <p className="text-xs text-[#a5aeb5] mt-0.5">{meta.subtitle}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1d2328] hover:bg-[#2a3239] border border-white/15 hover:border-[#f5c542]/60 text-xs font-military font-semibold tracking-wider uppercase text-[#dde2e6] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4 text-[#f5c542]" />
          <span>FECHAR</span>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* === OPERADOR === */}
        {activeTab === 'operador' && (
          <div className="space-y-5">
            <div className="bg-[#161c21] border border-white/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-mono-hud uppercase tracking-widest text-[#f5c542]">
                  INDICATIVO DE CHAMADA (CALLSIGN)
                </div>
                <p className="text-xs text-[#9ca5ac] mt-0.5">
                  Nome exibido no seu perfil militar e registros de operação.
                </p>
              </div>
              <input
                type="text"
                maxLength={18}
                value={callsign}
                onChange={(e) => onChangeCallsign(e.target.value)}
                className="w-full sm:w-56 px-3 py-2 bg-[#0c0f12] border border-white/20 focus:border-[#f5c542] focus:outline-none text-sm font-semibold text-white tracking-wide"
                placeholder="CaioGamer"
              />
            </div>

            <div>
              <div className="text-xs font-mono-hud uppercase tracking-widest text-[#c6ced4] mb-3">
                ESPECIALIZAÇÃO & EQUIPAMENTO TÁTICO
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {OPERATOR_PRESETS.map((preset) => {
                  const selected = selectedOperatorId === preset.id;
                  const armor = ITEMS[preset.armorId];
                  const helmet = ITEMS[preset.helmetId];
                  return (
                    <button
                      key={preset.id}
                      onClick={() => onSelectOperator(preset)}
                      className={`text-left p-4 border transition-all cursor-pointer ${
                        selected
                          ? 'bg-gradient-to-r from-[#d49a1a]/22 via-[#1b2024] to-[#14181c] border-[#f5c542]'
                          : 'bg-[#151a1e] border-white/10 hover:border-white/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-mono-hud uppercase tracking-widest text-[#9aa4ac]">
                            {preset.unit} · {preset.role}
                          </div>
                          <div className="font-military font-bold text-xl tracking-wide text-white mt-0.5">
                            {preset.name}
                          </div>
                        </div>
                        {selected && (
                          <span className="px-2 py-0.5 bg-[#f5c542] text-[#111315] font-military font-bold text-xs tracking-wider uppercase">
                            EQUIPADO
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#c7cfd4] mt-2">{preset.perk}</p>
                      <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-white/10 text-[11px] font-mono-hud text-[#99a3ab]">
                        <div>COLETE: <span className="text-white">{armor?.armorProtection ?? 50} PROT</span></div>
                        <div>CAPACETE: <span className="text-white">-{Math.round((helmet?.helmetReduction ?? 0.25) * 100)}% HS</span></div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* === ARSENAL === */}
        {activeTab === 'arsenal' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 h-full">
            {/* Left: Current Loadout + Weapon Grid */}
            <div className="xl:col-span-7 flex flex-col gap-4">
              {/* Active 3 Slots */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'SLOT 1 · PRIMÁRIA', id: deployConfig.primaryWeapon },
                  { label: 'SLOT 2 · SECUNDÁRIA', id: deployConfig.secondaryWeapon },
                  { label: 'SLOT 3 · PISTOLA', id: deployConfig.sidearmWeapon },
                ].map((slot) => {
                  const spec = WEAPONS[slot.id];
                  return (
                    <div
                      key={slot.label}
                      onClick={() => setFocusedWeaponId(slot.id)}
                      className="p-2.5 bg-[#161c21] border border-[#f5c542]/40 cursor-pointer hover:border-[#f5c542]"
                    >
                      <div className="text-[10px] font-mono-hud text-[#f5c542] tracking-wider">{slot.label}</div>
                      <div className="font-military font-bold text-lg text-white leading-tight mt-0.5 truncate">
                        {spec.name}
                      </div>
                      <div className="text-[10px] font-mono-hud text-[#98a2aa]">
                        {spec.caliber} · {spec.magSize} ROUNDS
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Category Filter */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setWeaponFilter('all')}
                  className={`px-2.5 py-1 text-[11px] font-military font-semibold tracking-wider uppercase border cursor-pointer ${
                    weaponFilter === 'all'
                      ? 'bg-[#f5c542] text-[#111315] border-[#f5c542]'
                      : 'bg-[#171c20] text-[#b5bec5] border-white/15 hover:border-white/35'
                  }`}
                >
                  TODAS ({ALL_WEAPON_IDS.length})
                </button>
                {(Object.keys(CATEGORY_LABELS) as WeaponCategory[]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setWeaponFilter(cat)}
                    className={`px-2.5 py-1 text-[11px] font-military font-semibold tracking-wider uppercase border cursor-pointer ${
                      weaponFilter === cat
                        ? 'bg-[#f5c542] text-[#111315] border-[#f5c542]'
                        : 'bg-[#171c20] text-[#b5bec5] border-white/15 hover:border-white/35'
                    }`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>

              {/* Weapon List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredWeapons.map((w) => {
                  const isFocused = w.id === focusedWeaponId;
                  const equippedTag =
                    deployConfig.primaryWeapon === w.id
                      ? 'PRIMÁRIA'
                      : deployConfig.secondaryWeapon === w.id
                      ? 'SECUNDÁRIA'
                      : deployConfig.sidearmWeapon === w.id
                      ? 'PISTOLA'
                      : null;
                  return (
                    <button
                      key={w.id}
                      onClick={() => setFocusedWeaponId(w.id)}
                      className={`text-left p-3 border transition-colors cursor-pointer ${
                        isFocused
                          ? 'bg-[#22282d] border-[#f5c542]'
                          : 'bg-[#151a1e] border-white/10 hover:border-white/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-military font-bold text-lg text-white leading-none">{w.name}</span>
                        {equippedTag && (
                          <span className="px-1.5 py-0.5 text-[10px] font-mono-hud bg-[#f5c542]/20 border border-[#f5c542]/60 text-[#f5c542]">
                            {equippedTag}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono-hud text-[#939da5] mt-1.5">
                        <span>{w.caliber}</span>
                        <span>DMG {w.damage * w.pellets} · {w.rpm} RPM</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Focused Weapon Specs & Equip Actions */}
            <div className="xl:col-span-5 bg-[#151a1e] border border-white/12 p-4 flex flex-col justify-between gap-4">
              <div>
                <div className="text-[10px] font-mono-hud uppercase tracking-widest text-[#f5c542]">
                  {CATEGORY_LABELS[focusedWeapon.category]} · {focusedWeapon.caliber}
                </div>
                <h3 className="font-military font-extrabold text-3xl tracking-wide text-white mt-0.5">
                  {focusedWeapon.name}
                </h3>
                <p className="text-xs text-[#b5bec4] leading-relaxed mt-2">{focusedWeapon.description}</p>

                {/* Ballistic Bars */}
                <div className="space-y-3 mt-5">
                  {[
                    { label: 'DANO BALÍSTICO', value: Math.min(100, Math.round(((focusedWeapon.damage * focusedWeapon.pellets) / 130) * 100)), raw: `${focusedWeapon.damage}${focusedWeapon.pellets > 1 ? `x${focusedWeapon.pellets}` : ''}` },
                    { label: 'CADÊNCIA (RPM)', value: Math.min(100, Math.round((focusedWeapon.rpm / 950) * 100)), raw: `${focusedWeapon.rpm}` },
                    { label: 'ALCANCE EFETIVO', value: Math.min(100, Math.round((focusedWeapon.range / 620) * 100)), raw: `${focusedWeapon.range}m` },
                    { label: 'PRECISÃO ADS', value: Math.min(100, Math.max(18, Math.round((1 - focusedWeapon.adsSpread * 16) * 100))), raw: `${Math.round((1 - focusedWeapon.adsSpread * 10) * 100)}%` },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <div className="flex justify-between text-[11px] font-mono-hud mb-1">
                        <span className="text-[#9ea8b0]">{stat.label}</span>
                        <span className="text-white font-semibold">{stat.raw}</span>
                      </div>
                      <div className="h-1.5 bg-[#0b0e10] overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#d4961c] to-[#f7cb4d]"
                          style={{ width: `${stat.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2 mt-5 pt-3 border-t border-white/10 text-[11px] font-mono-hud">
                  <div>
                    <div className="text-[#8a949c]">CARREGADOR</div>
                    <div className="text-white font-bold">{focusedWeapon.magSize}</div>
                  </div>
                  <div>
                    <div className="text-[#8a949c]">RECARGA</div>
                    <div className="text-white font-bold">{focusedWeapon.reloadTime}s</div>
                  </div>
                  <div>
                    <div className="text-[#8a949c]">MODOS</div>
                    <div className="text-white font-bold">{focusedWeapon.fireModes.join('/')}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-white/10">
                {focusedWeapon.category === 'pistol' ? (
                  <button
                    onClick={() => onChangeDeployConfig({ sidearmWeapon: focusedWeapon.id })}
                    className="w-full py-2.5 bg-[#f5c542] hover:bg-[#ffd65c] text-[#111315] font-military font-extrabold text-base tracking-wider uppercase cursor-pointer transition-colors"
                  >
                    EQUIPAR NO SLOT 3 (PISTOLA)
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onChangeDeployConfig({ primaryWeapon: focusedWeapon.id })}
                      className="py-2.5 bg-[#f5c542] hover:bg-[#ffd65c] text-[#111315] font-military font-extrabold text-sm tracking-wider uppercase cursor-pointer transition-colors"
                    >
                      EQUIPAR PRIMÁRIA
                    </button>
                    <button
                      onClick={() => onChangeDeployConfig({ secondaryWeapon: focusedWeapon.id })}
                      className="py-2.5 bg-[#22292f] hover:bg-[#2d363e] border border-[#f5c542]/50 text-white font-military font-bold text-sm tracking-wider uppercase cursor-pointer transition-colors"
                    >
                      EQUIPAR SECUNDÁRIA
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* === INVENTÁRIO === */}
        {activeTab === 'inventario' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 bg-[#151a1e] border border-white/12">
                <div className="text-[10px] font-mono-hud text-[#99a3ab]">ARMA PRIMÁRIA / SECUNDÁRIA</div>
                <div className="font-military font-bold text-lg text-white mt-0.5">
                  {WEAPONS[deployConfig.primaryWeapon].name} + {WEAPONS[deployConfig.secondaryWeapon].name}
                </div>
              </div>
              <div className="p-3.5 bg-[#151a1e] border border-white/12">
                <div className="text-[10px] font-mono-hud text-[#99a3ab]">PROTEÇÃO EQUIPADA</div>
                <div className="font-military font-bold text-lg text-[#f5c542] mt-0.5">
                  {ITEMS[deployConfig.armorId]?.name ?? 'Colete Kevlar Nível II'}
                </div>
              </div>
              <div className="p-3.5 bg-[#151a1e] border border-white/12">
                <div className="text-[10px] font-mono-hud text-[#99a3ab]">STASH EXTRAÍDO</div>
                <div className="font-military font-bold text-lg text-[#6cc46d] mt-0.5">
                  {hud.stashedItemsCount} ITENS · ${hud.stashedValue.toLocaleString('pt-BR')}
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-mono-hud uppercase tracking-widest text-[#c6ced4] mb-2.5">
                SUPRIMENTOS PRONTOS PARA INSERÇÃO
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {[
                  ...hud.inventory.map((it) => ({ templateId: it.templateId, quantity: it.quantity, source: 'PADRÃO' })),
                  ...deployConfig.bonusItems.map((b) => ({ templateId: b.templateId, quantity: b.quantity, source: 'LOJA' })),
                ].map((entry, idx) => {
                  const tpl = ITEMS[entry.templateId];
                  if (!tpl) return null;
                  return (
                    <div
                      key={`${entry.templateId}_${idx}`}
                      className="p-3 bg-[#151a1e] border border-white/10 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{tpl.name}</div>
                        <div className="text-[11px] font-mono-hud text-[#8f99a1]">
                          {tpl.weight}kg · {entry.source}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 bg-[#22292f] border border-white/15 text-xs font-mono-hud text-[#f5c542] shrink-0">
                        x{entry.quantity}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* === MISSÕES === */}
        {activeTab === 'missoes' && (
          <div className="space-y-3">
            {hud.missions.map((m) => {
              const tracked = hud.trackedMissionId === m.id;
              const pct = Math.min(100, Math.round((m.progress / Math.max(1, m.targetCount)) * 100));
              const region = REGIONS[m.regionId];
              return (
                <div
                  key={m.id}
                  className={`p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    tracked
                      ? 'bg-gradient-to-r from-[#d49a1a]/20 via-[#181d22] to-[#14181c] border-[#f5c542]'
                      : 'bg-[#151a1e] border-white/10'
                  }`}
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 text-[10px] font-mono-hud uppercase tracking-wider">
                      <span className="text-[#f5c542]">{region?.name ?? m.regionId}</span>
                      <span className="text-[#69747d]">·</span>
                      <span className="text-[#6cc46d]">+${m.rewardCredits} CP / +{m.rewardXp} XP</span>
                    </div>
                    <div className="font-military font-bold text-xl text-white tracking-wide">
                      {m.title}
                    </div>
                    <p className="text-xs text-[#aeb7be]">{m.description}</p>
                    <div className="flex items-center gap-3 pt-1">
                      <div className="flex-1 max-w-xs h-1.5 bg-[#0b0e10]">
                        <div
                          className={`h-full ${m.completed ? 'bg-[#5ec260]' : 'bg-[#f5c542]'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-mono-hud text-[#c5cdd3]">
                        {m.progress} / {m.targetCount}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onTrackMission(m.id)}
                    className={`px-4 py-2 font-military font-bold text-sm tracking-wider uppercase border cursor-pointer shrink-0 ${
                      m.completed
                        ? 'bg-[#1d2e20] border-[#5ec260]/60 text-[#7fe081]'
                        : tracked
                        ? 'bg-[#f5c542] border-[#f5c542] text-[#111315]'
                        : 'bg-[#1e2429] border-white/20 hover:border-[#f5c542] text-white'
                    }`}
                  >
                    {m.completed ? 'CONCLUÍDA' : tracked ? 'RASTREANDO' : 'RASTREAR MISSÃO'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* === PROGRESSÃO === */}
        {activeTab === 'progressao' && (
          <div className="space-y-5">
            <div className="p-5 bg-gradient-to-r from-[#1c2227] via-[#151a1e] to-[#121619] border border-[#f5c542]/40">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-mono-hud text-[#f5c542] tracking-widest uppercase">
                    PATENTE ATUAL · {callsign.toUpperCase()}
                  </div>
                  <div className="font-military font-extrabold text-4xl text-white tracking-wide mt-0.5">
                    NÍVEL {playerLevel} — COMANDANTE RECON
                  </div>
                </div>
                <div className="text-right font-mono-hud">
                  <div className="text-sm text-white font-bold">
                    {currentXpDisplay.toLocaleString('pt-BR')} / {nextLevelXp.toLocaleString('pt-BR')} XP
                  </div>
                  <div className="text-[11px] text-[#98a3ab]">
                    Faltam {(nextLevelXp - currentXpDisplay).toLocaleString('pt-BR')} XP para o Nível {playerLevel + 1}
                  </div>
                </div>
              </div>
              <div className="h-2.5 bg-[#0b0e10] mt-4 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#d4961c] via-[#f5c542] to-[#ffe17d]"
                  style={{ width: `${Math.min(100, Math.round((currentXpDisplay / nextLevelXp) * 100))}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'ABATES EM SESSÃO', val: hud.kills },
                { label: 'TIROS NA CABEÇA', val: hud.headshots },
                { label: 'SETORES ATIVOS', val: 7 },
                { label: 'CRÉDITOS CP', val: cpBalance.toLocaleString('pt-BR') },
              ].map((stat) => (
                <div key={stat.label} className="p-4 bg-[#151a1e] border border-white/10">
                  <div className="text-[10px] font-mono-hud text-[#909aa2]">{stat.label}</div>
                  <div className="font-military font-bold text-3xl text-white mt-1 tabular-nums">{stat.val}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { lv: 40, reward: 'Rifle SCAR-H CQC Desbloqueado', unlocked: true },
                { lv: 42, reward: 'Capacete Ops-Core FAST', unlocked: true },
                { lv: 45, reward: 'Sniper M700 Long-Range Elite', unlocked: playerLevel >= 45 },
              ].map((m) => (
                <div key={m.lv} className="p-3.5 bg-[#151a1e] border border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono-hud text-[#f5c542]">NÍVEL {m.lv}</div>
                    <div className="text-sm font-semibold text-white mt-0.5">{m.reward}</div>
                  </div>
                  {m.unlocked ? (
                    <CheckCircle2 className="w-5 h-5 text-[#5ec260] shrink-0" />
                  ) : (
                    <Lock className="w-4 h-4 text-[#778189] shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === LOJA === */}
        {activeTab === 'loja' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 bg-[#161c21] border border-[#f5c542]/35">
              <div className="text-xs text-[#c5cdd3]">
                Itens adquiridos são entregues automaticamente na sua mochila ao clicar em <strong className="text-[#f5c542]">ENTRAR</strong>.
              </div>
              <div className="font-mono-hud font-bold text-sm text-[#f5c542] shrink-0">
                SALDO: {cpBalance.toLocaleString('pt-BR')} CP
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {SHOP_BUNDLES.map((bundle) => {
                const owned = purchasedBundleIds.includes(bundle.id);
                const canAfford = cpBalance >= bundle.priceCp;
                return (
                  <div
                    key={bundle.id}
                    className="p-4 bg-[#151a1e] border border-white/12 flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono-hud tracking-widest text-[#f5c542] uppercase">
                          PACOTE {bundle.rarity}
                        </span>
                        <span className="font-mono-hud font-bold text-sm text-[#f5c542]">
                          {bundle.priceCp.toLocaleString('pt-BR')} CP
                        </span>
                      </div>
                      <h3 className="font-military font-bold text-2xl text-white mt-1">{bundle.name}</h3>
                      <p className="text-xs text-[#a9b2b9] mt-1">{bundle.subtitle}</p>
                    </div>
                    <button
                      disabled={owned || !canAfford}
                      onClick={() => onPurchaseBundle(bundle)}
                      className={`w-full py-2 font-military font-bold text-sm tracking-wider uppercase transition-colors ${
                        owned
                          ? 'bg-[#1d2e20] border border-[#5ec260]/60 text-[#7fe081] cursor-default'
                          : canAfford
                          ? 'bg-[#f5c542] hover:bg-[#ffd65c] text-[#111315] cursor-pointer'
                          : 'bg-[#20262b] text-[#7c858c] cursor-not-allowed'
                      }`}
                    >
                      {owned ? 'ADQUIRIDO PARA INSERÇÃO' : canAfford ? `ADQUIRIR (${bundle.priceCp.toLocaleString('pt-BR')} CP)` : 'CP INSUFICIENTE'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* === CONFIGURAÇÕES === */}
        {activeTab === 'configuracoes' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="text-xs font-mono-hud tracking-widest text-[#f5c542] uppercase border-b border-white/10 pb-1.5">
                GRÁFICOS & CÂMERA
              </div>
              <div>
                <label className="block text-[11px] font-mono-hud text-[#a9b2b9] mb-2">PRESET GRÁFICO</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onUpdateSettings({ graphicsPreset: p.id })}
                      className={`py-2 text-[11px] font-mono-hud border cursor-pointer ${
                        settings.graphicsPreset === p.id
                          ? 'bg-[#f5c542] border-[#f5c542] text-[#111315] font-bold'
                          : 'bg-[#151a1e] border-white/15 text-[#b5bec4] hover:border-white/35'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono-hud text-[#a9b2b9] mb-1">
                  <span>RENDERIZAÇÃO POR CHUNKS</span>
                  <span className="text-[#f5c542] font-bold">
                    {settings.renderDistanceChunks} {settings.renderDistanceChunks === 1 ? 'CHUNK' : 'CHUNKS'} · ~
                    {Math.round(settings.renderDistanceChunks * 190 * 0.92)}M
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={1}
                  value={settings.renderDistanceChunks}
                  onChange={(e) => onUpdateSettings({ renderDistanceChunks: Number(e.target.value) })}
                  className="w-full accent-[#f5c542]"
                />
                <div className="flex justify-between text-[9px] font-mono-hud text-[#7d8891] mt-0.5">
                  <span>1 (MAIS FPS)</span>
                  <span>FOG NO FIM DA CHUNK</span>
                  <span>4 (HORIZONTE LONGO)</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono-hud text-[#a9b2b9] mb-1">
                  <span>ESCALA DE RESOLUÇÃO</span>
                  <span className="text-white">{Math.round(settings.resolutionScale * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.6}
                  max={1.0}
                  step={0.05}
                  value={settings.resolutionScale}
                  onChange={(e) => onUpdateSettings({ resolutionScale: Number(e.target.value) })}
                  className="w-full accent-[#f5c542]"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono-hud text-[#a9b2b9] mb-1">
                  <span>CAMPO DE VISÃO (FOV)</span>
                  <span className="text-white">{settings.fov}°</span>
                </div>
                <input
                  type="range"
                  min={65}
                  max={105}
                  step={1}
                  value={settings.fov}
                  onChange={(e) => onUpdateSettings({ fov: Number(e.target.value) })}
                  className="w-full accent-[#f5c542]"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono-hud text-[#a9b2b9] mb-1">
                  <span>SENSIBILIDADE DO MOUSE</span>
                  <span className="text-white">{settings.mouseSensitivity.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.25}
                  max={2.5}
                  step={0.05}
                  value={settings.mouseSensitivity}
                  onChange={(e) => onUpdateSettings({ mouseSensitivity: Number(e.target.value) })}
                  className="w-full accent-[#f5c542]"
                />
              </div>

              <label className="flex items-center gap-2.5 text-xs font-mono-hud text-[#ced6dc] cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.invertY}
                  onChange={(e) => onUpdateSettings({ invertY: e.target.checked })}
                  className="accent-[#f5c542]"
                />
                <span>INVERTER EIXO Y DA CÂMERA</span>
              </label>
            </div>

            <div className="space-y-4">
              <div className="text-xs font-mono-hud tracking-widest text-[#f5c542] uppercase border-b border-white/10 pb-1.5">
                ÁUDIO & ATMOSFERA
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono-hud text-[#a9b2b9]">ÁUDIO GERAL</span>
                <button
                  onClick={() => onUpdateSettings({ muted: !settings.muted })}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#161c21] border border-white/20 text-[11px] font-mono-hud text-white cursor-pointer"
                >
                  {settings.muted ? <VolumeX className="w-3.5 h-3.5 text-[#e84b3c]" /> : <Volume2 className="w-3.5 h-3.5 text-[#f5c542]" />}
                  <span>{settings.muted ? 'MUDO' : 'ATIVO'}</span>
                </button>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono-hud text-[#a9b2b9] mb-1">
                  <span>VOLUME MASTER</span>
                  <span className="text-white">{Math.round(settings.masterVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.masterVolume}
                  onChange={(e) => onUpdateSettings({ masterVolume: Number(e.target.value) })}
                  className="w-full accent-[#f5c542]"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono-hud text-[#a9b2b9] mb-1">
                  <span>EFEITOS & ARMAS (SFX)</span>
                  <span className="text-white">{Math.round(settings.sfxVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.sfxVolume}
                  onChange={(e) => onUpdateSettings({ sfxVolume: Number(e.target.value) })}
                  className="w-full accent-[#f5c542]"
                />
              </div>

              <div className="pt-2 border-t border-white/10 space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-mono-hud text-[#f5c542]">
                  <CloudRain className="w-3.5 h-3.5" />
                  <span>CLIMA INICIAL</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {WEATHERS.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => onSetWeather(w.id)}
                      className={`py-1.5 text-[10px] font-mono-hud border cursor-pointer ${
                        hud.weather === w.id
                          ? 'bg-[#f5c542] border-[#f5c542] text-[#111315] font-bold'
                          : 'bg-[#151a1e] border-white/15 text-[#b5bec4]'
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] font-mono-hud text-[#a9b2b9] mb-1">
                    <span className="flex items-center gap-1.5">
                      <Sun className="w-3.5 h-3.5 text-[#f5c542]" />
                      HORÁRIO DO CENÁRIO
                    </span>
                    <span className="text-white">{Math.floor(hud.timeOfDay)}:00H</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={23.5}
                    step={0.5}
                    value={hud.timeOfDay}
                    onChange={(e) => onSetTime(Number(e.target.value))}
                    className="w-full accent-[#f5c542]"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === DESAFIOS DIÁRIOS === */}
        {activeTab === 'desafios' && (
          <div className="space-y-3">
            {challenges.map((c) => {
              const complete = c.current >= c.target;
              const pct = Math.min(100, Math.round((c.current / c.target) * 100));
              return (
                <div
                  key={c.id}
                  className="p-4 bg-[#151a1e] border border-white/12 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Check className={`w-4 h-4 ${complete ? 'text-[#5ec260]' : 'text-[#778189]'}`} />
                      <span className="font-semibold text-base text-white">{c.label}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex-1 max-w-sm h-2 bg-[#0b0e10]">
                        <div
                          className={`h-full ${complete ? 'bg-[#5ec260]' : 'bg-[#f5c542]'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono-hud text-[#c5cdd3]">
                        {c.current} / {c.target}
                      </span>
                    </div>
                  </div>
                  <button
                    disabled={!complete || c.claimed}
                    onClick={() => onClaimChallenge(c.id)}
                    className={`px-4 py-2 font-military font-bold text-sm tracking-wider uppercase ${
                      c.claimed
                        ? 'bg-[#1d2e20] border border-[#5ec260]/60 text-[#7fe081] cursor-default'
                        : complete
                        ? 'bg-[#f5c542] hover:bg-[#ffd65c] text-[#111315] cursor-pointer'
                        : 'bg-[#1f252a] text-[#838d94] cursor-not-allowed'
                    }`}
                  >
                    {c.claimed ? 'RESGATADO' : complete ? `RESGATAR +${c.rewardCp} CP` : `+${c.rewardCp} CP`}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* === PASSE DE BATALHA === */}
        {activeTab === 'passe' && (
          <div className="space-y-4">
            <div className="p-4 bg-gradient-to-r from-[#d49a1a]/25 via-[#181d22] to-[#13171b] border border-[#f5c542]/50 flex items-center justify-between">
              <div>
                <div className="text-xs font-mono-hud text-[#f5c542] uppercase tracking-widest">PASSE PREMIUM ATIVO</div>
                <div className="font-military font-extrabold text-3xl text-white">NÍVEL 50 / 50 COMPLETO</div>
                <p className="text-xs text-[#c5cdd3] mt-0.5">
                  Todas as recompensas sazonais da Força-Tarefa Wildlands foram liberadas no Arsenal e Operador.
                </p>
              </div>
              <Shield className="w-12 h-12 text-[#f5c542] shrink-0" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { tier: 'NÍVEL 10', name: 'Carabina M4A1 SOPMOD', type: 'ARMA PRIMÁRIA' },
                { tier: 'NÍVEL 20', name: 'Blindagem Plate Carrier III', type: 'PROTEÇÃO' },
                { tier: 'NÍVEL 30', name: 'Rifle SCAR-H CQC FDE', type: 'RIFLE DE BATALHA' },
                { tier: 'NÍVEL 40', name: 'Capacete Ops-Core FAST', type: 'EQUIPAMENTO' },
                { tier: 'NÍVEL 45', name: 'Sniper M700 Long-Range', type: 'LENDÁRIO' },
                { tier: 'NÍVEL 50', name: 'Operador Vanguarda Blindada', type: 'RECOMPENSA MÁXIMA' },
              ].map((item) => (
                <div key={item.tier} className="p-3.5 bg-[#151a1e] border border-[#f5c542]/30">
                  <div className="flex items-center justify-between text-[10px] font-mono-hud text-[#f5c542]">
                    <span>{item.tier}</span>
                    <span>DESBLOQUEADO</span>
                  </div>
                  <div className="font-military font-bold text-xl text-white mt-1">{item.name}</div>
                  <div className="text-[11px] font-mono-hud text-[#8f99a1] mt-0.5">{item.type}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === EVENTO ESPECIAL === */}
        {activeTab === 'evento' && (
          <div className="space-y-4">
            <div className="relative h-56 overflow-hidden border border-[#f5c542]/40">
              <img
                src={eventImage}
                alt={eventTitle}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0d1013] via-[#0d1013]/45 to-transparent" />
              <div className="absolute bottom-4 left-5 right-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs font-mono-hud text-[#f5c542] tracking-widest uppercase">
                    EVENTO ESPECIAL · TERMINA EM {eventTimer}
                  </div>
                  <h3 className="font-military font-extrabold text-4xl text-white tracking-wide">
                    {eventTitle}
                  </h3>
                  <p className="text-sm text-[#d4dce1] max-w-xl mt-1">{eventSubtitle}</p>
                </div>
                <button
                  onClick={() => onDeployModeNow('desert_op')}
                  className="flex items-center gap-2 px-6 py-3 bg-[#f5c542] hover:bg-[#ffd65c] text-[#111315] font-military font-extrabold text-lg tracking-wider uppercase cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>ENTRAR NO EVENTO</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 bg-[#151a1e] border border-white/10">
                <div className="font-mono-hud text-[#f5c542] text-[10px]">SETOR DE INSERÇÃO</div>
                <div className="font-semibold text-white mt-1">Desert Outpost — Checkpoint Bravo-04</div>
              </div>
              <div className="p-3.5 bg-[#151a1e] border border-white/10">
                <div className="font-mono-hud text-[#f5c542] text-[10px]">ATMOSFERA</div>
                <div className="font-semibold text-white mt-1">Fim de Tarde Dourado (17:30h)</div>
              </div>
              <div className="p-3.5 bg-[#151a1e] border border-white/10">
                <div className="font-mono-hud text-[#f5c542] text-[10px]">RECOMPENSA BÔNUS</div>
                <div className="font-semibold text-white mt-1">+500 CP em Caixas Militares</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
