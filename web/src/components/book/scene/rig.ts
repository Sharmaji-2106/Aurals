import { BOARD_H, BOARD_W, BOOK, BLOCK_TOP, LEAVES } from "@/components/book/contract";
import { boardPose, spineSection, spineTopology, writeSpine, SPINE_POINTS } from "@/components/book/binding";
import type { Lighting } from "@/components/book/choreography";
import { deformLeaf, leafTopology, makeLeaves, type Leaf } from "@/components/book/leaf";
import type { PrintedPages } from "@/components/book/assets";
import { BOOK_LAYER, TERRACE_TURN, Terrace, type TerraceAssets } from "@/components/book/scene/terrace";
import * as THREE from "three";

/**
 * The book as a three.js object graph, and the one method that poses it.
 *
 * React owns when this is built and destroyed; nothing else about it. Every
 * frame the scene calls `pose()` with the state `choreography.ts` computed for
 * that instant, and the rig writes it straight into transforms, vertex
 * buffers and uniforms — no per-frame allocation, and nothing deforms that is
 * not moving (a leaf at rest is computed once and left alone).
 */

export type Maps = Record<
  | "coverAlbedo"
  | "coverNormal"
  | "coverOrm"
  | "spineAlbedo"
  | "spineNormal"
  | "spineOrm"
  | "pastedownAlbedo"
  | "pastedownNormal"
  | "pastedownOrm"
  | "paperNormal"
  | "edges"
  | "edgesNormal",
  THREE.Texture
>;

const MAP_FILES: Record<keyof Maps, { url: string; color: boolean }> = {
  coverAlbedo: { url: "/book/tex/cover-albedo.jpg", color: true },
  coverNormal: { url: "/book/tex/cover-normal.webp", color: false },
  coverOrm: { url: "/book/tex/cover-orm.webp", color: false },
  spineAlbedo: { url: "/book/tex/spine-albedo.jpg", color: true },
  spineNormal: { url: "/book/tex/spine-normal.webp", color: false },
  spineOrm: { url: "/book/tex/spine-orm.webp", color: false },
  pastedownAlbedo: { url: "/book/tex/pastedown-albedo.jpg", color: true },
  pastedownNormal: { url: "/book/tex/pastedown-normal.webp", color: false },
  pastedownOrm: { url: "/book/tex/pastedown-orm.webp", color: false },
  paperNormal: { url: "/book/tex/paper-normal.png", color: false },
  edges: { url: "/book/tex/page-edges.jpg", color: true },
  edgesNormal: { url: "/book/tex/page-edges-normal.webp", color: false },
};

export async function loadMaps(): Promise<Maps> {
  const loader = new THREE.TextureLoader();
  const entries = await Promise.all(
    (Object.keys(MAP_FILES) as (keyof Maps)[]).map(async (key) => {
      const tex = await loader.loadAsync(MAP_FILES[key].url);
      tex.colorSpace = MAP_FILES[key].color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return [key, tex] as const;
    }),
  );
  const maps = Object.fromEntries(entries) as Maps;
  maps.paperNormal.wrapS = maps.paperNormal.wrapT = THREE.RepeatWrapping;
  // 30 mm of grain per tile: 8 across a page, 10 down it.
  maps.paperNormal.repeat.set(BOOK.pageW / 0.03, BOOK.pageH / 0.03);
  return maps;
}

export type Quality = "high" | "balanced" | "low";

export type Pose = {
  cover: { c: number; settle: number };
  leaves: readonly number[];
  lighting: Lighting;
};

const NAVY = new THREE.Color("#171D45");
const ENDPAPER = new THREE.Color("#1E2552");

/* ------------------------------------------------------------- geometry --- */

/**
 * A board: a slab with leather-rounded edges, its hinge edge at x = 0.
 *
 * Built from an extruded rounded rectangle so the two broad faces carry clean
 * 0–1 texture coordinates (the cover artwork and the pastedown are laid out to
 * them exactly) and come out as separate material groups: 0 = outer face,
 * 1 = inner face, 2 = the edges.
 */
