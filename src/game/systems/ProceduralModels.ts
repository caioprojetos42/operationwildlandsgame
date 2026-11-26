import * as THREE from 'three';
import { EnemyClass, VehicleType, WeaponId } from '../types';
import { WEAPONS } from '../data/weapons';
import { VEHICLE_SPECS } from '../data/worldConfig';
import { ProceduralMaterials } from './TextureLibrary';
import { buildRealisticWeaponModel, BuiltWeaponModel } from './FirstPersonWeapons';
import { buildRealisticSoldierModel, BuiltEnemyModel } from './CharacterModels';

export type { BuiltWeaponModel, BuiltEnemyModel };

export function buildWeaponModel(weaponId: WeaponId, mats?: ProceduralMaterials): BuiltWeaponModel {
  return buildRealisticWeaponModel(weaponId, mats);
}

// Legacy fallback kept unused; superseded by FirstPersonWeapons.ts
function _legacyBuildWeaponModel(weaponId: WeaponId, mats?: ProceduralMaterials): any {
  const spec = WEAPONS[weaponId];
  const group = new THREE.Group();

  const gunNormal = mats?.gunNormalMap ?? null;
  const polyNormal = mats?.polymerNormalMap ?? null;

  const matPrimary = new THREE.MeshStandardMaterial({
    color: spec.colorPrimary,
    roughness: 0.34,
    metalness: 0.84,
    normalMap: gunNormal,
    normalScale: new THREE.Vector2(0.55, 0.55),
  });
  const matSecondary = new THREE.MeshStandardMaterial({
    color: spec.colorSecondary,
    roughness: 0.72,
    metalness: 0.16,
    normalMap: polyNormal,
    normalScale: new THREE.Vector2(0.75, 0.75),
  });
  const matBarrel = new THREE.MeshStandardMaterial({
    color: 0x191c1f,
    roughness: 0.24,
    metalness: 0.92,
    normalMap: gunNormal,
    normalScale: new THREE.Vector2(0.4, 0.4),
  });
  const matSteelBright = new THREE.MeshStandardMaterial({
    color: 0x6f767e,
    roughness: 0.22,
    metalness: 0.94,
    normalMap: gunNormal,
    normalScale: new THREE.Vector2(0.3, 0.3),
  });
  const matGrip = new THREE.MeshStandardMaterial({
    color: 0x17181a,
    roughness: 0.88,
    metalness: 0.08,
    normalMap: polyNormal,
    normalScale: new THREE.Vector2(1.0, 1.0),
  });
  const matLens = new THREE.MeshStandardMaterial({
    color: 0x20546a,
    emissive: 0x0d2c38,
    roughness: 0.06,
    metalness: 0.92,
  });
  const matLaserBody = new THREE.MeshStandardMaterial({
    color: 0x4b4436,
    roughness: 0.65,
    metalness: 0.28,
    normalMap: polyNormal,
    normalScale: new THREE.Vector2(0.5, 0.5),
  });

  const isPistol = spec.category === 'pistol';
  const receiverLen = isPistol ? 0.19 : spec.category === 'smg' ? 0.28 : 0.37;
  const receiverH = isPistol ? 0.042 : 0.066;
  const receiverW = isPistol ? 0.031 : 0.047;

  // 1. Machined Upper & Lower Receiver assembly
  const upperRec = new THREE.Mesh(
    new THREE.BoxGeometry(receiverW, receiverH * 0.58, receiverLen),
    matPrimary
  );
  upperRec.position.set(0, receiverH * 0.22, 0);
  group.add(upperRec);

  const lowerRec = new THREE.Mesh(
    new THREE.BoxGeometry(receiverW * 0.92, receiverH * 0.48, receiverLen * 0.86),
    isPistol ? matGrip : matPrimary
  );
  lowerRec.position.set(0, -receiverH * 0.22, 0.015);
  group.add(lowerRec);

  // Magwell flare on rifles & SMGs
  if (!isPistol && spec.magStyle !== 'tube') {
    const magwell = new THREE.Mesh(
      new THREE.BoxGeometry(receiverW * 0.96, 0.032, 0.072),
      matPrimary
    );
    magwell.position.set(0, -receiverH * 0.52, -0.035);
    group.add(magwell);
  }

  // Steel receiver pins, screws & fire selector lever
  const pinGeo = new THREE.CylinderGeometry(0.0038, 0.0038, receiverW * 1.08, 8);
  pinGeo.rotateZ(Math.PI / 2);
  for (const pz of [-0.075, 0.015, 0.078]) {
    if (isPistol && Math.abs(pz) > 0.06) continue;
    const pin = new THREE.Mesh(pinGeo, matSteelBright);
    pin.position.set(0, -receiverH * 0.18, pz);
    group.add(pin);
  }
  const selector = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.024), matBarrel);
  selector.position.set(-receiverW * 0.5 - 0.002, -0.008, 0.07);
  selector.rotation.x = 0.45;
  group.add(selector);

  // Brass deflector bump behind ejection port
  const deflector = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.016, 0.016), matPrimary);
  deflector.position.set(receiverW * 0.5 + 0.003, 0.012, 0.035);
  group.add(deflector);

  // 2. Top Picatinny Rail with individual machined cross-notches
  const railLen = receiverLen * 0.94;
  const topRail = new THREE.Mesh(
    new THREE.BoxGeometry(receiverW * 0.62, 0.008, railLen),
    matBarrel
  );
  topRail.position.set(0, receiverH * 0.5 + 0.004, -0.01);
  group.add(topRail);

  const toothCount = isPistol ? 6 : 12;
  const toothGeo = new THREE.BoxGeometry(receiverW * 0.68, 0.005, 0.009);
  for (let i = 0; i < toothCount; i++) {
    const tz = -railLen * 0.46 + (i / (toothCount - 1)) * railLen * 0.92 - 0.01;
    const tooth = new THREE.Mesh(toothGeo, matBarrel);
    tooth.position.set(0, receiverH * 0.5 + 0.009, tz);
    group.add(tooth);
  }

  // 3. Ventilated Tactical Handguard, Gas Tube, Side Rails & PEQ-15 Laser Module
  const barrelStartZ = -receiverLen * 0.42;
  const barrelEndZ = barrelStartZ - spec.barrelLength;

  if (!isPistol) {
    const hgLen = spec.barrelLength * 0.62;
    const hgCenterZ = -(receiverLen * 0.5 + hgLen * 0.46);
    const handguard = new THREE.Mesh(
      new THREE.BoxGeometry(receiverW * 0.86, receiverH * 0.74, hgLen),
      matSecondary
    );
    handguard.position.set(0, 0.005, hgCenterZ);
    group.add(handguard);

    // M-LOK / cooling vent ribs along handguard
    const ventSlots = Math.max(3, Math.floor(hgLen / 0.045));
    const ventGeo = new THREE.BoxGeometry(receiverW * 0.92, 0.01, 0.018);
    for (let v = 0; v < ventSlots; v++) {
      const vz = hgCenterZ + hgLen * 0.36 - (v / Math.max(1, ventSlots - 1)) * hgLen * 0.72;
      const vent = new THREE.Mesh(ventGeo, matBarrel);
      vent.position.set(0, 0.012, vz);
      group.add(vent);
    }

    // Side rails + front angled grip on rifles/SMGs
    const sideRail = new THREE.Mesh(
      new THREE.BoxGeometry(receiverW * 1.06, 0.012, hgLen * 0.82),
      matBarrel
    );
    sideRail.position.set(0, 0.003, hgCenterZ);
    group.add(sideRail);

    // Top handguard rail continuation
    const hgTopRail = new THREE.Mesh(
      new THREE.BoxGeometry(receiverW * 0.56, 0.009, hgLen * 0.92),
      matBarrel
    );
    hgTopRail.position.set(0, receiverH * 0.42 + 0.005, hgCenterZ);
    group.add(hgTopRail);

    // PEQ-15 Tactical Laser Aiming Module on side rail (AR/Battle Rifle/SMG)
    if (spec.category === 'assault' || spec.category === 'smg' || spec.category === 'battle_rifle') {
      const peq = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.02, 0.072), matLaserBody);
      peq.position.set(receiverW * 0.58, 0.012, hgCenterZ - hgLen * 0.16);
      const peqLens = new THREE.Mesh(
        new THREE.CircleGeometry(0.0045, 8),
        new THREE.MeshBasicMaterial({ color: 0xcc2222 })
      );
      peqLens.position.set(receiverW * 0.58, 0.012, hgCenterZ - hgLen * 0.16 - 0.037);
      peqLens.rotation.y = Math.PI;
      group.add(peq, peqLens);
    }

    // Compact vertical foregrip on assault rifles & SMGs
    if (spec.category === 'assault' || spec.category === 'smg') {
      const fg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.075, 10), matGrip);
      fg.position.set(0, -0.048, hgCenterZ - 0.02);
      group.add(fg);
    }

    // Gas block & front sling swivel near barrel front
    const gasBlock = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.036, 0.026), matBarrel);
    gasBlock.position.set(0, 0.018, hgCenterZ - hgLen * 0.52);
    group.add(gasBlock);
  }

  // 4. Heavy Cold-Hammer-Forged Barrel
  const barrelRadius = spec.category === 'shotgun' ? 0.0155 : spec.category === 'sniper' ? 0.0125 : 0.0105;
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(barrelRadius, barrelRadius * 1.12, spec.barrelLength, 12),
    matBarrel
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.014, barrelStartZ - spec.barrelLength * 0.5);
  group.add(barrel);

  // Shotgun under-barrel tube magazine + ribbed tactical pump forend
  if (spec.magStyle === 'tube') {
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.013, spec.barrelLength * 0.88, 10),
      matPrimary
    );
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, -0.016, barrelStartZ - spec.barrelLength * 0.44);
    group.add(tube);

    const pump = new THREE.Mesh(
      new THREE.CylinderGeometry(0.023, 0.023, 0.17, 12),
      matGrip
    );
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, -0.016, barrelStartZ - spec.barrelLength * 0.35);
    group.add(pump);
  }

  // 5. Slotted Compensator / Muzzle Brake + Fluted Tactical Suppressor
  const muzzleBrake = new THREE.Mesh(
    new THREE.CylinderGeometry(barrelRadius * 1.42, barrelRadius * 1.32, 0.052, 10),
    matBarrel
  );
  muzzleBrake.rotation.x = Math.PI / 2;
  muzzleBrake.position.set(0, 0.014, barrelEndZ - 0.02);
  group.add(muzzleBrake);

  const suppressorGroup = new THREE.Group();
  const suppTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.2, 14),
    matGrip
  );
  suppTube.rotation.x = Math.PI / 2;
  suppressorGroup.add(suppTube);
  // Heat dissipation collar rings on suppressor
  for (const rz of [-0.07, 0.0, 0.075]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.012, 14), matBarrel);
    ring.rotation.x = Math.PI / 2;
    ring.position.z = rz;
    suppressorGroup.add(ring);
  }
  suppressorGroup.position.set(0, 0.014, barrelEndZ - 0.105);
  suppressorGroup.visible = Boolean(spec.suppressedByDefault);
  group.add(suppressorGroup);

  // 6. Reciprocating Bolt Carrier + Charging Handle + Ejection Port anchor
  const boltGroup = new THREE.Group();
  const boltCarrier = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.019, 0.072), matSteelBright);
  boltGroup.add(boltCarrier);
  const chargeHandle = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.008, 0.014), matBarrel);
  chargeHandle.position.set(0.012, 0.002, -0.01);
  boltGroup.add(chargeHandle);
  const boltRestPos = new THREE.Vector3(receiverW * 0.48, 0.012, -0.018);
  boltGroup.position.copy(boltRestPos);
  group.add(boltGroup);

  const ejectionPort = new THREE.Object3D();
  ejectionPort.position.set(receiverW * 0.56, 0.014, -0.012);
  group.add(ejectionPort);

  // 7. Ergonomic Stippled Pistol Grip, Curved Trigger & Guard
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.031, 0.115, 0.044), matGrip);
  grip.position.set(0, -0.074, isPistol ? 0.055 : 0.1);
  grip.rotation.x = 0.26;
  group.add(grip);

  const gripCap = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.012, 0.048), matBarrel);
  gripCap.position.set(0, -0.128, isPistol ? 0.068 : 0.114);
  gripCap.rotation.x = 0.26;
  group.add(gripCap);

  const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.024, 0.056), matPrimary);
  triggerGuard.position.set(0, -0.042, isPistol ? 0.008 : 0.048);
  group.add(triggerGuard);

  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.022, 0.007), matSteelBright);
  trigger.position.set(0, -0.038, isPistol ? 0.016 : 0.056);
  trigger.rotation.x = 0.35;
  group.add(trigger);

  // 8. Detailed Ribbed Magazine with Floorplate
  const magGroup = new THREE.Group();
  const magDims: [number, number, number] =
    spec.magStyle === 'curved'
      ? [0.027, 0.165, 0.056]
      : spec.magStyle === 'box'
      ? [0.034, 0.13, 0.072]
      : spec.magStyle === 'pistol'
      ? [0.023, 0.098, 0.034]
      : [0.024, 0.155, 0.038];

  const magBody = new THREE.Mesh(new THREE.BoxGeometry(magDims[0], magDims[1], magDims[2]), matSecondary);
  magGroup.add(magBody);

  // Baseplate & reinforcing ribs
  const magPlate = new THREE.Mesh(
    new THREE.BoxGeometry(magDims[0] * 1.12, 0.014, magDims[2] * 1.1),
    matGrip
  );
  magPlate.position.y = -magDims[1] * 0.5 - 0.004;
  magGroup.add(magPlate);

  if (spec.magStyle !== 'pistol') {
    for (const ry of [-0.03, 0.015]) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(magDims[0] * 1.06, 0.008, magDims[2] * 0.85),
        matGrip
      );
      rib.position.y = ry;
      magGroup.add(rib);
    }
  }

  const magRestPos = new THREE.Vector3();
  if (spec.magStyle === 'tube') {
    magGroup.scale.set(0.001, 0.001, 0.001);
  } else if (spec.magStyle === 'pistol') {
    magRestPos.set(0, -0.08, 0.055);
    magGroup.rotation.x = 0.26;
  } else {
    magRestPos.set(0, -0.1, -0.035);
    magGroup.rotation.x = spec.magStyle === 'curved' ? -0.2 : -0.06;
  }
  magGroup.position.copy(magRestPos);
  group.add(magGroup);

  // 9. Collapsible Tactical / Precision Sniper Stock with Cheek Riser & Buffer Tube
  if (spec.stockStyle !== 'none') {
    const stockLen = spec.stockStyle === 'sniper' ? 0.29 : 0.24;
    const bufferTube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, stockLen * 0.9, 10), matBarrel);
    bufferTube.rotation.x = Math.PI / 2;
    bufferTube.position.set(0, 0.008, receiverLen * 0.5 + stockLen * 0.42);
    group.add(bufferTube);

    const stockBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.034, spec.stockStyle === 'sniper' ? 0.084 : 0.064, stockLen * 0.72),
      spec.stockStyle === 'wood' ? matSecondary : matGrip
    );
    stockBody.position.set(0, -0.014, receiverLen * 0.5 + stockLen * 0.54);
    group.add(stockBody);

    if (spec.stockStyle === 'sniper') {
      const cheekRest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.022, 0.13), matSecondary);
      cheekRest.position.set(0, 0.036, receiverLen * 0.5 + stockLen * 0.5);
      group.add(cheekRest);
    }

    const buttpad = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.098, 0.024), matGrip);
    buttpad.position.set(0, -0.018, receiverLen * 0.5 + stockLen * 0.92);
    group.add(buttpad);
  }

  // 10. Precision Optics / Holographic Sights / Sniper Scopes with Adjustment Turrets
  if (spec.opticStyle === 'holo') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.014, 0.082), matBarrel);
    base.position.set(0, receiverH * 0.5 + 0.014, 0.01);
    // Open U-shaped protective EOTech hood so you see through the holographic window
    const hoodL = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.036, 0.058), matGrip);
    hoodL.position.set(-0.02, receiverH * 0.5 + 0.036, 0.015);
    const hoodR = hoodL.clone();
    hoodR.position.x = 0.02;
    const hoodTop = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.006, 0.058), matGrip);
    hoodTop.position.set(0, receiverH * 0.5 + 0.053, 0.015);
    const frontBat = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.024, 0.034), matPrimary);
    frontBat.position.set(0, receiverH * 0.5 + 0.025, -0.024);

    const glassMat = new THREE.MeshBasicMaterial({ color: 0x35a5c4, transparent: true, opacity: 0.16 });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.03), glassMat);
    glass.position.set(0, receiverH * 0.5 + 0.035, 0.015);
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.0022, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3b2f })
    );
    dot.position.set(0, receiverH * 0.5 + 0.035, 0.017);
    group.add(base, hoodL, hoodR, hoodTop, frontBat, glass, dot);
  } else if (spec.opticStyle === 'acog' || spec.opticStyle === 'sniper') {
    const isSniper = spec.opticStyle === 'sniper';
    const scopeLen = isSniper ? 0.31 : 0.15;
    const scopeR = isSniper ? 0.021 : 0.018;

    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(scopeR * 1.18, scopeR * 0.96, scopeLen, 14),
      matBarrel
    );
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, receiverH * 0.5 + 0.04, -0.025);
    group.add(tube);

    // Objective bell & ocular ring
    const frontBell = new THREE.Mesh(
      new THREE.CylinderGeometry(scopeR * 1.38, scopeR * 1.16, 0.055, 14),
      matBarrel
    );
    frontBell.rotation.x = Math.PI / 2;
    frontBell.position.set(0, receiverH * 0.5 + 0.04, -0.025 - scopeLen * 0.5);
    group.add(frontBell);

    // Dual scope mount rings + elevation/windage adjustment turrets
    for (const mz of [-0.065, 0.018]) {
      const ring = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.034, 0.018), matGrip);
      ring.position.set(0, receiverH * 0.5 + 0.024, mz);
      group.add(ring);
    }
    const elevTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.018, 10), matSteelBright);
    elevTurret.position.set(0, receiverH * 0.5 + 0.04 + scopeR + 0.007, -0.025);
    const windTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.018, 10), matSteelBright);
    windTurret.rotation.z = Math.PI / 2;
    windTurret.position.set(scopeR + 0.007, receiverH * 0.5 + 0.04, -0.025);
    group.add(elevTurret, windTurret);

    const rearLens = new THREE.Mesh(new THREE.CircleGeometry(scopeR * 0.84, 14), matLens);
    rearLens.position.set(0, receiverH * 0.5 + 0.04, -0.025 + scopeLen * 0.505);
    group.add(rearLens);
  } else {
    // Flip-up tactical iron sights with glowing tritium dots
    const frontBase = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.024, 0.016), matBarrel);
    frontBase.position.set(0, receiverH * 0.5 + 0.014, barrelEndZ + 0.035);
    const frontDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.0024, 8),
      new THREE.MeshBasicMaterial({ color: 0x52ff7a })
    );
    frontDot.position.set(0, receiverH * 0.5 + 0.021, barrelEndZ + 0.044);
    const rearL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.018, 0.014), matBarrel);
    rearL.position.set(-0.01, receiverH * 0.5 + 0.014, receiverLen * 0.36);
    const rearR = rearL.clone();
    rearR.position.x = 0.01;
    group.add(frontBase, frontDot, rearL, rearR);
  }

  // 11. Muzzle point & Crossed Multi-Plane Starburst Muzzle Flash
  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0.014, barrelEndZ - 0.065);
  group.add(muzzlePoint);

  const flashGroup = new THREE.Group();
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd175,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const coneMain = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 6), flashMat);
  coneMain.rotation.x = -Math.PI / 2;
  coneMain.position.z = -0.09;
  const starV = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), flashMat);
  starV.position.z = -0.02;
  const starH = starV.clone();
  starH.rotation.z = Math.PI / 2;
  const starD = starV.clone();
  starD.rotation.z = Math.PI / 4;
  flashGroup.add(coneMain, starV, starH, starD);
  flashGroup.position.copy(muzzlePoint.position);
  flashGroup.visible = false;
  group.add(flashGroup);

  return {
    group,
    muzzlePoint,
    ejectionPort,
    suppressorMesh: suppressorGroup,
    boltMesh: boltGroup,
    magMesh: magGroup,
    muzzleFlash: flashGroup,
    magRestPos,
    boltRestPos,
  };
}

