import * as THREE from 'three';
import { VEHICLE_SPECS } from '../data/worldConfig';
import { VehicleSpec, VehicleType } from '../types';
import { buildVehicleModel, BuiltVehicleModel } from './ProceduralModels';
import { ProceduralMaterials } from './TextureLibrary';
import { TerrainManager } from './TerrainManager';
import { WorldManager } from './WorldManager';

export interface VehicleInstance {
  id: string;
  spec: VehicleSpec;
  model: BuiltVehicleModel;
  position: THREE.Vector3;
  yaw: number;
  speed: number;
  steerAngle: number;
  health: number;
  fuel: number;
  headlightsOn: boolean;
  destroyed: boolean;
  pitch: number;
  roll: number;
  dustTimer: number;
  smokeTimer: number;
}

interface VehiclePuff {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  baseOpacity: number;
  growRate: number;
}

const _up = new THREE.Vector3(0, 1, 0);
const _normal = new THREE.Vector3();
const _quatAlign = new THREE.Quaternion();
const _quatYaw = new THREE.Quaternion();

export class VehicleSystem {
  public vehicles: VehicleInstance[] = [];
  public activeVehicle: VehicleInstance | null = null;
  public thirdPerson = true;

  private scene: THREE.Scene;
  private terrain: TerrainManager;
  private world: WorldManager;
  private mats: ProceduralMaterials;
  private headlightSpot: THREE.SpotLight;
  private puffs: VehiclePuff[] = [];

  constructor(scene: THREE.Scene, terrain: TerrainManager, world: WorldManager, mats: ProceduralMaterials) {
    this.scene = scene;
    this.terrain = terrain;
    this.world = world;
    this.mats = mats;

    this.headlightSpot = new THREE.SpotLight(0xfff4d6, 0, 82, Math.PI / 4, 0.48, 1.3);
    this.scene.add(this.headlightSpot);
    this.scene.add(this.headlightSpot.target);

    this.spawnInitialFleet();
  }

  private spawnInitialFleet() {
    const spawns: { id: string; type: VehicleType; x: number; z: number; yaw: number }[] = [
      { id: 'veh_jeep_blacksite', type: 'jeep', x: 18, z: 22, yaw: -Math.PI * 0.5 },
      { id: 'veh_car_blacksite', type: 'military_car', x: -16, z: 32, yaw: 0.2 },
      { id: 'veh_truck_blacksite', type: 'cargo_truck', x: 76, z: 26, yaw: Math.PI * 0.5 },
      { id: 'veh_apc_hq', type: 'apc', x: -18, z: -56, yaw: 0 },
      // Hero APC 8x8 Striker stationed on the dirt road approaching Desert Outpost!
      { id: 'veh_apc_desert_approach', type: 'apc', x: 332, z: 12, yaw: -2.38 },
      { id: 'veh_jeep_desert', type: 'jeep', x: 378, z: -46, yaw: 1.1 },
      { id: 'veh_pickup_rural', type: 'pickup', x: -315, z: 305, yaw: -0.6 },
      { id: 'veh_truck_industrial', type: 'cargo_truck', x: -365, z: 18, yaw: 1.5 },
      { id: 'veh_car_city', type: 'military_car', x: -24, z: -365, yaw: Math.PI },
      { id: 'veh_apc_mountain', type: 'apc', x: 318, z: -395, yaw: 2.3 },
    ];

    const vehicleAssetMap: Record<VehicleType, 'vehicle_apc' | 'vehicle_jeep' | 'vehicle_pickup' | 'vehicle_truck' | 'vehicle_car'> = {
      apc: 'vehicle_apc',
      jeep: 'vehicle_jeep',
      pickup: 'vehicle_pickup',
      cargo_truck: 'vehicle_truck',
      military_car: 'vehicle_car',
    };

    for (const sp of spawns) {
      const spec = VEHICLE_SPECS[sp.type];
      const model = buildVehicleModel(sp.type, this.mats);
      const y = this.terrain.getSurfaceHeightAt(sp.x, sp.z);
      model.group.position.set(sp.x, y, sp.z);
      model.group.rotation.y = sp.yaw;
      model.bodyMesh.userData = { vehicleId: sp.id };
      this.scene.add(model.group);
      this.world.raycastMeshes.push(model.bodyMesh);

      // Phase 4: Non-blocking external GLB override if configured in /public/models/manifest.json
      const assetKey = vehicleAssetMap[sp.type];
      void this.world.assetManager.init().then(() => {
        if (!this.world.assetManager.hasExternalAsset(assetKey)) return;
        void this.world.assetManager.loadClone(assetKey).then((glbModel) => {
          if (!glbModel) return;
          model.group.children.forEach((child) => {
            if (child !== model.bodyMesh) child.visible = false;
          });
          model.bodyMesh.visible = false; // Keeps raycast hitbox bounds intact while hiding procedural shell
          model.group.add(glbModel);
        });
      });

      this.vehicles.push({
        id: sp.id,
        spec,
        model,
        position: new THREE.Vector3(sp.x, y, sp.z),
        yaw: sp.yaw,
        speed: 0,
        steerAngle: 0,
        health: spec.maxHealth,
        fuel: spec.maxFuel,
        headlightsOn: true,
        destroyed: false,
        pitch: 0,
        roll: 0,
        dustTimer: 0,
        smokeTimer: 0,
      });
    }
  }

