import * as THREE from 'three';
import { ProceduralMaterials } from './TextureLibrary';
import { ColliderBox, WorldManager } from './WorldManager';

export interface TrainingStats {
  hits: number;
  headshots: number;
  shots: number;
  lastDist: number;
  streak: number;
}

interface ReactiveTarget {
  id: string;
  kind: 'silhouette' | 'moving' | 'plate';
  pivot: THREE.Group;
  hitMeshes: THREE.Mesh[];
  worldPos: THREE.Vector3;
  distanceMeters: number;
  knockedDown: boolean;
  tiltAngle: number;
  resetTimer: number;
  // Optional lateral rail oscillation for moving targets
  baseX: number;
  moveAmp: number;
  moveSpeed: number;
  movePhase: number;
}

/**
 * Dedicated 3D Tactical Firing Range ("Estande de Tiro") for Treinamento mode:
 * - Sunlit concrete courtyard enclosed by Hesco bastion blocks, stacked sandbags,
 *   weathered baffle walls, overhead firing-line awning & an interactive "ARMAMENTO" bench.
 * - Zero NPCs: strictly the player practicing aim on static distance silhouettes
 *   (15m, 30m, 50m, 75m, 100m), 2 motorized lateral strafe targets (22m, 45m),
 *   and a 5-plate reactive steel dueling rack (18m).
 */
export class TrainingRange {
  public static readonly CENTER_X = 0;
  public static readonly FLOOR_Y = 2.02;
  public static readonly SPAWN_Z = 642.5;
  public static readonly WEAPON_BENCH_POS = new THREE.Vector3(-4.4, 2.02, 640.5);

  public active = false;
  public hitMeshes: THREE.Mesh[] = [];

  private scene: THREE.Scene;
  private world: WorldManager;
  private mats: ProceduralMaterials;
  private root = new THREE.Group();
  private built = false;

  private targets = new Map<string, ReactiveTarget>();
  private plateRackIds: string[] = [];
  private rangeColliders: ColliderBox[] = [];
  private rangeRaycastMeshes: THREE.Object3D[] = [];
  private createdTextures: THREE.Texture[] = [];

  private stats: TrainingStats = {
    hits: 0,
    headshots: 0,
    shots: 0,
    lastDist: 0,
    streak: 0,
  };

  constructor(scene: THREE.Scene, world: WorldManager, mats: ProceduralMaterials) {
    this.scene = scene;
    this.world = world;
    this.mats = mats;
    this.root.visible = false;
  }

  public activate() {
    if (!this.built) {
      this.buildRangeGeometry();
      this.built = true;
    }
    if (!this.active) {
      this.active = true;
      this.root.visible = true;
      if (!this.root.parent) {
        this.scene.add(this.root);
      }
      for (const col of this.rangeColliders) {
        this.world.allColliders.push(col);
      }
      for (const rm of this.rangeRaycastMeshes) {
        this.world.raycastMeshes.push(rm);
      }
    }
    this.resetTargetsAndStats();
  }

  public deactivate() {
    if (!this.active) return;
    this.active = false;
    this.root.visible = false;
    if (this.root.parent) {
      this.scene.remove(this.root);
    }
    const colSet = new Set(this.rangeColliders);
    this.world.allColliders = this.world.allColliders.filter((c) => !colSet.has(c));
    const raySet = new Set(this.rangeRaycastMeshes);
    this.world.raycastMeshes = this.world.raycastMeshes.filter((m) => !raySet.has(m));
  }

  public resetTargetsAndStats() {
    this.stats = {
      hits: 0,
      headshots: 0,
      shots: 0,
      lastDist: 0,
      streak: 0,
    };
    for (const t of this.targets.values()) {
      t.knockedDown = false;
      t.tiltAngle = 0;
      t.resetTimer = 0;
      t.pivot.rotation.x = 0;
    }
  }

  public recordShotFired() {
    if (!this.active) return;
    this.stats.shots++;
  }

  public getStats(): TrainingStats {
    return { ...this.stats };
  }

