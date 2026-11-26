import * as THREE from 'three';
import { ExtractionPointState, MissionState, RegionId } from '../types';
import { createInitialMissions, EXTRACTION_POINTS } from '../data/worldConfig';

export interface ExtractionUpdateResult {
  completed: boolean;
  interrupted: boolean;
  spawnWave: boolean;
}

export class MissionSystem {
  public missions: MissionState[] = createInitialMissions();
  public trackedMissionId: string | null = 'mis_blacksite_cmd';
  public extractionPoints: ExtractionPointState[] = EXTRACTION_POINTS;

  // Active extraction state
  public extractionActive = false;
  public activeExtractionPoint: ExtractionPointState | null = null;
  public extractionTimer = 0;
  public readonly extractionTotalTime = 18;
  private waveSpawned = false;

  public reset() {
    this.missions = createInitialMissions();
    this.trackedMissionId = this.missions[0].id;
    this.cancelExtraction();
  }

  public loadProgress(completedIds: string[], progressMap: Record<string, number>) {
    this.missions = createInitialMissions();
    for (const m of this.missions) {
      if (completedIds.includes(m.id)) {
        m.completed = true;
        m.progress = m.targetCount;
        m.active = false;
      } else if (progressMap[m.id] !== undefined) {
        m.progress = Math.min(m.targetCount, progressMap[m.id]);
      }
    }
    const nextIncomplete = this.missions.find((m) => !m.completed);
    this.trackedMissionId = nextIncomplete ? nextIncomplete.id : null;
  }

  public trackMission(id: string) {
    const found = this.missions.find((m) => m.id === id);
    if (!found) return;
    this.trackedMissionId = id;
    for (const m of this.missions) {
      m.active = m.id === id;
    }
  }

  public recordEnemyKill(regionId: RegionId): MissionState[] {
    const newlyCompleted: MissionState[] = [];
    for (const m of this.missions) {
      if (m.completed || m.type !== 'eliminate') continue;
      if (m.regionId === regionId) {
        m.progress = Math.min(m.targetCount, m.progress + 1);
        if (m.progress >= m.targetCount) {
          m.completed = true;
          newlyCompleted.push(m);
        }
      }
    }
    this.advanceTrackedIfCompleted();
    return newlyCompleted;
  }

  public recordObjectiveAction(missionId: string, amount = 1): MissionState | null {
    const m = this.missions.find((x) => x.id === missionId);
    if (!m || m.completed) return null;
    m.progress = Math.min(m.targetCount, m.progress + amount);
    if (m.progress >= m.targetCount) {
      m.completed = true;
      this.advanceTrackedIfCompleted();
      return m;
    }
    return null;
  }

  private advanceTrackedIfCompleted() {
    const current = this.missions.find((m) => m.id === this.trackedMissionId);
    if (!current || current.completed) {
      const next = this.missions.find((m) => !m.completed);
      this.trackedMissionId = next ? next.id : null;
      for (const m of this.missions) m.active = m.id === this.trackedMissionId;
    }
  }

  public getNearestExtractionPoint(pos: THREE.Vector3): { point: ExtractionPointState; dist: number } | null {
    let best: ExtractionPointState | null = null;
    let bestDist = Infinity;
    for (const ep of this.extractionPoints) {
      const d = Math.hypot(pos.x - ep.x, pos.z - ep.z);
      if (d < bestDist) {
        bestDist = d;
        best = ep;
      }
    }
    return best ? { point: best, dist: bestDist } : null;
  }

  public startExtraction(point: ExtractionPointState) {
    this.extractionActive = true;
    this.activeExtractionPoint = point;
    this.extractionTimer = this.extractionTotalTime;
    this.waveSpawned = false;
  }

  public cancelExtraction() {
    this.extractionActive = false;
    this.activeExtractionPoint = null;
    this.extractionTimer = 0;
    this.waveSpawned = false;
  }

  public updateExtraction(dt: number, playerPos: THREE.Vector3): ExtractionUpdateResult {
    if (!this.extractionActive || !this.activeExtractionPoint) {
      return { completed: false, interrupted: false, spawnWave: false };
    }
    const d = Math.hypot(
      playerPos.x - this.activeExtractionPoint.x,
      playerPos.z - this.activeExtractionPoint.z
    );
    if (d > this.activeExtractionPoint.radius + 3) {
      this.cancelExtraction();
      return { completed: false, interrupted: true, spawnWave: false };
    }

    this.extractionTimer = Math.max(0, this.extractionTimer - dt);
    let spawnWave = false;
    if (!this.waveSpawned && this.extractionTimer < this.extractionTotalTime - 4) {
      this.waveSpawned = true;
      spawnWave = true;
    }

    if (this.extractionTimer <= 0) {
      this.recordObjectiveAction('mis_extract_protocol', 1);
      this.cancelExtraction();
      return { completed: true, interrupted: false, spawnWave: false };
    }

    return { completed: false, interrupted: false, spawnWave };
  }
}
