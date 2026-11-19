import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

/**
 * The oceanfront terrace: where the book is read, at sunset.
 *
 * Built and lit in Blender (`design/book/build_terrace.py`), because its light
 * is global illumination — a low sun across polished stone, the sky's colour in
 * every surface, the villa's warm rooms spilling onto the terrace — which a
 * browser cannot compute per frame and Cycles can compute once. What arrives:
 *
 * - **The sky, sea and coast** (`terrace-sky.webp`): everything kilometres
 *   away, rendered all the way round from the book and drawn here as a backdrop
 *   at infinity. Already tone-mapped with the scene's own operator, so it is
 *   drawn as it is. Softened by `setFocus` — the lens is focused on a book half
 *   a metre away, and the horizon should not be as sharp as the page.
 * - **The near terrace** (`terrace.glb`): the stone floor, the glass
 *   balustrade, the villa's glass wall, the room behind it and the canopy. The
 *   villa is drawn with its light baked in. The floor is drawn with its own
 *   stone and gloss live and its light from a bake, so the sky's reflection
 *   moves with the camera as it should.
 * - **The light** (`terrace-env.hdr`): the whole terrace seen from the book,
 *   used as the environment the leather, foil, paper and glass reflect.
 *
 * The table is made here, not in Blender: its smoked glass must reflect the
 * book as the book opens. That reflection is a second, mirrored camera that
 * draws only the book (layer `BOOK_LAYER`) into a texture the glass samples.
 */

/** Objects on this layer are seen in the glass table. */
export const BOOK_LAYER = 1;

/**
 * How far the terrace is turned about the table, relative to the book.
 *
 * The book's own frame is fixed by its ending (the page's head is "up" on the
 * screen at the last frame), so the room turns instead: by this much, the sea
 * and the sun sit off the book's front-left corner, where the opening camera
 * looks past its spine toward them. Everything far and near turns together —
 * the sky, the terrace, the environment the book reflects, and the sun's
 * direction as a light.
 */
export const TERRACE_TURN = THREE.MathUtils.degToRad(-14);

/** The table, in the book's own frame: its top is y = 0, the book lies on it. */
export const TABLE = { x: 0.03, z: 0, radius: 0.45, thickness: 0.012, height: 0.56 } as const;

export type TerraceAssets = {
  scene: THREE.Group;
  environment: THREE.DataTexture;
  sky: THREE.Texture;
  maps: { villa: THREE.Texture; curtains: THREE.Texture; floorLight: THREE.Texture; stone: THREE.Texture };
  manifest: {
    sky: { top: number; bottom: number };
    scale: { villa: number; curtains: number; floorLight: number };
  };
};

export async function loadTerrace(small = false): Promise<TerraceAssets> {
  const loader = new THREE.TextureLoader();
  const texture = async (url: string, gltf: boolean, color = true) => {
    const tex = await loader.loadAsync(url);
    tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    // glTF texture coordinates have their origin at the top left.
    if (gltf) tex.flipY = false;
    return tex;
  };
  const [gltf, environment, sky, villa, curtains, floorLight, stone, manifest] = await Promise.all([
    new GLTFLoader().loadAsync("/book/terrace/terrace.glb"),
    new HDRLoader().loadAsync("/book/terrace/terrace-env.hdr").then((tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      return tex;
    }),
    texture(small ? "/book/terrace/terrace-sky-small.webp" : "/book/terrace/terrace-sky.webp", false),
    texture("/book/terrace/terrace-villa.webp", true),
    texture("/book/terrace/terrace-curtains.webp", true),
    texture("/book/terrace/terrace-floor-light.webp", true),
    texture("/book/terrace/terrace-stone.jpg", false),
    fetch("/book/terrace/terrace.json").then((r) => r.json() as Promise<TerraceAssets["manifest"]>),
  ]);
  return { scene: gltf.scene, environment, sky, maps: { villa, curtains, floorLight, stone }, manifest };
}