export interface BuiltVehicleModel {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  headlightMeshes: THREE.Mesh[];
  brakeLightMeshes: THREE.Mesh[];
  bodyMesh: THREE.Mesh;
}

export function buildVehicleModel(type: VehicleType, mats: ProceduralMaterials): BuiltVehicleModel {
  const spec = VEHICLE_SPECS[type];
  const group = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const headlightMeshes: THREE.Mesh[] = [];
  const brakeLightMeshes: THREE.Mesh[] = [];

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: spec.color,
    map: mats.camoVehicleMap,
    normalMap: mats.camoVehicleNormal,
    normalScale: new THREE.Vector2(1.25, 1.25),
    roughness: type === 'apc' ? 0.52 : 0.44,
    metalness: type === 'apc' ? 0.48 : 0.38,
    clearcoat: 0.24,
    clearcoatRoughness: 0.46,
    envMapIntensity: 1.45,
  });
  const armorDarkMat = new THREE.MeshStandardMaterial({
    color: 0x262a25,
    map: mats.camoVehicleMap,
    normalMap: mats.camoVehicleNormal,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.58,
    metalness: 0.52,
    envMapIntensity: 1.35,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x181b1e,
    map: mats.gunWearMap,
    roughnessMap: mats.gunRoughnessMap,
    normalMap: mats.gunNormalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.55,
    metalness: 0.62,
    envMapIntensity: 1.4,
  });
  const suspMat = new THREE.MeshStandardMaterial({
    color: 0x3b4045,
    normalMap: mats.gunNormalMap,
    roughness: 0.42,
    metalness: 0.82,
    envMapIntensity: 1.5,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c1e,
    map: mats.tireTreadMap,
    normalMap: mats.tireTreadNormal,
    normalScale: new THREE.Vector2(1.6, 1.6),
    roughness: 0.92,
    metalness: 0.04,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x4f544e,
    map: mats.gunWearMap,
    normalMap: mats.gunNormalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.36,
    metalness: 0.82,
    envMapIntensity: 1.55,
  });
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xfff5d4,
    emissive: 0xffe6a3,
    emissiveIntensity: 0.9,
    roughness: 0.12,
  });
  const brakeMat = new THREE.MeshStandardMaterial({
    color: 0x9c1616,
    emissive: 0xff2b1f,
    emissiveIntensity: 1.05,
    roughness: 0.16,
  });
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x252422,
    roughness: 0.9,
    metalness: 0.04,
  });

  const w = spec.width;
  const l = spec.length;
  const wheelR = type === 'cargo_truck' || type === 'apc' ? 0.58 : 0.43;
  const wheelW = type === 'apc' ? 0.4 : 0.29;
  const chassisY = wheelR + 0.22;

  // Ground contact shadow
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.54, l * 1.32), mats.contactShadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  // Lower chassis hull (preserves exact raycast bodyMesh!)
  const hullH = type === 'apc' ? 1.05 : type === 'cargo_truck' ? 0.72 : 0.62;
  const bodyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(type === 'apc' ? w * 0.92 : w, hullH, type === 'apc' ? l * 0.92 : l),
    bodyMat
  );
  bodyMesh.position.y = chassisY + hullH * 0.5;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // Underbody differential transmission spine
  const underAxleSpine = new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, 0.34, l * 0.78), suspMat);
  underAxleSpine.position.set(0, wheelR * 0.95, 0);
  group.add(underAxleSpine);

  if (type === 'apc') {
    // === HERO APC 8x8 STRIKER (Matching the reference armored vehicle!) ===
    // 1. Sloped Armored Upper Glacis & Chamfered Troop Compartment (ExtrudeGeometry side profile)
    const hullProfile = new THREE.Shape();
    hullProfile.moveTo(-l * 0.48, 0.0);
    hullProfile.lineTo(-l * 0.54, 0.46); // Lower nose bow
    hullProfile.lineTo(-l * 0.26, 1.32); // Steep sloped armored glacis
    hullProfile.lineTo(l * 0.45, 1.32);  // Flat armored roof deck
    hullProfile.lineTo(l * 0.5, 0.65);   // Upper angled rear bustle
    hullProfile.lineTo(l * 0.48, 0.0);   // Rear troop ramp base
    hullProfile.closePath();

    const hullGeo = new THREE.ExtrudeGeometry(hullProfile, {
      depth: w * 0.88,
      bevelEnabled: true,
      bevelThickness: 0.14,
      bevelSize: 0.12,
      bevelSegments: 2,
    });
    hullGeo.center();
    hullGeo.rotateY(-Math.PI / 2);
    const armoredShell = new THREE.Mesh(hullGeo, bodyMat);
    armoredShell.position.set(0, chassisY + 0.82, 0);
    armoredShell.castShadow = true;
    armoredShell.receiveShadow = true;
    group.add(armoredShell);

    // 2. Side Reactive Armor Skirts & Sponson Stowage Boxes
    for (const side of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.56, l * 0.84), armorDarkMat);
      skirt.position.set(side * (w * 0.52), chassisY + 0.62, 0.05);
      skirt.castShadow = true;
      const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.26, l * 0.55), trimMat);
      sideRail.position.set(side * (w * 0.55), chassisY + 1.18, 0.45);
      // Bolted side armor panel segments
      for (let pz = -1.7; pz <= 1.8; pz += 1.15) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.96), bodyMat);
        panel.position.set(side * (w * 0.56), chassisY + 0.64, pz);
        group.add(panel);
      }
      group.add(skirt, sideRail);
    }

    // 3. Detailed Rear Hydraulic Troop Ramp, Hinges, Tow Shackles, Stowage Racks & Unit Plate (Foreground Hero View!)
    const rearRamp = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, 1.18, 0.14), armorDarkMat);
    rearRamp.position.set(0, chassisY + 0.66, l * 0.5 - 0.02);
    rearRamp.castShadow = true;
    const rampFrame = new THREE.Mesh(new THREE.BoxGeometry(w * 0.68, 1.24, 0.08), trimMat);
    rampFrame.position.set(0, chassisY + 0.66, l * 0.49);
    const rampDoorInset = new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, 0.92, 0.08), bodyMat);
    rampDoorInset.position.set(0.14, chassisY + 0.66, l * 0.52);
    const rampHandle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.1), suspMat);
    rampHandle.position.set(-0.08, chassisY + 0.72, l * 0.56);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.16, 0.04),
      new THREE.MeshStandardMaterial({ color: 0xb5b2a6, roughness: 0.65 })
    );
    plate.position.set(0, chassisY + 0.22, l * 0.54);

    // Rear heavy tow shackles & corner step bumpers
    for (const side of [-1, 1]) {
      const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.032, 6, 10), trimMat);
      shackle.position.set(side * (w * 0.36), chassisY + 0.18, l * 0.53);
      const rearRack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.24), trimMat);
      rearRack.position.set(side * (w * 0.42), chassisY + 0.72, l * 0.51);
      const jerry = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.18), armorDarkMat);
      jerry.position.set(side * (w * 0.42), chassisY + 0.76, l * 0.53);
      // Recessed armored red tail-light housing with bright dual glowing lenses!
      const tlHousing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.16), trimMat);
      tlHousing.position.set(side * (w * 0.44), chassisY + 1.14, l * 0.49);
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.08), brakeMat);
      bl.position.set(side * (w * 0.44), chassisY + 1.14, l * 0.55);
      brakeLightMeshes.push(bl);
      group.add(shackle, rearRack, jerry, tlHousing, bl);
    }

    // Rear mudflaps behind back tires
    for (const side of [-1, 1]) {
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.44, 0.05), trimMat);
      flap.position.set(side * (w * 0.48), wheelR * 0.75, l * 0.49);
      group.add(flap);
    }
    group.add(rearRamp, rampFrame, rampDoorInset, rampHandle, plate);

    // 4. Roof Deck: Armored Commander Hatch, Stowage Basket, Crew Periscopes & Dual Whip Antennas
    const deckSuper = new THREE.Mesh(new THREE.BoxGeometry(w * 0.64, 0.34, l * 0.52), armorDarkMat);
    deckSuper.position.set(0, chassisY + 1.52, 0.22);
    deckSuper.castShadow = true;
    const rearHatch = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.14, 0.72), bodyMat);
    rearHatch.position.set(0, chassisY + 1.72, 1.1);
    const roofRack = new THREE.Mesh(new THREE.BoxGeometry(w * 0.58, 0.18, 0.85), trimMat);
    roofRack.position.set(0, chassisY + 1.72, 0.15);
    const viewSlit = new THREE.Mesh(new THREE.BoxGeometry(w * 0.54, 0.16, 0.12), mats.glassTinted);
    viewSlit.position.set(0, chassisY + 1.46, -l * 0.22);

    // Twin tall flexible military radio whip antennas (signature Striker silhouette!)
    for (const side of [-1, 1]) {
      const antBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.24, 6), trimMat);
      antBase.position.set(side * (w * 0.42), chassisY + 1.46, l * 0.36);
      const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.022, 2.75, 6), trimMat);
      whip.position.set(side * (w * 0.42), chassisY + 2.85, l * 0.38);
      whip.rotation.x = 0.06;
      whip.rotation.z = side * -0.04;
      group.add(antBase, whip);
    }
    group.add(deckSuper, rearHatch, roofRack, viewSlit);

    // 5. Unmanned 30mm RWS Autocannon Turret + Thermal Optics Pod + 2x4 Smoke Dischargers
    const turret = new THREE.Group();
    turret.position.set(0, chassisY + 1.72, -0.55);
    const tBase = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.92, 0.48, 8), bodyMat);
    tBase.castShadow = true;
    const tCheekL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.95), armorDarkMat);
    tCheekL.position.set(-0.56, 0.05, 0.05);
    const tCheekR = tCheekL.clone();
    tCheekR.position.x = 0.56;
    const tMantlet = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.36, 0.62), trimMat);
    tMantlet.position.set(0, 0.08, -0.58);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.075, 2.55, 10), trimMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.1, -1.65);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.065, 0.24, 8), suspMat);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.1, -2.92);
    const optPod = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.36), trimMat);
    optPod.position.set(0.36, 0.36, -0.2);
    const optLens = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.04), mats.glassTinted);
    optLens.position.set(0.36, 0.36, -0.39);
    // 2x4 angled smoke grenade discharger tubes on turret flanks
    for (const side of [-1, 1]) {
      for (let s = 0; s < 3; s++) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 6), suspMat);
        tube.position.set(side * 0.72, 0.2 + s * 0.03, -0.28 + s * 0.1);
        tube.rotation.x = -0.65;
        tube.rotation.z = side * -0.35;
        turret.add(tube);
      }
    }
    turret.add(tBase, tCheekL, tCheekR, tMantlet, barrel, muzzle, optPod, optLens);
    group.add(turret);

    // Armored front headlight cages
    for (const side of [-1, 1]) {
      const cage = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.18), trimMat);
      cage.position.set(side * (w * 0.36), chassisY + 0.72, -l * 0.51);
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.15, 0.08), lightMat);
      hl.position.set(side * (w * 0.36), chassisY + 0.72, -l * 0.55);
      headlightMeshes.push(hl);
      group.add(cage, hl);
    }
  } else {
    // Helper: beveled side-profile extrusion along vehicle length (-Z forward, +Y up)
    const buildSideProfile = (pts: [number, number][], width: number, bevel = 0.075) => {
      const sh = new THREE.Shape();
      pts.forEach(([z, y], idx) => {
        if (idx === 0) sh.moveTo(z, y);
        else sh.lineTo(z, y);
      });
      sh.closePath();
      const depth = Math.max(0.1, width - bevel * 2);
      const geo = new THREE.ExtrudeGeometry(sh, {
        depth,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel * 0.85,
        bevelSegments: 2,
      });
      geo.translate(0, 0, -depth * 0.5);
      geo.rotateY(-Math.PI / 2); // Shape +X maps to +Z, Shape -X maps to -Z (front!)
      geo.computeVertexNormals();
      return geo;
    };

    // === HEAVY STEEL BUMPERS, BRUSH GUARD, TOW SHACKLES, EXHAUST & WHIP ANTENNA ===
    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, 0.24, 0.3), trimMat);
    frontBumper.position.set(0, chassisY + 0.14, -l * 0.5 - 0.1);
    frontBumper.castShadow = true;
    const bullBarL = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.52, 8), trimMat);
    bullBarL.position.set(-w * 0.28, chassisY + 0.42, -l * 0.5 - 0.16);
    const bullBarR = bullBarL.clone();
    bullBarR.position.x = w * 0.28;
    const bullBarTop = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, w * 0.62, 8), trimMat);
    bullBarTop.rotation.z = Math.PI / 2;
    bullBarTop.position.set(0, chassisY + 0.66, -l * 0.5 - 0.16);
    const bullBarMid = bullBarTop.clone();
    bullBarMid.position.y = chassisY + 0.44;
    for (const side of [-1, 1]) {
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 6, 10), suspMat);
      hook.position.set(side * (w * 0.34), chassisY + 0.14, -l * 0.5 - 0.26);
      group.add(hook);
    }

    const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.22, 0.24), trimMat);
    rearBumper.position.set(0, chassisY + 0.14, l * 0.5 + 0.07);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.55, 8), rimMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(-w * 0.36, chassisY + 0.04, l * 0.5 + 0.12);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.02, 2.35, 6), trimMat);
    antenna.position.set(w * 0.44, chassisY + hullH + 1.12, l * 0.42);
    antenna.rotation.x = 0.09;
    group.add(frontBumper, bullBarL, bullBarR, bullBarTop, bullBarMid, rearBumper, exhaust, antenna);

    // 7-Slot Military Radiator Grille (Signature Humvee / Tactical 4x4 Front End!)
    const grilleBacking = new THREE.Mesh(new THREE.BoxGeometry(w * 0.58, hullH * 0.54, 0.05), trimMat);
    grilleBacking.position.set(0, chassisY + hullH * 0.54, -l * 0.5 - 0.01);
    group.add(grilleBacking);
    for (let g = -3; g <= 3; g++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.055, hullH * 0.44, 0.07), armorDarkMat);
      slat.position.set(g * (w * 0.075), chassisY + hullH * 0.54, -l * 0.5 - 0.03);
      group.add(slat);
    }

    if (type === 'jeep') {
      // === MENU-MATCHING ARMORED MILITARY HUMVEE (M1151 Up-Armored HMMWV) ===
      // Sloped beveled armored hood + angled split-windshield cab + fastback rear
      const humveeBodyGeo = buildSideProfile(
        [
          [-l * 0.49, 0.0],
          [-l * 0.48, 0.18],        // sloped nose lip
          [-l * 0.12, 0.24],        // long broad Humvee hood
          [-l * 0.02, 0.88],        // raked armored windshield pillar
          [l * 0.36, 0.88],         // flat armored roof deck
          [l * 0.49, 0.24],         // slanted fastback rear cargo hatch
          [l * 0.49, 0.0],
        ],
        w * 0.94,
        0.065
      );
      const humveeUpper = new THREE.Mesh(humveeBodyGeo, bodyMat);
      humveeUpper.position.set(0, chassisY + hullH - 0.04, 0);
      humveeUpper.castShadow = true;
      humveeUpper.receiveShadow = true;
      group.add(humveeUpper);

      // Hood louver grille + raised armored air intake snorkel on right pillar
      const hoodVent = new THREE.Mesh(new THREE.BoxGeometry(w * 0.48, 0.05, 0.36), trimMat);
      hoodVent.position.set(0, chassisY + hullH + 0.22, -l * 0.3);
      const snorkel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.92, 8), trimMat);
      snorkel.position.set(w * 0.47, chassisY + hullH + 0.46, -l * 0.12);
      const snorkelCap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.12, 8), trimMat);
      snorkelCap.position.set(w * 0.47, chassisY + hullH + 0.94, -l * 0.12);

      // Split armored ballistic windshield panes + center armored mullion + interior seats
      const wsGlass = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.54, 0.07), mats.glassTinted);
      wsGlass.position.set(0, chassisY + hullH + 0.52, -l * 0.08);
      wsGlass.rotation.x = -0.18;
      const wsCenterBar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.56, 0.09), bodyMat);
      wsCenterBar.position.copy(wsGlass.position);
      wsCenterBar.rotation.copy(wsGlass.rotation);

      // Armored door recessed windows + exterior bolt-on door handles
      const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.38, l * 0.38), mats.glassTinted);
      sideGlass.position.set(0, chassisY + hullH + 0.54, l * 0.16);
      for (const side of [-1, 1]) {
        const bPillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.14), bodyMat);
        bPillar.position.set(side * (w * 0.47), chassisY + hullH + 0.54, l * 0.16);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.14), trimMat);
        handle.position.set(side * (w * 0.51), chassisY + hullH + 0.14, l * 0.04);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.22), seatMat);
        seat.position.set(side * 0.34, chassisY + hullH + 0.35, l * 0.06);
        group.add(bPillar, handle, seat);
      }

      // Roof Gunner Cupola Ring + OGPK Armored Turret Shield + Mounted M2 .50-Cal Heavy Machine Gun!
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.16, 14), armorDarkMat);
      ring.position.set(0, chassisY + hullH + 0.92, l * 0.14);
      const gunShield = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.48, 0.07), bodyMat);
      gunShield.position.set(0, chassisY + hullH + 1.18, l * 0.14 - 0.38);
      gunShield.castShadow = true;
      const gunGlass = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.08), mats.glassTinted);
      gunGlass.position.set(0, chassisY + hullH + 1.28, l * 0.14 - 0.38);
      const mgReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.46), trimMat);
      mgReceiver.position.set(0, chassisY + hullH + 1.24, l * 0.14 - 0.48);
      const mgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.95, 8), trimMat);
      mgBarrel.rotation.x = Math.PI / 2;
      mgBarrel.position.set(0, chassisY + hullH + 1.25, l * 0.14 - 1.05);
      const ammoBox = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.24), armorDarkMat);
      ammoBox.position.set(-0.14, chassisY + hullH + 1.2, l * 0.14 - 0.46);

      // Rear spare wheel carrier + red tactical jerry can
      const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.25, 16), tireMat);
      spare.rotation.x = Math.PI / 2;
      spare.position.set(0.14, chassisY + 0.66, l * 0.5 + 0.15);
      const spareRim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.27, 12), rimMat);
      spareRim.rotation.x = Math.PI / 2;
      spareRim.position.copy(spare.position);
      const jerryCan = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.44, 0.32),
        new THREE.MeshStandardMaterial({ color: 0x99261b, roughness: 0.45, metalness: 0.45 })
      );
      jerryCan.position.set(-w * 0.36, chassisY + 0.62, l * 0.5 + 0.11);
      group.add(
        hoodVent, snorkel, snorkelCap, wsGlass, wsCenterBar, sideGlass,
        ring, gunShield, gunGlass, mgReceiver, mgBarrel, ammoBox, spare, spareRim, jerryCan
      );
    } else if (type === 'pickup') {
      // === SCULPTED 4x4 TACTICAL CREW-CAB PICKUP TRUCK ===
      const pickupCabGeo = buildSideProfile(
        [
          [-l * 0.49, 0.0],
          [-l * 0.47, 0.16],        // sculpted hood front
          [-l * 0.22, 0.22],        // hood cowl
          [-l * 0.11, 0.84],        // sloped windshield
          [l * 0.14, 0.84],         // cab roof
          [l * 0.16, 0.16],         // cab rear wall
          [l * 0.49, 0.16],         // cargo bed top rails
          [l * 0.49, 0.0],
        ],
        w * 0.92,
        0.06
      );
      const cabMesh = new THREE.Mesh(pickupCabGeo, bodyMat);
      cabMesh.position.set(0, chassisY + hullH - 0.04, 0);
      cabMesh.castShadow = true;
      cabMesh.receiveShadow = true;

      const windshield = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 0.54, 0.07), mats.glassTinted);
      windshield.position.set(0, chassisY + hullH + 0.5, -l * 0.17);
      windshield.rotation.x = -0.24;
      const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.42, l * 0.25), mats.glassTinted);
      sideGlass.position.set(0, chassisY + hullH + 0.52, -0.02);

      // Tubular steel rollbar + roof tactical LED lightbar + cargo military crates
      const rollL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8), trimMat);
      rollL.position.set(-w * 0.4, chassisY + hullH + 0.46, l * 0.19);
      const rollR = rollL.clone();
      rollR.position.x = w * 0.4;
      const rollTop = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, w * 0.84, 8), trimMat);
      rollTop.rotation.z = Math.PI / 2;
      rollTop.position.set(0, chassisY + hullH + 0.82, l * 0.19);
      const lightBar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.58, 0.08, 0.1), lightMat);
      lightBar.position.set(0, chassisY + hullH + 0.89, l * 0.18);
      const cargo1 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.52, 0.74), mats.militaryCrate);
      cargo1.position.set(-0.14, chassisY + hullH + 0.26, l * 0.34);
      const cargo2 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.38, 0.48), mats.woodCrate);
      cargo2.position.set(0.48, chassisY + hullH + 0.2, l * 0.36);
      group.add(cabMesh, windshield, sideGlass, rollL, rollR, rollTop, lightBar, cargo1, cargo2);
    } else if (type === 'military_car') {
      // === SCULPTED TACTICAL PATROL SUV ===
      const suvGeo = buildSideProfile(
        [
          [-l * 0.49, 0.0],
          [-l * 0.47, 0.14],
          [-l * 0.18, 0.2],
          [-l * 0.05, 0.72],
          [l * 0.36, 0.72],
          [l * 0.48, 0.22],
          [l * 0.49, 0.0],
        ],
        w * 0.9,
        0.07
      );
      const suvUpper = new THREE.Mesh(suvGeo, bodyMat);
      suvUpper.position.set(0, chassisY + hullH - 0.04, 0);
      suvUpper.castShadow = true;
      suvUpper.receiveShadow = true;

      const windshield = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.48, 0.07), mats.glassTinted);
      windshield.position.set(0, chassisY + hullH + 0.42, -l * 0.12);
      windshield.rotation.x = -0.34;
      const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.36, l * 0.44), mats.glassTinted);
      sideGlass.position.set(0, chassisY + hullH + 0.44, l * 0.16);
      const roofBasket = new THREE.Mesh(new THREE.BoxGeometry(w * 0.74, 0.12, l * 0.38), trimMat);
      roofBasket.position.set(0, chassisY + hullH + 0.76, l * 0.18);
      group.add(suvUpper, windshield, sideGlass, roofBasket);
    } else if (type === 'cargo_truck') {
      // === HEAVY 6x6 TACTICAL TRANSPORT TRUCK (Beveled Cab + Curved Arched Canvas Canopy!) ===
      const truckCabGeo = buildSideProfile(
        [
          [-l * 0.49, 0.0],
          [-l * 0.48, 0.44],
          [-l * 0.32, 0.5],
          [-l * 0.28, 1.28],
          [-l * 0.12, 1.28],
          [-l * 0.12, 0.0],
        ],
        w * 0.92,
        0.07
      );
      const cab = new THREE.Mesh(truckCabGeo, bodyMat);
      cab.position.set(0, chassisY + hullH - 0.04, 0);
      cab.castShadow = true;
      cab.receiveShadow = true;

      const windshield = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 0.56, 0.08), mats.glassTinted);
      windshield.position.set(0, chassisY + hullH + 0.86, -l * 0.3);
      windshield.rotation.x = -0.1;

      const canopyMat = new THREE.MeshPhysicalMaterial({
        color: 0x525742,
        normalMap: mats.sandbag.normalMap,
        normalScale: new THREE.Vector2(0.75, 0.75),
        roughness: 0.88,
        metalness: 0.02,
        sheen: 0.32,
        sheenRoughness: 0.82,
      });

      // Arched canvas cargo cover profile (extruded along Z length — zero blocky cube!)
      const archShape = new THREE.Shape();
      const hw = w * 0.48;
      archShape.moveTo(-hw, 0);
      archShape.lineTo(-hw, 1.25);
      archShape.quadraticCurveTo(-hw, 1.72, 0, 1.78);
      archShape.quadraticCurveTo(hw, 1.72, hw, 1.25);
      archShape.lineTo(hw, 0);
      archShape.closePath();
      const canopyLen = l * 0.61;
      const canopyGeo = new THREE.ExtrudeGeometry(archShape, {
        depth: canopyLen,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.03,
        bevelSegments: 2,
      });
      canopyGeo.translate(0, 0, -canopyLen * 0.5);
      const canopy = new THREE.Mesh(canopyGeo, canopyMat);
      canopy.position.set(0, chassisY + hullH - 0.02, l * 0.18);
      canopy.castShadow = true;
      canopy.receiveShadow = true;

      // Vertical exhaust stack behind cab + underbody cylindrical fuel tanks
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 1.9, 8), rimMat);
      stack.position.set(w * 0.49, chassisY + hullH + 0.85, -l * 0.1);
      group.add(cab, windshield, canopy, stack);

      for (const side of [-1, 1]) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.15, 10), trimMat);
        tank.rotation.x = Math.PI / 2;
        tank.position.set(side * (w * 0.42), chassisY - 0.1, -0.2);
        group.add(tank);
      }
    }

    // Recessed Headlight Bezels, Tail Lamps & Heavy Tubular Side Mirrors
    for (const side of [-1, 1]) {
      const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.03), trimMat);
      mirrorArm.position.set(side * (w * 0.5), chassisY + hullH + 0.42, -l * 0.1);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.14), trimMat);
      mirror.position.set(side * (w * 0.57), chassisY + hullH + 0.42, -l * 0.1);

      const hlBezel = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.1), trimMat);
      hlBezel.position.set(side * (w * 0.36), chassisY + hullH * 0.58, -l * 0.5 - 0.01);
      const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.06, 12), lightMat);
      hl.rotation.x = Math.PI / 2;
      hl.position.set(side * (w * 0.36), chassisY + hullH * 0.58, -l * 0.5 - 0.05);

      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.15, 0.08), brakeMat);
      bl.position.set(side * (w * 0.36), chassisY + hullH * 0.54, l * 0.5 + 0.02);
      headlightMeshes.push(hl);
      brakeLightMeshes.push(bl);
      group.add(mirrorArm, mirror, hlBezel, hl, bl);
    }
  }

  // Deeply-Treaded Off-Road Wheels + Bolted Military Beadlock Rims + Suspension Struts & Wheel-Arch Flares
  const axleZs =
    type === 'apc'
      ? [-l * 0.35, -l * 0.115, l * 0.115, l * 0.35]
      : type === 'cargo_truck'
      ? [-l * 0.34, l * 0.14, l * 0.36]
      : [-l * 0.32, l * 0.32];

  const tireGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 20);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(wheelR * 0.54, wheelR * 0.54, wheelW + 0.025, 14);
  rimGeo.rotateZ(Math.PI / 2);
  const beadlockGeo = new THREE.TorusGeometry(wheelR * 0.52, 0.032, 6, 16);
  beadlockGeo.rotateY(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(wheelR * 0.22, wheelR * 0.22, wheelW + 0.075, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const lugGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.04, 6);
  lugGeo.rotateZ(Math.PI / 2);

  for (const az of axleZs) {
    const axleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, w * 0.96, 8), suspMat);
    axleBar.rotation.z = Math.PI / 2;
    axleBar.position.set(0, wheelR, az);
    group.add(axleBar);

    for (const side of [-1, 1]) {
      const shock = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.58, 6), suspMat);
      shock.position.set(side * (w * 0.38), wheelR + 0.24, az);
      shock.rotation.z = side * 0.35;
      group.add(shock);

      const wheelPivot = new THREE.Group();
      wheelPivot.position.set(side * (w * 0.5 + 0.04), wheelR, az);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      const rim = new THREE.Mesh(rimGeo, rimMat);
      const beadlock = new THREE.Mesh(beadlockGeo, trimMat);
      beadlock.position.x = side * (wheelW * 0.48);
      const hub = new THREE.Mesh(hubGeo, trimMat);
      wheelPivot.add(tire, rim, beadlock, hub);

      // 6 bolted lug nuts around military hub
      for (let b = 0; b < 6; b++) {
        const a = (b / 6) * Math.PI * 2;
        const lug = new THREE.Mesh(lugGeo, suspMat);
        lug.position.set(side * (wheelW * 0.5 + 0.015), Math.sin(a) * wheelR * 0.35, Math.cos(a) * wheelR * 0.35);
        wheelPivot.add(lug);
      }

      group.add(wheelPivot);
      wheels.push(wheelPivot);

      if (type !== 'apc') {
        // Sculpted angled wheel-arch fender flare (top + front/rear angled mud wings)
        const fenderTop = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, wheelR * 1.45), trimMat);
        fenderTop.position.set(side * (w * 0.51), wheelR * 2 + 0.08, az);
        const fenderF = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.08, wheelR * 0.72), trimMat);
        fenderF.position.set(side * (w * 0.51), wheelR * 1.82, az - wheelR * 0.92);
        fenderF.rotation.x = 0.65;
        const fenderR = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.08, wheelR * 0.72), trimMat);
        fenderR.position.set(side * (w * 0.51), wheelR * 1.82, az + wheelR * 0.92);
        fenderR.rotation.x = -0.65;
        group.add(fenderTop, fenderF, fenderR);
      }
    }
  }

  return { group, wheels, headlightMeshes, brakeLightMeshes, bodyMesh };
}

