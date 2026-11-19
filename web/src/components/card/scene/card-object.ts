import { CARD, type Engraving } from "@/components/card/artwork";
import type { ArtDirection, Material } from "@/components/card/commission";
import { paintFace, type FaceMaps } from "@/components/card/scene/card-face";
import * as THREE from "three";

/**
 * The Sound Card as a physical object: a thin card of its finish's material
 * — acrylic, anodised metal, brass, glass, pearl, chrome or glazed ceramic —
 * with its artwork engraved into both faces.
 *
 * The engraving is part of the surface, not lines drawn over it. Each face's
 * material reads what was painted when the card was made (`card-face.ts`):
 * when the reveal reaches each mark, how strong it is, and whether it is foil.
 * A mark appears as the scan passes, warms for a moment, and is left as a
 * gently raised relief that catches the light. Under a glossy top coat, the
 * card reflects the studio around it as it turns.
 *
 * Posed from numbers, not animated by itself: `setReveal(t)` says how far the
 * scan has got (0–1) and everything follows, so the reveal scrubs and replays.
 *
 * The card is 63 × 88 mm; its artwork units (630 × 880) map to 0.1 mm.
 */

export const UNIT = 0.0001;
export const CARD_W = CARD.w * UNIT;
export const CARD_H = CARD.h * UNIT;

/** Seconds the reveal's scan takes; the warm trail is measured against it. */
export const SCAN_SECONDS = 1.3;

type Look = {
  metal: number;
  rough: number;
  coat: number;
  coatRough: number;
  iridescence: number;
  env: number;
  lineMetal: number;
  lineRough: number;
  /** Brushed metal: how strongly highlights stretch along the grain (0 = none). */
  brushed: number;
};

/**
 * A bank card's stock (ISO/IEC 7810 ID-1): 0.76 mm, whatever it is made of.
 * Premium cards are satin rather than mirror-bright: a soft sheen across the
 * body, with the engraving and foil glossy against it ("spot gloss"), so the
 * marks catch the light and the body never throws a hard glare.
 */
const THICKNESS = 0.00076;

const LOOK: Record<Material, Look> = {
  acrylic: {
    metal: 0,
    rough: 0.26,
    coat: 0.55,
    coatRough: 0.09,
    iridescence: 0.12,
    env: 1,
    lineMetal: 0.75,
    lineRough: 0.14,
    brushed: 0,
  },
  anodised: {
    metal: 0.9,
    rough: 0.34,
    coat: 0.22,
    coatRough: 0.12,
    iridescence: 0,
    env: 1.05,
    lineMetal: 1,
    lineRough: 0.14,
    brushed: 0.65,
  },
  brass: {
    metal: 1,
    rough: 0.3,
    coat: 0.2,
    coatRough: 0.12,
    iridescence: 0,
    env: 1.05,
    lineMetal: 0.7,
    lineRough: 0.2,
    brushed: 0.55,
  },
  glass: {
    metal: 0,
    rough: 0.1,
    coat: 0.8,
    coatRough: 0.05,
    iridescence: 0.05,
    env: 1.15,
    lineMetal: 0.6,
    lineRough: 0.12,
    brushed: 0,
  },
  pearl: {
    metal: 0.25,
    rough: 0.3,
    coat: 0.6,
    coatRough: 0.1,
    iridescence: 0.9,
    env: 1,
    lineMetal: 0.85,
    lineRough: 0.16,
    brushed: 0,
  },
  chrome: {
    metal: 1,
    rough: 0.15,
    coat: 0.15,
    coatRough: 0.08,
    iridescence: 0,
    env: 1.2,
    lineMetal: 0.4,
    lineRough: 0.4,
    brushed: 0.35,
  },
  ceramic: {
    metal: 0,
    rough: 0.46,
    coat: 0.5,
    coatRough: 0.14,
    iridescence: 0,
    env: 0.9,
    lineMetal: 0.55,
    lineRough: 0.22,
    brushed: 0,
  },
};

const toLocal = (u: number, v: number): [number, number] => [
  (u - CARD.w / 2) * UNIT,
  (CARD.h / 2 - v) * UNIT,
];

function roundedRect(w: number, h: number, r: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return shape;
}

