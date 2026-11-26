import React, { useMemo, useState } from 'react';
import {
  Backpack,
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  ChevronsRight,
  Clock,
  Crosshair,
  Globe,
  Plus,
  RotateCcw,
  Settings,
  ShoppingCart,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { WEAPONS } from '../game/data/weapons';
import {
  DeploymentConfig,
  DeploymentMode,
  GameSettings,
  HUDState,
  WeatherType,
} from '../game/types';
import {
  DailyChallengeItem,
  MenuDrawers,
  MenuTabId,
  OPERATOR_PRESETS,
  OperatorPreset,
  ShopBundle,
} from './MenuDrawers';

import heroOperatorImg from '../assets/images/menu_hero_operator_1795672971835.jpg';
import eventDesertImg from '../assets/images/menu_event_desert_1795672975021.jpg';
import modeOpenWorldImg from '../assets/images/menu_mode_openworld_1795672975806.jpg';
import operatorAvatarImg from '../assets/images/menu_operator_avatar_1795672976547.jpg';

interface TitleScreenProps {
  hud: HUDState;
  settings: GameSettings;
  hasSavedGame: boolean;
  muted: boolean;
  onStartNew: (config?: DeploymentConfig) => void;
  onContinue: () => void;
  onToggleMute: () => void;
  onUpdateSettings: (partial: Partial<GameSettings>) => void;
  onSetWeather: (w: WeatherType) => void;
  onSetTime: (h: number) => void;
  onTrackMission: (id: string) => void;
}

const EVENTS_CAROUSEL = [
  {
    id: 'desert_op',
    kicker: 'EVENTO ESPECIAL',
    title: 'OPERAÇÃO DESERTO',
    subtitle: 'Avance pelo Posto Avançado Leste, neutralize comboios blindados e garanta caixas de suprimentos raras.',
    timer: '7d 12h',
    image: eventDesertImg,
  },
  {
    id: 'blacksite_siege',
    kicker: 'OPERAÇÃO TÁTICA',
    title: 'CERCO AO BLACKSITE',
    subtitle: 'Infiltre o complexo militar central e recupere os dossiês confidenciais da equipe Recon.',
    timer: '4d 08h',
    image: modeOpenWorldImg,
  },
  {
    id: 'night_recon',
    kicker: 'ALERTA NOTURNO',
    title: 'SOMBRA NA CORDILHEIRA',
    subtitle: 'Operações furtivas na Estação Radar Pico Norte com armamento silenciado.',
    timer: '2d 19h',
    image: eventDesertImg,
  },
  {
    id: 'armor_convoy',
    kicker: 'FORÇA BLINDADA',
    title: 'COMBOIO DO VALE',
    subtitle: 'Intercepte blindados APC no Vale Industrial e extraia módulos eletrônicos militares.',
    timer: '5d 04h',
    image: modeOpenWorldImg,
  },
  {
    id: 'bunker_breach',
    kicker: 'ACESSO RESTRITO',
    title: 'BUNKER SUBTERRÂNEO',
    subtitle: 'Desça à instalação de nível 4 sob alta ameaça para recuperar blindagem Spec-Ops.',
    timer: '9d 01h',
    image: eventDesertImg,
  },
];

const DEPLOY_MODES: {
  id: DeploymentMode;
  title: string;
  subtitle: string;
  image: string;
}[] = [
  {
    id: 'open_world',
    title: 'MUNDO ABERTO',
    subtitle: 'Explore, lute e sobreviva!',
    image: modeOpenWorldImg,
  },
  {
    id: 'desert_op',
    title: 'OPERAÇÃO DESERTO',
    subtitle: 'Inserção direta no Posto Árido!',
    image: eventDesertImg,
  },
  {
    id: 'night_raid',
    title: 'INCURSÃO NOTURNA',
    subtitle: 'Mapa Industrial — Combate tático noturno!',
    image: modeOpenWorldImg,
  },
  {
    id: 'training',
    title: 'TREINAMENTO',
    subtitle: 'Estande de tiro — Sem NPCs, treine sua mira!',
    image: eventDesertImg,
  },
];

const NOTIFICATIONS_DATA = [
  { id: 'n1', title: 'Evento Operação Deserto ativo', time: 'Agora', detail: 'Bônus de CP em caixas militares no setor Leste.' },
  { id: 'n2', title: 'Desafio Diário concluído', time: '12 min', detail: 'Elimine 10 inimigos (10/10) pronto para resgate.' },
  { id: 'n3', title: 'Passe de Batalha Nível 50', time: '1 h', detail: 'Recompensas exclusivas liberadas no Arsenal.' },
];

// Crisp custom SVG icons matching the exact reference silhouette
const TacticalHelmetIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 3C7.5 3 4 6.4 4 10.7v2.6c0 .9.7 1.7 1.6 1.7h1.6l.8 2.4c.4 1.2 1.8 2.6 4 2.6s3.6-1.4 4-2.6l.8-2.4h1.6c.9 0 1.6-.8 1.6-1.7v-2.6C20 6.4 16.5 3 12 3zm-4.4 8.2c1.2-.5 2.7-.7 4.4-.7s3.2.2 4.4.7c.4.2.6.6.5 1.1l-.4 1.4c-.1.4-.5.7-1 .7H8.5c-.5 0-.9-.3-1-.7l-.4-1.4c-.1-.5.1-.9.5-1.1z" />
  </svg>
);

const AssaultRifleIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 28 24" fill="currentColor" className={className}>
    <path d="M24.8 8.3l-1.5.7-3.8-1.4-2.1 1-1.3-.5-1.6.7-.9-.3-3.5 1.7-1.1-.4-6.4 3.1.9 2 3.8-1.4 1.2 1.8 1.4-.6-.9-1.7 2.2-1 1.6 3.5 1.7-.7-1.3-3.2 2.4-1.1 1.1.5 1.7-.8-.4-.9 1.9-.9 3.6 1.1 1.7-.8-.4-.9z" />
  </svg>
);

const MissionBadgeIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M5 3h14a1 1 0 0 1 1 1v10.2c0 2.7-1.6 5.1-4.1 6.2L12 22l-3.9-1.6C5.6 19.3 4 16.9 4 14.2V4a1 1 0 0 1 1-1zm7 4.2l-1.3 2.7-3 .4 2.2 2.1-.5 3 2.6-1.4 2.6 1.4-.5-3 2.2-2.1-3-.4L12 7.2z" />
  </svg>
);

const BattlePassCrest = () => (
  <svg viewBox="0 0 88 88" className="w-[74px] h-[74px] drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)]">
    <defs>
      <linearGradient id="bpGoldOuter" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff0a6" />
        <stop offset="45%" stopColor="#e5aa2b" />
        <stop offset="100%" stopColor="#7a4f0a" />
      </linearGradient>
      <linearGradient id="bpGoldInner" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4c3917" />
        <stop offset="100%" stopColor="#1b160d" />
      </linearGradient>
    </defs>
    <path
      d="M44 6 L74 18 L70 54 C69 66 57 76 44 82 C31 76 19 66 18 54 L14 18 Z"
      fill="url(#bpGoldOuter)"
      stroke="#ffe38a"
      strokeWidth="1.5"
    />
    <path
      d="M44 12 L68 22 L65 52 C64 62 54 70 44 75 C34 70 24 62 23 52 L20 22 Z"
      fill="url(#bpGoldInner)"
    />
    {/* Tactical eagle / wing emblem */}
    <path
      d="M44 21 L47 32 L61 29 L53 40 L59 44 L48 46 L44 63 L40 46 L29 44 L35 40 L27 29 L41 32 Z"
      fill="url(#bpGoldOuter)"
    />
    <circle cx="44" cy="39" r="4" fill="#fff4be" />
  </svg>
);