  public isNearWeaponBench(playerPos: THREE.Vector3): boolean {
    if (!this.active) return false;
    return Math.hypot(
      playerPos.x - TrainingRange.WEAPON_BENCH_POS.x,
      playerPos.z - TrainingRange.WEAPON_BENCH_POS.z
    ) < 3.6;
  }

  public registerHit(
    targetId: string,
    hitZone: 'head' | 'body',
    playerPos: THREE.Vector3
  ): { headshot: boolean; distanceMeters: number; plateRackCleared: boolean; alreadyDown: boolean } {
    const t = this.targets.get(targetId);
    if (!t) {
      return { headshot: false, distanceMeters: 0, plateRackCleared: false, alreadyDown: true };
    }

    const dist = Math.max(1, Math.round(playerPos.distanceTo(t.worldPos)));
    const isHead = hitZone === 'head';
    const alreadyDown = t.knockedDown;

    this.stats.hits++;
    if (isHead) this.stats.headshots++;
    this.stats.lastDist = dist;
    this.stats.streak++;

    t.knockedDown = true;
    t.resetTimer = t.kind === 'plate' ? 999 : 1.55;

    let plateRackCleared = false;
    if (t.kind === 'plate') {
      const allDown = this.plateRackIds.every((pid) => this.targets.get(pid)?.knockedDown);
      if (allDown) {
        plateRackCleared = true;
        for (const pid of this.plateRackIds) {
          const pt = this.targets.get(pid);
          if (pt) pt.resetTimer = 1.1;
        }
      }
    }

    return { headshot: isHead, distanceMeters: dist, plateRackCleared, alreadyDown };
  }

  public update(dt: number) {
    if (!this.active) return;

    for (const t of this.targets.values()) {
      // Smooth spring knockdown & upright pop-back animation
      const targetAngle = t.knockedDown ? -1.42 : 0;
      t.tiltAngle = THREE.MathUtils.damp(t.tiltAngle, targetAngle, t.knockedDown ? 18 : 10, dt);
      t.pivot.rotation.x = t.tiltAngle;

      if (t.knockedDown && t.resetTimer < 100) {
        t.resetTimer -= dt;
        if (t.resetTimer <= 0) {
          t.knockedDown = false;
        }
      }

      // Motorized lateral rail targets for smooth aim-tracking drills
      if (t.kind === 'moving' && t.moveAmp > 0) {
        t.movePhase += dt * t.moveSpeed;
        const nextX = t.baseX + Math.sin(t.movePhase) * t.moveAmp;
        t.pivot.parent!.position.x = nextX;
        t.worldPos.x = nextX;
      }
    }
  }

  private addStaticCollider(minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number) {
    this.rangeColliders.push({
      minX,
      maxX,
      minY,
      maxY,
      minZ,
      maxZ,
      material: 'concrete',
      sectorKey: 'training_range',
    });
  }

  private makeStencilSignTexture(
    title: string,
    subtitle: string,
    bgColor: string,
    accentColor: string,
    drawRifleIcon = false
  ): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d')!;