export function buildEnemyModel(enemyClass: EnemyClass, enemyId: string, mats: ProceduralMaterials): BuiltEnemyModel {
  return buildRealisticSoldierModel(enemyClass, enemyId, mats);
}

// Legacy fallback kept unused; superseded by CharacterModels.ts
function _legacyBuildEnemyModel(enemyClass: EnemyClass, enemyId: string, mats: ProceduralMaterials): any {
  const group = new THREE.Group();
  const scale = enemyClass === 'heavy' ? 1.15 : 1.0;

  const uniformColor =
    enemyClass === 'elite'
      ? 0x1f2429
      : enemyClass === 'sniper'
      ? 0x455037
      : enemyClass === 'heavy'
      ? 0x2b2d30
      : enemyClass === 'guard'
      ? 0x37404a
      : 0x4b4e3e;

  const vestColor =
    enemyClass === 'heavy'
      ? 0x1a1c1e
      : enemyClass === 'elite'
      ? 0x282d33
      : 0x363329;

  const uniformMat = new THREE.MeshStandardMaterial({
    color: uniformColor,
    normalMap: mats.sandbag.normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.88,
    metalness: 0.05,
  });
  const vestMat = new THREE.MeshStandardMaterial({
    color: vestColor,
    normalMap: mats.polymerNormalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.65,
    metalness: 0.25,
  });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x1a1917, roughness: 0.85, metalness: 0.08 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xb08a6d, roughness: 0.78, metalness: 0.0 });
  const helmetMat = new THREE.MeshStandardMaterial({
    color: enemyClass === 'heavy' ? 0x181a1c : 0x2c3227,
    normalMap: mats.polymerNormalMap,
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.42,
    metalness: 0.42,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: enemyClass === 'elite' ? 0xc8432b : 0x152229,
    emissive: enemyClass === 'elite' ? 0x551208 : 0x000000,
    roughness: 0.14,
    metalness: 0.88,
  });

  // Ground contact shadow
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), mats.contactShadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  // Legs with tactical knee pads & combat boots
  const legGeo = new THREE.BoxGeometry(0.18, 0.78, 0.2);
  const leftLeg = new THREE.Mesh(legGeo, uniformMat);
  leftLeg.position.set(-0.14, 0.39, 0);
  leftLeg.castShadow = true;
  leftLeg.userData = { enemyId, hitZone: 'limb' };
  const lKnee = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.13, 0.06), bootMat);
  lKnee.position.set(0, 0.05, -0.11);
  const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.18, 0.25), bootMat);
  lBoot.position.set(0, -0.31, -0.02);
  leftLeg.add(lKnee, lBoot);

  const rightLeg = new THREE.Mesh(legGeo, uniformMat);
  rightLeg.position.set(0.14, 0.39, 0);
  rightLeg.castShadow = true;
  rightLeg.userData = { enemyId, hitZone: 'limb' };
  const rKnee = lKnee.clone();
  const rBoot = lBoot.clone();
  rightLeg.add(rKnee, rBoot);
  group.add(leftLeg, rightLeg);

  // Torso + Tactical Plate Carrier + MOLLE Magazine Pouches + Belt + Shoulder Pads
  const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), uniformMat);
  torsoMesh.position.set(0, 1.09, 0);
  torsoMesh.castShadow = true;
  torsoMesh.userData = { enemyId, hitZone: 'torso' };
  group.add(torsoMesh);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.46, 0.32), vestMat);
  vest.position.set(0, 1.13, 0);
  vest.userData = { enemyId, hitZone: 'torso' };
  group.add(vest);

  // 3 front rifle mag pouches + utility belt
  for (const px of [-0.12, 0, 0.12]) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.06), bootMat);
    pouch.position.set(px, 1.04, -0.18);
    group.add(pouch);
  }
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.08, 0.29), bootMat);
  belt.position.set(0, 0.82, 0);
  group.add(belt);

  // Backpack + radio whip antenna
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 0.19), vestMat);
  pack.position.set(0, 1.14, 0.21);
  pack.userData = { enemyId, hitZone: 'torso' };
  const radioAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.48, 5), mats.gunMetal);
  radioAnt.position.set(-0.11, 1.54, 0.22);
  group.add(pack, radioAnt);

  // Head + Ballistic FAST Helmet + Visor + NVG Mount (dedicated headshot hitbox)
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), skinMat);
  headMesh.position.set(0, 1.56, 0);
  headMesh.castShadow = true;
  headMesh.userData = { enemyId, hitZone: 'head' };
  group.add(headMesh);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), helmetMat);
  helmet.position.set(0, 1.59, 0);
  helmet.userData = { enemyId, hitZone: 'head' };
  group.add(helmet);

  const nvgMount = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.06), bootMat);
  nvgMount.position.set(0, 1.69, -0.16);
  group.add(nvgMount);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.075, 0.08), visorMat);
  visor.position.set(0, 1.58, -0.12);
  visor.userData = { enemyId, hitZone: 'head' };
  group.add(visor);

  // Arms + Shoulder armor pads + Multi-part Rifle
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 0.16), uniformMat);
  leftArm.position.set(-0.31, 1.12, -0.06);
  leftArm.rotation.x = 0.55;
  leftArm.userData = { enemyId, hitZone: 'limb' };
  group.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.28, 1.24, -0.04);
  const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.48, 0.16), uniformMat);
  armMesh.position.set(0, -0.14, -0.12);
  armMesh.rotation.x = 1.2;
  armMesh.userData = { enemyId, hitZone: 'limb' };
  rightArm.add(armMesh);

  // Detailed multi-part enemy rifle silhouette (receiver + barrel + magazine + optic)
  const gunLen = enemyClass === 'sniper' ? 1.08 : 0.74;
  const gunRec = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.095, gunLen * 0.52), mats.gunMetal);
  gunRec.position.set(-0.08, -0.1, -0.36);
  const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, gunLen * 0.55, 8), mats.gunMetal);
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.set(-0.08, -0.09, -0.36 - gunLen * 0.45);
  const gunMag = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.15, 0.055), bootMat);
  gunMag.position.set(-0.08, -0.2, -0.38);
  gunMag.rotation.x = -0.18;
  const gunOptic = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, enemyClass === 'sniper' ? 0.24 : 0.1, 8), bootMat);
  gunOptic.rotation.x = Math.PI / 2;
  gunOptic.position.set(-0.08, -0.03, -0.35);
  rightArm.add(gunRec, gunBarrel, gunMag, gunOptic);

  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffc864, transparent: true, opacity: 0.9 })
  );
  flash.position.set(-0.08, -0.08, -0.42 - gunLen * 0.55);
  flash.visible = false;
  rightArm.add(flash);
  group.add(rightArm);

  group.scale.setScalar(scale);

  return {
    group,
    headMesh,
    torsoMesh,
    leftLeg,
    rightLeg,
    rightArm,
    muzzleFlash: flash,
    hitMeshes: [headMesh, helmet, visor, torsoMesh, vest, pack, leftLeg, rightLeg, leftArm, armMesh],
  };
}

