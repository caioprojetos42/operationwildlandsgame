import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export type AssetCategory =
  | 'vehicle_apc'
  | 'vehicle_jeep'
  | 'vehicle_pickup'
  | 'vehicle_truck'
  | 'vehicle_car'
  | 'vehicle_helicopter'
  | 'tree_pine'
  | 'tree_oak'
  | 'tree_palm'
  | 'bush_sage'
  | 'grass_tuft'
  | 'rock_boulder'
  | 'rock_outcrop'
  | 'building_hangar'
  | 'building_warehouse'
  | 'building_tower'
  | 'building_barracks'
  | 'building_bunker'
  | 'prop_container'
  | 'soldier_trooper'
  | 'soldier_heavy'
  | 'soldier_sniper'
  | 'weapon_rifle'
  | 'weapon_smg'
  | 'weapon_sniper'
  | 'weapon_pistol';

export interface ManifestEntry {
  category?: string;
  label?: string;
  url: string | null;
  scale?: number;
  yOffset?: number;
  rotY?: number;
}

interface ModelManifest {
  version: number;
  description?: string;
  models: Partial<Record<AssetCategory, ManifestEntry>>;
}

export interface InstancedMeshPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

export interface InstancedPrototype {
  key: AssetCategory;
  parts: InstancedMeshPart[];
}

export interface AssetStatusReport {
  totalSlots: number;
  loadedExternalGlb: AssetCategory[];
  proceduralPlaceholders: AssetCategory[];
}

/**
 * PHASE 4 — Production GLB/GLTF Professional Asset Manager for OPERATION: WILDLANDS.
 * - Reads /models/manifest.json on startup (zero 404s; skips entries where url === null).
 * - Supports both single-entity cloning (vehicles, buildings, soldiers, weapons) and
 *   multi-part InstancedMesh prototype extraction (trees, bushes, rocks) from .glb assets.
 * - Never fabricates URLs and accurately reports external GLB vs procedural fallback state.
 */