function boardGeometry() {
  const bevel = 0.0009;
  const corner = 0.0016;
  const w = BOARD_W - 2 * bevel;
  const h = BOARD_H - 2 * bevel;
  const x0 = bevel;
  const y0 = -h / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x0 + corner, y0);
  shape.lineTo(x0 + w - corner, y0);
  shape.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + corner);
  shape.lineTo(x0 + w, y0 + h - corner);
  shape.quadraticCurveTo(x0 + w, y0 + h, x0 + w - corner, y0 + h);
  shape.lineTo(x0 + corner, y0 + h);
  shape.quadraticCurveTo(x0, y0 + h, x0, y0 + h - corner);
  shape.lineTo(x0, y0 + corner);
  shape.quadraticCurveTo(x0, y0, x0 + corner, y0);
  const depth = BOOK.board - 2 * bevel;
  const raw = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 5,
  });

  // Re-sort triangles into outer cap, inner cap and everything else, and give
  // the caps texture coordinates spanning the full board.
  const pos = raw.getAttribute("position") as THREE.BufferAttribute;
  const uv = raw.getAttribute("uv") as THREE.BufferAttribute;
  const capGroup = raw.groups[0];
  const buckets: number[][] = [[], [], []];
  for (let tri = 0; tri < pos.count / 3; tri++) {
    const first = tri * 3;
    const inCap = first >= capGroup.start && first < capGroup.start + capGroup.count;
    if (!inCap) {
      buckets[2].push(first);
      continue;
    }
    const z = pos.getZ(first);
    buckets[z > depth / 2 ? 0 : 1].push(first);
    for (let k = 0; k < 3; k++) {
      uv.setXY(first + k, pos.getX(first + k) / BOARD_W, (pos.getY(first + k) + BOARD_H / 2) / BOARD_H);
    }
  }
  const out = new THREE.BufferGeometry();
  const order = buckets.flat();
  const positions = new Float32Array(order.length * 9);
  const uvs = new Float32Array(order.length * 6);
  order.forEach((first, i) => {
    for (let k = 0; k < 3; k++) {
      positions.set(
        [pos.getX(first + k), pos.getY(first + k), pos.getZ(first + k) - depth / 2],
        (i * 3 + k) * 3,
      );
      uvs.set([uv.getX(first + k), uv.getY(first + k)], (i * 3 + k) * 2);
    }
  });
  out.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  let start = 0;
  buckets.forEach((bucket, material) => {
    out.addGroup(start, bucket.length * 3, material);
    start += bucket.length * 3;
  });
  // Shape XY becomes the board's XZ: shape +y (the head) points to -z.
  out.rotateX(-Math.PI / 2);
  out.computeVertexNormals();
  raw.dispose();
  return out;
}

function blobTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.filter = "blur(22px)";
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.fillRect(44, 44, 168, 168);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function stripeTexture(colors: string[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, (i * 64) / colors.length, 4, 64 / colors.length);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 6);
  return tex;
}

/* ------------------------------------------------------------- the rig --- */

type LeafMesh = {
  leaf: Leaf;
  geometry: THREE.BufferGeometry;
  position: THREE.BufferAttribute;
  front: THREE.Mesh;
  back: THREE.Mesh;
  last: number;
};

export class BookRig {
  readonly root = new THREE.Group();
  private readonly owned: { dispose(): void }[] = [];
  private readonly flat = { value: 0 };
  private readonly glint = { value: -1 };
  private readonly glintLevel = { value: 0 };
  private readonly frontBoard = new THREE.Group();
  private readonly spine: THREE.BufferGeometry;
  private readonly spinePosition: THREE.BufferAttribute;
  private readonly spineUv: THREE.BufferAttribute;
  private lastCover = -1;
  private readonly leaves: LeafMesh[] = [];
  private readonly selected: THREE.Mesh;
  private readonly frontBlob: THREE.Mesh;
  private readonly terrace: Terrace;
  private readonly light: {
    key: THREE.DirectionalLight;
    rim: THREE.DirectionalLight;
    fill: THREE.DirectionalLight;
  };

