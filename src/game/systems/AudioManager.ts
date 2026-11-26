import * as THREE from 'three';
import { GameSettings, WeaponCategory, WeatherType } from '../types';
import { SurfaceType } from './TerrainManager';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Ambient continuous nodes
  private windGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private combatPulseGain: GainNode | null = null;
  private vehicleOsc: OscillatorNode | null = null;
  private vehicleSubOsc: OscillatorNode | null = null;
  private vehicleGain: GainNode | null = null;

  private settings: GameSettings;
  private initialized = false;

  constructor(settings: GameSettings) {
    this.settings = { ...settings };
  }

  public unlock() {
    if (!this.initialized) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.ambientGain = this.ctx.createGain();

      this.sfxGain.connect(this.masterGain);
      this.ambientGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.noiseBuffer = this.createNoiseBuffer(2.0);
      this.startAmbientLayers();
      this.applySettings(this.settings);
      this.initialized = true;
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public applySettings(settings: GameSettings) {
    this.settings = { ...settings };
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(settings.muted ? 0 : settings.masterVolume, now, 0.03);
    this.sfxGain.gain.setTargetAtTime(settings.sfxVolume, now, 0.03);
    this.ambientGain.gain.setTargetAtTime(settings.ambientVolume, now, 0.05);
  }

  private createNoiseBuffer(durationSec: number): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private startAmbientLayers() {
    if (!this.ctx || !this.noiseBuffer || !this.ambientGain) return;

    // Wind noise loop
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = this.noiseBuffer;
    windSrc.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 320;
    windFilter.Q.value = 1.4;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.08;
    windSrc.connect(windFilter).connect(this.windGain).connect(this.ambientGain);
    windSrc.start();

    // Rain noise loop
    const rainSrc = this.ctx.createBufferSource();
    rainSrc.buffer = this.noiseBuffer;
    rainSrc.loop = true;
    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 1600;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0.0;
    rainSrc.connect(rainFilter).connect(this.rainGain).connect(this.ambientGain);
    rainSrc.start();

    // Subtle dark tactical tension drone (scales up in combat)
    const droneOsc = this.ctx.createOscillator();
    droneOsc.type = 'sawtooth';
    droneOsc.frequency.value = 55;
    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 140;
    this.combatPulseGain = this.ctx.createGain();
    this.combatPulseGain.gain.value = 0.0;
    droneOsc.connect(droneFilter).connect(this.combatPulseGain).connect(this.ambientGain);
    droneOsc.start();

    // Continuous vehicle engine synth
    this.vehicleOsc = this.ctx.createOscillator();
    this.vehicleOsc.type = 'sawtooth';
    this.vehicleOsc.frequency.value = 48;
    this.vehicleSubOsc = this.ctx.createOscillator();
    this.vehicleSubOsc.type = 'triangle';
    this.vehicleSubOsc.frequency.value = 24;
    const vehFilter = this.ctx.createBiquadFilter();
    vehFilter.type = 'lowpass';
    vehFilter.frequency.value = 240;
    this.vehicleGain = this.ctx.createGain();
    this.vehicleGain.gain.value = 0;
    this.vehicleOsc.connect(vehFilter);
    this.vehicleSubOsc.connect(vehFilter);
    vehFilter.connect(this.vehicleGain).connect(this.sfxGain!);
    this.vehicleOsc.start();
    this.vehicleSubOsc.start();
  }

  public updateListener(pos: THREE.Vector3, forward: THREE.Vector3, up: THREE.Vector3) {
    if (!this.ctx) return;
    const listener = this.ctx.listener;
    if (listener.positionX) {
      listener.positionX.value = pos.x;
      listener.positionY.value = pos.y;
      listener.positionZ.value = pos.z;
      listener.forwardX.value = forward.x;
      listener.forwardY.value = forward.y;
      listener.forwardZ.value = forward.z;
      listener.upX.value = up.x;
      listener.upY.value = up.y;
      listener.upZ.value = up.z;
    }
  }

  public updateEnvironmentAudio(weather: WeatherType, combatTension: number, vehicleActive: boolean, vehicleSpeedRatio: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.windGain) {
      const targetWind = weather === 'rain' ? 0.14 : weather === 'fog' ? 0.11 : 0.06;
      this.windGain.gain.setTargetAtTime(targetWind, now, 0.3);
    }
    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(weather === 'rain' ? 0.13 : 0.0, now, 0.4);
    }
    if (this.combatPulseGain) {
      const pulse = combatTension > 0.1 ? (0.04 + 0.03 * Math.sin(now * 5.2)) * combatTension : 0;
      this.combatPulseGain.gain.setTargetAtTime(pulse, now, 0.2);
    }
    if (this.vehicleGain && this.vehicleOsc && this.vehicleSubOsc) {
      if (vehicleActive) {
        const rpmFreq = 46 + vehicleSpeedRatio * 98;
        this.vehicleOsc.frequency.setTargetAtTime(rpmFreq, now, 0.06);
        this.vehicleSubOsc.frequency.setTargetAtTime(rpmFreq * 0.5, now, 0.06);
        this.vehicleGain.gain.setTargetAtTime(0.11 + vehicleSpeedRatio * 0.07, now, 0.08);
      } else {
        this.vehicleGain.gain.setTargetAtTime(0, now, 0.12);
      }
    }
  }

  private createSpatialOut(pos?: THREE.Vector3, maxDistance = 160): AudioNode {
    if (!pos || !this.ctx) return this.sfxGain!;
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 8;
    panner.maxDistance = maxDistance;
    panner.rolloffFactor = 1.4;
    panner.positionX.value = pos.x;
    panner.positionY.value = pos.y;
    panner.positionZ.value = pos.z;
    panner.connect(this.sfxGain!);
    return panner;
  }

  public playGunshot(category: WeaponCategory, suppressed: boolean, worldPos?: THREE.Vector3) {
    if (!this.ctx || !this.noiseBuffer || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const dest = this.createSpatialOut(worldPos, suppressed ? 55 : 220);

    // 1. High-energy muzzle crack (noise burst)
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    const nGain = this.ctx.createGain();

    let duration = 0.16;
    let baseFreq = 1100;
    let vol = 0.42;
    let punchFreq = 135;

    if (category === 'sniper') {
      duration = 0.34;
      baseFreq = 750;
      vol = 0.62;
      punchFreq = 90;
    } else if (category === 'shotgun') {
      duration = 0.28;
      baseFreq = 620;
      vol = 0.6;
      punchFreq = 82;
    } else if (category === 'battle_rifle') {
      duration = 0.22;
      baseFreq = 900;
      vol = 0.5;
      punchFreq = 110;
    } else if (category === 'smg') {
      duration = 0.11;
      baseFreq = 1550;
      vol = 0.32;
      punchFreq = 175;
    } else if (category === 'pistol') {
      duration = 0.12;
      baseFreq = 1400;
      vol = 0.34;
      punchFreq = 165;
    }

    if (suppressed) {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(baseFreq * 1.45, now);
      filter.Q.value = 1.8;
      vol *= 0.34;
      duration *= 0.58;
    } else {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(baseFreq * 2.8, now);
      filter.frequency.exponentialRampToValueAtTime(240, now + duration);
    }

    nGain.gain.setValueAtTime(vol, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter).connect(nGain).connect(dest);
    noise.start(now);
    noise.stop(now + duration + 0.02);

    // 2. Low-end ballistic punch (sine pitch drop)
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(suppressed ? punchFreq * 1.4 : punchFreq, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + (suppressed ? 0.05 : 0.11));

    const oGain = this.ctx.createGain();
    oGain.gain.setValueAtTime(suppressed ? vol * 0.45 : vol * 0.9, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + (suppressed ? 0.06 : 0.13));

    osc.connect(oGain).connect(dest);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playReload(stage: 'start' | 'end') {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    const gain = this.ctx.createGain();
    if (stage === 'start') {
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.06);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    } else {
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(520, now + 0.045);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    }
    osc.connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playFootstep(surface: SurfaceType, sprinting: boolean, crouching: boolean) {
    if (!this.ctx || !this.noiseBuffer || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value =
      surface === 'metal' ? 1400 : surface === 'concrete' || surface === 'asphalt' ? 760 : surface === 'sand' ? 520 : 440;
    filter.Q.value = 1.6;

    const gain = this.ctx.createGain();
    const vol = crouching ? 0.035 : sprinting ? 0.14 : 0.085;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    src.connect(filter).connect(gain).connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.09);
  }

  public playHitmarker(headshot: boolean, kill: boolean) {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = headshot ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(headshot ? 1950 : 1280, now);
    osc.frequency.exponentialRampToValueAtTime(headshot ? 920 : 620, now + 0.065);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(headshot ? 0.24 : 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.08);

    if (kill) {
      const kOsc = this.ctx.createOscillator();
      kOsc.type = 'sine';
      kOsc.frequency.setValueAtTime(480, now + 0.04);
      kOsc.frequency.exponentialRampToValueAtTime(210, now + 0.14);
      const kGain = this.ctx.createGain();
      kGain.gain.setValueAtTime(0.18, now + 0.04);
      kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      kOsc.connect(kGain).connect(this.sfxGain);
      kOsc.start(now + 0.04);
      kOsc.stop(now + 0.16);
    }
  }

  public playImpact(material: 'metal' | 'concrete' | 'flesh', pos: THREE.Vector3) {
    if (!this.ctx || !this.noiseBuffer || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const dest = this.createSpatialOut(pos, 75);

    if (material === 'metal') {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2100 + Math.random() * 800, now);
      osc.frequency.exponentialRampToValueAtTime(750, now + 0.12);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.connect(gain).connect(dest);
      osc.start(now);
      osc.stop(now + 0.14);
    } else {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = material === 'flesh' ? 500 : 1200;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      src.connect(filter).connect(gain).connect(dest);
      src.start(now);
      src.stop(now + 0.09);
    }
  }

  public playExplosion(pos: THREE.Vector3) {
    if (!this.ctx || !this.noiseBuffer || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const dest = this.createSpatialOut(pos, 320);

    // Shockwave rumble
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(480, now);
    filter.frequency.exponentialRampToValueAtTime(65, now + 0.9);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.95, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 1.05);
    noise.connect(filter).connect(nGain).connect(dest);
    noise.start(now);
    noise.stop(now + 1.1);

    // Sub boom
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(22, now + 0.55);
    const oGain = this.ctx.createGain();
    oGain.gain.setValueAtTime(0.85, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(oGain).connect(dest);
    osc.start(now);
    osc.stop(now + 0.62);
  }

  public playLootPickup() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.setValueAtTime(740, now + 0.05);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playAlarm(pos: THREE.Vector3) {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const dest = this.createSpatialOut(pos, 140);
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.linearRampToValueAtTime(880, now + 0.35);
    osc.frequency.linearRampToValueAtTime(660, now + 0.7);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    osc.connect(gain).connect(dest);
    osc.start(now);
    osc.stop(now + 0.78);
  }

  public playRadioBeep() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1420, now);
    osc.frequency.setValueAtTime(1180, now + 0.06);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public dispose() {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
