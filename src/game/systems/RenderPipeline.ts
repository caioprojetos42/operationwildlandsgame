import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GraphicsPreset } from '../types';
import { AtmosphereLightingState } from './SkyAtmosphere';

const _sunWorldPos = new THREE.Vector3();
const _sunNdc = new THREE.Vector3();
const _camForward = new THREE.Vector3();

/**
 * Custom linear-space cinematic tactical grading + directional golden-hour atmospheric scatter.
 * Runs BEFORE OutputPass so ACESFilmicToneMapping + Linear->sRGB execute once at final output.
 */
const TacticalCinematicShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uSharpen: { value: 0.38 },
    uSunScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
    uSunGlare: { value: 0.0 },
    uGodRayStrength: { value: 0.32 },
    uSunColor: { value: new THREE.Color(0xffe0b2) },
    uContrast: { value: 1.06 },
    uSaturation: { value: 1.12 },
    uVignette: { value: 0.08 },
    uWarmth: { value: 0.035 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uSharpen;
    uniform vec2 uSunScreenPos;
    uniform float uSunGlare;
    uniform float uGodRayStrength;
    uniform vec3 uSunColor;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uVignette;
    uniform float uWarmth;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 col = max(texel.rgb, vec3(0.0));

      // Adaptive micro-detail sharpening (CAS-style 4-tap unsharp mask, clamped against HDR haloing)
      if (uSharpen > 0.01) {
        vec2 px = 1.0 / max(uResolution, vec2(1.0));
        vec3 n = max(texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb, vec3(0.0));
        vec3 s = max(texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb, vec3(0.0));
        vec3 e = max(texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb, vec3(0.0));
        vec3 w = max(texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb, vec3(0.0));
        vec3 blur = (n + s + e + w) * 0.25;
        vec3 detail = clamp(col - blur, vec3(-0.18), vec3(0.18));
        // Taper sharpening on blazing HDR sky pixels so clouds stay silky
        float midMask = 1.0 - smoothstep(0.95, 2.2, dot(col, vec3(0.2126, 0.7152, 0.0722)));
        col = max(col + detail * (uSharpen * (0.45 + 0.55 * midMask)), vec3(0.0));
      }

      // Screen-Space Radial Volumetric God Rays (Crepuscular Solar Shafts) + Solar Veil
      if (uSunGlare > 0.002) {
        vec2 delta = (vUv - uSunScreenPos);
        vec2 aspDelta = vec2(delta.x * 1.65, delta.y);
        float dist = length(aspDelta);
        float haloWide = exp(-dist * 2.3) * 0.14;
        float haloCore = exp(-dist * 8.2) * 0.18;

        vec3 shafts = vec3(0.0);
        if (uGodRayStrength > 0.01) {
          vec2 stepUv = (uSunScreenPos - vUv) * (0.68 / 10.0);
          vec2 sampleUv = vUv;
          float decay = 1.0;
          for (int i = 0; i < 10; i++) {
            sampleUv += stepUv;
            vec3 sCol = texture2D(tDiffuse, clamp(sampleUv, 0.002, 0.998)).rgb;
            float sLuma = dot(sCol, vec3(0.2126, 0.7152, 0.0722));
            float brightGate = smoothstep(0.68, 1.8, sLuma);
            shafts += sCol * brightGate * decay;
            decay *= 0.84;
          }
          shafts *= (0.045 * uGodRayStrength * exp(-dist * 1.15));
        }

        col += uSunColor * (haloWide + haloCore) * uSunGlare + shafts * uSunGlare;
      }

      // Vivid military cinema split-tone (crisp cool slate shadows + rich golden-hour sunlight highlights)
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowTint = vec3(0.92, 0.97, 1.06);
      vec3 highlightTint = vec3(1.0 + uWarmth * 1.15, 1.0 + uWarmth * 0.42, 1.0 - uWarmth * 0.52);
      float hlWeight = smoothstep(0.06, 0.82, luma);
      col *= mix(shadowTint, highlightTint, hlWeight);

      // Selective vibrance + vivid saturation (pops MultiCam, foliage, desert gold & sky blues without clipping)
      float maxC = max(col.r, max(col.g, col.b));
      float minC = min(col.r, min(col.g, col.b));
      float satNow = (maxC - minC) / max(maxC, 0.001);
      float vibBoost = 1.0 + (uSaturation - 1.0) * (1.28 - 0.55 * clamp(satNow, 0.0, 1.0));
      vec3 gray = vec3(dot(col, vec3(0.2126, 0.7152, 0.0722)));
      col = max(mix(gray, col, vibBoost), vec3(0.0));

      // Punchy filmic S-curve micro-contrast in linear space
      col = pow(max(col, vec3(0.0001)), vec3(uContrast));

      // Minimal optical edge chromatic aberration (Standoff 2 crisp clarity)
      vec2 center = vUv - 0.5;
      float edgeDist = length(center);
      float caAmt = smoothstep(0.45, 0.98, edgeDist) * 0.0004;
      if (caAmt > 0.00005) {
        vec2 caDir = normalize(center + vec2(0.0001)) * caAmt;
        col.r = mix(col.r, max(texture2D(tDiffuse, clamp(vUv + caDir, 0.001, 0.999)).r, 0.0), 0.45);
        col.b = mix(col.b, max(texture2D(tDiffuse, clamp(vUv - caDir, 0.001, 0.999)).b, 0.0), 0.45);
      }

      // Clean subtle edge vignette
      float vig = smoothstep(0.96, 0.32, dot(center, center) * 1.7);
      col *= mix(1.0 - uVignette, 1.0, vig);

      // Ultra-light sensor micro-grain (keeps competitive clarity razor-sharp)
      float grain = fract(sin(dot(vUv * uResolution, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      col = max(col + grain * 0.003 * (1.0 - smoothstep(0.8, 2.2, luma)), vec3(0.0));

      gl_FragColor = vec4(col, texel.a);
    }
  `,
};

/**
 * PHASE 1 — AAA Rendering, HDR Outdoor IBL & Post-Processing Pipeline.
 * Completely decoupled from gameplay; gracefully bypasses multi-pass overhead on LOW or software WebGL.
 */
export class RenderPipeline {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;

  private composer: EffectComposer | null = null;
  private renderTarget: THREE.WebGLRenderTarget | null = null;
  private renderPass: RenderPass | null = null;
  private gtaoPass: GTAOPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private gradePass: ShaderPass | null = null;
  private outputPass: OutputPass | null = null;

  private envTexture: THREE.Texture | null = null;
  private preset: GraphicsPreset = 'HIGH';
  private useComposer = false;
  private currentExposure = 1.18;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    isSoftwareGl: boolean
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.isSoftwareGl = isSoftwareGl;

    // Canonical PBR Filmic Color Pipeline
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.currentExposure;

    // Generate genuine HDR Outdoor Sky IBL (vivid golden-hour reflections on weapons, armor, vehicles & glass)
    this.buildOutdoorHDRIEnvironment();

    // Initialize HDR EffectComposer stack on hardware GPUs
    if (!this.isSoftwareGl) {
      this.initComposer(
        renderer.domElement.clientWidth || window.innerWidth,
        renderer.domElement.clientHeight || window.innerHeight
      );
    }
  }

  /**
   * Builds a physically-inspired HDR outdoor sky dome + blazing HDR solar specular lobe + desert ground bounce
   * compiled through PMREMGenerator for realistic IBL reflections on weapons, vehicles, glass, and PBR terrain.
   */
  private buildOutdoorHDRIEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();

    const envScene = new THREE.Scene();

    // HDR Atmospheric Sky Sphere with intense HDR sun peak (intensity > 9.0) & vivid sunset horizon band
    const skyGeo = new THREE.SphereGeometry(40, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(-0.78, 0.24, -0.58).normalize() },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float y = d.y;

          // Vivid outdoor golden-hour sky zenith -> azure midsky -> rich amber horizon -> warm ground bounce
          vec3 zenith = vec3(0.22, 0.48, 0.86);
          vec3 midSky = vec3(0.62, 0.78, 0.94);
          vec3 horizon = vec3(1.58, 1.04, 0.56);
          vec3 ground = vec3(0.36, 0.28, 0.20);
          vec3 nadir = vec3(0.16, 0.13, 0.10);

          vec3 col;
          if (y >= 0.0) {
            col = mix(horizon, midSky, smoothstep(0.0, 0.26, y));
            col = mix(col, zenith, pow(clamp(y, 0.0, 1.0), 0.65));
          } else {
            col = mix(horizon * 0.5, ground, smoothstep(0.0, -0.25, y));
            col = mix(col, nadir, smoothstep(-0.25, -0.85, y));
          }

          // Sunlit cloud band bounce
          float sunCos = max(dot(d, normalize(uSunDir)), 0.0);
          col += vec3(1.7, 1.12, 0.62) * pow(sunCos, 4.5) * 0.62;
          // Crisp HDR solar specular lobe for metallic weapons, goggles & vehicle clearcoat
          col += vec3(9.5, 6.8, 3.8) * pow(sunCos, 68.0);
          // Cool sky rim on opposite horizon so dark gunmetal & armor silhouettes pop cleanly
          float backSky = max(dot(d, normalize(vec3(0.6, 0.35, 0.5))), 0.0);
          col += vec3(0.42, 0.60, 0.86) * pow(backSky, 2.8) * 0.45;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const skySphere = new THREE.Mesh(skyGeo, skyMat);
    envScene.add(skySphere);

    const rt = pmrem.fromScene(envScene, 0.028);
    this.envTexture?.dispose();
    this.envTexture = rt.texture;
    this.scene.environment = this.envTexture;

    skyGeo.dispose();
    skyMat.dispose();
    pmrem.dispose();
  }

  /**
   * Optional runtime hook for loading a real external .hdr file (e.g. from /public/hdri/) via RGBELoader.
   */
  public async loadExternalHDRI(url: string): Promise<boolean> {
    try {
      const loader = new RGBELoader();
      const hdrTex = await loader.loadAsync(url);
      hdrTex.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();
      const envRT = pmrem.fromEquirectangular(hdrTex);
      this.envTexture?.dispose();
      this.envTexture = envRT.texture;
      this.scene.environment = this.envTexture;
      hdrTex.dispose();
      pmrem.dispose();
      return true;
    } catch {
      return false;
    }
  }

  private initComposer(width: number, height: number) {
    const safeW = Math.max(1, Math.floor(width));
    const safeH = Math.max(1, Math.floor(height));

    // HDR HalfFloat render target with WebGL2 MSAA (4x) so geometry edges stay crisp
    this.renderTarget = new THREE.WebGLRenderTarget(safeW, safeH, {
      type: THREE.HalfFloatType,
      samples: 4,
    });

    this.composer = new EffectComposer(this.renderer, this.renderTarget);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(safeW, safeH);

    // 1. Primary HDR PBR Scene Pass
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // 2. Ground Truth Ambient Occlusion (GTAO) — crisp crevice grounding on buildings, vehicles, rocks & weapons
    this.gtaoPass = new GTAOPass(this.scene, this.camera, safeW, safeH);
    this.gtaoPass.output = GTAOPass.OUTPUT.Default;
    this.gtaoPass.blendIntensity = 0.62;
    this.gtaoPass.updateGtaoMaterial({
      radius: 0.48,
      distanceExponent: 1.5,
      thickness: 1.15,
      distanceFallOff: 1.0,
      scale: 1.0,
      samples: 12,
      screenSpaceRadius: false,
    });
    this.gtaoPass.updatePdMaterial({
      lumaPhi: 10,
      depthPhi: 2,
      normalPhi: 3,
      radius: 6,
      radiusExponent: 2,
      rings: 2,
      samples: 8,
    });
    this.composer.addPass(this.gtaoPass);

    // 3. Selective Moderate HDR Bloom (threshold > 1.06 so ONLY true HDR emissives/sun glow!)
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, Math.floor(safeW * 0.5)), Math.max(1, Math.floor(safeH * 0.5))),
      0.24, // moderate strength
      0.48, // controlled soft radius
      1.08  // HDR-only threshold (prevents bright sand/concrete washout)
    );
    this.composer.addPass(this.bloomPass);

    // 4. Cinematic Tactical Color Grading + Adaptive Micro-Sharpening + Sun Atmospheric Scatter
    this.gradePass = new ShaderPass(TacticalCinematicShader);
    this.gradePass.uniforms.uResolution.value.set(safeW, safeH);
    this.composer.addPass(this.gradePass);

    // 5. Final OutputPass (executes ACESFilmicToneMapping + Linear->sRGB once cleanly!)
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.applyPreset(this.preset);
  }

  public applyPreset(preset: GraphicsPreset) {
    this.preset = preset;
    if (this.isSoftwareGl || !this.composer) {
      this.useComposer = false;
      return;
    }

    if (preset === 'LOW') {
      this.useComposer = false;
      return;
    }

    this.useComposer = true;

    if (this.gtaoPass) {
      if (preset === 'MEDIUM') {
        this.gtaoPass.enabled = false;
      } else if (preset === 'HIGH') {
        this.gtaoPass.enabled = true;
        this.gtaoPass.blendIntensity = 0.56;
        this.gtaoPass.updateGtaoMaterial({ samples: 12, radius: 0.42 });
      } else {
        // ULTRA
        this.gtaoPass.enabled = true;
        this.gtaoPass.blendIntensity = 0.62;
        this.gtaoPass.updateGtaoMaterial({ samples: 16, radius: 0.46 });
      }
    }

    if (this.bloomPass) {
      this.bloomPass.enabled = true;
      this.bloomPass.strength = preset === 'MEDIUM' ? 0.2 : preset === 'HIGH' ? 0.26 : 0.3;
      this.bloomPass.threshold = preset === 'MEDIUM' ? 1.15 : 1.06;
    }

    if (this.gradePass) {
      this.gradePass.enabled = true;
      this.gradePass.uniforms.uGodRayStrength.value =
        preset === 'MEDIUM' ? 0.2 : preset === 'HIGH' ? 0.46 : 0.66;
      this.gradePass.uniforms.uSharpen.value =
        preset === 'MEDIUM' ? 0.24 : preset === 'HIGH' ? 0.34 : 0.4;
    }
  }

  public resize(width: number, height: number, pixelRatio: number) {
    if (!this.composer) return;
    const safeW = Math.max(1, Math.floor(width));
    const safeH = Math.max(1, Math.floor(height));
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(safeW, safeH);

    if (this.gradePass) {
      this.gradePass.uniforms.uResolution.value.set(safeW * pixelRatio, safeH * pixelRatio);
    }

    if (this.bloomPass) {
      this.bloomPass.resolution.set(
        Math.max(1, Math.floor(safeW * 0.5)),
        Math.max(1, Math.floor(safeH * 0.5))
      );
    }
  }

  /**
   * Synchronizes cinematic exposure, sun-glare screen position, and vivid grading warmth with live sky atmosphere.
   */
  public updateAtmosphere(atmo: AtmosphereLightingState, weatherDim: number, dt: number) {
    // Vivid, luminous dynamic exposure: rich golden hour (1.16), crisp midday (1.06), clear night ops (1.18)
    const targetExposure =
      THREE.MathUtils.lerp(1.18, 1.06, atmo.dayFactor) + atmo.sunsetFactor * 0.09;
    this.currentExposure = THREE.MathUtils.damp(this.currentExposure, targetExposure, 2.2, Math.max(dt, 0.001));
    this.renderer.toneMappingExposure = this.currentExposure;

    if (this.gradePass && this.gradePass.enabled) {
      const u = this.gradePass.uniforms;

      // Project real sun direction into screen UV space for directional atmospheric glare
      this.camera.getWorldDirection(_camForward);
      const facingSun = _camForward.dot(atmo.sunDir);
      const sunAboveHorizon = THREE.MathUtils.smoothstep(atmo.sunDir.y, -0.05, 0.08);
      const glareStrength =
        facingSun > 0.15
          ? Math.pow(THREE.MathUtils.clamp((facingSun - 0.15) / 0.85, 0, 1), 2.2) *
            sunAboveHorizon *
            weatherDim *
            (0.48 + atmo.sunsetFactor * 0.9)
          : 0;

      if (glareStrength > 0.001) {
        _sunWorldPos.copy(this.camera.position).addScaledVector(atmo.sunDir, 900);
        _sunNdc.copy(_sunWorldPos).project(this.camera);
        u.uSunScreenPos.value.set(_sunNdc.x * 0.5 + 0.5, _sunNdc.y * 0.5 + 0.5);
      }

      u.uSunGlare.value = THREE.MathUtils.damp(u.uSunGlare.value, glareStrength, 6.0, Math.max(dt, 0.001));
      u.uSunColor.value.copy(atmo.sunColor);
      u.uWarmth.value = 0.04 + atmo.sunsetFactor * 0.085;
      u.uSaturation.value = THREE.MathUtils.lerp(1.12, 1.2, atmo.dayFactor) + atmo.sunsetFactor * 0.05;
      u.uContrast.value = THREE.MathUtils.lerp(1.05, 1.09, atmo.dayFactor);
    }
  }

  public render() {
    if (this.useComposer && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public getDiagnostics() {
    return {
      composerActive: this.useComposer,
      gtaoEnabled: Boolean(this.useComposer && this.gtaoPass?.enabled),
      bloomEnabled: Boolean(this.useComposer && this.bloomPass?.enabled),
      gradeEnabled: Boolean(this.useComposer && this.gradePass?.enabled),
      preset: this.preset,
      isSoftwareGl: this.isSoftwareGl,
    };
  }

  public dispose() {
    this.gtaoPass?.dispose();
    this.bloomPass?.dispose();
    this.outputPass?.dispose();
    this.renderTarget?.dispose();
    this.composer?.dispose();
    this.envTexture?.dispose();
  }
}