  constructor(maps: Maps, terrace: TerraceAssets, pages: PrintedPages, quality: Quality, anisotropy: number) {
    const own = <T extends { dispose(): void }>(thing: T) => {
      this.owned.push(thing);
      return thing;
    };
    // Shadows stay on at every tier: the shadow a lifting leaf throws is half
    // of what makes it read as paper. Only the map's resolution scales.
    const shadows = true;

    for (const tex of Object.values(maps)) {
      tex.anisotropy = anisotropy;
      own(tex);
    }

    /* ---- materials ---- */
    const leather = own(new THREE.MeshStandardMaterial({ color: NAVY, roughness: 0.6, metalness: 0 }));
    // Leather is a dielectric with a soft, low sheen: full-strength specular
    // makes it read as plastic, and a warm room reflected at full strength
    // turned the navy brown.
    const cover = own(
      new THREE.MeshPhysicalMaterial({
        specularIntensity: 0.32,
        map: maps.coverAlbedo,
        normalMap: maps.coverNormal,
        aoMap: maps.coverOrm,
        roughnessMap: maps.coverOrm,
        metalnessMap: maps.coverOrm,
        roughness: 1,
        metalness: 1,
      }),
    );
    // The light crossing the foil. A real softbox would light the table as
    // well; this is the reflection alone, art-directed: a soft band that
    // travels across the cover, gold where it meets foil, brightest where the
    // emboss's bevels turn toward it, and barely there on the leather.
    const glint = this.glint;
    const glintLevel = this.glintLevel;
    cover.onBeforeCompile = (shader) => {
      shader.uniforms.uGlint = glint;
      shader.uniforms.uGlintLevel = glintLevel;
      shader.fragmentShader =
        "uniform float uGlint;\nuniform float uGlintLevel;\n" +
        shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          {
            float along = vMapUv.x * 0.85 + (1.0 - vMapUv.y) * 0.55;
            float band = exp(-pow((along - uGlint) / 0.075, 2.0));
            float relief = clamp(1.0 - dot(normal, nonPerturbedNormal), 0.0, 1.0);
            float foil = metalnessFactor;
            vec3 gold = vec3(1.0, 0.8, 0.52) * (1.4 + 22.0 * relief) * foil;
            vec3 sheen = vec3(0.55, 0.6, 0.85) * 0.035 * (1.0 - foil);
            totalEmissiveRadiance += (gold + sheen) * band * uGlintLevel;
          }`,
        );
    };
    cover.customProgramCacheKey = () => "aurals-cover";

    const pastedown = own(
      new THREE.MeshStandardMaterial({
        map: maps.pastedownAlbedo,
        normalMap: maps.pastedownNormal,
        aoMap: maps.pastedownOrm,
        roughnessMap: maps.pastedownOrm,
        roughness: 1,
        metalness: 0,
      }),
    );
    const spineLeather = own(
      new THREE.MeshPhysicalMaterial({
        specularIntensity: 0.32,
        map: maps.spineAlbedo,
        normalMap: maps.spineNormal,
        aoMap: maps.spineOrm,
        roughnessMap: maps.spineOrm,
        metalnessMap: maps.spineOrm,
        roughness: 1,
        metalness: 1,
        side: THREE.FrontSide,
      }),
    );
    const endpaper = own(new THREE.MeshStandardMaterial({ color: ENDPAPER, roughness: 0.9, metalness: 0 }));
    const edges = own(
      new THREE.MeshStandardMaterial({
        map: maps.edges,
        normalMap: maps.edgesNormal,
        normalScale: new THREE.Vector2(1, 1),
        roughness: 0.9,
        metalness: 0,
      }),
    );
    const ivory = own(new THREE.MeshStandardMaterial({ color: new THREE.Color("#E9DDC8"), roughness: 0.9 }));
    const hollow = own(new THREE.MeshStandardMaterial({ color: new THREE.Color("#120f0b"), roughness: 1 }));

    const flat = this.flat;
    const page = (canvas: HTMLCanvasElement, mirrored: boolean, side: THREE.Side) => {
      const map = own(new THREE.CanvasTexture(canvas));
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = anisotropy;
      if (mirrored) {
        // The back of a leaf is seen with its spine on the right.
        map.repeat.set(-1, 1);
        map.offset.set(1, 0);
      }
      const material = own(
        new THREE.MeshStandardMaterial({
          map,
          roughness: 0.84,
          metalness: 0,
          normalMap: maps.paperNormal,
          normalScale: new THREE.Vector2(0.45, 0.45),
          side,
        }),
      );
      // At the end the page is shown exactly as its artwork, so the frame the
      // DOM replaces is the DOM's own picture. Mixed after tone mapping and
      // before the output transform, so 1.0 reproduces the texture's sRGB.
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uFlat = flat;
        shader.fragmentShader =
          "uniform float uFlat;\n" +
          shader.fragmentShader.replace(
            "#include <tonemapping_fragment>",
            "#include <tonemapping_fragment>\n\tgl_FragColor.rgb = mix(gl_FragColor.rgb, diffuseColor.rgb, uFlat);",
          );
      };
      material.customProgramCacheKey = () => "aurals-page";
      return material;
    };

    // Soft contact shadows: the shadow map gives the shape, these give the
    // dark seam where an object actually touches the table.
    const blob = own(blobTexture());
    const blobMaterial = own(
      new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, opacity: 0.9 }),
    );
    const backBlob = new THREE.Mesh(
      own(new THREE.PlaneGeometry(BOARD_W * 1.32, BOARD_H * 1.22)),
      blobMaterial,
    );
    backBlob.rotation.x = -Math.PI / 2;
    backBlob.position.set(BOOK.joint + BOARD_W / 2, 0.0002, 0);
    this.root.add(backBlob);
    this.frontBlob = new THREE.Mesh(backBlob.geometry, own(blobMaterial.clone()));
    this.frontBlob.rotation.x = -Math.PI / 2;
    this.frontBlob.position.set(-(BOOK.bulge + BOOK.joint) - BOARD_W / 2, 0.0002, 0);
    this.root.add(this.frontBlob);

    /* ---- boards ---- */
    const boardGeo = own(boardGeometry());
    const back = new THREE.Mesh(boardGeo, [leather, pastedown, leather]);
    // The back board is the same board turned over: outer face down, hinge
    // edge still toward the spine.
    back.rotation.x = Math.PI;
    back.position.set(BOOK.joint, BOOK.board / 2, 0);
    back.castShadow = back.receiveShadow = shadows;
    this.root.add(back);

    const front = new THREE.Mesh(boardGeo, [cover, pastedown, leather]);
    front.castShadow = front.receiveShadow = shadows;
    this.frontBoard.add(front);
    this.root.add(this.frontBoard);

    /* ---- text block ---- */
    const block = new THREE.Mesh(own(new THREE.BoxGeometry(BOOK.pageW, BOOK.block, BOOK.pageH)), [
      edges,
      hollow,
      ivory,
      ivory,
      edges,
      edges,
    ]);
    block.position.set(BOOK.pageW / 2, BOOK.board + BOOK.block / 2, 0);
    block.castShadow = block.receiveShadow = shadows;
    this.root.add(block);

    // Headbands: the little striped rolls at the head and tail of the spine.
    const band = own(
      new THREE.MeshStandardMaterial({
        map: own(stripeTexture(["#D5AD62", "#171D45", "#F1E5D1", "#171D45"])),
        roughness: 0.55,
      }),
    );
    for (const z of [BOOK.pageH / 2 - 0.0008, -BOOK.pageH / 2 + 0.0008]) {
      const roll = new THREE.Mesh(
        own(new THREE.CylinderGeometry(0.0011, 0.0011, BOOK.block * 0.96, 10)),
        band,
      );
      roll.position.set(-0.0006, BOOK.board + BOOK.block / 2, z);
      this.root.add(roll);
    }

    /* ---- spine ---- */
    const topology = spineTopology(SPINE_POINTS);
    this.spine = own(new THREE.BufferGeometry());
    this.spinePosition = new THREE.BufferAttribute(new Float32Array(topology.vertexCount * 3), 3);
    this.spineUv = new THREE.BufferAttribute(new Float32Array(topology.vertexCount * 2), 2);
    this.spinePosition.setUsage(THREE.DynamicDrawUsage);
    this.spine.setAttribute("position", this.spinePosition);
    this.spine.setAttribute("uv", this.spineUv);
    this.spine.setIndex(topology.index);
    for (const g of topology.groups) this.spine.addGroup(g.start, g.count, g.material);
    const spineMesh = new THREE.Mesh(this.spine, [spineLeather, endpaper, leather]);
    spineMesh.castShadow = spineMesh.receiveShadow = shadows;
    spineMesh.frustumCulled = false;
    this.root.add(spineMesh);

    /* ---- the selected page: the top of the text block ---- */
    this.selected = new THREE.Mesh(
      own(new THREE.PlaneGeometry(BOOK.pageW, BOOK.pageH)),
      page(pages.selected, false, THREE.FrontSide),
    );
    this.selected.rotation.x = -Math.PI / 2;
    this.selected.position.set(BOOK.pageW / 2, BLOCK_TOP + 0.00004, 0);
    this.selected.receiveShadow = shadows;
    this.root.add(this.selected);

    /* ---- leaves ---- */
    const topo = leafTopology();
    makeLeaves().forEach((leaf, i) => {
      const geometry = own(new THREE.BufferGeometry());
      const position = new THREE.BufferAttribute(new Float32Array(topo.vertexCount * 3), 3);
      position.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("position", position);
      geometry.setAttribute("uv", new THREE.BufferAttribute(topo.uv, 2));
      geometry.setIndex(topo.index);
      const frontMaterial = page(pages.leaves[i].front, false, THREE.FrontSide);
      frontMaterial.shadowSide = THREE.DoubleSide;
      const frontMesh = new THREE.Mesh(geometry, frontMaterial);
      const backMesh = new THREE.Mesh(geometry, page(pages.leaves[i].back, true, THREE.BackSide));
      frontMesh.castShadow = shadows;
      frontMesh.receiveShadow = backMesh.receiveShadow = shadows;
      frontMesh.frustumCulled = backMesh.frustumCulled = false;
      this.root.add(frontMesh, backMesh);
      this.leaves.push({ leaf, geometry, position, front: frontMesh, back: backMesh, last: -1 });
    });

    /* ---- light ----
     *
     * The light is the terrace's. The key is the sun itself, low over the sea
     * behind the book and a little to the right, warm, throwing the book's
     * shadow long across the glass toward the camera — raised a few degrees
     * above where the sun sits in the sky, so the pages are lit rather than
     * merely grazed. The villa's warm rooms are a soft practical from the
     * right. The sky and everything else around comes from the environment
     * map, which is the terrace itself.
     */
    const key = new THREE.DirectionalLight(new THREE.Color("#ffc7a0"), 0);
    const sun = new THREE.Vector3(0.067, 0.29, -0.955)
      .normalize()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), TERRACE_TURN);
    key.target.position.set(0.08, 0, 0);
    key.position.copy(key.target.position).addScaledVector(sun, 2.2);
    key.castShadow = shadows;
    const map = quality === "low" ? 1024 : 2048;
    key.shadow.mapSize.set(map, map);
    const cam = key.shadow.camera;
    cam.left = -0.44;
    cam.right = 0.44;
    cam.top = 0.44;
    cam.bottom = -0.44;
    cam.near = 1.2;
    cam.far = 3.2;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.0014;
    key.shadow.radius = 4;
    key.shadow.blurSamples = 12;
    this.root.add(key, key.target);

    // The terrace behind the camera: the villa's lit rooms and the canopy's
    // downlights fall on the book from the front left, warm and soft, so the
    // spine and the ivory read as themselves and not as the sunset's colour.
    const rim = new THREE.DirectionalLight(new THREE.Color("#ffe1c4"), 0);
    rim.position.set(-1.1, 1.0, 1.3);
    this.root.add(rim);

    // The villa's rooms, to the right: a warm practical.
    const fill = new THREE.DirectionalLight(new THREE.Color("#ffb27a"), 0);
    fill.position.set(2.6, 1.0, 0.4);
    this.root.add(fill);

    // Everything above is the book (and its lights): it is what the glass table
    // reflects. The terrace is added after, on the default layer alone.
    this.root.traverse((object) => object.layers.enable(BOOK_LAYER));

    /* ---- the terrace ---- */
    this.terrace = new Terrace(terrace, quality);
    this.owned.push(this.terrace);
    this.root.add(this.terrace.root);

    this.light = { key, rim, fill };
  }

  /** The book's pose at one instant. */
  pose(pose: Pose, scene: THREE.Scene) {
    const { cover, leaves, lighting } = pose;
    scene.environmentIntensity = 0.72 * lighting.environment;
    scene.environmentRotation.set(0, TERRACE_TURN, 0);
    this.terrace.setLevel(lighting.room);
    this.terrace.setFocus(lighting.focus);
    // The page must end exactly as its artwork: no reflection under it either.
    this.terrace.setReflection(1 - lighting.flatten);

    /* cover + spine, only while they move */
    const coverKey = cover.c + cover.settle * 10;
    if (coverKey !== this.lastCover) {
      this.lastCover = coverKey;
      const board = boardPose(cover.c, cover.settle);
      this.frontBoard.position.set(board.x, board.y, 0);
      this.frontBoard.rotation.set(0, 0, board.angle);
      writeSpine(
        spineSection(cover.c, board),
        this.spinePosition.array as Float32Array,
        this.spineUv.array as Float32Array,
      );
      this.spinePosition.needsUpdate = true;
      this.spineUv.needsUpdate = true;
      this.spine.computeVertexNormals();
      this.frontBlob.visible = cover.c > 0.6;
      (this.frontBlob.material as THREE.MeshBasicMaterial).opacity =
        0.9 * Math.min(1, Math.max(0, (cover.c - 0.75) / 0.25)) ** 2;
    }

    /* leaves */
    for (let i = 0; i < LEAVES; i++) {
      const item = this.leaves[i];
      const p = leaves[i];
      if (p !== item.last) {
        item.last = p;
        deformLeaf(item.leaf, p, item.position.array as Float32Array);
        item.position.needsUpdate = true;
        item.geometry.computeVertexNormals();
      }
      // A leaf lying flat under another flat leaf cannot be seen; skip it.
      const coveredRight = p === 0 && i > 0 && leaves[i - 1] === 0;
      const coveredLeft = p === 1 && i < LEAVES - 1 && leaves[i + 1] === 1;
      const visible = !coveredRight && !coveredLeft && cover.c > 0.02;
      item.front.visible = item.back.visible = visible;
    }
    this.selected.visible = leaves[LEAVES - 1] > 0;

    /* light */
    const { key, rim, fill } = this.light;
    key.intensity = 4.6 * lighting.key;
    rim.intensity = 1.05 * lighting.rim;
    fill.intensity = 0.4 * lighting.fill;
    this.glint.value = -0.2 + 1.8 * lighting.sweep;
    this.glintLevel.value = lighting.sweepLevel;
    this.flat.value = lighting.flatten;
  }

  dispose() {
    for (const thing of this.owned) thing.dispose();
    this.owned.length = 0;
  }
}