export class ModelAssetManager {
  private loader = new GLTFLoader();
  private manifest: ModelManifest | null = null;
  private cache = new Map<AssetCategory, THREE.Group>();
  private urlCache = new Map<string, { group: THREE.Group; animations: THREE.AnimationClip[] }>();
  private urlLoading = new Map<string, Promise<{ group: THREE.Group; animations: THREE.AnimationClip[] } | null>>();
  private instancedCache = new Map<AssetCategory, InstancedPrototype>();
  private loading = new Map<AssetCategory, Promise<THREE.Group | null>>();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  public async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const res = await fetch('/models/manifest.json', { cache: 'no-cache' });
        if (res.ok) {
          const data = (await res.json()) as ModelManifest;
          if (data && typeof data.models === 'object') {
            this.manifest = data;
          }
        }
      } catch {
        this.manifest = { version: 2, models: {} };
      } finally {
        this.initialized = true;
      }
    })();

    return this.initPromise;
  }

  public hasExternalAsset(key: AssetCategory): boolean {
    const url = this.manifest?.models?.[key]?.url;
    return typeof url === 'string' && url.trim().length > 0;
  }

  public getRegisteredAssets(): AssetCategory[] {
    if (!this.manifest?.models) return [];
    return (Object.keys(this.manifest.models) as AssetCategory[]).filter((k) => this.hasExternalAsset(k));
  }

  public getAssetStatusReport(): AssetStatusReport {
    const allKeys = this.manifest?.models ? (Object.keys(this.manifest.models) as AssetCategory[]) : [];
    const loadedExternalGlb: AssetCategory[] = [];
    const proceduralPlaceholders: AssetCategory[] = [];
    for (const k of allKeys) {
      if (this.hasExternalAsset(k)) loadedExternalGlb.push(k);
      else proceduralPlaceholders.push(k);
    }
    return {
      totalSlots: allKeys.length,
      loadedExternalGlb,
      proceduralPlaceholders,
    };
  }

  /**
   * Loads and caches a normalized THREE.Group clone from a registered external .glb/.gltf entry.
   */
  public async loadClone(key: AssetCategory): Promise<THREE.Group | null> {
    if (!this.initialized) await this.init();
    const entry = this.manifest?.models?.[key];
    if (!entry?.url) return null;

    const cached = this.cache.get(key);
    if (cached) return cloneSkinned(cached) as THREE.Group;

    let promise = this.loading.get(key);
    if (!promise) {
      const targetUrl = entry.url;
      promise = new Promise<THREE.Group | null>((resolve) => {
        this.loader.load(
          targetUrl,
          (gltf) => {
            const root = new THREE.Group();
            const model = gltf.scene;
            const scale = entry.scale ?? 1.0;
            model.scale.setScalar(scale);
            model.position.y = entry.yOffset ?? 0;
            model.rotation.y = entry.rotY ?? 0;
            model.traverse((obj) => {
              if ((obj as THREE.Mesh).isMesh) {
                const m = obj as THREE.Mesh;
                m.visible = true;
                m.castShadow = true;
                m.receiveShadow = true;
                m.frustumCulled = false;
                const mats = Array.isArray(m.material) ? m.material : [m.material];
                for (const mat of mats) {
                  if (!mat) continue;
                  const std = mat as THREE.MeshPhysicalMaterial;
                  if (typeof std.transmission === 'number' && std.transmission > 0) {
                    std.transmission = 0;
                    std.transparent = false;
                    std.opacity = 1;
                    std.depthWrite = true;
                    std.needsUpdate = true;
                  }
                  if (std.transparent && std.opacity < 0.2) {
                    std.transparent = false;
                    std.opacity = 1;
                    std.depthWrite = true;
                    std.needsUpdate = true;
                  }
                }
              }
            });
            root.add(model);
            root.updateMatrixWorld(true);
            this.cache.set(key, root);
            resolve(root);
          },
          undefined,
          () => resolve(null)
        );
      });
      this.loading.set(key, promise);
    }

    const loaded = await promise;
    return loaded ? (cloneSkinned(loaded) as THREE.Group) : null;
  }

  /**
   * Loads and caches a GLB by direct URL (preserving embedded AnimationClips & SkinnedMesh rigs).
   */
  public async loadByUrl(
    url: string,
    skipClone = false
  ): Promise<{ group: THREE.Group; animations: THREE.AnimationClip[] } | null> {
    const cached = this.urlCache.get(url);
    if (cached) {
      return {
        group: skipClone ? cached.group : (cloneSkinned(cached.group) as THREE.Group),
        animations: cached.animations,
      };
    }

    let promise = this.urlLoading.get(url);
    if (!promise) {
      console.info(`[ModelAssetManager] Loading GLB: ${url}`);
      promise = new Promise<{ group: THREE.Group; animations: THREE.AnimationClip[] } | null>((resolve) => {
        this.loader.load(
          url,
          (gltf) => {
            const model = gltf.scene;
            let meshCount = 0;
            model.traverse((obj) => {
              if ((obj as THREE.Mesh).isMesh) {
                meshCount++;
                const m = obj as THREE.Mesh;
                m.visible = true;
                m.castShadow = true;
                m.receiveShadow = true;
                m.frustumCulled = false;
                const mats = Array.isArray(m.material) ? m.material : [m.material];
                for (const mat of mats) {
                  if (!mat) continue;
                  const std = mat as THREE.MeshPhysicalMaterial;
                  if (typeof std.transmission === 'number' && std.transmission > 0) {
                    std.transmission = 0;
                    std.transparent = false;
                    std.opacity = 1;
                    std.depthWrite = true;
                    std.needsUpdate = true;
                  }
                  if (std.transparent && std.opacity < 0.2) {
                    std.transparent = false;
                    std.opacity = 1;
                    std.depthWrite = true;
                    std.needsUpdate = true;
                  }
                }
              }
            });
            model.updateMatrixWorld(true);
            console.info(`[ModelAssetManager] Loaded ${url} (${meshCount} meshes, ${(gltf.animations ?? []).length} anims)`);
            const entry = { group: model, animations: gltf.animations ?? [] };
            this.urlCache.set(url, entry);
            resolve(entry);
          },
          undefined,
          (err) => {
            console.error(`[ModelAssetManager] Failed to load GLB ${url}:`, err);
            resolve(null);
          }
        );
      });
      this.urlLoading.set(url, promise);
    }

    const loaded = await promise;
    if (!loaded) return null;
    return {
      group: skipClone ? loaded.group : (cloneSkinned(loaded.group) as THREE.Group),
      animations: loaded.animations,
    };
  }

  /**
   * Loads a soldier GLB from manifest.json and normalizes its height to `targetHeight` meters
   * with feet grounded at y = 0.
   */
  public async loadNormalizedSoldier(key: AssetCategory, targetHeight = 1.78): Promise<THREE.Group | null> {
    const clone = await this.loadClone(key);
    if (!clone) return null;

    clone.visible = true;
    clone.traverse((obj) => {
      obj.visible = true;
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.visible = true;
        m.frustumCulled = false;
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });

    clone.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (Number.isFinite(size.y) && size.y > 0.01 && size.y < 500) {
      const normScale = targetHeight / size.y;
      clone.scale.multiplyScalar(normScale);
      clone.updateMatrixWorld(true);
      const scaledBox = new THREE.Box3().setFromObject(clone);
      const center = new THREE.Vector3();
      scaledBox.getCenter(center);
      clone.position.x -= center.x;
      clone.position.z -= center.z;
      clone.position.y -= scaledBox.min.y;
    }
    return clone;
  }

  /**
   * Extracts baked geometry + material pairs from a loaded .glb so WorldManager can render
   * hundreds of external GLB trees, bushes, or boulders through GPU InstancedMesh!
   */
  public async loadInstancedPrototype(key: AssetCategory): Promise<InstancedPrototype | null> {
    const existing = this.instancedCache.get(key);
    if (existing) return existing;

    const group = await this.loadClone(key);
    if (!group) return null;

    group.updateMatrixWorld(true);
    const parts: InstancedMeshPart[] = [];

    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const bakedGeo = mesh.geometry.clone();
        bakedGeo.applyMatrix4(mesh.matrixWorld);
        const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        parts.push({ geometry: bakedGeo, material: mat });
      }
    });

    if (parts.length === 0) return null;
    const proto: InstancedPrototype = { key, parts };
    this.instancedCache.set(key, proto);
    return proto;
  }

  /**
   * Synchronous accessor for already-loaded instanced prototypes (zero-stutter streaming).
   */
  public getCachedInstancedPrototype(key: AssetCategory): InstancedPrototype | null {
    return this.instancedCache.get(key) ?? null;
  }

  /**
   * Preloads any externally configured GLB vegetation & prop prototypes asynchronously at startup.
   */
  public async preloadRegisteredInstancedAssets(): Promise<void> {
    if (!this.initialized) await this.init();
    const instancedKeys: AssetCategory[] = [
      'tree_pine',
      'tree_oak',
      'tree_palm',
      'bush_sage',
      'grass_tuft',
      'rock_boulder',
      'rock_outcrop',
    ];
    await Promise.all(
      instancedKeys
        .filter((k) => this.hasExternalAsset(k))
        .map((k) => this.loadInstancedPrototype(k))
    );
  }

  /**
   * Non-blocking visual swap hook for vehicles, buildings, soldiers, and weapons:
   * keeps procedural geometry active immediately and replaces the visual child group
   * automatically if an external .glb is registered for `key` in manifest.json.
   */
  public attachExternalOverrideIfAvailable(
    key: AssetCategory,
    visualHolder: THREE.Group,
    onReplaced?: (loaded: THREE.Group) => void
  ): void {
    if (!this.hasExternalAsset(key)) return;
    void this.loadClone(key).then((loaded) => {
      if (!loaded) return;
      while (visualHolder.children.length > 0) {
        visualHolder.remove(visualHolder.children[0]);
      }
      visualHolder.add(loaded);
      onReplaced?.(loaded);
    });
  }

  public dispose() {
    this.cache.forEach((group) => {
      group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry.dispose();
          if (Array.isArray(m.material)) {
            m.material.forEach((mat) => mat.dispose());
          } else {
            m.material.dispose();
          }
        }
      });
    });
    this.instancedCache.forEach((proto) => {
      proto.parts.forEach((p) => p.geometry.dispose());
    });
    this.cache.clear();
    this.instancedCache.clear();
    this.loading.clear();
  }
}