/** A face: the card's outline as a flat shape, UVs spanning the artwork 0–1. */
function faceGeometry(w: number, h: number, r: number) {
  const g = new THREE.ShapeGeometry(roundedRect(w, h, r), 16);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / w + 0.5;
    uv[i * 2 + 1] = pos.getY(i) / h + 0.5;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

type Shared = {
  progress: { value: number };
  stamp: { value: number };
  glow: { value: number };
  /** Where the passing light is, along the card's diagonal (−0.3 → 1.3). */
  sweep: { value: number };
  /** How strongly it shines. */
  gleam: { value: number };
};

const shared = (): Shared => ({
  progress: { value: 0 },
  stamp: { value: 0 },
  glow: { value: 0 },
  sweep: { value: -1 },
  gleam: { value: 0 },
});

/** The face material: the finish's stock, with the engraving in it. */
function faceMaterial(art: ArtDirection, maps: FaceMaps, state: Shared) {
  const look = LOOK[art.material];
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(art.palette.base),
    metalness: look.metal,
    roughness: look.rough,
    clearcoat: look.coat,
    clearcoatRoughness: look.coatRough,
    iridescence: look.iridescence,
    iridescenceIOR: 1.45,
    iridescenceThicknessRange: [180, 620],
    normalMap: maps.relief,
    normalScale: new THREE.Vector2(1, 1),
    envMapIntensity: look.env,
    anisotropy: look.brushed,
    transparent: true,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uEngraving: { value: maps.engraving },
      uProgress: state.progress,
      uStamp: state.stamp,
      uGlowLevel: state.glow,
      uSweep: state.sweep,
      uGleam: state.gleam,
      uSeconds: { value: SCAN_SECONDS },
      uCut: { value: new THREE.Color(art.palette.cut) },
      uGlow: { value: new THREE.Color(art.palette.glow) },
      uFoilA: { value: new THREE.Color("#f4a8ba") },
      uFoilB: { value: new THREE.Color("#f1b49c") },
      uFoilC: { value: new THREE.Color("#e6c483") },
      uLineMetal: { value: look.lineMetal },
      uLineRough: { value: look.lineRough },
    });
    shader.fragmentShader =
      /* glsl */ `
      uniform sampler2D uEngraving;
      uniform float uProgress;
      uniform float uStamp;
      uniform float uGlowLevel;
      uniform float uSweep;
      uniform float uGleam;
      uniform float uSeconds;
      uniform vec3 uCut;
      uniform vec3 uGlow;
      uniform vec3 uFoilA;
      uniform vec3 uFoilB;
      uniform vec3 uFoilC;
      uniform float uLineMetal;
      uniform float uLineRough;

      // Is the mark at uv already revealed? Returns coverage × revealed.
      float engravedAt( vec2 uv, out float time, out float tone, out float foil ) {
        vec4 e = texture2D( uEngraving, uv );
        float w = max( e.g, 1e-4 );
        time = e.r / w;
        tone = e.b / w;
        foil = e.a / w;
        float revealed = time > 1.5 ? step( 0.5, uStamp ) : smoothstep( time - 0.012, time, uProgress );
        return clamp( e.g * 1.2, 0.0, 1.0 ) * revealed;
      }
      ` +
      shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          float engravedTime, engravedTone, engravedFoil;
          float engravedOn = engravedAt( vNormalMapUv, engravedTime, engravedTone, engravedFoil );
          bool hallmark = engravedTime > 1.5;
          float shadeTime, shadeTone, shadeFoil;
          vec2 shadeOffset = vec2( -0.0045, 0.0034 );
          float shadeOn = engravedAt( vNormalMapUv + shadeOffset, shadeTime, shadeTone, shadeFoil );
          float softShadow = shadeOn * texture2D( normalMap, vNormalMapUv + shadeOffset ).a * ( 1.0 - engravedOn );
          float foilT = clamp( vNormalMapUv.x * 1.4 - 0.1 + vNormalMapUv.y * 0.3, 0.0, 1.0 );
          vec3 foilColour = foilT < 0.5 ? mix( uFoilA, uFoilB, foilT * 2.0 ) : mix( uFoilB, uFoilC, foilT * 2.0 - 1.0 );
          vec3 lineColour = mix( uCut * ( 0.55 + 0.5 * engravedTone ), foilColour, step( 0.5, engravedFoil ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, lineColour, engravedOn );`,
        )
        .replace(
          "#include <metalnessmap_fragment>",
          `#include <metalnessmap_fragment>
          metalnessFactor = mix( metalnessFactor, engravedFoil > 0.5 ? 1.0 : uLineMetal, engravedOn );`,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
          roughnessFactor = mix( roughnessFactor, engravedFoil > 0.5 ? 0.2 : uLineRough, engravedOn );`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
          // The relief exists only where the marks already are.
          normal = normalize( mix( nonPerturbedNormal, normal, max( engravedOn, softShadow ) ) );
          {
            // Specular anti-aliasing (Kaplanyan & Hoffman): where the normal
            // turns faster than a pixel can resolve, widen the highlight
            // rather than let it sparkle along the raised marks.
            vec3 dndu = dFdx( normal );
            vec3 dndv = dFdy( normal );
            float variance = 0.25 * ( dot( dndu, dndu ) + dot( dndv, dndv ) );
            float kernel = min( 2.0 * variance, 0.2 );
            float a2 = roughnessFactor * roughnessFactor;
            roughnessFactor = sqrt( sqrt( clamp( a2 * a2 + kernel, 0.0, 1.0 ) ) );
          }`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          {
            // The scan: each mark warms for a moment as it appears.
            float age = ( uProgress - engravedTime ) * uSeconds;
            float heat = hallmark ? 0.0 : exp( -max( age, 0.0 ) / 0.22 ) * engravedOn * step( uProgress, 0.999 );
            totalEmissiveRadiance += vec3( 1.0, 0.72, 0.5 ) * heat * 0.6;
            totalEmissiveRadiance += uGlow * uGlowLevel * engravedOn * ( engravedFoil > 0.5 ? 0.25 : 1.0 );
            // Light passing over the card, caught most by the raised marks.
            float diag = vNormalMapUv.x * 0.55 + ( 1.0 - vNormalMapUv.y ) * 0.45;
            float band = exp( -pow( ( diag - uSweep ) / 0.12, 2.0 ) );
            float slope = 1.0 - clamp( dot( normal, nonPerturbedNormal ), 0.0, 1.0 );
            vec3 gleamColour = mix( vec3( 1.0, 0.96, 0.92 ), uGlow, 0.2 );
            totalEmissiveRadiance += gleamColour * band * uGleam * ( 0.06 + engravedOn * ( 0.3 + slope * 5.0 ) );
          }`,
        )
        .replace(
          "#include <aomap_fragment>",
          `#include <aomap_fragment>
          {
            float occlusion = 1.0 - 0.55 * softShadow;
            reflectedLight.directDiffuse *= occlusion;
            reflectedLight.indirectDiffuse *= occlusion;
            reflectedLight.directSpecular *= occlusion;
            reflectedLight.indirectSpecular *= occlusion;
          }`,
        );
  };
  material.customProgramCacheKey = () => `aurals-card-face-v4-${art.material}`;
  return material;
}

