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
    subtitle: 'Combate tático sob a noite!',
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
    <div className="fixed inset-0 z-20 w-screen h-screen overflow-hidden select-none pointer-events-auto bg-[#0c0f12] text-white">
      {/* === FULL-BLEED CINEMATIC OPERATOR & MILITARY BASE KEY ART === */}
      <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#1b1f22] via-[#2b2419] to-[#0e1114]">
        <img
          src={heroOperatorImg}
          alt="Operador Militar Operation: Wildlands"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-[50%_28%] scale-[1.15]"
        />
        {/* Subtle left & right readability scrims keeping center operator crisp and unobstructed */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, rgba(10,13,16,0.72) 0%, rgba(10,13,16,0.28) 26%, rgba(10,13,16,0.0) 48%, rgba(10,13,16,0.18) 74%, rgba(10,13,16,0.68) 100%)',
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(8,10,12,0.52) 0%, rgba(8,10,12,0.0) 22%, rgba(8,10,12,0.0) 76%, rgba(8,10,12,0.82) 100%)',
          }}
        />
      </div>

      {/* === TOP HEADER BAR: BRAND LOGO (LEFT) + PROFILE / CP / SOCIAL (RIGHT) === */}
      <div className="relative z-20 flex items-start justify-between px-4 lg:px-6 pt-3">
        {/* Top-Left Brand Lockup: Jagged Alpine Peak + OPERATION: WILDLANDS */}
        <div className="flex items-center select-none drop-shadow-[0_4px_14px_rgba(0,0,0,0.92)]">
          <svg
            viewBox="0 0 380 96"
            className="w-[270px] sm:w-[310px] lg:w-[340px] h-auto"
            role="img"
            aria-label="OPERATION: WILDLANDS"
          >
            <defs>
              <linearGradient id="wlGoldText" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f9d86c" />
                <stop offset="48%" stopColor="#d99d29" />
                <stop offset="100%" stopColor="#946211" />
              </linearGradient>
              <linearGradient id="wlMountainSnow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#b9c0c6" />
              </linearGradient>
            </defs>
            {/* Mountain Silhouette */}
            <g transform="translate(0, 6)">
              <polygon points="4,76 46,24 68,42 104,6 144,44 166,30 198,76" fill="#171a1d" stroke="#0b0d0f" strokeWidth="2" />
              {/* Snow-lit sunlit facets */}
              <polygon points="104,6 88,28 97,32 106,20 116,35 129,28" fill="url(#wlMountainSnow)" />
              <polygon points="46,24 33,44 43,43 49,33 58,42" fill="url(#wlMountainSnow)" />
              <polygon points="104,6 112,26 105,36 125,46 144,44" fill="#d5dce1" opacity="0.65" />
              <path d="M18,74 L58,34 L66,46 L42,74 Z" fill="#cfd6db" opacity="0.55" />
            </g>
            {/* OPERATION: */}
            <text
              x="166"
              y="39"
              fill="#f3f5f6"
              fontFamily="'Barlow Condensed', 'Chakra Petch', sans-serif"
              fontSize="27"
              fontWeight="800"
              letterSpacing="2.2"
              stroke="#0a0c0e"
              strokeWidth="3.5"
              paintOrder="stroke"
            >
              OPERATION:
            </text>
            {/* WILDLANDS */}
            <text
              x="104"
              y="84"
              fill="url(#wlGoldText)"
              fontFamily="'Barlow Condensed', 'Chakra Petch', sans-serif"
              fontSize="54"
              fontWeight="800"
              letterSpacing="1.6"
              stroke="#121417"
              strokeWidth="5"
              paintOrder="stroke"
            >
              WILDLANDS
            </text>
          </svg>
        </div>

        {/* Top-Right Profile, CP Balance, Notification Bell & Squad */}
        <div className="flex items-center gap-2 pt-0.5">
          {/* Player Profile Card */}
          <button
            onClick={() => setActiveTab('progressao')}
            className="relative flex items-center gap-3 pl-2 pr-4 py-1.5 bg-[#151a1e]/90 hover:bg-[#1c2329]/95 border border-white/15 hover:border-[#f5c542]/60 transition-colors cursor-pointer"
          >
            <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-[#c8a350] shadow-[0_0_12px_rgba(245,197,66,0.3)] shrink-0 bg-[#1a1f24]">
              <img
                src={operatorAvatarImg}
                alt={callsign}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="text-left min-w-[150px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-white leading-none">{callsign || 'CaioGamer'}</span>
              </div>
              <div className="text-[11px] font-military font-semibold tracking-wider text-[#cfd6dc] uppercase mt-0.5 leading-none">
                NÍVEL {playerLevel}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="w-[74px] h-[6px] bg-[#0b0e10] border border-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#d4961c] to-[#f8cd4c]"
                    style={{ width: `${xpPercent}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono-hud text-[#dce2e6] leading-none">
                  {currentXpDisplay.toLocaleString('pt-BR')} / {nextLevelXp.toLocaleString('pt-BR')} XP
                </span>
              </div>
            </div>
          </button>

          {/* CP Currency Bar */}
          <div className="flex items-center gap-2 px-3 py-2 bg-[#151a1e]/90 border border-white/15 h-[44px]">
            <div className="w-6 h-6 rounded-full bg-gradient-to-b from-[#ffe27a] via-[#e2a322] to-[#98640b] border border-[#fff2b3]/70 flex items-center justify-center text-[10px] font-extrabold text-[#1c1304] shadow-inner shrink-0">
              CP
            </div>
            <span className="font-military font-bold text-xl tracking-wide text-white tabular-nums">
              {cpBalance.toLocaleString('pt-BR')}
            </span>
            <button
              onClick={() => setActiveTab('loja')}
              title="Abrir Loja de Suprimentos"
              className="ml-1 w-6 h-6 flex items-center justify-center text-[#f5c542] hover:bg-[#f5c542]/20 transition-colors cursor-pointer"
            >
              <Plus className="w-5 h-5 stroke-[2.8]" />
            </button>
          </div>

          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications((v) => !v);
                setShowSquad(false);
                setUnreadCount(0);
              }}
              aria-label="Notificações"
              className="relative w-[44px] h-[44px] flex items-center justify-center bg-[#151a1e]/90 hover:bg-[#1f262c] border border-white/15 hover:border-[#f5c542]/60 transition-colors cursor-pointer"
            >
              <Bell className="w-5 h-5 text-white fill-white/90" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#df3229] text-white text-[11px] font-bold flex items-center justify-center shadow">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-72 bg-[#121619]/96 border border-[#f5c542]/40 shadow-2xl z-40">
                <div className="px-3.5 py-2 bg-[#181d22] border-b border-white/10 text-xs font-military font-bold tracking-wider uppercase text-[#f5c542]">
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

          {/* Friends / Squad Icon */}
          <div className="relative">
            <button
              onClick={() => {
                setShowSquad((v) => !v);
                setShowNotifications(false);
              }}
              aria-label="Esquadrão"
              className="w-[44px] h-[44px] flex items-center justify-center bg-[#151a1e]/90 hover:bg-[#1f262c] border border-white/15 hover:border-[#f5c542]/60 transition-colors cursor-pointer"
            >
              <Users className="w-5 h-5 text-white" />
            </button>

            {showSquad && (
              <div className="absolute right-0 mt-2 w-64 bg-[#121619]/96 border border-[#f5c542]/40 shadow-2xl z-40">
                <div className="px-3.5 py-2 bg-[#181d22] border-b border-white/10 text-xs font-military font-bold tracking-wider uppercase text-[#f5c542]">
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
      </div>

      {/* === MAIN BODY: LEFT NAV + EVENT BANNER & RIGHT TACTICAL PANELS === */}
      <div className="relative z-10 flex items-stretch justify-between px-4 lg:px-6 pt-2 pb-[44px] h-[calc(100vh-104px)]">
        {/* LEFT COLUMN: 8 Navigation Buttons + Bottom Special Event Card */}
        <div className="w-[265px] lg:w-[285px] flex flex-col justify-between shrink-0">
          {/* 8 Stacked Tactical Nav Buttons */}
          <nav className="flex flex-col gap-[5px]" aria-label="Menu principal">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`group relative flex items-center justify-between px-3.5 py-[7px] text-left transition-all cursor-pointer border ${
                    isActive
                      ? 'bg-gradient-to-r from-[#d49a1a]/75 via-[#7d5812]/55 to-[#16191d]/75 border-[#f7cb4d] shadow-[0_0_20px_rgba(245,197,66,0.28)]'
                      : 'bg-gradient-to-r from-[#12161a]/90 via-[#1a1f24]/75 to-[#12161a]/45 border-white/15 hover:border-[#f5c542]/60 hover:from-[#1d2227]/95'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-8 flex items-center justify-center shrink-0 transition-colors ${
                        isActive ? 'text-[#ffd85c]' : 'text-[#e3e7ea] group-hover:text-[#ffd85c]'
                      }`}
                    >
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div
                        className={`font-military font-extrabold text-[19px] leading-[1.05] tracking-[0.04em] uppercase ${
                          isActive ? 'text-white' : 'text-[#f1f3f5]'
                        }`}
                      >
                        {item.label}
                      </div>
                      <div
                        className={`text-[11px] leading-tight truncate ${
                          isActive ? 'text-[#f5e7c1]' : 'text-[#b5bec4]'
                        }`}
                      >
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  {isActive && (
                    <ChevronsRight className="w-6 h-6 text-[#ffd85c] shrink-0 drop-shadow-[0_0_8px_rgba(245,197,66,0.65)]" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Bottom-Left Special Event Banner + 5 Carousel Dots */}
          <div className="mt-2.5">
            <button
              onClick={() => setActiveTab('evento')}
              className="group relative w-full h-[86px] overflow-hidden border border-white/30 hover:border-[#f5c542] text-left transition-all cursor-pointer shadow-[0_10px_28px_rgba(0,0,0,0.75)] bg-[#14181c]"
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
                    'linear-gradient(90deg, rgba(10,13,16,0.94) 0%, rgba(10,13,16,0.72) 55%, rgba(10,13,16,0.12) 100%)',
                }}
              />
              <div className="absolute inset-0 p-3 flex flex-col justify-between">
                <div>
                  <div className="font-military font-bold text-[11px] tracking-[0.12em] text-[#f5c542] uppercase leading-none">
                    {currentEvent.kicker}
                  </div>
                  <div className="font-military font-extrabold text-[23px] tracking-[0.03em] text-white uppercase leading-tight mt-0.5">
                    {currentEvent.title}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-medium text-[#f5c542]">
                  <span>Termina em: {currentEvent.timer}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </button>

            {/* 5 Interactive Carousel Dots */}
            <div className="flex items-center justify-center gap-2 mt-2">
              {EVENTS_CAROUSEL.map((ev, idx) => (
                <button
                  key={ev.id}
                  onClick={() => setEventIdx(idx)}
                  aria-label={ev.title}
                  className={`h-2 rounded-full transition-all cursor-pointer ${
                    idx === eventIdx
                      ? 'w-2.5 bg-[#f5c542] shadow-[0_0_8px_rgba(245,197,66,0.8)]'
                      : 'w-2 bg-white/35 hover:bg-white/65'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Daily Challenges + Battle Pass + Selected Mode & ENTRAR CTA */}
        <div
          className={`w-[275px] lg:w-[296px] flex flex-col justify-end gap-2.5 shrink-0 transition-opacity duration-200 ${
            activeTab !== 'jogar' ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          {/* 1. DESAFIOS DIÁRIOS */}
          <div className="relative bg-[#13171b]/88 border border-white/18 shadow-[0_12px_32px_rgba(0,0,0,0.65)]">
            <div className="flex items-center justify-between px-3.5 py-2 bg-[#191f24]/90 border-b border-white/10">
              <span className="font-military font-bold text-[16px] tracking-[0.06em] uppercase text-white">
                DESAFIOS DIÁRIOS
              </span>
              <div className="flex items-center gap-1 text-[11px] font-mono-hud text-[#f5c542]">
                <Clock className="w-3.5 h-3.5" />
                <span>12h 34min</span>
              </div>
            </div>

            <div className="p-3 pr-8 space-y-2.5">
              {dailyChallenges.map((c) => {
                const complete = c.current >= c.target;
                const pct = Math.min(100, Math.round((c.current / c.target) * 100));
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveTab('desafios')}
                    className="w-full text-left group cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Check
                          className={`w-3.5 h-3.5 shrink-0 ${
                            complete ? 'text-[#62c965]' : 'text-[#5cb85f]/80'
                          }`}
                        />
                        <span className="text-[#eef2f5] group-hover:text-[#f5c542] transition-colors truncate">
                          {c.label}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono-hud text-[#d6dde2] shrink-0">
                        {c.current} / {c.target}
                      </span>
                    </div>
                    <div className="mt-1 ml-5 h-[5px] bg-[#2a3137] overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          complete
                            ? 'bg-[#64c967]'
                            : pct > 0
                            ? 'bg-gradient-to-r from-[#d4961c] to-[#f7ca4a]'
                            : 'bg-transparent'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right-edge gold chevron tab */}
            <button
              onClick={() => setActiveTab('desafios')}
              title="Ver e resgatar Desafios Diários"
              className="absolute right-0 top-[38px] bottom-0 w-7 flex items-center justify-center bg-[#191f24]/70 hover:bg-[#f5c542]/20 border-l border-white/10 text-[#f5c542] cursor-pointer transition-colors"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>

          {/* 2. PASSE DE BATALHA */}
          <button
            onClick={() => setActiveTab('passe')}
            className="group relative flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-[#14181c]/92 via-[#23211a]/88 to-[#2c2516]/90 border border-white/20 hover:border-[#f5c542] text-left transition-all cursor-pointer overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.65)]"
          >
            <div className="relative z-10">
              <div className="font-military font-extrabold text-[19px] tracking-[0.05em] uppercase text-white leading-none">
                PASSE DE BATALHA
              </div>
              <div className="font-military font-bold text-[15px] text-[#f5c542] leading-tight mt-0.5">
                Nível 50
              </div>
              <div className="text-[11px] text-[#e5cfa0] mt-1">
                Recompensas exclusivas!
              </div>
            </div>
            <div className="relative z-10 flex items-center gap-0.5 shrink-0">
              <BattlePassCrest />
              <ChevronRight className="w-4 h-4 text-[#f5c542] group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>

          {/* 3. MODO SELECIONADO + LARGE GOLDEN ENTRAR CTA */}
          <div className="border border-white/25 bg-[#12161a]/92 shadow-[0_16px_40px_rgba(0,0,0,0.8)] overflow-hidden">
            {/* Mode Selector Preview */}
            <button
              onClick={handleCycleMode}
              title="Clique para alternar o modo de operação"
              className="group relative w-full text-left block cursor-pointer"
            >
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#191f25]/95 border-b border-white/10">
                <span className="font-military font-bold text-[13px] tracking-[0.08em] uppercase text-[#e6ebef]">
                  MODO SELECIONADO
                </span>
                <span className="text-[10px] font-mono-hud text-[#f5c542] opacity-85 group-hover:opacity-100">
                  TROCAR MODO ▸
                </span>
              </div>

              <div className="relative h-[116px] overflow-hidden bg-[#1a2024]">
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
                      'linear-gradient(180deg, rgba(10,13,16,0.12) 0%, rgba(10,13,16,0.35) 50%, rgba(10,13,16,0.92) 100%)',
                  }}
                />
                <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2">
                  <div>
                    <div className="font-military font-extrabold text-[22px] tracking-[0.04em] uppercase text-white leading-none">
                      {currentMode.title}
                    </div>
                    <div className="text-[11px] text-[#d5dce0] mt-0.5">
                      {currentMode.subtitle}
                    </div>
                  </div>
                  <Users className="w-5 h-5 text-white/90 shrink-0 mb-0.5" />
                </div>
              </div>
            </button>

            {/* Quick 1-Click Mode Tabs (including TREINAMENTO firing range) */}
            <div className="grid grid-cols-4 border-t border-white/15 bg-[#101418]">
              {[
                { id: 'open_world' as DeploymentMode, label: 'ABERTO' },
                { id: 'desert_op' as DeploymentMode, label: 'DESERTO' },
                { id: 'night_raid' as DeploymentMode, label: 'NOITE' },
                { id: 'training' as DeploymentMode, label: 'TREINAMENTO' },
              ].map((tab) => {
                const active = deployConfig.mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleChangeDeployConfig({ mode: tab.id })}
                    className={`py-1.5 px-1 text-[9.5px] font-military font-bold tracking-[0.06em] uppercase transition-colors cursor-pointer border-r last:border-r-0 border-white/10 ${
                      active
                        ? 'bg-[#f2b91d]/22 text-[#ffd85a] shadow-[inset_0_-2px_0_#f2b91d]'
                        : 'text-[#aeb8c0] hover:bg-white/6 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Optional Continue Saved Operation strip if IndexedDB save exists */}
            {hasSavedGame && (
              <button
                onClick={onContinue}
                className="w-full py-1.5 px-3 bg-[#1a2228] hover:bg-[#232e36] border-t border-white/15 flex items-center justify-center gap-2 text-[11px] font-military font-bold tracking-[0.1em] uppercase text-[#f5c542] cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>CONTINUAR OPERAÇÃO SALVA</span>
              </button>
            )}

            {/* Primary Golden ENTRAR CTA */}
            <button
              onClick={() => handleDeployNow()}
              className="group relative w-full h-[52px] bg-gradient-to-b from-[#ffe055] via-[#f2b91d] to-[#d9920d] hover:brightness-110 active:brightness-95 text-[#111315] flex items-center justify-center cursor-pointer transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
            >
              <span className="font-military font-extrabold text-[27px] tracking-[0.08em] uppercase">
                ENTRAR
              </span>
              <ChevronRight className="absolute right-4 w-7 h-7 stroke-[3] text-[#111315] group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>

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
      <div className="fixed bottom-0 inset-x-0 z-20 h-[34px] px-4 lg:px-6 bg-[#0b0e11]/88 border-t border-white/10 flex items-center justify-between text-[11px] text-[#c7cfd4]">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMute}
            className="flex items-center gap-1.5 text-[#b6bfc6] hover:text-[#f5c542] transition-colors cursor-pointer"
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
          {/* 4-bar green signal icon */}
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

// Lightweight helper to show currently armed primary weapon in the slim footer
function WEAPONS_LABEL(id: keyof typeof WEAPONS): string {
  return `Armamento: ${WEAPONS[id]?.name ?? 'M4A1 SOPMOD'}`;
}
