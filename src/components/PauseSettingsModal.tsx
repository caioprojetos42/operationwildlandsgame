import React, { useState } from 'react';
import { GameSettings, GraphicsPreset, HUDState, WeatherType } from '../game/types';
import { AlertTriangle, CloudRain, LogOut, Play, RotateCcw, Save, Sliders, Sun, Volume2, VolumeX } from 'lucide-react';

interface PauseSettingsModalProps {
  hud: HUDState;
  settings: GameSettings;
  onResume: () => void;
  onSave: () => void;
  onRestart: () => void;
  onAbandonMatch: () => void;
  onUpdateSettings: (partial: Partial<GameSettings>) => void;
  onSetWeather: (w: WeatherType) => void;
  onSetTime: (h: number) => void;
}

const PRESETS: { id: GraphicsPreset; label: string; desc: string }[] = [
  { id: 'LOW', label: 'BAIXO', desc: 'Máximo desempenho' },
  { id: 'MEDIUM', label: 'MÉDIO', desc: 'Equilíbrio' },
  { id: 'HIGH', label: 'ALTO', desc: 'Qualidade' },
  { id: 'ULTRA', label: 'ULTRA', desc: 'Máximo alcance' },
];

const WEATHERS: { id: WeatherType; label: string }[] = [
  { id: 'clear', label: 'SOL' },
  { id: 'overcast', label: 'NUBLADO' },
  { id: 'fog', label: 'NEBLINA' },
  { id: 'rain', label: 'CHUVA' },
];