/* ------------------------------------------------------------- the sky --- */

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // Drawn at the far plane, whatever the camera's far distance: it is at infinity.
    gl_Position = clip.xyww;
    gl_Position.z *= 0.99999;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform sampler2D uSky;
  uniform vec2 uSize;
  uniform float uTop;
  uniform float uBottom;
  uniform float uLevel;
  uniform float uBlur;
  varying vec3 vDirection;
  #include <common>

  vec2 skyUv(vec3 d) {
    float u = atan(d.z, d.x) / (2.0 * PI) + 0.5;
    float elevation = asin(clamp(d.y, -1.0, 1.0));
    float v = (elevation - uBottom) / (uTop - uBottom);
    return vec2(u, clamp(v, 0.0, 1.0));
  }

  void main() {
    vec3 d = normalize(vDirection);
    vec2 uv = skyUv(d);
    // A small disc of taps, golden-angle spaced: a lens's out-of-focus blur
    // rather than a box filter's.
    vec3 sum = vec3(0.0);
    float lod = log2(max(1.0, uBlur * 0.5));
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float r = sqrt((fi + 0.5) / 12.0) * uBlur;
      float a = fi * 2.39996;
      vec2 offset = vec2(cos(a), sin(a)) * r / uSize;
      sum += texture2D(uSky, uv + offset, lod).rgb;
    }
    gl_FragColor = vec4(sum / 12.0 * uLevel, 1.0);
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------- the glass table top --- */

/**
 * A planar reflection of the book: a mirrored camera, an oblique near plane on
 * the glass, and only the book's layer drawn. The rest of what the glass
 * reflects — the sky, the canopy, the villa — comes from the environment map.
 */
class Reflection {
  readonly target: THREE.WebGLRenderTarget;
  readonly matrix = new THREE.Matrix4();
  private readonly camera = new THREE.PerspectiveCamera();
  private readonly plane = new THREE.Plane();
  private readonly clip = new THREE.Vector4();
  private readonly q = new THREE.Vector4();
  private readonly normal = new THREE.Vector3();
  private readonly mirror = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly target3 = new THREE.Vector3();
  private readonly rotation = new THREE.Matrix4();
  private readonly clearColor = new THREE.Color();
  private readonly view = new THREE.Vector3();