export class CardObject {
  readonly root = new THREE.Group();
  readonly thickness: number;
  private readonly owned: { dispose(): void }[] = [];
  private readonly front: Shared;
  private readonly back: Shared;
  private readonly materials: THREE.Material[] = [];
  private readonly edge: THREE.MeshPhysicalMaterial;
  private readonly art: ArtDirection;

  constructor(engraving: Engraving, art: ArtDirection) {
    const own = <T extends { dispose(): void }>(thing: T) => {
      this.owned.push(thing);
      return thing;
    };
    this.art = art;
    const look = LOOK[art.material];
    this.thickness = THICKNESS;
    const t = this.thickness;
    const r = CARD.radius * UNIT;

    /* ---- the card: thin, its edges just rounded ---- */
    const bevel = t * 0.3;
    const slabGeometry = own(
      new THREE.ExtrudeGeometry(roundedRect(CARD_W, CARD_H, r), {
        depth: t - 2 * bevel,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 4,
        curveSegments: 24,
      }),
    );
    slabGeometry.translate(0, 0, -(t - 2 * bevel) / 2);
    this.edge = own(
      new THREE.MeshPhysicalMaterial({
        // A milled edge: the stock's own colour, a shade deeper, satin.
        color: new THREE.Color(art.palette.base).lerp(new THREE.Color("#000000"), 0.3),
        metalness: look.metal,
        roughness: Math.max(look.rough, 0.3),
        clearcoat: 0.3,
        clearcoatRoughness: 0.12,
        emissive: new THREE.Color(art.palette.glow),
        emissiveIntensity: 0,
        envMapIntensity: look.env,
        transparent: true,
      }),
    );
    this.materials.push(this.edge);
    this.root.add(new THREE.Mesh(slabGeometry, this.edge));

    /* ---- the faces ---- */
    this.front = shared();
    this.back = shared();
    const frontMaps = paintFace(engraving.front);
    const backMaps = paintFace(engraving.back);
    for (const m of [frontMaps, backMaps]) {
      own(m.engraving);
      own(m.relief);
    }
    const faceGeo = own(faceGeometry(CARD_W - 2 * bevel * 0.6, CARD_H - 2 * bevel * 0.6, r - bevel * 0.6));
    const frontMaterial = own(faceMaterial(art, frontMaps, this.front));
    const backMaterial = own(faceMaterial(art, backMaps, this.back));
    this.materials.push(frontMaterial, backMaterial);
    const front = new THREE.Mesh(faceGeo, frontMaterial);
    front.position.z = t / 2 + 0.000004;
    const back = new THREE.Mesh(faceGeo, backMaterial);
    back.rotation.y = Math.PI;
    back.position.z = -t / 2 - 0.000004;
    this.root.add(front, back);
    // The back is whole from the start; only the front is revealed.
    this.back.progress.value = 1;
    this.back.stamp.value = 1;

    /* ---- the back's window, onto the finish's sky ---- */
    const win = engraving.back.windows[0];
    const window = own(
      new THREE.ShaderMaterial({
        uniforms: {
          uSky: { value: art.hour.sky.map((c) => new THREE.Color(c)) },
          uSun: { value: new THREE.Color(art.hour.sun) },
          uOpacity: { value: 1 },
        },
        transparent: true,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vView;
          void main() {
            vUv = uv;
            vec4 world = modelMatrix * vec4(position, 1.0);
            vView = normalize(cameraPosition - world.xyz);
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uSky[5];
          uniform vec3 uSun;
          uniform float uOpacity;
          varying vec2 vUv;
          varying vec3 vView;
          vec3 sky(float y) {
            float s = clamp(1.0 - y, 0.0, 1.0) * 3.999;
            int i = int(floor(s));
            float f = smoothstep(0.0, 1.0, fract(s));
            vec3 a = i == 0 ? uSky[0] : i == 1 ? uSky[1] : i == 2 ? uSky[2] : uSky[3];
            vec3 b = i == 0 ? uSky[1] : i == 1 ? uSky[2] : i == 2 ? uSky[3] : uSky[4];
            return mix(a, b, f);
          }
          float ridge(float x, float seed) {
            return 0.07 * sin(x * 6.0 + seed) + 0.04 * sin(x * 15.0 + seed * 2.3) + 0.02 * sin(x * 37.0 + seed);
          }
          void main() {
            // A window, not a sticker: the view shifts behind it as the card turns.
            vec2 p = vUv + vView.xy * vec2(-0.1, -0.07);
            vec3 col = sky(p.y);
            float sun = smoothstep(0.08, 0.0, length((p - vec2(0.62, 0.36)) * vec2(1.0, 1.4)));
            col += uSun * sun * 1.2;
            float far = 0.32 + ridge(p.x + 0.3 + vView.x * 0.05, 1.7);
            float near = 0.19 + ridge(p.x * 1.4 + vView.x * 0.12, 4.1);
            col = mix(col, uSky[1] * 0.55, smoothstep(far + 0.004, far - 0.004, p.y) * 0.85);
            col = mix(col, uSky[0] * 0.7, smoothstep(near + 0.004, near - 0.004, p.y));
            gl_FragColor = vec4(col, uOpacity);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    );
    this.materials.push(window);
    if (win) {
      const plane = new THREE.Mesh(own(new THREE.PlaneGeometry(win.w * UNIT, win.h * UNIT)), window);
      const [cx, cy] = toLocal(win.x + win.w / 2, win.y + win.h / 2);
      // Seen from behind: mirrored across the card's vertical axis.
      plane.position.set(-cx, cy, -t / 2 - 0.00001);
      plane.rotation.y = Math.PI;
      this.root.add(plane);
    }
  }

  /** How far the scan has revealed the front, 0–1. */
  setReveal(progress: number) {
    this.front.progress.value = Math.max(0, Math.min(1, progress));
    this.front.stamp.value = progress >= 1 ? 1 : 0;
  }

  /** The finished card's own glow: edge-lit acrylic, a little warmth on metal. */
  setGlow(level: number) {
    const l = Math.max(0, Math.min(1, level));
    const lit = this.art.material === "acrylic" || this.art.material === "glass";
    this.front.glow.value = this.back.glow.value = lit ? 0.2 * l : 0.03 * l;
    this.edge.emissiveIntensity = lit ? 0.18 * l : 0;
  }

  /** Light passing over both faces: `sweep` along the diagonal, `gleam` its strength. */
  setGleam(sweep: number, gleam: number) {
    this.front.sweep.value = this.back.sweep.value = sweep;
    this.front.gleam.value = this.back.gleam.value = Math.max(0, gleam);
  }

  /** The card arriving: 0 invisible, 1 solid. */
  setPresence(presence: number) {
    const o = Math.max(0, Math.min(1, presence));
    for (const m of this.materials) {
      m.opacity = o;
      m.depthWrite = o > 0.98;
    }
  }

  dispose() {
    for (const thing of this.owned) thing.dispose();
    this.owned.length = 0;
  }
}