export const PauseSettingsModal: React.FC<PauseSettingsModalProps> = ({
  hud,
  settings,
  onResume,
  onSave,
  onRestart,
  onAbandonMatch,
  onUpdateSettings,
  onSetWeather,
  onSetTime,
}) => {
  const [savedToast, setSavedToast] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  const handleSave = () => {
    onSave();
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2200);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 md:p-8 bg-[#070a08]/90 pointer-events-auto">
      <div className="w-full max-w-4xl max-h-[88vh] flex flex-col bg-[#101612] border border-[#3d4a3a] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#161e19] border-b border-[#344032]">
          <div className="flex items-center gap-3">
            <Sliders className="w-5 h-5 text-[#9fb87a]" />
            <div>
              <h2 className="font-tactical font-bold text-xl tracking-wider uppercase text-[#edf4ea]">
                PAUSA & CONFIGURAÇÕES TÁTICAS
              </h2>
              <div className="text-[11px] font-mono-hud text-[#93a38d]">
                OPERADOR NÍVEL {hud.rank} ({hud.xp} XP) · ABATES: {hud.kills} ({hud.headshots} HS) · STASH EXTRAÍDO: ${hud.stashedValue}
              </div>
            </div>
          </div>
          <button
            onClick={onResume}
            className="flex items-center gap-2 px-5 py-2 bg-[#9fb87a] hover:bg-[#b5ce8e] text-[#0c110d] font-tactical font-bold text-sm uppercase tracking-wider cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>RETOMAR</span>
          </button>
        </div>

        {/* Settings Grid */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Graphics & Display */}
          <div className="space-y-4">
            <div className="text-xs font-mono-hud tracking-widest text-[#9fb87a] uppercase border-b border-[#2c362a] pb-1.5">
              GRÁFICOS & CÂMERA
            </div>

            <div>
              <label className="block text-[11px] font-mono-hud text-[#a4b29e] mb-2">PRESET GRÁFICO</label>
              <div className="grid grid-cols-4 gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onUpdateSettings({ graphicsPreset: p.id })}
                    className={`py-2 px-1 text-center border text-[11px] font-mono-hud cursor-pointer ${
                      settings.graphicsPreset === p.id
                        ? 'bg-[#263324] border-[#9fb87a] text-white font-bold'
                        : 'bg-[#141a16] border-[#2e382c] text-[#95a48e] hover:border-[#62735c]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono-hud text-[#a4b29e] mb-1">
                <span>RENDERIZAÇÃO POR CHUNKS</span>
                <span className="text-[#d4a54a] font-bold">
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
                className="w-full accent-[#9fb87a]"
              />
              <div className="flex justify-between text-[9px] font-mono-hud text-[#73826e] mt-0.5">
                <span>1 (MAIS FPS)</span>
                <span>FOG NO FIM DA CHUNK</span>
                <span>4 (HORIZONTE LONGO)</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono-hud text-[#a4b29e] mb-1">
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
                className="w-full accent-[#9fb87a]"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono-hud text-[#a4b29e] mb-1">
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
                className="w-full accent-[#9fb87a]"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono-hud text-[#a4b29e] mb-1">
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
                className="w-full accent-[#9fb87a]"
              />
            </div>

            <label className="flex items-center gap-2.5 text-xs font-mono-hud text-[#c5d1bf] cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={settings.invertY}
                onChange={(e) => onUpdateSettings({ invertY: e.target.checked })}
                className="accent-[#9fb87a]"
              />
              <span>INVERTER EIXO Y DA CÂMERA</span>
            </label>
          </div>

          {/* Audio & World Environment */}
          <div className="space-y-4">
            <div className="text-xs font-mono-hud tracking-widest text-[#9fb87a] uppercase border-b border-[#2c362a] pb-1.5">
              ÁUDIO ESPACIAL & CLIMA DINÂMICO
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono-hud text-[#a4b29e]">ÁUDIO GERAL</span>
              <button
                onClick={() => onUpdateSettings({ muted: !settings.muted })}
                className="flex items-center gap-1.5 px-3 py-1 bg-[#18201b] border border-[#3e4c3a] text-[11px] font-mono-hud text-[#dce6d8] cursor-pointer"
              >
                {settings.muted ? <VolumeX className="w-3.5 h-3.5 text-[#e84b3c]" /> : <Volume2 className="w-3.5 h-3.5 text-[#9fb87a]" />}
                <span>{settings.muted ? 'MUDO' : 'ATIVO'}</span>
              </button>
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono-hud text-[#a4b29e] mb-1">
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
                className="w-full accent-[#9fb87a]"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono-hud text-[#a4b29e] mb-1">
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
                className="w-full accent-[#9fb87a]"
              />
            </div>

            {/* Live Weather & Time of Day controls */}
            <div className="pt-2 border-t border-[#2c362a] space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-mono-hud text-[#e3b552]">
                <CloudRain className="w-3.5 h-3.5" />
                <span>CLIMA EM TEMPO REAL</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {WEATHERS.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => onSetWeather(w.id)}
                    className={`py-1.5 text-[10px] font-mono-hud border cursor-pointer ${
                      hud.weather === w.id
                        ? 'bg-[#263324] border-[#e3b552] text-white font-bold'
                        : 'bg-[#141a16] border-[#2e382c] text-[#95a48e]'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] font-mono-hud text-[#a4b29e] mb-1">
                  <span className="flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5 text-[#e3b552]" />
                    HORA DO DIA
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
                  className="w-full accent-[#e3b552]"
                />
              </div>
            </div>
          </div>

          {/* Controls Summary */}
          <div className="md:col-span-2 bg-[#141b16] border border-[#2d382c] p-3.5 text-[11px] font-mono-hud text-[#a5b3a0] grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div><span className="text-[#9fb87a]">WASD</span> Mover / Dirigir</div>
            <div><span className="text-[#9fb87a]">LMB / RMB</span> Atirar / Mira ADS</div>
            <div><span className="text-[#9fb87a]">SHIFT / CTRL / C</span> Correr / Agachar</div>
            <div><span className="text-[#9fb87a]">ESPAÇO</span> Pular / Freio de Mão</div>
            <div><span className="text-[#9fb87a]">R / V / F</span> Recarga / Modo / Lanterna</div>
            <div><span className="text-[#9fb87a]">1 2 3 4</span> Trocar Armamento</div>
            <div><span className="text-[#9fb87a]">E</span> Loot / Veículo / Extrair</div>
            <div><span className="text-[#9fb87a]">G / H / X</span> Granada / Curar / Distrair</div>
          </div>
        </div>

        {/* Inline Abandon Match Warning Banner */}
        {confirmAbandon && (
          <div className="px-6 py-3 bg-[#241212] border-t border-[#8a322d] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs font-mono-hud text-[#f6c4be]">
              <AlertTriangle className="w-4 h-4 text-[#ef5348] shrink-0" />
              <span>
                {hud.isTrainingMode
                  ? 'SAIR DO MODO TREINAMENTO E VOLTAR AO MENU PRINCIPAL?'
                  : `ATENÇÃO: ABANDONAR A PARTIDA PERDE TODO O LOOT CARREGADO ($${hud.lootValue}) COMO SE TIVESSE MORRIDO!`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConfirmAbandon(false)}
                className="px-3.5 py-1.5 bg-[#1b221d] hover:bg-[#273129] border border-[#4a5746] text-[11px] font-mono-hud text-[#dbe4d7] cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                onClick={onAbandonMatch}
                className="px-4 py-1.5 bg-[#b8322a] hover:bg-[#d13b32] border border-[#f27168] text-[11px] font-mono-hud font-bold text-white cursor-pointer"
              >
                CONFIRMAR ABANDONO
              </button>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 bg-[#161e19] border-t border-[#344032]">
          <div className="flex flex-wrap items-center gap-2.5">
            {!hud.isTrainingMode && (
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-[#1e2a22] hover:bg-[#2a3b30] border border-[#5d7057] text-xs font-mono-hud text-[#e6efe2] cursor-pointer"
              >
                <Save className="w-4 h-4 text-[#9fb87a]" />
                <span>{savedToast ? 'PROGRESSO SALVO!' : 'SALVAR PROGRESSO'}</span>
              </button>
            )}
            <button
              onClick={onRestart}
              className="flex items-center gap-2 px-4 py-2 bg-[#231f17] hover:bg-[#322b1e] border border-[#6e5c33] text-xs font-mono-hud text-[#f0dfb8] cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-[#e3b552]" />
              <span>REINICIAR OPERAÇÃO</span>
            </button>
            <button
              onClick={() => setConfirmAbandon(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#2b1514] hover:bg-[#411d1b] border border-[#8f352f] text-xs font-mono-hud font-bold text-[#ffd0ca] cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-[#ef5348]" />
              <span>ABANDONAR PARTIDA</span>
            </button>
          </div>
          <span className="text-[11px] font-mono-hud text-[#869682]">
            SETORES CARREGADOS: {hud.loadedSectorsCount} · ARSENAL: 15 ARMAS
          </span>
        </div>
      </div>
    </div>
  );
};
