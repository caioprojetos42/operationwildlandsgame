import * as THREE from 'three';
import { TerrainManager } from './TerrainManager';
import { WorldManager } from './WorldManager';
import { AudioManager } from './AudioManager';

export interface PlayerInputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  crouchHold: boolean;
  jumpJustPressed: boolean;
}

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

export class PlayerController {
  public position = new THREE.Vector3(0, 0, 24);
  public velocity = new THREE.Vector3();
  public yaw = 0; // 0 = facing -Z (north toward Blacksite hangars & HQ)
  public pitch = 0;

  public health = 100;
  public maxHealth = 100;
  public stamina = 100;
  public maxStamina = 100;

  public grounded = true;
  public coyoteTimer = 0;
  public crouchToggled = false;
  public crouching = false;
  public sprinting = false;
  public currentEyeHeight = 1.72;
  public flashlightOn = false;

  private stepDistAccum = 0;
  private readonly standEye = 1.72;
  private readonly crouchEye = 1.08;

  private terrain: TerrainManager;
  private world: WorldManager;
  private audio: AudioManager;
  public flashlight: THREE.SpotLight;

  constructor(
    camera: THREE.PerspectiveCamera,
    terrain: TerrainManager,
    world: WorldManager,
    audio: AudioManager
  ) {
    this.terrain = terrain;
    this.world = world;
    this.audio = audio;

    this.position.y = this.terrain.getSurfaceHeightAt(this.position.x, this.position.z);

    this.flashlight = new THREE.SpotLight(0xf6f8ff, 0, 52, Math.PI / 5.5, 0.55, 1.35);
    this.flashlight.position.set(0.12, -0.08, 0);
    this.flashlight.target.position.set(0, -0.08, -10);
    camera.add(this.flashlight);
    camera.add(this.flashlight.target);
  }

  public toggleFlashlight() {
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.intensity = this.flashlightOn ? 32 : 0;
  }

  public toggleCrouch() {
    this.crouchToggled = !this.crouchToggled;
  }

  public resetAtSpawn(x = 0, z = 24) {
    const y = this.terrain.getSurfaceHeightAt(x, z);
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.crouchToggled = false;
    this.crouching = false;
    this.grounded = true;
  }

  public applyLookDelta(dx: number, dy: number, sensitivity: number, invertY: boolean, adsScale: number) {
    const mult = 0.0021 * sensitivity * adsScale;
    this.yaw -= dx * mult;
    this.pitch -= dy * mult * (invertY ? -1 : 1);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI * 0.46, Math.PI * 0.46);
  }

  public update(
    dt: number,
    input: PlayerInputState,
    camera: THREE.PerspectiveCamera,
    recoilPitch: number,
    recoilYaw: number,
    shakeOffset: THREE.Vector3,
    overweightFactor: number,
    onLoudFootstep?: (pos: THREE.Vector3, radius: number) => void
  ): { moveSpeedRatio: number } {
    this.crouching = input.crouchHold || this.crouchToggled;

    const moveZ = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const hasMove = moveZ !== 0 || moveX !== 0;

    // Sprint & Stamina
    const wantsSprint = input.sprint && moveZ > 0 && !this.crouching && this.stamina > 4;
    this.sprinting = wantsSprint && this.grounded;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - 22 * dt);
    } else {
      const regen = hasMove ? 11 : 22;
      this.stamina = Math.min(this.maxStamina, this.stamina + regen * dt);
    }

    // Target speed (military operator weight feel)
    const baseSpeed = this.crouching ? 3.2 : this.sprinting ? 8.6 : 5.4;
    const maxSpeed = baseSpeed * overweightFactor;

    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _move.set(0, 0, 0);
    if (hasMove) {
      _move.addScaledVector(_fwd, moveZ).addScaledVector(_right, moveX).normalize();
    }

    const accel = this.grounded ? 14 : 4.5;
    const targetVx = _move.x * maxSpeed;
    const targetVz = _move.z * maxSpeed;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, targetVx, accel, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, targetVz, accel, dt);

    // Coyote time & Jump
    if (this.grounded) {
      this.coyoteTimer = 0.12;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    if (input.jumpJustPressed && this.coyoteTimer > 0 && this.stamina >= 10) {
      this.velocity.y = 7.4;
      this.grounded = false;
      this.coyoteTimer = 0;
      this.stamina = Math.max(0, this.stamina - 10);
      this.crouchToggled = false;
    }

    // Gravity
    this.velocity.y -= 21.5 * dt;

    // Integrate position
    const prevX = this.position.x;
    const prevZ = this.position.z;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    // Resolve horizontal AABB collisions
    this.world.resolveHorizontalCollision(this.position, 0.48, this.crouching ? 1.2 : 1.82);

    // Ground detection & slope following
    const groundY = this.terrain.getHeightAt(this.position.x, this.position.z, this.position.y);
    if (this.position.y <= groundY + 0.04 && this.velocity.y <= 0) {
      if (!this.grounded && this.velocity.y < -9) {
        // Hard landing thud
        const surface = this.terrain.getSurfaceType(this.position.x, this.position.z, this.position.y);
        this.audio.playFootstep(surface, true, false);
      }
      this.position.y = groundY;
      this.velocity.y = 0;
      this.grounded = true;
    } else if (this.position.y > groundY + 0.18) {
      this.grounded = false;
    }

    // Footstep cadence & stealth sound emission
    const horizStep = Math.hypot(this.position.x - prevX, this.position.z - prevZ);
    if (this.grounded && horizStep > 0.001) {
      this.stepDistAccum += horizStep;
      const stride = this.sprinting ? 2.4 : this.crouching ? 1.65 : 2.0;
      if (this.stepDistAccum >= stride) {
        this.stepDistAccum = 0;
        const surface = this.terrain.getSurfaceType(this.position.x, this.position.z, this.position.y);
        this.audio.playFootstep(surface, this.sprinting, this.crouching);
        if (this.sprinting) {
          onLoudFootstep?.(this.position, 22);
        } else if (!this.crouching) {
          onLoudFootstep?.(this.position, 10);
        }
      }
    }

    // Smooth crouch eye height interpolation
    const targetEye = this.crouching ? this.crouchEye : this.standEye;
    this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, targetEye, 13, dt);

    // Apply camera transform with recoil & shake
    camera.position.set(
      this.position.x + shakeOffset.x,
      this.position.y + this.currentEyeHeight + shakeOffset.y,
      this.position.z + shakeOffset.z
    );
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw + recoilYaw;
    camera.rotation.x = THREE.MathUtils.clamp(this.pitch + recoilPitch, -Math.PI * 0.48, Math.PI * 0.48);
    camera.rotation.z = 0;

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    return { moveSpeedRatio: THREE.MathUtils.clamp(horizSpeed / 8.6, 0, 1) };
  }
}
