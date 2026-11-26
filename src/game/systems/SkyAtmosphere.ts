import * as THREE from 'three';
import { WeatherType } from '../types';

export interface AtmosphereLightingState {
  sunDir: THREE.Vector3;
  dayFactor: number;
  sunsetFactor: number;
  horizonColor: THREE.Color;
  sunColor: THREE.Color;
  skyZenith: THREE.Color;
  groundBounce: THREE.Color;
  envIntensity: number;
}

export class SkyAtmosphere {
  public skyMesh: THREE.Mesh;
  public sunDirection = new THREE.Vector3(-0.82, 0.16, -0.54).normalize();
  public horizonColor = new THREE.Color(0xd1935a);

  private skyMat: THREE.ShaderMaterial;
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(1750, 40, 24);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uSunDir: { value: this.sunDirection.clone() },
        uZenithColor: { value: new THREE.Color(0x284364) },
        uMidSkyColor: { value: new THREE.Color(0x6e8599) },
        uHorizonColor: { value: new THREE.Color(0xd4965b) },
        uGroundColor: { value: new THREE.Color(0x4a3b2c) },
        uSunColor: { value: new THREE.Color(0xffc778) },
        uCloudShadowColor: { value: new THREE.Color(0x3a4350) },
        uCloudLitColor: { value: new THREE.Color(0xffe1b0) },
        uCloudDensity: { value: 0.54 },
        uCloudBrightness: { value: 1.0 },
        uStarVisibility: { value: 0.0 },
        uGoldenGlow: { value: 0.85 },
        uTime: { value: 0.0 },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform vec3 uZenithColor;
        uniform vec3 uMidSkyColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uGroundColor;
        uniform vec3 uSunColor;
        uniform vec3 uCloudShadowColor;
        uniform vec3 uCloudLitColor;
        uniform float uCloudDensity;
        uniform float uCloudBrightness;
        uniform float uStarVisibility;
        uniform float uGoldenGlow;
        uniform float uTime;

