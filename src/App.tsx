import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, GameEngine } from './game/GameEngine';
import { DeploymentConfig, GameSettings, HUDState, WeatherType } from './game/types';
import { TitleScreen } from './components/TitleScreen';
import { TacticalHUD } from './components/TacticalHUD';
import { InventoryModal } from './components/InventoryModal';
import { TacticalMapModal } from './components/TacticalMapModal';
import { PauseSettingsModal } from './components/PauseSettingsModal';
import { EndScreenModal } from './components/EndScreenModal';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [hud, setHud] = useState<HUDState | null>(null);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [introStage, setIntroStage] = useState<'loop' | 'done'>('loop');

  const finishIntro = useCallback(() => {
    setIntroStage('done');
    engineRef.current?.audio.unlock();
  }, []);

  useEffect(() => {
    if (introStage === 'done') return;
    const onKey = (e: KeyboardEvent) => {
      if (introStage === 'loop') {
        e.preventDefault();
        finishIntro();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [introStage, finishIntro]);

  // Mount isolated WebGL canvas once so React state updates never tear down the 3D scene
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;
    const engine = new GameEngine(mount, (nextHud) => {
      setHud(nextHud);
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleStartNew = useCallback((config?: DeploymentConfig) => {
    engineRef.current?.startNewOperation(config);
  }, []);

  const handleRestartDefault = useCallback(() => {
    engineRef.current?.redeployRandomSpawn();
  }, []);

  const handleReturnToMenu = useCallback(() => {
    engineRef.current?.returnToMainMenu();
  }, []);

  const handleAbandonMatch = useCallback(() => {
    engineRef.current?.abandonOperation();
  }, []);

  const handleCycleSpectator = useCallback(() => {
    engineRef.current?.cycleSpectatorTarget();
  }, []);

  const handleContinue = useCallback(() => {
    engineRef.current?.continueSavedOperation();
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.setPhase('playing');
  }, []);

  const handleResumePointerLock = useCallback(() => {
    engineRef.current?.requestPointerLock();
  }, []);

  const handleUpdateSettings = useCallback((partial: Partial<GameSettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...partial };
      engineRef.current?.updateSettings(partial);
      return merged;
    });
  }, []);

  const handleToggleMute = useCallback(() => {
    handleUpdateSettings({ muted: !settings.muted });
  }, [handleUpdateSettings, settings.muted]);

  const handleSetWeather = useCallback((w: WeatherType) => {
    engineRef.current?.setWeatherManual(w);
  }, []);

  const handleSetTime = useCallback((h: number) => {
    engineRef.current?.setTimeOfDayManual(h);
  }, []);

  const handleSave = useCallback(() => {
    engineRef.current?.saveCurrentGame(false);
  }, []);

  const handleEquipOrUse = useCallback((uid: string) => {
    engineRef.current?.equipInventoryItem(uid);
  }, []);

  const handleDrop = useCallback((uid: string) => {
    engineRef.current?.dropInventoryItem(uid);
  }, []);

  const handleTakeItem = useCallback((uid: string) => {
    engineRef.current?.takeItemFromOpenContainer(uid);
  }, []);

  const handleTakeAll = useCallback(() => {
    engineRef.current?.takeAllFromOpenContainer();
  }, []);

  const handleTrackMission = useCallback((id: string) => {
    engineRef.current?.trackMission(id);
  }, []);

  const handleFastTravel = useCallback((x: number, z: number, label: string) => {
    engineRef.current?.fastTravelToPoi(x, z, label);
  }, []);

  const handleContinueAfterExtract = useCallback(() => {
    engineRef.current?.setPhase('playing');
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0b0e0d]">
      {/* Isolated WebGL viewport container */}
      <div ref={canvasMountRef} className="w-full h-full block" />

      {/* Game Shell Overlays */}
      {introStage === 'loop' && (
        <div
          onClick={finishIntro}
          role="button"
          tabIndex={0}
          className="fixed inset-0 z-50 w-screen h-screen bg-black cursor-pointer select-none overflow-hidden"
        >
          <video
            src="/assets/intro_loop.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(180deg, rgba(6,8,10,0.35) 0%, rgba(6,8,10,0.0) 35%, rgba(6,8,10,0.0) 68%, rgba(6,8,10,0.88) 100%)',
            }}
          />
          <div className="absolute bottom-10 inset-x-0 flex flex-col items-center justify-center gap-2 pointer-events-none px-4 text-center">
            <div className="px-6 py-2.5 bg-[#0a0d10]/78 backdrop-blur-md border border-[#f5c542]/55 shadow-[0_0_28px_rgba(0,0,0,0.85)]">
              <span className="font-military font-bold text-sm sm:text-base tracking-[0.22em] uppercase text-[#f5c542] animate-pulse">
                PRESSIONE QUALQUER TECLA OU CLIQUE NA TELA PARA CONTINUAR
              </span>
            </div>
          </div>
        </div>
      )}

      {introStage === 'done' && hud && hud.phase === 'title' && (
        <TitleScreen
          hud={hud}
          settings={settings}
          hasSavedGame={hud.hasSavedGame}
          muted={settings.muted}
          onStartNew={handleStartNew}
          onContinue={handleContinue}
          onToggleMute={handleToggleMute}
          onUpdateSettings={handleUpdateSettings}
          onSetWeather={handleSetWeather}
          onSetTime={handleSetTime}
          onTrackMission={handleTrackMission}
        />
      )}

      {hud && hud.phase === 'playing' && (
        <TacticalHUD hud={hud} onResumePointerLock={handleResumePointerLock} />
      )}

      {hud && hud.phase === 'inventory' && (
        <InventoryModal
          hud={hud}
          onClose={handleResume}
          onEquipOrUse={handleEquipOrUse}
          onDrop={handleDrop}
          onTakeItem={handleTakeItem}
          onTakeAll={handleTakeAll}
        />
      )}

      {hud && hud.phase === 'map' && (
        <TacticalMapModal
          hud={hud}
          onClose={handleResume}
          onTrackMission={handleTrackMission}
          onFastTravel={handleFastTravel}
        />
      )}

      {hud && hud.phase === 'paused' && (
        <PauseSettingsModal
          hud={hud}
          settings={settings}
          onResume={handleResume}
          onSave={handleSave}
          onRestart={handleRestartDefault}
          onAbandonMatch={handleAbandonMatch}
          onUpdateSettings={handleUpdateSettings}
          onSetWeather={handleSetWeather}
          onSetTime={handleSetTime}
        />
      )}

      {hud && (hud.phase === 'dead' || hud.phase === 'extracted') && (
        <EndScreenModal
          hud={hud}
          onRedeploy={handleRestartDefault}
          onContinueExplore={handleContinueAfterExtract}
          onReturnToMenu={handleReturnToMenu}
          onCycleSpectator={handleCycleSpectator}
        />
      )}
    </div>
  );
}