  private spawnPuff(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    startScale: number,
    life: number,
    color: number,
    baseOpacity: number,
    growRate: number
  ) {
    if (this.puffs.length >= 36) {
      const oldest = this.puffs.shift()!;
      this.scene.remove(oldest.sprite);
      (oldest.sprite.material as THREE.Material).dispose();
    }
    const mat = new THREE.SpriteMaterial({
      map: this.mats.smokeSpriteMap,
      color,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.scale.set(startScale, startScale, 1);
    this.scene.add(sprite);
    this.puffs.push({ sprite, vel, life, maxLife: life, baseOpacity, growRate });
  }

  public findNearestVehicle(playerPos: THREE.Vector3, maxDist = 4.5): VehicleInstance | null {
    let best: VehicleInstance | null = null;
    let bestD = maxDist;
    for (const v of this.vehicles) {
      if (v.destroyed) continue;
      const d = v.position.distanceTo(playerPos);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  public enterVehicle(v: VehicleInstance) {
    this.activeVehicle = v;
    this.headlightSpot.intensity = v.headlightsOn ? 32 : 0;
  }

  public exitVehicle(): THREE.Vector3 | null {
    if (!this.activeVehicle) return null;
    const v = this.activeVehicle;
    const sideOffset = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw)).multiplyScalar(v.spec.width * 0.85 + 1.1);
    const exitPos = v.position.clone().add(sideOffset);
    exitPos.y = this.terrain.getHeightAt(exitPos.x, exitPos.z, exitPos.y);
    this.activeVehicle = null;
    this.headlightSpot.intensity = 0;
    return exitPos;
  }

  public toggleHeadlights() {
    if (!this.activeVehicle) return;
    this.activeVehicle.headlightsOn = !this.activeVehicle.headlightsOn;
    this.headlightSpot.intensity = this.activeVehicle.headlightsOn ? 32 : 0;
  }

  public damageVehicle(id: string, amount: number): { destroyed: boolean; position?: THREE.Vector3 } {
    const v = this.vehicles.find((x) => x.id === id);
    if (!v || v.destroyed) return { destroyed: false };
    v.health = Math.max(0, v.health - amount);
    if (v.health <= 0) {
      v.destroyed = true;
      v.speed = 0;
      (v.model.bodyMesh.material as THREE.MeshStandardMaterial).color.setHex(0x1f1e1c);
      if (this.activeVehicle === v) {
        this.activeVehicle = null;
        this.headlightSpot.intensity = 0;
      }
      return { destroyed: true, position: v.position.clone() };
    }
    return { destroyed: false };
  }

  public update(
    dt: number,
    input: { forward: boolean; backward: boolean; left: boolean; right: boolean; brake: boolean },
    camera: THREE.PerspectiveCamera
  ): { speedRatio: number; roadkillPos?: THREE.Vector3 } {
    let speedRatio = 0;
    let roadkillPos: THREE.Vector3 | undefined;

    for (const v of this.vehicles) {
      const isControlled = v === this.activeVehicle && !v.destroyed;

      if (isControlled) {
        const throttle = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
        const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);

        if (v.fuel > 0 && throttle !== 0) {
          const accel = throttle > 0 ? v.spec.acceleration : v.spec.acceleration * 0.75;
          v.speed += throttle * accel * dt;
          v.fuel = Math.max(0, v.fuel - v.spec.fuelBurnRate * Math.abs(throttle) * dt);
        } else {
          v.speed = THREE.MathUtils.damp(v.speed, 0, 2.2, dt);
        }

        if (input.brake) {
          v.speed = THREE.MathUtils.damp(v.speed, 0, 7.5, dt);
        }

        v.speed = THREE.MathUtils.clamp(v.speed, -v.spec.reverseSpeed, v.spec.maxSpeed);
        v.steerAngle = THREE.MathUtils.damp(v.steerAngle, steer * 0.5, 9, dt);

        if (Math.abs(v.speed) > 0.35) {
          const dirSign = v.speed >= 0 ? 1 : -1;
          const speedTurnScale = THREE.MathUtils.clamp(Math.abs(v.speed) / 8, 0.25, 1.0);
          v.yaw += v.steerAngle * v.spec.turnSpeed * dirSign * speedTurnScale * dt;
        }

        const targetPitch = throttle * -0.035 + (input.brake ? 0.05 : 0);
        const targetRoll = -v.steerAngle * (v.speed / v.spec.maxSpeed) * 0.14;
        v.pitch = THREE.MathUtils.damp(v.pitch, targetPitch, 8, dt);
        v.roll = THREE.MathUtils.damp(v.roll, targetRoll, 8, dt);

        speedRatio = Math.min(1, Math.abs(v.speed) / v.spec.maxSpeed);
      } else {
        v.speed = THREE.MathUtils.damp(v.speed, 0, 4, dt);
        v.pitch = THREE.MathUtils.damp(v.pitch, 0, 6, dt);
        v.roll = THREE.MathUtils.damp(v.roll, 0, 6, dt);
      }

      // Sync headlight & red brake/tail light emissive feedback
      const hlIntensity = v.destroyed ? 0 : isControlled && v.headlightsOn ? 2.4 : 0.35;
      for (const hl of v.model.headlightMeshes) {
        (hl.material as THREE.MeshStandardMaterial).emissiveIntensity = hlIntensity;
      }
      const braking = isControlled && (input.brake || input.backward);
      const blIntensity = v.destroyed ? 0 : braking ? 2.6 : isControlled ? 0.65 : 0.15;
      for (const bl of v.model.brakeLightMeshes) {
        (bl.material as THREE.MeshStandardMaterial).emissiveIntensity = blIntensity;
      }

      const fwdX = -Math.sin(v.yaw);
      const fwdZ = -Math.cos(v.yaw);

      if (Math.abs(v.speed) > 0.02) {
        const prevX = v.position.x;
        const prevZ = v.position.z;
        v.position.x += fwdX * v.speed * dt;
        v.position.z += fwdZ * v.speed * dt;

        if (this.world.resolveHorizontalCollision(v.position, v.spec.width * 0.65, v.spec.height)) {
          if (Math.abs(v.speed) > 10) {
            v.health = Math.max(0, v.health - Math.abs(v.speed) * 1.4);
          }
          v.speed *= -0.3;
          v.position.x = THREE.MathUtils.lerp(v.position.x, prevX, 0.3);
          v.position.z = THREE.MathUtils.lerp(v.position.z, prevZ, 0.3);
        }

        const wheelSpin = v.speed * dt * 2.1;
        for (const w of v.model.wheels) {
          w.rotation.x -= wheelSpin;
        }
        if (Math.abs(v.speed) > 8 && isControlled) {
          roadkillPos = v.position;
        }

        // Kick up volumetric tire dust plumes behind rear wheels when moving fast
        if (Math.abs(v.speed) > 4.2) {
          v.dustTimer -= dt;
          if (v.dustTimer <= 0) {
            v.dustTimer = THREE.MathUtils.clamp(0.18 - Math.abs(v.speed) * 0.004, 0.06, 0.16);
            const rightX = Math.cos(v.yaw);
            const rightZ = -Math.sin(v.yaw);
            for (const side of [-1, 1]) {
              const rearPos = new THREE.Vector3(
                v.position.x - fwdX * (v.spec.length * 0.44) + rightX * side * (v.spec.width * 0.46),
                v.position.y + 0.35,
                v.position.z - fwdZ * (v.spec.length * 0.44) + rightZ * side * (v.spec.width * 0.46)
              );
              this.spawnPuff(
                rearPos,
                new THREE.Vector3(-fwdX * 1.4 + (Math.random() - 0.5) * 0.8, 0.75 + Math.random() * 0.5, -fwdZ * 1.4 + (Math.random() - 0.5) * 0.8),
                1.1,
                1.15,
                0xa19074,
                0.34,
                2.2
              );
            }
          }
        }
      }

      // Damaged / wrecked engine smoke plumes
      if (v.destroyed || v.health < v.spec.maxHealth * 0.45) {
        v.smokeTimer -= dt;
        if (v.smokeTimer <= 0) {
          v.smokeTimer = v.destroyed ? 0.28 : 0.45;
          const hoodPos = new THREE.Vector3(
            v.position.x + fwdX * (v.spec.length * 0.36),
            v.position.y + 1.35,
            v.position.z + fwdZ * (v.spec.length * 0.36)
          );
          this.spawnPuff(
            hoodPos,
            new THREE.Vector3((Math.random() - 0.5) * 0.6, 2.1 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6),
            1.1,
            2.2,
            v.destroyed ? 0x1c1d1e : 0x4b4c4e,
            v.destroyed ? 0.62 : 0.44,
            1.8
          );
        }
      }

      // Ground & slope alignment
      const groundY = this.terrain.getSurfaceHeightAt(v.position.x, v.position.z);
      v.position.y = THREE.MathUtils.damp(v.position.y, groundY, 18, dt);
      this.terrain.getNormalAt(v.position.x, v.position.z, _normal);

      _quatAlign.setFromUnitVectors(_up, _normal);
      _quatYaw.setFromAxisAngle(_up, v.yaw);
      v.model.group.position.copy(v.position);
      v.model.group.quaternion.copy(_quatAlign).multiply(_quatYaw);
      v.model.group.rotateX(v.pitch);
      v.model.group.rotateZ(v.roll);

      if (isControlled) {
        const forward = new THREE.Vector3(fwdX, -0.08, fwdZ);
        this.headlightSpot.position.copy(v.position).add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(forward, v.spec.length * 0.45);
        this.headlightSpot.target.position.copy(v.position).addScaledVector(forward, 28);
        this.headlightSpot.target.updateMatrixWorld();

        const targetCamPos = new THREE.Vector3();
        const lookAtPos = new THREE.Vector3();
        if (this.thirdPerson) {
          const backDist = v.spec.length * 1.45 + 3.0;
          targetCamPos.set(
            v.position.x + Math.sin(v.yaw) * backDist,
            v.position.y + v.spec.height + 2.4,
            v.position.z + Math.cos(v.yaw) * backDist
          );
          const camGround = this.terrain.getSurfaceHeightAt(targetCamPos.x, targetCamPos.z) + 1.2;
          if (targetCamPos.y < camGround) targetCamPos.y = camGround;
          lookAtPos.set(
            v.position.x - Math.sin(v.yaw) * 10,
            v.position.y + 1.5,
            v.position.z - Math.cos(v.yaw) * 10
          );
        } else {
          targetCamPos.set(v.position.x, v.position.y + v.spec.height * 0.92, v.position.z);
          lookAtPos.set(
            v.position.x - Math.sin(v.yaw) * 24,
            v.position.y + v.spec.height * 0.85,
            v.position.z - Math.cos(v.yaw) * 24
          );
        }

        const k = 1 - Math.exp(-8 * dt);
        camera.position.lerp(targetCamPos, k);
        camera.lookAt(lookAtPos);
      }
    }

    // Animate vehicle dust & smoke sprite puffs
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - Math.min(0.85, dt * 1.2));
      const s = p.sprite.scale.x + p.growRate * dt;
      p.sprite.scale.set(s, s, 1);
      (p.sprite.material as THREE.SpriteMaterial).opacity = p.baseOpacity * Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        (p.sprite.material as THREE.Material).dispose();
        this.puffs.splice(i, 1);
      }
    }

    return { speedRatio, roadkillPos };
  }

  public dispose() {
    for (const v of this.vehicles) {
      this.scene.remove(v.model.group);
    }
    this.vehicles = [];
    this.puffs.forEach((p) => {
      this.scene.remove(p.sprite);
      (p.sprite.material as THREE.Material).dispose();
    });
    this.puffs = [];
  }
}
