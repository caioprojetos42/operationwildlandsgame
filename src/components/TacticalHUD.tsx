import React, { useEffect, useRef } from 'react';
import { HUDState } from '../game/types';
import { ROAD_NETWORK } from '../game/data/worldConfig';
import { WEAPONS } from '../game/data/weapons';

interface TacticalHUDProps {
  hud: HUDState;
  onResumePointerLock: () => void;
}

const COMPASS_LABELS: [number, string][] = [
  [0, 'N'],
  [45, 'NE'],
  [90, 'E'],
  [135, 'SE'],
  [180, 'S'],
  [225, 'SW'],
  [270, 'W'],
  [315, 'NW'],
];

function formatTime(hours: number): string {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours - Math.floor(hours)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const TacticalHUD: React.FC<TacticalHUDProps> = ({ hud, onResumePointerLock }) => {
  const minimapRef = useRef<HTMLCanvasElement | null>(null);

  // Draw live tactical minimap
  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 0.42; // px per meter (~190m radius visible)

    ctx.fillStyle = '#0d1310';
    ctx.fillRect(0, 0, w, h);

    // Subtle tactical radar rings
    ctx.strokeStyle = 'rgba(130, 155, 120, 0.16)';
    ctx.lineWidth = 1;
    for (const r of [26, 52, 76]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Rotate map relative to player heading (North-up with player cone rotated)
    const toMap = (wx: number, wz: number): [number, number] => [
      cx + (wx - hud.playerX) * scale,
      cy + (wz - hud.playerZ) * scale,
    ];

    // Draw roads
    for (const seg of ROAD_NETWORK) {
      const [x1, y1] = toMap(seg.x1, seg.z1);
      const [x2, y2] = toMap(seg.x2, seg.z2);
      ctx.strokeStyle =
        seg.kind === 'rail'
          ? 'rgba(190, 145, 95, 0.5)'
          : seg.kind === 'asphalt'
          ? 'rgba(140, 152, 148, 0.55)'
          : 'rgba(155, 132, 95, 0.42)';
      ctx.lineWidth = seg.kind === 'rail' ? 1.5 : 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Draw entities
    for (const ent of hud.minimapEntities) {
      const [mx, my] = toMap(ent.x, ent.z);
      if (mx < -6 || mx > w + 6 || my < -6 || my > h + 6) continue;

      if (ent.type === 'extraction') {
        ctx.strokeStyle = '#3bd671';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, 5, 0, Math.PI * 2);
        ctx.stroke();
      } else if (ent.type === 'mission') {
        ctx.fillStyle = '#e5b84b';
        ctx.beginPath();
        ctx.moveTo(mx, my - 5);
        ctx.lineTo(mx + 4.5, my);
        ctx.lineTo(mx, my + 5);
        ctx.lineTo(mx - 4.5, my);
        ctx.closePath();
        ctx.fill();
      } else if (ent.type === 'vehicle') {
        ctx.fillStyle = '#7bb4d9';
        ctx.fillRect(mx - 2.5, my - 2.5, 5, 5);
      } else if (ent.type === 'enemy') {
        ctx.fillStyle = ent.alerted ? '#e84335' : '#e08b3e';
        ctx.beginPath();
        ctx.arc(mx, my, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Player view cone & arrow
    const heading = -hud.playerYaw; // 0 = -Z (up on canvas)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(heading);
    ctx.fillStyle = 'rgba(159, 184, 122, 0.18)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 34, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#e9f2e4';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, [hud.playerX, hud.playerZ, hud.playerYaw, hud.minimapEntities]);

  const headingDeg = (((-hud.playerYaw * 180) / Math.PI) % 360 + 360) % 360;
  const trackedMission = hud.missions.find((m) => m.id === hud.trackedMissionId && !m.completed);
  const trackedDist = trackedMission
    ? Math.round(Math.hypot(trackedMission.targetX - hud.playerX, trackedMission.targetZ - hud.playerZ))
    : 0;

  const fireMode =
    hud.activeWeapon && hud.activeWeaponSpec
      ? hud.activeWeaponSpec.fireModes[hud.activeWeapon.fireModeIndex] ?? hud.activeWeaponSpec.fireModes[0]
      : '';

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none overflow-hidden">
      {/* Damage & Suppression edge vignette */}
      {(hud.damageFlash > 0.02 || hud.suppressionLevel > 0.05) && (
        <div
          className="absolute inset-0"
          style={{
            boxShadow: `inset 0 0 ${Math.round(90 + hud.damageFlash * 110)}px rgba(${
              hud.damageFlash > 0.08 ? '185, 24, 20' : '15, 18, 16'
            }, ${Math.min(0.75, hud.damageFlash * 0.65 + hud.suppressionLevel * 0.45)})`,
          }}
        />
      )}

      {/* Sniper Scope Optical Overlay (M24 / M700) */}
      {hud.hasScopeOverlay && (
        <div className="absolute inset-0 flex items-center justify-center">
          <svg viewBox="0 0 1000 1000" className="w-full h-full object-cover" preserveAspectRatio="xMidYMid slice">
            <defs>
              <mask id="scopeHole">
                <rect width="1000" height="1000" fill="white" />
                <circle cx="500" cy="500" r="330" fill="black" />
              </mask>
            </defs>
            <rect width="1000" height="1000" fill="#050706" mask="url(#scopeHole)" />
            <circle cx="500" cy="500" r="330" fill="none" stroke="#18201b" strokeWidth="14" />
            <line x1="170" y1="500" x2="830" y2="500" stroke="#111" strokeWidth="1.8" />
            <line x1="500" y1="170" x2="500" y2="830" stroke="#111" strokeWidth="1.8" />
            {/* Mil-dot ballistic drop ticks */}
            {[535, 570, 605, 640].map((y) => (
              <line key={y} x1="490" y1={y} x2="510" y2={y} stroke="#111" strokeWidth="2" />
            ))}
            {[420, 460, 540, 580].map((x) => (
              <line key={x} x1={x} y1="492" x2={x} y2="508" stroke="#111" strokeWidth="2" />
            ))}
            <circle cx="500" cy="500" r="3" fill="#ff3b2f" />
          </svg>
        </div>
      )}

      {/* TOP-LEFT: Tactical Minimap & Region Readout */}
      <div className="absolute top-4 left-4 flex flex-col gap-1.5">
        <div className="relative w-[160px] h-[160px] border border-[#687a5e]/80 bg-[#0a0f0c]/88 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.65)] overflow-hidden">
          <canvas ref={minimapRef} width={160} height={160} className="w-full h-full block" />
          <div className="pointer-events-none absolute inset-0 border border-white/10" />
          <div className="absolute top-1 left-1.5 text-[9px] font-mono-hud font-bold text-[#c6df9e] drop-shadow">N</div>
          <div className="absolute bottom-1 right-1.5 text-[9px] font-mono-hud text-[#aebda8] bg-[#0a0f0c]/70 px-1">
            {hud.playerX}, {hud.playerZ}
          </div>
        </div>
        <div className="bg-[#0a0f0c]/85 backdrop-blur-md border-l-2 border-[#e3b552] px-2.5 py-1.5 max-w-[214px] shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
          <div className="text-[11px] font-tactical font-bold tracking-wider uppercase text-[#edf2e8] truncate">
            {hud.isTrainingMode ? 'ESTANDE DE TIRO' : hud.currentRegion.name}
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono-hud text-[#9aa894]">
            <span>{formatTime(hud.timeOfDay)} · {hud.weather.toUpperCase()}</span>
            {hud.isTrainingMode ? (
              <span className="text-[#68eb94] font-semibold">SEM NPCS</span>
            ) : (
              <span className="text-[#e0ad48] font-semibold">AMEAÇA {hud.currentRegion.threatLevel}</span>
            )}
          </div>
        </div>
      </div>

      {/* TOP-CENTER: Military Compass & Stealth/Alert State */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
        <div className="w-[340px] h-8 bg-[#0a0f0c]/88 border border-[#445041] shadow-[0_4px_16px_rgba(0,0,0,0.45)] relative overflow-hidden flex items-center justify-center">
          <div className="w-full h-full relative">
            {COMPASS_LABELS.map(([deg, label]) => {
              let diff = deg - headingDeg;
              while (diff > 180) diff -= 360;
              while (diff < -180) diff += 360;
              if (Math.abs(diff) > 78) return null;
              const pct = 50 + (diff / 75) * 48;
              return (
                <div
                  key={label}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 font-mono-hud text-[11px] font-bold"
                  style={{
                    left: `${pct}%`,
                    color: label === 'N' ? '#e5b84f' : '#d2dccd',
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-[#d4a54a]" />
          <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] font-mono-hud text-[#a3b09c]">
            {String(Math.round(headingDeg)).padStart(3, '0')}°
          </div>
        </div>

        {/* Progressive Stealth / Combat Alert Indicator OR Firing Range Aim Scorecard */}
        {hud.isTrainingMode ? (
          <div className="flex items-center gap-3 px-3.5 py-1 bg-[#0a0f0c]/92 border border-[#d4a54a]/55 text-[10px] font-mono-hud tracking-wider">
            <span className="text-[#f5c542] font-bold">ESTANDE DE TIRO</span>
            <span className="text-white/25">|</span>
            <span className="text-[#e3ebe0]">
              ALVOS <strong className="text-[#68eb94]">{hud.trainingHits}</strong>
            </span>
            <span className="text-[#e3ebe0]">
              HS <strong className="text-[#ff6452]">{hud.trainingHeadshots}</strong>
            </span>
            <span className="text-[#e3ebe0]">
              PRECISÃO{' '}
              <strong className="text-[#f5c542]">
                {hud.trainingShots > 0 ? Math.min(100, Math.round((hud.trainingHits / hud.trainingShots) * 100)) : 0}%
              </strong>
            </span>
            {hud.trainingLastDist > 0 && (
              <span className="text-[#9bb8c8]">{hud.trainingLastDist}M</span>
            )}
            <span className="text-white/25">|</span>
            <span className="text-[#b5c2b0]">[T] ARMA · [B] ZERAR</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-0.5 bg-[#0a0f0c]/90 border border-[#3e483c] text-[10px] font-mono-hud tracking-widest">
            <span
              className={
                hud.alertLevel === 'COMBATE'
                  ? 'text-[#e84b3c] font-bold'
                  : hud.alertLevel === 'SUSPEITA'
                  ? 'text-[#e3b552] font-bold'
                  : 'text-[#87b87a]'
              }
            >
              {hud.alertLevel}
            </span>
            <div className="w-16 h-1.5 bg-[#1e261f] overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${hud.maxEnemyAlert}%`,
                  backgroundColor:
                    hud.alertLevel === 'COMBATE'
                      ? '#e84b3c'
                      : hud.alertLevel === 'SUSPEITA'
                      ? '#e3b552'
                      : '#87b87a',
                }}
              />
            </div>
            <span className="text-[#8d9b88]">VIS {hud.stealthVisibility}%</span>
          </div>
        )}

        {/* Active Extraction Countdown Banner */}
        {!hud.isTrainingMode && hud.extractionActive && (
          <div className="mt-1 px-4 py-1.5 bg-[#112418]/92 border border-[#3bd671] text-center">
            <div className="text-[11px] font-tactical font-bold tracking-widest text-[#68eb94] uppercase">
              EXTRAÇÃO EM ANDAMENTO · {hud.extractionName}
            </div>
            <div className="text-lg font-mono-hud font-bold text-white">
              00:{String(hud.extractionTimer).padStart(2, '0')}
            </div>
          </div>
        )}
      </div>

      {/* TOP-RIGHT: Active Mission & Combat/Loot Feed */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2 max-w-[290px]">
        {!hud.isTrainingMode && trackedMission && (
          <div className="w-full bg-[#0c110e]/85 border-r-2 border-[#e3b552] px-3 py-2 text-right">
            <div className="text-[10px] font-mono-hud tracking-widest text-[#e3b552] uppercase">
              OBJETIVO ATIVO · {trackedDist}M
            </div>
            <div className="text-xs font-tactical font-bold text-[#edf2ea] mt-0.5">
              {trackedMission.title}
            </div>
            <div className="text-[11px] font-mono-hud text-[#9fb098] mt-1">
              PROGRESSO: {trackedMission.progress} / {trackedMission.targetCount}
            </div>
          </div>
        )}

        {/* Discreet Feed */}
        <div className="flex flex-col items-end gap-1">
          {hud.feed.map((entry) => (
            <div
              key={entry.id}
              className="px-2.5 py-1 bg-[#0b100d]/85 border-r-2 text-[11px] font-mono-hud"
              style={{
                borderColor:
                  entry.accent === 'headshot'
                    ? '#e84b3c'
                    : entry.accent === 'kill'
                    ? '#e3b552'
                    : entry.accent === 'loot'
                    ? '#68c982'
                    : entry.accent === 'mission'
                    ? '#6bb3e8'
                    : entry.accent === 'alert'
                    ? '#eb6038'
                    : '#7b8a77',
                color: '#e3ebe0',
              }}
            >
              {entry.text}
            </div>
          ))}
        </div>
      </div>

      {/* CENTER: Tactical Crosshair, Hitmarker, Directional Damage Arc & Interaction Prompt */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Directional Damage Arc */}
        {hud.damageIndicatorAngle !== null && (
          <div
            className="absolute w-32 h-32"
            style={{ transform: `rotate(${hud.damageIndicatorAngle}rad)` }}
          >
            <div className="w-10 h-1.5 bg-[#e83f33] mx-auto rounded-full" />
          </div>
        )}

        {/* Dynamic Hip-Fire Crosshair (hidden during ADS or vehicle driving) */}
        {!hud.aiming && !hud.inVehicle && !hud.hasScopeOverlay && (
          <div className="relative flex items-center justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.92)]">
            <div className="w-1 h-1 bg-[#f4faef] rounded-full" />
            <div
              className="absolute w-3 h-[1.5px] bg-[#f4faef]/90"
              style={{ transform: `translateX(-${Math.max(10, Math.min(44, hud.spreadPx))}px)` }}
            />
            <div
              className="absolute w-3 h-[1.5px] bg-[#f4faef]/90"
              style={{ transform: `translateX(${Math.max(10, Math.min(44, hud.spreadPx))}px)` }}
            />
            <div
              className="absolute h-3 w-[1.5px] bg-[#f4faef]/90"
              style={{ transform: `translateY(-${Math.max(10, Math.min(44, hud.spreadPx))}px)` }}
            />
            <div
              className="absolute h-3 w-[1.5px] bg-[#f4faef]/90"
              style={{ transform: `translateY(${Math.max(10, Math.min(44, hud.spreadPx))}px)` }}
            />
          </div>
        )}

        {/* Hitmarker X */}
        {hud.hitmarkerType !== 'none' && (
          <svg width="28" height="28" viewBox="0 0 28 28" className="absolute drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
            <g
              stroke={
                hud.hitmarkerType === 'kill' || hud.hitmarkerType === 'head'
                  ? '#ff3d2e'
                  : '#ffffff'
              }
              strokeWidth={hud.hitmarkerType === 'kill' ? '2.6' : '1.9'}
            >
              <line x1="4" y1="4" x2="10" y2="10" />
              <line x1="24" y1="4" x2="18" y2="10" />
              <line x1="4" y1="24" x2="10" y2="18" />
              <line x1="24" y1="24" x2="18" y2="18" />
            </g>
          </svg>
        )}

        {/* Reload progress ring/bar */}
        {hud.reloading && (
          <div className="absolute translate-y-12 flex flex-col items-center gap-1">
            <div className="text-[10px] font-mono-hud tracking-widest text-[#e3b552]">RECARREGANDO</div>
            <div className="w-28 h-1 bg-[#1b221c]">
              <div
                className="h-full bg-[#e3b552]"
                style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* World Interaction Prompt */}
        {hud.interactionPrompt && (
          <div className="absolute translate-y-24 px-4 py-1.5 bg-[#0c120e]/92 border border-[#9fb87a] text-xs font-mono-hud tracking-wider text-[#eef5ea]">
            {hud.interactionPrompt}
          </div>
        )}

        {/* Click-to-Lock Mouse prompt if unlocked during active play */}
        {!hud.pointerLocked && hud.phase === 'playing' && (
          <button
            onClick={onResumePointerLock}
            className="pointer-events-auto absolute -translate-y-28 px-4 py-1.5 bg-[#121915]/92 border border-[#c79b4b] text-[11px] font-mono-hud tracking-wider text-[#f0e2be] hover:bg-[#1c2620] cursor-pointer"
          >
            CLIQUE NA TELA PARA TRAVAR A MIRA DO MOUSE · [ESC] PAUSA · [TAB] INVENTÁRIO · [M] MAPA
          </button>
        )}
      </div>

      {/* BOTTOM-LEFT: Operator Health, Armor, Stamina & Tactical Gear */}
      <div className="absolute bottom-5 left-5 w-[265px] bg-[#0c110e]/85 border-l-2 border-[#9fb87a] p-3">
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-mono-hud font-bold text-[#eef5eb]">{hud.health}</span>
            <span className="text-[10px] font-mono-hud text-[#8f9f8a]">HP</span>
            {hud.maxArmor > 0 && (
              <span className="text-xs font-mono-hud text-[#7ab4d6] ml-2">
                COLETE {hud.armor}/{hud.maxArmor}
              </span>
            )}
          </div>
          <span className="text-[10px] font-mono-hud text-[#b2c2a8]">
            {hud.crouching ? 'AGACHADO' : hud.sprinting ? 'CORRENDO' : 'EM PÉ'}
          </span>
        </div>

        {/* Health bar */}
        <div className="w-full h-2 bg-[#1c241d] mb-1.5">
          <div
            className="h-full"
            style={{
              width: `${(hud.health / hud.maxHealth) * 100}%`,
              backgroundColor: hud.health < 30 ? '#e34438' : '#8ec474',
            }}
          />
        </div>

        {/* Armor bar */}
        {hud.maxArmor > 0 && (
          <div className="w-full h-1.5 bg-[#182126] mb-1.5">
            <div
              className="h-full bg-[#5ea3cc]"
              style={{ width: `${(hud.armor / hud.maxArmor) * 100}%` }}
            />
          </div>
        )}

        {/* Stamina bar */}
        <div className="w-full h-1 bg-[#1e241d] mb-2">
          <div className="h-full bg-[#c9b165]" style={{ width: `${hud.stamina}%` }} />
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono-hud text-[#99a894]">
          <span>[H] MED {hud.medkitCount}</span>
          <span>[G] FRAG {hud.grenadeCount}</span>
          <span>[X] DISTRAIR</span>
          <span className={hud.flashlightOn ? 'text-[#f2d67c]' : ''}>[F] LUZ</span>
        </div>
      </div>

      {/* BOTTOM-RIGHT: Weapon Ammo / Vehicle Telemetry */}
      <div className="absolute bottom-5 right-5 flex flex-col items-end gap-2">
        {hud.inVehicle ? (
          <div className="w-[270px] bg-[#0c110e]/88 border-r-2 border-[#7bb4d9] p-3 text-right">
            <div className="text-xs font-tactical font-bold tracking-wider uppercase text-[#7bb4d9]">
              {hud.vehicleName}
            </div>
            <div className="flex items-baseline justify-end gap-2 my-1">
              <span className="text-3xl font-mono-hud font-bold text-white">{hud.vehicleSpeedKmh}</span>
              <span className="text-xs font-mono-hud text-[#95a490]">KM/H</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[10px] font-mono-hud text-[#a2b09c]">
              <div>
                <div className="mb-0.5">BLINDAGEM {Math.round((hud.vehicleHealth / hud.vehicleMaxHealth) * 100)}%</div>
                <div className="w-full h-1.5 bg-[#1d241e]">
                  <div
                    className="h-full bg-[#8ec474]"
                    style={{ width: `${(hud.vehicleHealth / hud.vehicleMaxHealth) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-0.5">COMBUSTÍVEL {Math.round((hud.vehicleFuel / hud.vehicleMaxFuel) * 100)}%</div>
                <div className="w-full h-1.5 bg-[#1d241e]">
                  <div
                    className="h-full bg-[#e3b552]"
                    style={{ width: `${(hud.vehicleFuel / hud.vehicleMaxFuel) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-[275px] bg-[#0c110e]/85 border-r-2 border-[#c79b4b] p-3 text-right">
            <div className="flex items-center justify-between text-[10px] font-mono-hud text-[#9ba895] mb-0.5">
              <span>{hud.activeWeapon?.suppressed ? 'SILENCIADA' : hud.activeWeaponSpec?.caliber ?? ''}</span>
              <span className="text-[#c79b4b]">[V] {fireMode}</span>
            </div>
            <div className="text-sm font-tactical font-bold tracking-wider uppercase text-[#edf2ea]">
              {hud.activeWeaponSpec?.name ?? 'SEM ARMA'}
            </div>
            <div className="flex items-baseline justify-end gap-1.5 mt-1">
              <span
                className={`text-3xl font-mono-hud font-bold ${
                  (hud.activeWeapon?.ammoInMag ?? 0) === 0 ? 'text-[#e84b3c]' : 'text-white'
                }`}
              >
                {hud.activeWeapon?.ammoInMag ?? 0}
              </span>
              <span className="text-sm font-mono-hud text-[#8e9e89]">/ {hud.reserveAmmo}</span>
            </div>

            {/* Weapon slots 1-4 */}
            <div className="grid grid-cols-4 gap-1 mt-2">
              {hud.equipment.slots.map((slot, idx) => (
                <div
                  key={idx}
                  className={`px-1 py-0.5 text-[9px] font-mono-hud truncate border ${
                    hud.equipment.activeSlot === idx
                      ? 'bg-[#2a3428] border-[#9fb87a] text-[#eff6ec]'
                      : 'bg-[#121713] border-[#2c352a] text-[#7c8a78]'
                  }`}
                >
                  {idx + 1} {slot ? WEAPONS[slot.weaponId].name.split(' ')[0] : '---'}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