export const TitleScreen: React.FC<TitleScreenProps> = ({
  hud,
  settings,
  hasSavedGame,
  muted,
  onStartNew,
  onContinue,
  onToggleMute,
  onUpdateSettings,
  onSetWeather,
  onSetTime,
  onTrackMission,
}) => {
  const [activeTab, setActiveTab] = useState<MenuTabId>('jogar');
  const [callsign, setCallsign] = useState<string>('CaioGamer');
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>('multicam_assault');
  const [eventIdx, setEventIdx] = useState<number>(0);
  const [modeIdx, setModeIdx] = useState<number>(0);
  const [cpBonus, setCpBonus] = useState<number>(0);
  const [cpSpent, setCpSpent] = useState<number>(0);
  const [purchasedBundleIds, setPurchasedBundleIds] = useState<string[]>([]);
  const [claimedChallenges, setClaimedChallenges] = useState<Record<string, boolean>>({});
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(3);
  const [showSquad, setShowSquad] = useState(false);

  const [deployConfig, setDeployConfig] = useState<DeploymentConfig>({
    mode: 'open_world',
    primaryWeapon: 'm4a1',
    secondaryWeapon: 'm24',
    sidearmWeapon: 'glock17',
    armorId: 'armor_plate',
    helmetId: 'helmet_ops',
    bonusItems: [],
  });

  // Live player progression anchored to the reference NÍVEL 42 / 3.850 / 8.000 XP + live session XP
  const playerLevel = 42 + Math.max(0, hud.rank - 1);
  const nextLevelXp = 8000;
  const currentXpDisplay = (3850 + hud.xp) % nextLevelXp;
  const xpPercent = Math.min(100, Math.round((currentXpDisplay / nextLevelXp) * 100));

  // Live CP balance anchored to 12.500 + earned - spent
  const cpBalance = Math.max(0, 12500 + Math.max(0, hud.credits - 1200) + cpBonus - cpSpent);

  // Daily Challenges synced with live HUD stats & reference initial values
  const dailyChallenges: DailyChallengeItem[] = useMemo(
    () => [
      {
        id: 'elim_10',
        label: 'Elimine 10 inimigos',
        current: Math.min(10, 10 + hud.kills),
        target: 10,
        rewardCp: 500,
        claimed: Boolean(claimedChallenges['elim_10']),
      },
      {
        id: 'armor_5',
        label: 'Colete 5 kits de armadura',
        current: Math.min(5, 3 + (purchasedBundleIds.includes('bundle_specops_armor') ? 2 : 0)),
        target: 5,
        rewardCp: 750,
        claimed: Boolean(claimedChallenges['armor_5']),
      },
      {
        id: 'match_1',
        label: 'Conclua 1 partida',
        current: hud.stashedItemsCount > 0 ? 1 : 0,
        target: 1,
        rewardCp: 1000,
        claimed: Boolean(claimedChallenges['match_1']),
      },
    ],
    [claimedChallenges, hud.kills, hud.stashedItemsCount, purchasedBundleIds]
  );

  const currentEvent = EVENTS_CAROUSEL[eventIdx];
  const currentMode = DEPLOY_MODES[modeIdx];

  const handleSelectOperator = (preset: OperatorPreset) => {
    setSelectedOperatorId(preset.id);
    setDeployConfig((prev) => ({
      ...prev,
      armorId: preset.armorId,
      helmetId: preset.helmetId,
    }));
  };

  const handleChangeDeployConfig = (partial: Partial<DeploymentConfig>) => {
    setDeployConfig((prev) => ({ ...prev, ...partial }));
  };

  const handlePurchaseBundle = (bundle: ShopBundle) => {
    if (purchasedBundleIds.includes(bundle.id) || cpBalance < bundle.priceCp) return;
    setCpSpent((s) => s + bundle.priceCp);
    setPurchasedBundleIds((prev) => [...prev, bundle.id]);
    setDeployConfig((prev) => ({
      ...prev,
      bonusItems: [...prev.bonusItems, ...bundle.items],
    }));
  };

  const handleClaimChallenge = (id: string) => {
    const item = dailyChallenges.find((c) => c.id === id);
    if (!item || item.current < item.target || item.claimed) return;
    setClaimedChallenges((prev) => ({ ...prev, [id]: true }));
    setCpBonus((b) => b + item.rewardCp);
  };

  const handleDeployNow = (overrideMode?: DeploymentMode) => {
    const finalMode = overrideMode ?? currentMode.id;
    onStartNew({
      ...deployConfig,
      mode: finalMode,
      bonusCredits: cpBonus,
    });
  };

  const handleCycleMode = () => {
    const nextIdx = (modeIdx + 1) % DEPLOY_MODES.length;
    setModeIdx(nextIdx);
    setDeployConfig((prev) => ({ ...prev, mode: DEPLOY_MODES[nextIdx].id }));
  };

  const navItems: {
    id: MenuTabId;
    label: string;
    subtitle: string;
    icon: React.ReactNode;
  }[] = [
    { id: 'jogar', label: 'JOGAR', subtitle: 'Iniciar uma partida', icon: <Crosshair className="w-[26px] h-[26px]" /> },
    { id: 'operador', label: 'OPERADOR', subtitle: 'Personalize seu soldado', icon: <TacticalHelmetIcon className="w-[26px] h-[26px]" /> },
    { id: 'arsenal', label: 'ARSENAL', subtitle: 'Configure suas armas', icon: <AssaultRifleIcon className="w-[28px] h-[24px]" /> },
    { id: 'inventario', label: 'INVENTÁRIO', subtitle: 'Gerencie seus itens', icon: <Backpack className="w-[24px] h-[24px]" /> },
    { id: 'missoes', label: 'MISSÕES', subtitle: 'Complete objetivos', icon: <MissionBadgeIcon className="w-[24px] h-[24px]" /> },
    { id: 'progressao', label: 'PROGRESSÃO', subtitle: 'Acompanhe seu progresso', icon: <BarChart3 className="w-[24px] h-[24px]" /> },
    { id: 'loja', label: 'LOJA', subtitle: 'Adquira itens exclusivos', icon: <ShoppingCart className="w-[24px] h-[24px]" /> },
    { id: 'configuracoes', label: 'CONFIGURAÇÕES', subtitle: 'Ajuste o jogo', icon: <Settings className="w-[24px] h-[24px]" /> },
  ];

  return (
    <div className="fixed inset-0 z-20 w-screen h-screen overflow-hidden select-none pointer-events-auto bg-[#090c0f] text-white flex flex-col justify-between">
      {/* === FULL-BLEED CINEMATIC OPERATOR & MILITARY BASE KEY ART === */}
      <div className="absolute inset-0 overflow-hidden bg-[#0a0d10]">
        <img
          src={heroOperatorImg}
          alt="Operador Militar Operation: Wildlands"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-[52%_24%] scale-[1.08]"
        />
        {/* Clean asymmetric vignette & bottom readability gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 52% 42%, rgba(10,13,16,0.0) 18%, rgba(8,10,13,0.58) 72%, rgba(6,8,10,0.88) 100%)',
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(7,9,12,0.84) 0%, rgba(7,9,12,0.18) 16%, rgba(7,9,12,0.0) 68%, rgba(7,9,12,0.92) 100%)',
          }}
        />
      </div>

      {/* === TOP COMMAND HEADER: BRAND + HORIZONTAL TACTICAL TABS + PROFILE / CP === */}
      <header className="relative z-20 flex items-center justify-between gap-3 px-4 lg:px-7 h-[68px] bg-[#0a0d10]/72 backdrop-blur-md border-b border-white/10">
        {/* Left: Compact Tactical Brand Lockup */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-[#f6c945] to-[#b57c12] flex items-center justify-center shadow-[0_0_16px_rgba(245,197,66,0.35)]">
              <svg viewBox="0 0 32 32" className="w-6 h-6 text-[#0b0d10]" fill="currentColor">
                <polygon points="2,24 10,11 15,16 21,6 30,24" />
              </svg>
            </div>
            <div className="leading-none">
              <div className="text-[10px] font-mono-hud tracking-[0.26em] text-[#b8c2c8] uppercase">
                OPERATION
              </div>
              <div className="font-military font-extrabold text-[22px] tracking-[0.06em] text-[#f5c542] uppercase leading-none mt-0.5">
                WILDLANDS
              </div>
            </div>
          </div>

          {/* Lobby Music / Audio Pill */}
          <button
            onClick={onToggleMute}
            title={muted ? 'Ativar áudio e música do lobby' : 'Silenciar áudio'}
            className="hidden xl:flex items-center gap-2 ml-3 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono-hud text-[#cbd3d9] cursor-pointer"
          >
            {muted ? (
              <VolumeX className="w-3.5 h-3.5 text-[#e84b3c]" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-[#f5c542]" />
            )}
            <span className="uppercase tracking-wider">
              {muted ? 'MUDO' : 'OST: GUERILLA TACTICS'}
            </span>
          </button>
        </div>

        {/* Center: Horizontal Navigation Tabs (AAA CODM / Standoff 2 Top Rail) */}
        <nav className="hidden md:flex items-center h-full gap-1 overflow-x-auto" aria-label="Menu principal">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative h-full px-3 lg:px-3.5 flex items-center gap-2 text-xs font-military font-bold tracking-[0.08em] uppercase transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? 'text-[#ffd85c] bg-white/[0.06]'
                    : 'text-[#bfc7ce] hover:text-white hover:bg-white/[0.03]'
                }`}
              >
                <span className={isActive ? 'text-[#ffd85c]' : 'text-[#8e98a0]'}>{item.icon}</span>
                <span>{item.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 inset-x-0 h-[2.5px] bg-gradient-to-r from-transparent via-[#f5c542] to-transparent shadow-[0_0_10px_#f5c542]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right: Profile, CP Balance, Notification Bell & Squad */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('progressao')}
            className="flex items-center gap-2.5 pl-1.5 pr-3 py-1 bg-white/[0.04] hover:bg-white/[0.09] border border-white/12 hover:border-[#f5c542]/50 cursor-pointer"
          >
            <div className="w-9 h-9 overflow-hidden border border-[#c8a350] shrink-0 bg-[#1a1f24]">
              <img
                src={operatorAvatarImg}
                alt={callsign}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="text-left hidden sm:block min-w-[118px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-xs text-white leading-none">{callsign || 'CaioGamer'}</span>
                <span className="text-[10px] font-mono-hud text-[#f5c542]">NV.{playerLevel}</span>
              </div>
              <div className="w-full h-[4px] bg-[#0b0e10] border border-white/10 overflow-hidden mt-1.5">
                <div
                  className="h-full bg-gradient-to-r from-[#d4961c] to-[#f8cd4c]"
                  style={{ width: `${xpPercent}%` }}
                />
              </div>
            </div>
          </button>

          <div className="flex items-center gap-1.5 px-2.5 h-[40px] bg-white/[0.04] border border-white/12">
            <div className="w-5 h-5 rounded-full bg-gradient-to-b from-[#ffe27a] to-[#98640b] flex items-center justify-center text-[9px] font-extrabold text-[#1c1304] shrink-0">
              CP
            </div>
            <span className="font-military font-bold text-lg tracking-wide text-white tabular-nums">
              {cpBalance.toLocaleString('pt-BR')}
            </span>
            <button
              onClick={() => setActiveTab('loja')}
              title="Abrir Loja de Suprimentos"
              className="w-5 h-5 flex items-center justify-center text-[#f5c542] hover:bg-[#f5c542]/20 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.8]" />
            </button>
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications((v) => !v);
                setShowSquad(false);
                setUnreadCount(0);
              }}
              aria-label="Notificações"
              className="relative w-[40px] h-[40px] flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.1] border border-white/12 cursor-pointer"
            >
              <Bell className="w-4 h-4 text-white" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#df3229] text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-72 bg-[#0e1215]/96 backdrop-blur-md border border-[#f5c542]/40 shadow-2xl z-40">
                <div className="px-3.5 py-2 bg-[#161b20] border-b border-white/10 text-xs font-military font-bold tracking-wider uppercase text-[#f5c542]">
                  CENTRAL DE COMUNICAÇÕES
                </div>
                <div className="divide-y divide-white/10">
                  {NOTIFICATIONS_DATA.map((n) => (
                    <div key={n.id} className="p-3 hover:bg-white/5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white">{n.title}</span>
                        <span className="text-[10px] font-mono-hud text-[#909aa2]">{n.time}</span>
                      </div>
                      <p className="text-[11px] text-[#aeb7be] mt-0.5">{n.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setShowSquad((v) => !v);
                setShowNotifications(false);
              }}
              aria-label="Esquadrão"
              className="w-[40px] h-[40px] flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.1] border border-white/12 cursor-pointer"
            >
              <Users className="w-4 h-4 text-white" />
            </button>

            {showSquad && (
              <div className="absolute right-0 mt-2 w-64 bg-[#0e1215]/96 backdrop-blur-md border border-[#f5c542]/40 shadow-2xl z-40">
                <div className="px-3.5 py-2 bg-[#161b20] border-b border-white/10 text-xs font-military font-bold tracking-wider uppercase text-[#f5c542]">
                  ESQUADRÃO ALPHA (1 / 4)
                </div>
                <div className="p-3 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#5ec260]" />
                      <span className="font-semibold text-white">{callsign || 'CaioGamer'}</span>
                    </div>
                    <span className="text-[10px] font-mono-hud text-[#f5c542]">LÍDER</span>
                  </div>
                  <div className="pt-2 border-t border-white/10 text-[11px] text-[#9aa4ac]">
                    Operação Solo pronta para inserção imediata no servidor América do Sul.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* === MAIN LOBBY STAGE: LEFT INTEL CARDS + OPEN CENTER HERO + RIGHT DEPLOYMENT DOCK === */}
      <main
        className={`relative z-10 flex-1 flex items-end justify-between px-4 lg:px-7 pb-12 pt-4 transition-opacity duration-200 ${
          activeTab !== 'jogar' ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        {/* LEFT COLUMN: Compact Event Carousel + Battle Pass + Daily Challenges */}
        <div className="w-[270px] lg:w-[295px] flex flex-col gap-2.5 shrink-0">
          {/* Special Event Banner */}
          <div>
            <button
              onClick={() => setActiveTab('evento')}
              className="group relative w-full h-[88px] overflow-hidden border border-white/20 hover:border-[#f5c542] text-left cursor-pointer shadow-xl bg-[#101418]"
            >
              <img
                src={currentEvent.image}
                alt={currentEvent.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-right group-hover:scale-105 transition-transform duration-300"
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(90deg, rgba(9,12,15,0.95) 0%, rgba(9,12,15,0.7) 58%, rgba(9,12,15,0.15) 100%)',
                }}
              />
              <div className="absolute inset-0 p-3 flex flex-col justify-between">
                <div>
                  <div className="font-mono-hud text-[9px] tracking-[0.18em] text-[#f5c542] uppercase">
                    {currentEvent.kicker}
                  </div>
                  <div className="font-military font-extrabold text-[20px] tracking-[0.04em] text-white uppercase leading-tight mt-0.5">
                    {currentEvent.title}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-mono-hud text-[#f5c542]">
                  <span>TERMINA EM {currentEvent.timer}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </button>
            <div className="flex items-center gap-1.5 mt-1.5 pl-0.5">
              {EVENTS_CAROUSEL.map((ev, idx) => (
                <button
                  key={ev.id}
                  onClick={() => setEventIdx(idx)}
                  aria-label={ev.title}
                  className={`h-1.5 transition-all cursor-pointer ${
                    idx === eventIdx ? 'w-5 bg-[#f5c542]' : 'w-2 bg-white/30 hover:bg-white/60'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Battle Pass Compact Card */}
          <button
            onClick={() => setActiveTab('passe')}
            className="group relative flex items-center justify-between px-3.5 py-2.5 bg-[#0d1115]/82 backdrop-blur-md border border-white/15 hover:border-[#f5c542]/70 text-left cursor-pointer shadow-xl"
          >
            <div>
              <div className="font-military font-extrabold text-[17px] tracking-[0.06em] uppercase text-white leading-none">
                PASSE DE BATALHA
              </div>
              <div className="text-[11px] font-mono-hud text-[#f5c542] mt-1">
                NÍVEL 50 · RECOMPENSAS LIBERADAS
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 scale-90">
              <BattlePassCrest />
            </div>
          </button>

          {/* Daily Challenges Glassmorphic Panel */}
          <div className="relative bg-[#0d1115]/82 backdrop-blur-md border border-white/15 shadow-xl">
            <div className="flex items-center justify-between px-3.5 py-2 bg-white/[0.03] border-b border-white/10">
              <span className="font-military font-bold text-[14px] tracking-[0.08em] uppercase text-white">
                DESAFIOS DIÁRIOS
              </span>
              <div className="flex items-center gap-1 text-[10px] font-mono-hud text-[#f5c542]">
                <Clock className="w-3 h-3" />
                <span>12h 34m</span>
              </div>
            </div>
            <div className="p-3 space-y-2">
              {dailyChallenges.map((c) => {
                const complete = c.current >= c.target;
                const pct = Math.min(100, Math.round((c.current / c.target) * 100));
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveTab('desafios')}
                    className="w-full text-left group cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Check className={`w-3.5 h-3.5 shrink-0 ${complete ? 'text-[#62c965]' : 'text-[#78848c]'}`} />
                        <span className="text-[#e6edf2] group-hover:text-[#f5c542] truncate">{c.label}</span>
                      </div>
                      <span className="text-[10px] font-mono-hud text-[#b8c2c8] shrink-0">
                        {c.current}/{c.target}
                      </span>
                    </div>
                    <div className="mt-1 ml-5 h-[4px] bg-white/10 overflow-hidden">
                      <div
                        className={`h-full ${complete ? 'bg-[#64c967]' : 'bg-[#f5c542]'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* CENTER-BOTTOM: Active Loadout Strip (click to customize Arsenal) */}
        <div className="hidden lg:flex flex-col items-center gap-2 mb-1">
          <button
            onClick={() => setActiveTab('arsenal')}
            className="flex items-center gap-4 px-5 py-2 bg-[#0b0e12]/78 backdrop-blur-md border border-white/15 hover:border-[#f5c542]/70 cursor-pointer shadow-2xl"
          >
            <AssaultRifleIcon className="w-6 h-5 text-[#f5c542]" />
            <div className="text-left">
              <div className="text-[9px] font-mono-hud tracking-[0.2em] text-[#9aa4ac] uppercase">
                ARMAMENTO EQUIPADO
              </div>
              <div className="font-military font-bold text-sm tracking-wider uppercase text-white">
                {WEAPONS[deployConfig.primaryWeapon]?.name ?? 'M4A1 SOPMOD'}{' '}
                <span className="text-[#8e98a0]">·</span>{' '}
                {WEAPONS[deployConfig.secondaryWeapon]?.name ?? 'M24'}{' '}
                <span className="text-[#8e98a0]">·</span>{' '}
                <span className="text-[#f5c542]">EDITAR ARSENAL</span>
              </div>
            </div>
          </button>
        </div>

        {/* RIGHT COLUMN: Mode Preview + Quick Selector + Primary DEPLOY CTA */}
        <div className="w-[290px] lg:w-[320px] flex flex-col gap-2.5 shrink-0">
          <div className="bg-[#0d1115]/88 backdrop-blur-md border border-white/20 shadow-[0_18px_45px_rgba(0,0,0,0.85)] overflow-hidden">
            <button
              onClick={handleCycleMode}
              title="Clique para alternar o modo de operação"
              className="group relative w-full text-left block cursor-pointer"
            >
              <div className="flex items-center justify-between px-3.5 py-2 bg-white/[0.04] border-b border-white/10">
                <span className="font-military font-bold text-[12px] tracking-[0.12em] uppercase text-[#d8e0e6]">
                  MODO DE OPERAÇÃO
                </span>
                <span className="text-[10px] font-mono-hud text-[#f5c542]">ALTERNAR ▸</span>
              </div>
              <div className="relative h-[126px] overflow-hidden bg-[#151a1e]">
                <img
                  src={currentMode.image}
                  alt={currentMode.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(8,10,13,0.12) 0%, rgba(8,10,13,0.45) 55%, rgba(8,10,13,0.95) 100%)',
                  }}
                />
                <div className="absolute bottom-2.5 left-3.5 right-3.5 flex items-end justify-between">
                  <div>
                    <div className="font-military font-extrabold text-[23px] tracking-[0.04em] uppercase text-white leading-none">
                      {currentMode.title}
                    </div>
                    <div className="text-[11px] text-[#cfd7dd] mt-0.5">{currentMode.subtitle}</div>
                  </div>
                </div>
              </div>
            </button>

            <div className="grid grid-cols-4 border-t border-white/12 bg-[#0b0e12]">
              {[
                { id: 'open_world' as DeploymentMode, label: 'ABERTO' },
                { id: 'desert_op' as DeploymentMode, label: 'DESERTO' },
                { id: 'night_raid' as DeploymentMode, label: 'NOITE' },
                { id: 'training' as DeploymentMode, label: 'TREINO' },
              ].map((tab) => {
                const active = deployConfig.mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleChangeDeployConfig({ mode: tab.id })}
                    className={`py-2 px-1 text-[10px] font-military font-bold tracking-[0.08em] uppercase transition-colors cursor-pointer border-r last:border-r-0 border-white/10 ${
                      active
                        ? 'bg-[#f2b91d]/20 text-[#ffd85a] shadow-[inset_0_-2px_0_#f2b91d]'
                        : 'text-[#9aa4ac] hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {hasSavedGame && (
              <button
                onClick={onContinue}
                className="w-full py-2 px-3 bg-[#161c22] hover:bg-[#1f2830] border-t border-white/12 flex items-center justify-center gap-2 text-[11px] font-military font-bold tracking-[0.12em] uppercase text-[#f5c542] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>CONTINUAR OPERAÇÃO SALVA</span>
              </button>
            )}

            <button
              onClick={() => handleDeployNow()}
              className="group relative w-full h-[56px] bg-gradient-to-b from-[#ffe055] via-[#f2b91d] to-[#d48e0c] hover:brightness-110 text-[#0f1214] flex items-center justify-center cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
            >
              <span className="font-military font-extrabold text-[26px] tracking-[0.1em] uppercase">
                ENTRAR
              </span>
              <ChevronRight className="absolute right-4 w-7 h-7 stroke-[3] text-[#0f1214] group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </main>

      {/* === INTERACTIVE SUB-PANEL DRAWERS FOR ALL TABS === */}
      <MenuDrawers
        activeTab={activeTab}
        onClose={() => setActiveTab('jogar')}
        hud={hud}
        settings={settings}
        callsign={callsign}
        onChangeCallsign={setCallsign}
        selectedOperatorId={selectedOperatorId}
        onSelectOperator={handleSelectOperator}
        deployConfig={deployConfig}
        onChangeDeployConfig={handleChangeDeployConfig}
        cpBalance={cpBalance}
        purchasedBundleIds={purchasedBundleIds}
        onPurchaseBundle={handlePurchaseBundle}
        challenges={dailyChallenges}
        onClaimChallenge={handleClaimChallenge}
        onTrackMission={onTrackMission}
        onUpdateSettings={onUpdateSettings}
        onSetWeather={onSetWeather}
        onSetTime={onSetTime}
        onDeployModeNow={(mode) => handleDeployNow(mode)}
        eventTitle={currentEvent.title}
        eventSubtitle={currentEvent.subtitle}
        eventTimer={currentEvent.timer}
        eventImage={currentEvent.image}
        playerLevel={playerLevel}
        currentXpDisplay={currentXpDisplay}
        nextLevelXp={nextLevelXp}
      />

      {/* === BOTTOM SLIM STATUS FOOTER BAR === */}
      <footer className="fixed bottom-0 inset-x-0 z-20 h-[34px] px-4 lg:px-7 bg-[#090c0f]/88 backdrop-blur-md border-t border-white/10 flex items-center justify-between text-[11px] text-[#c7cfd4]">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMute}
            className="flex items-center gap-1.5 text-[#b6bfc6] hover:text-[#f5c542] cursor-pointer"
          >
            {muted ? <VolumeX className="w-3.5 h-3.5 text-[#e84b3c]" /> : <Volume2 className="w-3.5 h-3.5 text-[#f5c542]" />}
            <span className="font-mono-hud text-[10px] uppercase">{muted ? 'Áudio Mudo' : 'Áudio Ativo'}</span>
          </button>
          <span className="hidden sm:inline text-white/20">|</span>
          <span className="hidden sm:inline font-mono-hud text-[10px] text-[#9aa4ac]">
            ENTER para iniciar · {WEAPONS_LABEL(deployConfig.primaryWeapon)}
          </span>
        </div>

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
      </footer>
    </div>
  );
};

// Lightweight helper to show currently armed primary weapon in the slim footer
function WEAPONS_LABEL(id: keyof typeof WEAPONS): string {
  return `Armamento: ${WEAPONS[id]?.name ?? 'M4A1 SOPMOD'}`;
}