    // Weathered crate / concrete surface base
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 512, 256);

    // Subtle concrete/wood horizontal grain bands
    for (let y = 0; y < 256; y += 6) {
      ctx.fillStyle = y % 12 === 0 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, y, 512, 3);
    }

    // Subtle weathered border frame
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, 488, 232);

    if (drawRifleIcon) {
      // Crisp white rifle silhouette stencil (inspired by Standoff 2 armory sign!)
      ctx.fillStyle = 'rgba(245, 248, 244, 0.92)';
      ctx.beginPath();
      ctx.moveTo(118, 94);
      ctx.lineTo(175, 86);
      ctx.lineTo(192, 74);
      ctx.lineTo(295, 74);
      ctx.lineTo(302, 82);
      ctx.lineTo(395, 84);
      ctx.lineTo(395, 92);
      ctx.lineTo(312, 94);
      ctx.lineTo(308, 106);
      ctx.lineTo(272, 106);
      ctx.lineTo(264, 140);
      ctx.lineTo(244, 138);
      ctx.lineTo(250, 106);
      ctx.lineTo(212, 106);
      ctx.lineTo(202, 132);
      ctx.lineTo(186, 128);
      ctx.lineTo(192, 104);
      ctx.lineTo(118, 122);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = accentColor;
    ctx.font = 'bold 54px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, 256, drawRifleIcon ? 196 : 126);

    if (subtitle) {
      ctx.fillStyle = 'rgba(235, 238, 232, 0.85)';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(subtitle, 256, drawRifleIcon ? 230 : 178);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.createdTextures.push(tex);
    return tex;
  }

  private makeSilhouetteTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const ctx = c.getContext('2d')!;

    // Warm tan/cardboard tactical target backing
    ctx.fillStyle = '#c8b796';
    ctx.fillRect(0, 0, 256, 512);

    // Subtle paper grain
    for (let i = 0; i < 650; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect((i * 73) % 256, (i * 137) % 512, 3, 3);
    }

    // Dark tactical human silhouette chest/shoulders
    ctx.fillStyle = '#1e2429';
    ctx.beginPath();
    ctx.moveTo(32, 512);
    ctx.lineTo(38, 185);
    ctx.quadraticCurveTo(42, 132, 86, 122);
    ctx.lineTo(170, 122);
    ctx.quadraticCurveTo(214, 132, 218, 185);
    ctx.lineTo(224, 512);
    ctx.closePath();
    ctx.fill();

    // High-contrast scoring bullseye rings on center chest
    const rings: [number, string][] = [
      [68, '#d4d8d2'],
      [48, '#20262c'],
      [28, '#e89d2c'],
      [12, '#e33b2d'],
    ];
    for (const [r, col] of rings) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(128, 260, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Scoring zone grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 236, 492);
    ctx.beginPath();
    ctx.moveTo(128, 150);
    ctx.lineTo(128, 370);
    ctx.moveTo(45, 260);
    ctx.lineTo(211, 260);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.createdTextures.push(tex);
    return tex;
  }

  private makeGraffitiWallTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d')!;

    ctx.fillStyle = '#b9aa90';
    ctx.fillRect(0, 0, 512, 256);

    // Weathered plaster panels
    ctx.strokeStyle = 'rgba(60, 52, 42, 0.25)';
    ctx.lineWidth = 3;
    for (let x = 0; x < 512; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }

    // Bold tactical urban spray-art motif (inspired by Standoff 2 Training Outside range wall!)
    ctx.save();
    ctx.translate(256, 148);
    ctx.rotate(-0.08);
    ctx.fillStyle = '#181b1f';
    ctx.font = 'italic 900 76px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WILDLANDS', 5, 5);
    ctx.fillStyle = '#e2a326';
    ctx.fillText('WILDLANDS', 0, 0);
    ctx.strokeStyle = '#d93829';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-175, 22);
    ctx.lineTo(178, 12);
    ctx.stroke();
    ctx.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.createdTextures.push(tex);
    return tex;
  }

  private buildRangeGeometry() {
    const y = TrainingRange.FLOOR_Y;
    const spawnZ = TrainingRange.SPAWN_Z;

    // Materials reusing procedural PBR maps from TextureLibrary for visual unity
    const floorMat = this.mats.concrete.clone();
    floorMat.color = new THREE.Color(0xc2beb4);
    floorMat.roughness = 0.88;

    const hescoMat = new THREE.MeshStandardMaterial({
      color: 0xb99d73,
      map: this.mats.sandbag.map,
      normalMap: this.mats.concrete.normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.92,
      metalness: 0.04,
    });
    const hescoWireMat = new THREE.MeshStandardMaterial({
      color: 0x454a4f,
      roughness: 0.55,
      metalness: 0.75,
    });
    const sandbagMat = this.mats.sandbag.clone();
    const steelMat = this.mats.bunkerSteel.clone();
    const woodMat = this.mats.woodCrate.clone();
    const yellowPaintMat = new THREE.MeshStandardMaterial({
      color: 0xe6b42c,
      roughness: 0.72,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const silhouetteTex = this.makeSilhouetteTexture();
    const silhouetteMat = new THREE.MeshStandardMaterial({
      map: silhouetteTex,
      roughness: 0.82,
      metalness: 0.04,
    });
    const headZoneMat = new THREE.MeshStandardMaterial({
      color: 0xd94b2b,
      roughness: 0.65,
      metalness: 0.08,
    });
    const plateSteelMat = new THREE.MeshStandardMaterial({
      color: 0xe8e4d8,
      roughness: 0.35,
      metalness: 0.82,
    });
    const plateRimMat = new THREE.MeshStandardMaterial({
      color: 0xe35424,
      roughness: 0.45,
      metalness: 0.4,
    });

    // === 1. SOLID LEVEL CONCRETE FIRING RANGE DECK (46m wide x 124m long) ===
    const deck = new THREE.Mesh(new THREE.BoxGeometry(46, 0.3, 124), floorMat);
    deck.position.set(0, y - 0.15, spawnZ - 54);
    deck.receiveShadow = true;
    this.root.add(deck);
    this.rangeRaycastMeshes.push(deck);

    // Painted tactical yellow firing line & lane dividers
    const fireLine = new THREE.Mesh(new THREE.PlaneGeometry(34, 0.28), yellowPaintMat);
    fireLine.rotation.x = -Math.PI * 0.5;
    fireLine.position.set(0, y + 0.012, spawnZ - 3.2);
    this.root.add(fireLine);

    for (const laneX of [-11, -5.5, 0, 5.5, 11]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 104), yellowPaintMat);
      strip.rotation.x = -Math.PI * 0.5;
      strip.position.set(laneX, y + 0.01, spawnZ - 55);
      this.root.add(strip);
    }

    // Distance yardage lines painted on concrete + standing distance marker signs (15m, 30m, 50m, 75m, 100m)
    const distances = [15, 30, 50, 75, 100];
    for (const d of distances) {
      const zPos = spawnZ - d;
      const distBar = new THREE.Mesh(new THREE.PlaneGeometry(32, 0.18), yellowPaintMat);
      distBar.rotation.x = -Math.PI * 0.5;
      distBar.position.set(0, y + 0.011, zPos);
      this.root.add(distBar);

      // Left & Right distance marker boards
      const signTex = this.makeStencilSignTexture(`${d}M`, 'DISTÂNCIA', '#1e252b', '#f5c542');
      const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.72 });
      const signL = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.05, 0.12), signMat);
      signL.position.set(-18.5, y + 1.3, zPos);
      const postL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.6, 0.14), steelMat);
      postL.position.set(-18.5, y + 0.8, zPos);
      const signR = signL.clone();
      signR.position.x = 18.5;
      const postR = postL.clone();
      postR.position.x = 18.5;
      this.root.add(signL, postL, signR, postR);
    }

    // === 2. HESCO BASTION PERIMETER & STACKED SANDBAGS (Standoff 2 Training Courtyard aesthetic!) ===
    const buildHescoWallRun = (
      startX: number,
      startZ: number,
      endX: number,
      endZ: number,
      tiers = 2
    ) => {
      const dx = endX - startX;
      const dz = endZ - startZ;
      const totalLen = Math.hypot(dx, dz);
      const blockW = 2.6;
      const count = Math.max(1, Math.round(totalLen / blockW));
      const angle = Math.atan2(dx, dz);

      const blockGeo = new THREE.BoxGeometry(1.75, 1.75, blockW - 0.06);
      const capGeo = new THREE.BoxGeometry(1.82, 0.12, blockW - 0.02);

      for (let t = 0; t < tiers; t++) {
        for (let i = 0; i < count; i++) {
          const frac = (i + 0.5) / count;
          const bx = startX + dx * frac;
          const bz = startZ + dz * frac;
          const by = y + 0.875 + t * 1.75;

          const blk = new THREE.Mesh(blockGeo, hescoMat);
          blk.position.set(bx, by, bz);
          blk.rotation.y = angle;
          blk.castShadow = true;
          blk.receiveShadow = true;
          this.root.add(blk);
          this.rangeRaycastMeshes.push(blk);

          const rim = new THREE.Mesh(capGeo, hescoWireMat);
          rim.position.set(bx, by + 0.86, bz);
          rim.rotation.y = angle;
          this.root.add(rim);
        }
      }

      // Register clean AABB collider for the entire wall segment
      const pad = 1.05;
      this.addStaticCollider(
        Math.min(startX, endX) - pad,
        Math.max(startX, endX) + pad,
        y,
        y + tiers * 1.85,
        Math.min(startZ, endZ) - pad,
        Math.max(startZ, endZ) + pad
      );
    };

    // Far backstop Hesco berm (3 tiers tall at 112m downrange!)
    buildHescoWallRun(-22, spawnZ - 112, 22, spawnZ - 112, 3);
    // Left & right Hesco courtyard walls
    buildHescoWallRun(-22, spawnZ + 8, -22, spawnZ - 112, 2);
    buildHescoWallRun(22, spawnZ + 8, 22, spawnZ - 112, 2);
    // Rear safety berm behind the firing line
    buildHescoWallRun(-22, spawnZ + 8, 22, spawnZ + 8, 2);

    // Iconic right-side weathered concrete wall with tactical spray stencil + stacked sandbags at base!
    const wallTex = this.makeGraffitiWallTexture();
    const graffitiWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 4.4, 14),
      new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.86 })
    );
    graffitiWall.position.set(14.5, y + 2.2, spawnZ - 8);
    graffitiWall.castShadow = true;
    graffitiWall.receiveShadow = true;
    this.root.add(graffitiWall);
    this.rangeRaycastMeshes.push(graffitiWall);
    this.addStaticCollider(13.9, 15.1, y, y + 4.4, spawnZ - 15.2, spawnZ - 0.8);

    // Stacked sandbag rows along firing line flanks & right baffle wall
    const bagGeo = new THREE.CapsuleGeometry(0.2, 0.52, 4, 8);
    bagGeo.rotateZ(Math.PI * 0.5);
    const buildSandbagPile = (cx: number, cz: number, count: number, rotY = 0) => {
      const grp = new THREE.Group();
      for (let row = 0; row < 3; row++) {
        const n = count - row;
        for (let i = 0; i < n; i++) {
          const bag = new THREE.Mesh(bagGeo, sandbagMat);
          bag.position.set((i - (n - 1) * 0.5) * 0.72, 0.18 + row * 0.31, (row % 2) * 0.08);
          bag.scale.set(1, 0.78, 1.12);
          bag.castShadow = true;
          bag.receiveShadow = true;
          grp.add(bag);
        }
      }
      grp.position.set(cx, y, cz);
      grp.rotation.y = rotY;
      this.root.add(grp);
    };
    buildSandbagPile(13.4, spawnZ - 5.5, 6, Math.PI * 0.5);
    buildSandbagPile(-14.5, spawnZ - 11.5, 7, 0);
    buildSandbagPile(0, spawnZ - 109.2, 12, 0);

    // === 3. OVERHEAD FIRING-LINE CANOPY & SHOOTING BAYS ===
    const canopyRoof = new THREE.Mesh(new THREE.BoxGeometry(26, 0.22, 6.2), steelMat);
    canopyRoof.position.set(0, y + 3.85, spawnZ + 0.5);
    canopyRoof.castShadow = true;
    canopyRoof.receiveShadow = true;
    this.root.add(canopyRoof);

    for (const px of [-12, -4, 4, 12]) {
      for (const pz of [spawnZ - 2.3, spawnZ + 3.3]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.85, 0.22), steelMat);
        pillar.position.set(px, y + 1.92, pz);
        pillar.castShadow = true;
        this.root.add(pillar);
      }
    }

    // === 4. INTERACTIVE "ARMAMENTO" WEAPON BENCH (Left of firing line — inspired by Standoff 2!) ===
    const benchPos = TrainingRange.WEAPON_BENCH_POS;
    const armoryTex = this.makeStencilSignTexture('ARMAMENTO', '[E] TROCAR ARMA', '#8f7d60', '#f5e8c2', true);
    const armoryWall = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 2.2, 1.5),
      new THREE.MeshStandardMaterial({ map: armoryTex, roughness: 0.84 })
    );
    armoryWall.position.set(benchPos.x - 1.2, y + 1.1, benchPos.z - 0.6);
    armoryWall.rotation.y = 0.28;
    armoryWall.castShadow = true;
    armoryWall.receiveShadow = true;
    this.root.add(armoryWall);
    this.rangeRaycastMeshes.push(armoryWall);
    this.addStaticCollider(benchPos.x - 3.6, benchPos.x + 1.1, y, y + 2.3, benchPos.z - 1.8, benchPos.z + 0.6);

    // Tactical wooden gun rack table right in front of the armory wall
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 0.95), woodMat);
    tableTop.position.set(benchPos.x + 0.3, y + 0.92, benchPos.z + 0.55);
    tableTop.rotation.y = 0.28;
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    this.root.add(tableTop);

    // Decorative tactical ammo crates + display rifle silhouette on bench
    const crate1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.55), this.mats.militaryCrate);
    crate1.position.set(benchPos.x - 0.65, y + 0.225, benchPos.z + 0.65);
    crate1.rotation.y = 0.24;
    const displayRifle = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.14, 0.08), steelMat);
    displayRifle.position.set(benchPos.x + 0.45, y + 1.04, benchPos.z + 0.52);
    displayRifle.rotation.y = 0.42;
    this.root.add(crate1, displayRifle);

    // === 5. STATIC DISTANCE SILHOUETTE TARGETS (15m, 30m, 50m, 75m, 100m — Head + Body Hitboxes!) ===
    const staticLayout: { id: string; x: number; dist: number }[] = [
      { id: 'sil_15_l', x: -6.5, dist: 15 },
      { id: 'sil_15_c', x: 0.0, dist: 15 },
      { id: 'sil_15_r', x: 6.5, dist: 15 },
      { id: 'sil_30_l', x: -8.2, dist: 30 },
      { id: 'sil_30_c', x: -1.8, dist: 30 },
      { id: 'sil_30_r', x: 5.5, dist: 30 },
      { id: 'sil_50_l', x: -7.0, dist: 50 },
      { id: 'sil_50_c', x: 1.5, dist: 50 },
      { id: 'sil_50_r', x: 9.0, dist: 50 },
      { id: 'sil_75_l', x: -5.0, dist: 75 },
      { id: 'sil_75_r', x: 6.0, dist: 75 },
      { id: 'sil_100_c', x: 0.0, dist: 100 },
    ];

    for (const cfg of staticLayout) {
      this.createSilhouetteTarget(
        cfg.id,
        cfg.x,
        spawnZ - cfg.dist,
        cfg.dist,
        'silhouette',
        0,
        0,
        steelMat,
        silhouetteMat,
        headZoneMat
      );
    }

    // === 6. MOTORIZED LATERAL MOVING TARGETS (22m & 45m Tracking Drills!) ===
    this.createMovingTargetRail(spawnZ - 22, 16, steelMat);
    this.createSilhouetteTarget(
      'mov_22',
      0,
      spawnZ - 22,
      22,
      'moving',
      6.8,
      1.25,
      steelMat,
      silhouetteMat,
      headZoneMat
    );

    this.createMovingTargetRail(spawnZ - 45, 20, steelMat);
    this.createSilhouetteTarget(
      'mov_45',
      0,
      spawnZ - 45,
      45,
      'moving',
      8.5,
      1.05,
      steelMat,
      silhouetteMat,
      headZoneMat
    );

    // === 7. 5-PLATE REACTIVE STEEL DUELING RACK (18m Fast Flick Practice!) ===
    const rackZ = spawnZ - 18;
    const rackX = 9.2;
    const rackBar = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.14, 0.16), steelMat);
    rackBar.position.set(rackX, y + 1.02, rackZ);
    const rackLegL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.05, 0.65), steelMat);
    rackLegL.position.set(rackX - 2.05, y + 0.52, rackZ);
    const rackLegR = rackLegL.clone();
    rackLegR.position.x = rackX + 2.05;
    this.root.add(rackBar, rackLegL, rackLegR);

    for (let i = 0; i < 5; i++) {
      const px = rackX - 1.6 + i * 0.8;
      const plateId = `plate_${i + 1}`;
      this.plateRackIds.push(plateId);

      const carrier = new THREE.Group();
      carrier.position.set(px, y + 1.08, rackZ);
      const pivot = new THREE.Group();
      carrier.add(pivot);

      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.04), steelMat);
      stem.position.y = 0.11;
      const plateDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.045, 18), plateSteelMat);
      plateDisc.rotation.x = Math.PI * 0.5;
      plateDisc.position.y = 0.36;
      plateDisc.castShadow = true;
      plateDisc.userData = { trainingTargetId: plateId, hitZone: 'head' };

      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.022, 8, 18), plateRimMat);
      rim.position.set(0, 0.36, 0.022);
      pivot.add(stem, plateDisc, rim);

      this.root.add(carrier);
      this.hitMeshes.push(plateDisc);

      this.targets.set(plateId, {
        id: plateId,
        kind: 'plate',
        pivot,
        hitMeshes: [plateDisc],
        worldPos: new THREE.Vector3(px, y + 1.44, rackZ),
        distanceMeters: 18,
        knockedDown: false,
        tiltAngle: 0,
        resetTimer: 0,
        baseX: px,
        moveAmp: 0,
        moveSpeed: 0,
        movePhase: 0,
      });
    }
  }

  private createMovingTargetRail(zPos: number, width: number, steelMat: THREE.Material) {
    const y = TrainingRange.FLOOR_Y;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(width, 0.14, 0.26), steelMat);
    beam.position.set(0, y + 0.07, zPos);
    beam.receiveShadow = true;
    const stopL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.45, 0.38), steelMat);
    stopL.position.set(-width * 0.5, y + 0.22, zPos);
    const stopR = stopL.clone();
    stopR.position.x = width * 0.5;
    this.root.add(beam, stopL, stopR);
  }

  private createSilhouetteTarget(
    id: string,
    x: number,
    z: number,
    distanceMeters: number,
    kind: 'silhouette' | 'moving',
    moveAmp: number,
    moveSpeed: number,
    steelMat: THREE.Material,
    silhouetteMat: THREE.Material,
    headZoneMat: THREE.Material
  ) {
    const y = TrainingRange.FLOOR_Y;
    const carrier = new THREE.Group();
    carrier.position.set(x, y, z);

    // Steel spring base plate
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.55), steelMat);
    base.position.y = 0.06;
    carrier.add(base);

    // Spring-hinged upright target board
    const pivot = new THREE.Group();
    pivot.position.y = 0.12;
    carrier.add(pivot);

    const standPost = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.08), steelMat);
    standPost.position.y = 0.28;

    // Torso target panel (hitZone: 'body')
    const torsoBoard = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.12, 0.06), silhouetteMat);
    torsoBoard.position.y = 1.02;
    torsoBoard.castShadow = true;
    torsoBoard.receiveShadow = true;
    torsoBoard.userData = { trainingTargetId: id, hitZone: 'body' };

    // Dedicated Head target plate (hitZone: 'head' — high-contrast red/orange bullseye!)
    const headBoard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.065), headZoneMat);
    headBoard.position.y = 1.74;
    headBoard.castShadow = true;
    headBoard.userData = { trainingTargetId: id, hitZone: 'head' };

    const headCenter = new THREE.Mesh(
      new THREE.CircleGeometry(0.085, 14),
      new THREE.MeshBasicMaterial({ color: 0xf4f4ec })
    );
    headCenter.position.set(0, 1.74, 0.036);

    pivot.add(standPost, torsoBoard, headBoard, headCenter);
    this.root.add(carrier);

    this.hitMeshes.push(torsoBoard, headBoard);

    this.targets.set(id, {
      id,
      kind,
      pivot,
      hitMeshes: [torsoBoard, headBoard],
      worldPos: new THREE.Vector3(x, y + 1.25, z),
      distanceMeters,
      knockedDown: false,
      tiltAngle: 0,
      resetTimer: 0,
      baseX: x,
      moveAmp,
      moveSpeed,
      movePhase: Math.random() * Math.PI * 2,
    });
  }

  public dispose() {
    this.deactivate();
    for (const tex of this.createdTextures) {
      tex.dispose();
    }
    this.createdTextures = [];
  }
}
