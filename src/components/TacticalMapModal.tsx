import React from 'react';
import { HUDState } from '../game/types';
import { POINTS_OF_INTEREST, REGION_LIST, ROAD_NETWORK, WORLD_HALF_SIZE } from '../game/data/worldConfig';
import { CheckCircle2, Compass, MapPin, Navigation, X } from 'lucide-react';

interface TacticalMapModalProps {
  hud: HUDState;
  onClose: () => void;
  onTrackMission: (missionId: string) => void;
  onFastTravel: (x: number, z: number, label: string) => void;
}

export const TacticalMapModal: React.FC<TacticalMapModalProps> = ({
  hud,
  onClose,
  onTrackMission,
  onFastTravel,
}) => {
  const worldSpan = WORLD_HALF_SIZE * 2;
  const toPct = (v: number) => ((v + WORLD_HALF_SIZE) / worldSpan) * 100;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 md:p-8 bg-[#070a08]/90 pointer-events-auto">
      <div className="w-full max-w-6xl h-[86vh] flex flex-col bg-[#101612] border border-[#3d4a3a] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#161e19] border-b border-[#344032]">
          <div className="flex items-center gap-3">
            <Compass className="w-5 h-5 text-[#e3b552]" />
            <div>
              <h2 className="font-tactical font-bold text-lg tracking-wider uppercase text-[#edf4ea]">
                MAPA TÁTICO — REGIÃO WILDLANDS (1.5 KM²)
              </h2>
              <div className="text-[11px] font-mono-hud text-[#93a38d]">
                POSIÇÃO ATUAL: {hud.currentRegion.name.toUpperCase()} ({hud.playerX}m, {hud.playerZ}m) · SETORES ATIVOS: {hud.loadedSectorsCount}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1f2922] hover:bg-[#2a372e] border border-[#495946] text-xs font-mono-hud text-[#dce6d8] cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>FECHAR [M]</span>
          </button>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Interactive Map Canvas */}
          <div className="lg:col-span-8 relative bg-[#0c120e] border-r border-[#2f3b2d] overflow-hidden">
            {/* Grid & Roads SVG */}
            <svg viewBox="0 0 100 100" className="w-full h-full">
              {/* Tactical grid lines */}
              {[12.5, 25, 37.5, 50, 62.5, 75, 87.5].map((p) => (
                <g key={p}>
                  <line x1={p} y1="0" x2={p} y2="100" stroke="#1d281f" strokeWidth="0.2" />
                  <line x1="0" y1={p} x2="100" y2={p} stroke="#1d281f" strokeWidth="0.2" />
                </g>
              ))}

              {/* Region Biome Zones */}
              {REGION_LIST.map((reg) => (
                <g key={reg.id}>
                  <circle
                    cx={toPct(reg.centerX)}
                    cy={toPct(reg.centerZ)}
                    r={(reg.radius / worldSpan) * 100}
                    fill={reg.color}
                    fillOpacity="0.14"
                    stroke={reg.color}
                    strokeOpacity="0.45"
                    strokeWidth="0.35"
                  />
                  <text
                    x={toPct(reg.centerX)}
                    y={toPct(reg.centerZ) - (reg.id === 'underground_facility' ? 2.8 : 0)}
                    fill={reg.color}
                    fontSize="2.1"
                    fontFamily="'Chakra Petch', sans-serif"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {reg.name.toUpperCase()}
                  </text>
                </g>
              ))}

              {/* Road & Rail Network */}
              {ROAD_NETWORK.map((seg, i) => (
                <line
                  key={i}
                  x1={toPct(seg.x1)}
                  y1={toPct(seg.z1)}
                  x2={toPct(seg.x2)}
                  y2={toPct(seg.z2)}
                  stroke={seg.kind === 'rail' ? '#b88858' : seg.kind === 'asphalt' ? '#7b8783' : '#9c835c'}
                  strokeWidth={seg.kind === 'rail' ? '0.45' : '0.8'}
                  strokeDasharray={seg.kind === 'rail' ? '1.2 0.8' : undefined}
                />
              ))}

              {/* Extraction Points */}
              {hud.extractionPoints.map((ep) => (
                <g key={ep.id}>
                  <circle
                    cx={toPct(ep.x)}
                    cy={toPct(ep.z)}
                    r="1.9"
                    fill="#38d66b"
                    fillOpacity="0.22"
                    stroke="#38d66b"
                    strokeWidth="0.4"
                  />
                  <text
                    x={toPct(ep.x)}
                    y={toPct(ep.z) + 3.4}
                    fill="#6be893"
                    fontSize="1.6"
                    fontFamily="'JetBrains Mono', monospace"
                    textAnchor="middle"
                  >
                    EXT
                  </text>
                </g>
              ))}

              {/* Active Mission Target */}
              {hud.missions
                .filter((m) => !m.completed)
                .map((m) => (
                  <polygon
                    key={m.id}
                    points={`${toPct(m.targetX)},${toPct(m.targetZ) - 1.5} ${toPct(m.targetX) + 1.5},${toPct(m.targetZ)} ${toPct(m.targetX)},${toPct(m.targetZ) + 1.5} ${toPct(m.targetX) - 1.5},${toPct(m.targetZ)}`}
                    fill={m.id === hud.trackedMissionId ? '#f2c14e' : '#a88c48'}
                  />
                ))}

              {/* Player Marker */}
              <circle
                cx={toPct(hud.playerX)}
                cy={toPct(hud.playerZ)}
                r="1.5"
                fill="#ffffff"
                stroke="#9fb87a"
                strokeWidth="0.6"
              />
            </svg>

            {/* Legend */}
            <div className="absolute bottom-3 left-3 flex flex-wrap gap-3 px-3 py-1.5 bg-[#0c110e]/92 border border-[#344032] text-[10px] font-mono-hud text-[#a9b6a3]">
              <span className="text-white">● OPERADOR</span>
              <span className="text-[#f2c14e]">◆ MISSÃO</span>
              <span className="text-[#38d66b]">◎ EXTRAÇÃO</span>
              <span className="text-[#b88858]">--- FERROVIA</span>
            </div>
          </div>

          {/* Right Panel: Non-linear Missions & POI Tactical Deployment */}
          <div className="lg:col-span-4 flex flex-col overflow-y-auto p-4 gap-4">
            <div>
              <div className="text-xs font-mono-hud tracking-widest text-[#e3b552] uppercase mb-2">
                MISSÕES OPERACIONAIS ({hud.missions.filter((m) => m.completed).length}/{hud.missions.length})
              </div>
              <div className="space-y-2">
                {hud.missions.map((m) => {
                  const isTracked = m.id === hud.trackedMissionId;
                  return (
                    <button
                      key={m.id}
                      onClick={() => onTrackMission(m.id)}
                      className={`w-full text-left p-2.5 border transition-colors cursor-pointer ${
                        m.completed
                          ? 'bg-[#121a14] border-[#2e4733] opacity-70'
                          : isTracked
                          ? 'bg-[#1c241b] border-[#e3b552]'
                          : 'bg-[#141a16] border-[#2e382d] hover:border-[#6d7f66]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono-hud">
                        <span className={m.completed ? 'text-[#5cd67d]' : 'text-[#e3b552]'}>
                          {m.completed ? 'CONCLUÍDA' : isTracked ? 'RASTREANDO' : 'DISPONÍVEL'}
                        </span>
                        <span className="text-[#95a48e]">
                          {m.progress}/{m.targetCount} · +${m.rewardCredits}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-tactical font-bold text-[#eef4eb] mt-0.5">
                        {m.completed && <CheckCircle2 className="w-3.5 h-3.5 text-[#5cd67d] shrink-0" />}
                        <span>{m.title}</span>
                      </div>
                      <p className="text-[11px] text-[#91a08c] mt-1">{m.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs font-mono-hud tracking-widest text-[#9fb87a] uppercase mb-2">
                PONTOS DE INTERESSE (DESLOCAMENTO RÁPIDO)
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {POINTS_OF_INTEREST.map((poi) => {
                  const dist = Math.round(Math.hypot(poi.x - hud.playerX, poi.z - hud.playerZ));
                  return (
                    <button
                      key={poi.id}
                      onClick={() => onFastTravel(poi.x, poi.z, poi.name)}
                      className="flex items-center justify-between px-2.5 py-2 bg-[#131a15] hover:bg-[#1e2921] border border-[#2d382c] text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-[#9fb87a] shrink-0" />
                        <span className="text-xs font-medium text-[#e4ece0] truncate">{poi.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-mono-hud text-[#95a48e] shrink-0">
                        <span>{dist}m</span>
                        <Navigation className="w-3 h-3 text-[#c79b4b]" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