        varying vec3 vWorldDir;

        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.53);
          return fract(p.x * p.y);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
          for (int i = 0; i < 5; i++) {
            v += a * noise(p);
            p = rot * p * 2.03 + vec2(17.3, 9.2);
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          vec3 sunD = normalize(uSunDir);
          float elev = dir.y;

          // 3-stop atmospheric sky gradient (horizon -> mid atmosphere -> deep steel-blue zenith)
          float lowT = smoothstep(0.0, 0.24, max(elev, 0.0));
          float highT = pow(clamp(elev, 0.0, 1.0), 0.65);
          vec3 col = mix(uHorizonColor, uMidSkyColor, lowT);
          col = mix(col, uZenithColor, highT);

          if (elev < 0.0) {
            col = mix(uHorizonColor, uGroundColor, clamp(-elev * 5.5, 0.0, 1.0));
          }

          // Broad golden horizon scattering band strongest toward sun azimuth (matches golden-hour reference!)
          float sunCos = max(dot(dir, sunD), 0.0);
          float horizonBand = exp(-abs(elev) * 6.5);
          float sunAzimuthGlow = pow(sunCos, 2.2) * horizonBand * uGoldenGlow;
          col += uSunColor * sunAzimuthGlow * 0.52;

          // Mie solar corona + crisp blazing solar disc
          float mieHalo = pow(sunCos, 7.0) * 0.36 + pow(sunCos, 48.0) * 0.68;
          float sunDisc = smoothstep(0.9982, 0.9993, sunCos);
          float aboveHoriz = smoothstep(-0.14, 0.06, sunD.y);
          col += uSunColor * (mieHalo * 0.72 + sunDisc * 2.8) * aboveHoriz;

          // Multi-layered volumetric-style cumulus cloud deck with dramatic backlit silver-gold rims
          if (elev > 0.01) {
            vec2 proj = dir.xz / (elev + 0.145);
            vec2 uvMain = proj * 0.58 + vec2(uTime * 0.011, uTime * 0.004);
            vec2 uvDetail = proj * 1.45 - vec2(uTime * 0.007, uTime * 0.003);

            float cBase = fbm(uvMain);
            float cDetail = fbm(uvDetail);
            float cShape = cBase * 0.7 + cDetail * 0.3;

            float thresh = 1.0 - clamp(uCloudDensity, 0.1, 0.92);
            float cAlpha = smoothstep(thresh - 0.16, thresh + 0.22, cShape);
            // Smooth atmospheric fade into distant horizon mountains
            cAlpha *= smoothstep(0.01, 0.18, elev);

            // Sample slightly toward sun for fake self-shadowing depth on cloud bellies!
            vec2 sunStep = sunD.xz * 0.18;
            float cTowardSun = fbm(uvMain + sunStep) * 0.7 + fbm(uvDetail + sunStep * 2.0) * 0.3;
            float selfShadow = clamp(1.0 - (cTowardSun - cShape) * 2.8, 0.15, 1.0);
            float forwardScatter = pow(sunCos, 4.0) * (1.0 - cAlpha * 0.45) * 0.95;

            vec3 cloudCol = mix(uCloudShadowColor, uCloudLitColor, clamp(selfShadow * 0.72 + cDetail * 0.28, 0.0, 1.0));
            cloudCol += uSunColor * forwardScatter * (0.45 + uGoldenGlow * 0.55);
            cloudCol *= uCloudBrightness;

            col = mix(col, cloudCol, cAlpha * 0.92);
          }

          // Crisp starfield only during true dark night
          if (uStarVisibility > 0.02 && elev > 0.06) {
            vec2 starGrid = floor((dir.xz / (elev + 0.35)) * 180.0);
            float s = hash21(starGrid);
            if (s > 0.994) {
              float twinkle = 0.65 + 0.35 * sin(uTime * 2.5 + s * 400.0);
              col += vec3(0.84, 0.9, 1.0) * twinkle * uStarVisibility * smoothstep(0.06, 0.28, elev);
            }
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.skyMesh = new THREE.Mesh(geo, this.skyMat);
    this.skyMesh.frustumCulled = false;
    scene.add(this.skyMesh);
  }

  public update(
    dt: number,
    timeOfDay: number,
    weather: WeatherType,
    playerPos: THREE.Vector3
  ): AtmosphereLightingState {
    this.elapsed += dt;
    this.skyMesh.position.copy(playerPos);

    // Smooth solar orbital arc: 6:00 sunrise, 12:30 noon, 18:45 sunset (long rich golden hour from 16:30–19:15!)
    const dayPhase = ((timeOfDay - 6.0) / 24.0) * Math.PI * 2;
    const rawElev = Math.sin(dayPhase);
    const horiz = Math.cos(dayPhase);
    // Keep sun positioned across the dramatic western/mountain horizon during late afternoon!
    this.sunDirection.set(horiz * 0.86, rawElev, -0.52).normalize();

    // Coherent atmospheric daylight & golden-hour curves (NEVER turns sky black while sun is still up!)
    const dayFactor = THREE.MathUtils.smoothstep(rawElev, -0.22, 0.24);
    const sunsetFactor =
      dayFactor > 0.04
        ? Math.exp(-Math.pow((rawElev - 0.11) / 0.24, 2))
        : 0;
    const duskFactor = Math.exp(-Math.pow((rawElev + 0.06) / 0.16, 2));

    // Palette tuned directly to the Desert Outpost golden-hour reference
    const zenithDay = new THREE.Color(
      weather === 'rain' ? 0x2c3640 : weather === 'fog' ? 0x525e66 : weather === 'overcast' ? 0x415262 : 0x244a75
    );
    const zenithGolden = new THREE.Color(0x283e5e); // Deep steel-indigo sky above warm golden clouds
    const zenithNight = new THREE.Color(0x09111e);

    const midDay = new THREE.Color(
      weather === 'rain' ? 0x48535b : weather === 'fog' ? 0x737e84 : weather === 'overcast' ? 0x62707a : 0x6a8ea8
    );
    const midGolden = new THREE.Color(0x888f99);
    const midNight = new THREE.Color(0x131d2e);

    const horizDay = new THREE.Color(
      weather === 'rain' ? 0x5d676d : weather === 'fog' ? 0x869094 : weather === 'overcast' ? 0x7a858a : 0xa3b7c2
    );
    const horizGolden = new THREE.Color(0xdca063); // Warm amber-gold horizon matching reference!
    const horizNight = new THREE.Color(0x1a2536);

    const skyZenith = zenithNight.clone().lerp(zenithDay, dayFactor);
    const midSky = midNight.clone().lerp(midDay, dayFactor);
    const horizonColor = horizNight.clone().lerp(horizDay, dayFactor);

    const goldenBlend = Math.min(1, sunsetFactor * 0.95 + duskFactor * 0.45) * (weather === 'rain' ? 0.28 : 1.0);
    if (goldenBlend > 0.01) {
      skyZenith.lerp(zenithGolden, goldenBlend * 0.78);
      midSky.lerp(midGolden, goldenBlend * 0.65);
      horizonColor.lerp(horizGolden, goldenBlend * 0.85);
    }

    const sunColor = new THREE.Color(0x7c9ed4)
      .lerp(new THREE.Color(0xfff1d4), dayFactor)
      .lerp(new THREE.Color(0xffb562), goldenBlend * 0.82);

    const cloudShadow = new THREE.Color(0x141b26)
      .lerp(new THREE.Color(0x525d6b), dayFactor)
      .lerp(new THREE.Color(0x464a56), goldenBlend * 0.7);
    const cloudLit = new THREE.Color(0x28354a)
      .lerp(new THREE.Color(0xf2efe8), dayFactor)
      .lerp(new THREE.Color(0xffd79e), goldenBlend * 0.9);

    const groundBounce = new THREE.Color(0x161a1d)
      .lerp(new THREE.Color(0x574b39), dayFactor)
      .lerp(new THREE.Color(0x6b5034), goldenBlend * 0.65);

    const targetCloudDensity =
      weather === 'rain' ? 0.84 : weather === 'overcast' ? 0.74 : weather === 'fog' ? 0.65 : 0.56;
    const targetCloudBright =
      weather === 'rain' ? 0.52 : weather === 'overcast' ? 0.78 : 1.04;

    const u = this.skyMat.uniforms;
    u.uSunDir.value.copy(this.sunDirection);
    u.uZenithColor.value.copy(skyZenith);
    u.uMidSkyColor.value.copy(midSky);
    u.uHorizonColor.value.copy(horizonColor);
    u.uGroundColor.value.copy(groundBounce);
    u.uSunColor.value.copy(sunColor);
    u.uCloudShadowColor.value.copy(cloudShadow);
    u.uCloudLitColor.value.copy(cloudLit);
    u.uCloudDensity.value = THREE.MathUtils.damp(u.uCloudDensity.value, targetCloudDensity, 1.4, dt);
    u.uCloudBrightness.value = THREE.MathUtils.damp(
      u.uCloudBrightness.value,
      targetCloudBright * (0.28 + dayFactor * 0.72),
      1.4,
      dt
    );
    u.uGoldenGlow.value = goldenBlend;
    u.uStarVisibility.value = THREE.MathUtils.clamp((1 - dayFactor * 1.45) * (weather === 'clear' ? 0.92 : 0.2), 0, 1);
    u.uTime.value = this.elapsed;

    this.horizonColor.copy(horizonColor);
    const envIntensity = THREE.MathUtils.lerp(0.22, 0.82, dayFactor);
    return {
      sunDir: this.sunDirection,
      dayFactor,
      sunsetFactor: goldenBlend,
      horizonColor,
      sunColor,
      skyZenith,
      groundBounce,
      envIntensity,
    };
  }

  public dispose() {
    this.skyMesh.geometry.dispose();
    this.skyMat.dispose();
  }
}