  constructor(size: number) {
    this.target = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, samples: 2 });
    this.camera.layers.set(BOOK_LAYER);
  }

  setSize(width: number, height: number) {
    if (this.target.width !== width || this.target.height !== height) this.target.setSize(width, height);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, glass: THREE.Object3D) {
    const { normal, mirror, eye, look, target3, rotation } = this;
    mirror.setFromMatrixPosition(glass.matrixWorld);
    eye.setFromMatrixPosition(camera.matrixWorld);
    rotation.extractRotation(glass.matrixWorld);
    normal.set(0, 0, 1).applyMatrix4(rotation);
    const view = this.view.subVectors(mirror, eye);
    if (view.dot(normal) > 0) return;
    view.reflect(normal).negate().add(mirror);

    rotation.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rotation).add(eye);
    target3.subVectors(mirror, look).reflect(normal).negate().add(mirror);

    const cam = this.camera;
    cam.position.copy(view);
    cam.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
    cam.lookAt(target3);
    cam.far = (camera as THREE.PerspectiveCamera).far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    cam.projectionMatrix.elements[8] *= -1;
    cam.projectionMatrix.elements[12] *= -1;

    this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.matrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse).multiply(glass.matrixWorld);

    // Oblique near plane: nothing under the glass is drawn into its reflection.
    this.plane.setFromNormalAndCoplanarPoint(normal, mirror).applyMatrix4(cam.matrixWorldInverse);
    const clip = this.clip.set(
      this.plane.normal.x,
      this.plane.normal.y,
      this.plane.normal.z,
      this.plane.constant,
    );
    const p = cam.projectionMatrix.elements;
    this.q.set((Math.sign(clip.x) + p[8]) / p[0], (Math.sign(clip.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
    clip.multiplyScalar(2 / clip.dot(this.q));
    p[2] = clip.x;
    p[6] = clip.y;
    p[10] = clip.z + 1;
    p[14] = clip.w;

    const previousTarget = renderer.getRenderTarget();
    const autoUpdate = renderer.shadowMap.autoUpdate;
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.state.buffers.depth.setMask(true);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setClearColor(this.clearColor, alpha);
    renderer.shadowMap.autoUpdate = autoUpdate;
    renderer.setRenderTarget(previousTarget);
  }

  dispose() {
    this.target.dispose();
  }
}

/* ------------------------------------------------------------ the terrace --- */

export class Terrace {
  readonly root = new THREE.Group();
  /** Receives the book's shadow on the glass. */
  readonly shadowCatcher: THREE.Mesh;
  private readonly owned: { dispose(): void }[] = [];
  private readonly baked: { material: THREE.MeshBasicMaterial; scale: number }[] = [];
  private readonly sky: THREE.ShaderMaterial;
  private readonly floorLevel = { value: 1 };
  private readonly floorScale: number;
  private readonly reflection: Reflection;
  private readonly reflectionStrength = { value: 1 };

  constructor(assets: TerraceAssets, quality: "high" | "balanced" | "low") {
    const own = <T extends { dispose(): void }>(thing: T) => {
      this.owned.push(thing);
      return thing;
    };
    const { maps, manifest } = assets;
    for (const tex of Object.values(maps)) own(tex);
    own(assets.sky);

    /* ---- the sky, at infinity ---- */
    assets.sky.wrapS = THREE.RepeatWrapping;
    assets.sky.wrapT = THREE.ClampToEdgeWrapping;
    assets.sky.generateMipmaps = true;
    assets.sky.minFilter = THREE.LinearMipmapLinearFilter;
    const image = assets.sky.image as { width: number; height: number };
    this.sky = own(
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        uniforms: {
          uSky: { value: assets.sky },
          uSize: { value: new THREE.Vector2(image.width, image.height) },
          uTop: { value: THREE.MathUtils.degToRad(manifest.sky.top) },
          uBottom: { value: THREE.MathUtils.degToRad(manifest.sky.bottom) },
          uLevel: { value: 1 },
          uBlur: { value: 2 },
        },
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    const dome = new THREE.Mesh(own(new THREE.SphereGeometry(50, 64, 32)), this.sky);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.root.add(dome);

    /* ---- the near terrace, from Blender ---- */
    this.root.rotation.y = TERRACE_TURN;
    const terrace = assets.scene;
    this.floorScale = manifest.scale.floorLight;
    const stone = maps.stone;
    stone.wrapS = stone.wrapT = THREE.RepeatWrapping;
    // The tile is 2.4 m × 1.2 m; the floor is 15.6 m × 12.4 m (TERRACE_X/Y in
    // build_terrace.py).
    stone.repeat.set(15.6 / 2.4, 12.4 / 1.2);
    stone.anisotropy = 8;
    maps.floorLight.colorSpace = THREE.SRGBColorSpace;
    const floor = own(
      new THREE.MeshStandardMaterial({
        map: stone,
        roughness: 0.2,
        metalness: 0,
        lightMap: maps.floorLight,
        lightMapIntensity: 0,
        envMapIntensity: 0.85,
      }),
    );
    // The floor's diffuse light is Cycles' (sky, sun, villa, the table's
    // shadow), so the live lights add only their gloss. Its reflection of the
    // sky is the environment's, drawn live because it moves with the eye.
    const floorLevel = this.floorLevel;
    const floorScale = this.floorScale;
    floor.onBeforeCompile = (shader) => {
      shader.uniforms.uBakeLevel = floorLevel;
      shader.uniforms.uBakeScale = { value: floorScale };
      shader.fragmentShader =
        "uniform float uBakeLevel;\nuniform float uBakeScale;\n" +
        shader.fragmentShader.replace(
          "#include <aomap_fragment>",
          `reflectedLight.directDiffuse = vec3(0.0);
          reflectedLight.indirectDiffuse = diffuseColor.rgb * texture2D(lightMap, vLightMapUv).rgb * uBakeScale * uBakeLevel;
          #include <aomap_fragment>`,
        );
    };
    floor.customProgramCacheKey = () => "aurals-terrace-floor";

    const bakedMaterial = (
      map: THREE.Texture,
      scale: number,
      extra: THREE.MeshBasicMaterialParameters = {},
    ) => {
      const material = own(new THREE.MeshBasicMaterial({ map, ...extra }));
      this.baked.push({ material, scale });
      return material;
    };
    const glass = (tint: string, opacity: number, envMapIntensity: number) =>
      own(
        new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(tint),
          metalness: 0,
          roughness: 0.03,
          transparent: true,
          opacity,
          envMapIntensity,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );

    terrace.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.computeBoundingSphere();
      own(object.geometry);
      switch (object.name) {
        case "Floor":
          object.material = floor;
          break;
        case "Villa":
          object.material = bakedMaterial(maps.villa, manifest.scale.villa);
          break;
        case "Curtains":
          object.material = bakedMaterial(maps.curtains, manifest.scale.curtains, {
            transparent: true,
            opacity: 0.82,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          break;
        case "FacadeGlass":
          object.material = glass("#16141c", 0.3, 2.2);
          object.renderOrder = 2;
          break;
        case "RailGlass":
          object.material = glass("#cfe0e2", 0.07, 3.2);
          object.renderOrder = 3;
          break;
        case "RailCap":
          object.material = own(
            new THREE.MeshStandardMaterial({ color: "#d9d2ca", metalness: 1, roughness: 0.22 }),
          );
          break;
        case "RailShoe":
          object.material = own(
            new THREE.MeshStandardMaterial({ color: "#2a2830", metalness: 0.7, roughness: 0.38 }),
          );
          break;
      }
    });
    this.root.add(terrace);

    /* ---- the table ---- */
    const table = new THREE.Group();
    table.position.set(TABLE.x, 0, TABLE.z);
    this.root.add(table);

    this.reflection = new Reflection(quality === "low" ? 512 : 1024);
    const reflection = this.reflection;
    const strength = this.reflectionStrength;
    // Smoked glass: dark, half transparent, a mirror at a low angle.
    const top = own(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#0b0910"),
        metalness: 0,
        roughness: 0.035,
        transparent: true,
        opacity: 0.62,
        envMapIntensity: 1.25,
        depthWrite: false,
      }),
    );
    top.onBeforeCompile = (shader) => {
      shader.uniforms.uReflection = { value: reflection.target.texture };
      shader.uniforms.uReflectionMatrix = { value: reflection.matrix };
      shader.uniforms.uReflectionStrength = strength;
      shader.vertexShader =
        "uniform mat4 uReflectionMatrix;\nvarying vec4 vReflectionUv;\n" +
        shader.vertexShader.replace(
          "#include <project_vertex>",
          "#include <project_vertex>\n\tvReflectionUv = uReflectionMatrix * vec4( position, 1.0 );",
        );
      shader.fragmentShader =
        "uniform sampler2D uReflection;\nuniform float uReflectionStrength;\nvarying vec4 vReflectionUv;\n" +
        shader.fragmentShader.replace(
          "#include <opaque_fragment>",
          `{
            vec4 mirrored = texture2DProj( uReflection, vReflectionUv );
            float facing = clamp( dot( normalize( vViewPosition ), normal ), 0.0, 1.0 );
            // Fresnel, art-directed: a near mirror at the low opening angle,
            // a faint one looking straight down.
            float k = ( 0.1 + 0.62 * pow( 1.0 - facing, 2.6 ) ) * uReflectionStrength;
            outgoingLight = outgoingLight * ( 1.0 - mirrored.a * k ) + mirrored.rgb * k;
            diffuseColor.a = mix( diffuseColor.a, 1.0, mirrored.a * k );
          }
          #include <opaque_fragment>`,
        );
    };
    top.customProgramCacheKey = () => "aurals-glass-top";
    const disc = new THREE.Mesh(own(new THREE.CircleGeometry(TABLE.radius, 128)), top);
    disc.rotation.x = -Math.PI / 2;
    disc.renderOrder = 1;
    disc.onBeforeRender = (renderer, scene, camera) => {
      if (camera.layers.isEnabled(BOOK_LAYER) && !camera.layers.isEnabled(0)) return;
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const scale = quality === "low" ? 0.4 : 0.6;
      reflection.setSize(Math.max(64, Math.round(size.x * scale)), Math.max(64, Math.round(size.y * scale)));
      reflection.render(renderer, scene, camera, disc);
    };
    table.add(disc);

    // The glass's edge: 12 mm of glass seen edge-on carries light along it and
    // glows with whatever it faces.
    const edge = new THREE.Mesh(
      own(new THREE.CylinderGeometry(TABLE.radius, TABLE.radius, TABLE.thickness, 128, 1, true)),
      own(
        new THREE.MeshStandardMaterial({
          color: new THREE.Color("#3a2c34"),
          emissive: new THREE.Color("#ff9a62"),
          emissiveIntensity: 0.22,
          metalness: 0.2,
          roughness: 0.12,
          envMapIntensity: 2.4,
        }),
      ),
    );
    edge.position.y = -TABLE.thickness / 2;
    table.add(edge);
    const underside = new THREE.Mesh(
      disc.geometry,
      own(
        new THREE.MeshStandardMaterial({
          color: new THREE.Color("#0b0910"),
          roughness: 0.05,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        }),
      ),
    );
    underside.rotation.x = Math.PI / 2;
    underside.position.y = -TABLE.thickness;
    table.add(underside);

    // The pedestal: a turned bronze column on a low disc, a flange under the glass.
    const profile = [
      [0, -TABLE.height],
      [0.205, -TABLE.height],
      [0.21, -TABLE.height + 0.006],
      [0.2, -TABLE.height + 0.018],
      [0.06, -TABLE.height + 0.03],
      [0.042, -TABLE.height + 0.07],
      [0.034, -0.06],
      [0.04, -0.03],
      [0.05, -TABLE.thickness - 0.006],
      [0.05, -TABLE.thickness],
      [0, -TABLE.thickness],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const bronze = own(
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#c48a5d"), metalness: 1, roughness: 0.26 }),
    );
    const pedestal = new THREE.Mesh(own(new THREE.LatheGeometry(profile, 72)), bronze);
    pedestal.castShadow = true;
    table.add(pedestal);

    // The book's shadow, on the glass.
    this.shadowCatcher = new THREE.Mesh(
      own(new THREE.CircleGeometry(TABLE.radius, 96)),
      own(new THREE.ShadowMaterial({ opacity: 0.42, depthWrite: false })),
    );
    this.shadowCatcher.rotation.x = -Math.PI / 2;
    this.shadowCatcher.position.y = 0.0001;
    this.shadowCatcher.receiveShadow = true;
    this.shadowCatcher.renderOrder = 2;
    table.add(this.shadowCatcher);

    own(this.reflection);
  }

  /** 0 = the terrace at dusk's first light, 1 = as Cycles lit it. */
  setLevel(level: number) {
    for (const { material, scale } of this.baked) material.color.setScalar(scale * level);
    this.floorLevel.value = level;
    this.sky.uniforms.uLevel.value = level;
  }

  /** How far out of focus the horizon is, in backdrop pixels. */
  setFocus(blur: number) {
    this.sky.uniforms.uBlur.value = blur;
  }

  /** The glass's mirror strength: 1 normally, 0 when the page must read flat. */
  setReflection(strength: number) {
    this.reflectionStrength.value = strength;
  }

  dispose() {
    for (const thing of this.owned) thing.dispose();
    this.owned.length = 0;
  }
}