export function buildLootCrateModel(
  kind: 'military_crate' | 'weapon_case' | 'medical_box' | 'industrial_locker' | 'civilian_crate' | 'supply_drop',
  mats: ProceduralMaterials
): THREE.Group {
  const g = new THREE.Group();

  if (kind === 'supply_drop') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), mats.militaryCrate);
    base.position.y = 0.55;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: 0xffaa22, emissive: 0xff8800, emissiveIntensity: 1.5 })
    );
    beacon.position.y = 1.25;
    g.add(beacon);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.14, 1.48), mats.bunkerSteel);
    frame.position.y = 0.08;
    g.add(frame);
  } else if (kind === 'medical_box') {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.45, 0.55),
      new THREE.MeshStandardMaterial({ color: 0xd0d6d0, roughness: 0.48, metalness: 0.15 })
    );
    box.position.y = 0.225;
    box.castShadow = true;
    g.add(box);
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xcc2828 });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.02), crossMat);
    c1.position.set(0, 0.46, 0);
    c1.rotation.x = Math.PI / 2;
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.02), crossMat);
    c2.position.set(0, 0.46, 0);
    c2.rotation.x = Math.PI / 2;
    g.add(c1, c2);
  } else if (kind === 'weapon_case') {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.36, 0.58),
      new THREE.MeshStandardMaterial({
        color: 0x262b24,
        normalMap: mats.polymerNormalMap,
        normalScale: new THREE.Vector2(0.7, 0.7),
        roughness: 0.55,
        metalness: 0.35,
      })
    );
    body.position.y = 0.18;
    body.castShadow = true;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.09, 0.61), mats.bunkerSteel);
    lid.position.y = 0.38;
    const latch1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.06), mats.gunMetal);
    latch1.position.set(-0.42, 0.32, 0.3);
    const latch2 = latch1.clone();
    latch2.position.x = 0.42;
    g.add(body, lid, latch1, latch2);
  } else if (kind === 'industrial_locker') {
    const locker = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.85, 0.6), mats.rustedMetal);
    locker.position.y = 0.925;
    locker.castShadow = true;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.72, 0.04), mats.bunkerSteel);
    door.position.set(0, 0.925, 0.3);
    g.add(locker, door);
  } else {
    const mat = kind === 'military_crate' ? mats.militaryCrate : mats.woodCrate;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.68, 0.78), mat);
    crate.position.y = 0.34;
    crate.castShadow = true;
    const strap = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.7, 0.1), mats.bunkerSteel);
    strap.position.y = 0.34;
    g.add(crate, strap);
  }

  return g;
}
