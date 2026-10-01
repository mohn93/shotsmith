// Shared building blocks for the "Three.js studio" App Store screenshots.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const W = 1260, H = 2736;
export const CAP_W = 2428, CAP_H = 5275;

// ---------- renderer + post ----------
export function createRenderer({ pixelRatio = 2 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById("stage").appendChild(renderer.domElement);
  return renderer;
}

// Final pass: soft highlight shoulder (identity below 0.82 so UI colors stay exact),
// linear -> sRGB, triangular dither to kill banding, a touch of film grain.
const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uGrain: { value: 0.012 }, uRes: { value: new THREE.Vector2(W, H) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uGrain; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    vec3 shoulder(vec3 c){
      const float k = 0.82;
      vec3 over = max(c - k, 0.0);
      vec3 comp = k + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
      return mix(c, comp, step(k, c));
    }
    vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = min(c, vec3(1.0));
      vec3 s = toSRGB(c);
      vec2 p = vUv * uRes;
      float n = h(p) + h(p + 17.13) - 1.0;           // triangular dither
      float g = (h(p * 1.7 + 3.1) - 0.5) * uGrain;     // grain
      s += n / 255.0 + g * (1.0 - s);
      gl_FragColor = vec4(s, 1.0);
    }`,
};

export function createComposer(renderer, scene, camera, { bloom = { strength: 0.55, radius: 0.55, threshold: 1.08 }, samples = 4 } = {}) {
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(W * pr, H * pr, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  if (bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), bloom.strength, bloom.radius, bloom.threshold));
  const fin = new ShaderPass(FinalShader);
  fin.uniforms.uRes.value.set(W * pr, H * pr);
  composer.addPass(fin);
  return composer;
}

// ---------- textures ----------
export async function loadTexture(renderer, url, { srgb = true } = {}) {
  const tex = await new THREE.TextureLoader().loadAsync(url);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export function canvasTexture(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------- studio environment (custom softboxes -> PMREM) ----------
export function studioEnvironment(renderer, { key = 6, rim = 9, fill = 1.2, tint = new THREE.Color(0.35, 0.55, 1.0) } = {}) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: new THREE.Color(0.006, 0.008, 0.014) }));
  env.add(room);
  const box = (w, h, pos, look, color, intensity) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(look); env.add(m); return m;
  };
  const white = new THREE.Color(1, 0.98, 0.95);
  const o = new THREE.Vector3();
  box(26, 14, new THREE.Vector3(-14, 18, 16), o, white, key);          // big key softbox, upper-left front
  box(5, 40, new THREE.Vector3(22, 4, 14), o, white, rim * 0.55);             // hard strip, right
  box(3, 34, new THREE.Vector3(-24, 0, -8), o, tint, rim * 0.6);       // cool strip, left rear
  box(40, 10, new THREE.Vector3(0, -20, 10), o, tint, fill);           // floor bounce, cool
  box(10, 10, new THREE.Vector3(8, 10, 30), o, white, fill * 1.5);     // small front fill
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.02);
  pmrem.dispose();
  return rt.texture;
}

// ---------- background: full-screen gradient quad with glows ----------
export function backgroundQuad({ top = "#070b18", bottom = "#02040a", glows = [] } = {}) {
  // glows: [{ uv:[x,y], radius, color, intensity }], uv in screen space (0,0 bottom-left)
  const N = 4;
  const gl = [...glows]; while (gl.length < N) gl.push({ uv: [0, 0], radius: 0.001, color: "#000", intensity: 0 });
  const mat = new THREE.ShaderMaterial({
    depthWrite: false, depthTest: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) }, uBottom: { value: new THREE.Color(bottom) },
      uGlowPos: { value: gl.map((g) => new THREE.Vector3(g.uv[0], g.uv[1], g.radius)) },
      uGlowCol: { value: gl.map((g) => new THREE.Color(g.color).multiplyScalar(g.intensity)) },
      uAspect: { value: W / H },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
    fragmentShader: `
      uniform vec3 uTop, uBottom; uniform vec3 uGlowPos[${N}]; uniform vec3 uGlowCol[${N}]; uniform float uAspect; varying vec2 vUv;
      void main(){
        vec3 c = mix(uBottom, uTop, smoothstep(0.0, 1.0, vUv.y));
        for (int i = 0; i < ${N}; i++) {
          vec2 d = vUv - uGlowPos[i].xy; d.x *= uAspect;
          float r = length(d) / uGlowPos[i].z;
          c += uGlowCol[i] * exp(-r * r * 2.2);
        }
        vec2 v = vUv - 0.5; v.x *= uAspect;
        c *= 1.0 - 0.45 * smoothstep(0.35, 0.95, length(v) * 1.25);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  m.frustumCulled = false; m.renderOrder = -100;
  return m;
}

// ---------- geometry helpers ----------
export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// Plane-ish rounded rect whose UVs map to a pixel rect of the capture texture.
export function roundedRectCropGeometry(w, h, r, crop /* {x,y,w,h} in capture px */, segs = 24) {
  const g = new THREE.ShapeGeometry(roundedRectShape(w, h, r), segs);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) + w / 2) / w, v = (pos.getY(i) + h / 2) / h;
    const px = crop.x + u * crop.w, py = crop.y + (1 - v) * crop.h;
    uv.setXY(i, px / CAP_W, 1 - py / CAP_H);
  }
  uv.needsUpdate = true;
  return g;
}

// ---------- the phone ----------
// Units: 1 = 1 cm. Screen 7.2 x 15.64 (capture aspect 2428:5275). Body 7.76 x 16.2 x 0.825.
export const PHONE = { sw: 7.2, sh: 7.2 * CAP_H / CAP_W, bw: 7.76, bh: 7.2 * CAP_H / CAP_W + 0.56, d: 0.825 };

export function makePhone(screenTex, envMap, { frame = "#b8b2a8", frameRough = 0.26, glare = 0.12 } = {}) {
  const g = new THREE.Group();
  const bevel = 0.14, core = PHONE.d - bevel * 2;
  const bodyShape = roundedRectShape(PHONE.bw - bevel * 2, PHONE.bh - bevel * 2, 1.36);
  const body = new THREE.ExtrudeGeometry(bodyShape, { depth: core, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 12, curveSegments: 64 });
  body.translate(0, 0, -core / 2);
  const frameMat = new THREE.MeshPhysicalMaterial({ color: frame, metalness: 1, roughness: frameRough, envMap, envMapIntensity: 1.0, clearcoat: 0.3, clearcoatRoughness: 0.2 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: "#010102", metalness: 0, roughness: 0.08, envMap, envMapIntensity: 0.35, clearcoat: 1, clearcoatRoughness: 0.03 });
  const bodyMesh = new THREE.Mesh(body, [glassMat, frameMat]);
  g.add(bodyMesh);
  const zf = PHONE.d / 2;

  // buttons (left: action, vol+, vol-; right: side, camera control)
  const btnMat = frameMat;
  const btn = (x, y, len, depth = 0.09) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(depth * 2, len, 0.36, 4, 0.06), btnMat);
    m.position.set(x, y, 0); g.add(m);
  };
  const L = -PHONE.bw / 2, R = PHONE.bw / 2;
  btn(L, 5.0, 0.75); btn(L, 3.6, 1.3); btn(L, 2.05, 1.3); btn(R, 3.3, 1.9); btn(R, -1.8, 1.4, 0.05);

  // screen (capture has transparent rounded corners + island cut-out -> black glass shows through)
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(PHONE.sw, PHONE.sh), new THREE.MeshBasicMaterial({ map: screenTex, transparent: true, toneMapped: false }));
  screen.position.z = zf + 0.002; g.add(screen);
  // solid black behind the island cut-out so it reads as a true black pill
  const isl = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(PHONE.sw * 0.3, PHONE.sw * 0.09, PHONE.sw * 0.045), 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  isl.position.set(0, PHONE.sh / 2 - PHONE.sh * (177 / CAP_H), zf + 0.001); g.add(isl);

  // glass reflection layer: a soft diagonal studio streak, additive (keeps blacks black elsewhere)
  const glassTop = new THREE.Mesh(new THREE.ShapeGeometry(bodyShape, 48), new THREE.ShaderMaterial({
    // "screen" blend: src*(1-dst)+dst never pushes UI whites above 1.0 (so they never bloom)
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneMinusDstColorFactor, blendDst: THREE.OneFactor,
    uniforms: { uStrength: { value: glare }, uSize: { value: new THREE.Vector2(PHONE.bw, PHONE.bh) } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uStrength; uniform vec2 uSize; varying vec2 vP;
      void main(){
        vec2 p = vP / uSize + 0.5;                 // 0..1 across the glass
        float d = p.x * 0.9 + p.y * 1.0;            // diagonal coordinate
        float band = smoothstep(0.95, 1.2, d) * (1.0 - smoothstep(1.2, 1.75, d));
        float edge = smoothstep(1.55, 1.9, d) * 0.35;
        float v = (band * 0.55 + edge) * uStrength;
        gl_FragColor = vec4(vec3(v), 1.0);
      }`,
  }));
  glassTop.position.z = zf + 0.004; g.add(glassTop);
  g.userData = { screen, frameMat, glassTop, front: zf };
  return g;
}

// Soft rounded-rect shadow sprite (black with blurred alpha).
export function shadowTexture(aspect = 0.5, blur = 0.12) {
  const w = 512, h = Math.round(512 / aspect);
  return canvasTexture(w, h, (ctx) => {
    // alphaMap reads the green channel: draw white-on-black
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
    ctx.filter = `blur(${Math.round(w * blur)}px)`;
    ctx.fillStyle = "#fff";
    const m = w * blur * 1.6;
    const rr = (x, y, ww, hh, r) => { ctx.beginPath(); ctx.roundRect(x, y, ww, hh, r); ctx.fill(); };
    rr(m, m, w - 2 * m, h - 2 * m, w * 0.12);
  }, { srgb: false });
}

export function shadowMesh(w, h, { opacity = 0.5, blur = 0.12, radius = null } = {}) {
  // analytic soft shadow: rounded-rect SDF with a gaussian-ish falloff (no canvas blur dependency)
  const soft = Math.min(w, h) * blur * 2.2;
  const pw = w + soft * 4, ph = h + soft * 4;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uHalf: { value: new THREE.Vector2(w / 2, h / 2) }, uR: { value: radius ?? Math.min(w, h) * 0.12 }, uSoft: { value: soft }, uOpacity: { value: opacity } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec2 uHalf; uniform float uR, uSoft, uOpacity; varying vec2 vP;
      void main(){
        vec2 q = abs(vP) - uHalf + uR;
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uR;
        float a = 1.0 - smoothstep(-uSoft, uSoft * 1.6, d);
        a = a * a * (3.0 - 2.0 * a);
        gl_FragColor = vec4(0.0, 0.0, 0.0, a * uOpacity);
      }`,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
}

// A slab of UI lifted out of the capture: rounded card with real pixels, a thin
// light edge for thickness, and a soft shadow that can be dropped onto a surface.
export function liftedCard(tex, crop, widthUnits, { radiusPx = 64, thickness = 0.12, edge = "#e9edf5", envMap, edgeEmissive = null, edgeEmissiveIntensity = 1 } = {}) {
  const s = widthUnits / crop.w;
  const w = widthUnits, h = crop.h * s, r = radiusPx * s;
  const g = new THREE.Group();
  const face = new THREE.Mesh(roundedRectCropGeometry(w, h, r, crop, 32), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.z = thickness / 2 + 0.001; g.add(face);
  const slab = new THREE.ExtrudeGeometry(roundedRectShape(w - 0.04, h - 0.04, Math.max(r - 0.02, 0.01)), { depth: thickness - 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 4, curveSegments: 32 });
  slab.translate(0, 0, -(thickness - 0.04) / 2);
  const slabMat = new THREE.MeshPhysicalMaterial({ color: edge, roughness: 0.25, metalness: 0.0, envMap, envMapIntensity: 0.9, clearcoat: 1, clearcoatRoughness: 0.1 });
  if (edgeEmissive) { slabMat.emissive = new THREE.Color(edgeEmissive); slabMat.emissiveIntensity = edgeEmissiveIntensity; }
  g.add(new THREE.Mesh(slab, slabMat));
  // specular glass sheen on the face
  const sheen = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(w, h, r), 32), new THREE.MeshPhysicalMaterial({ color: "#000", roughness: 0.1, envMap, envMapIntensity: 0.35, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sheen.position.z = thickness / 2 + 0.003; g.add(sheen);
  g.userData = { w, h, r };
  return g;
}

export async function fontsReady(families) {
  await Promise.all(families.map((f) => document.fonts.load(f)));
  await document.fonts.ready;
}

export function deg(d) { return (d * Math.PI) / 180; }

// ---------- 3D status tokens echoing the app's icons ----------
function strokeShape(points, width) {
  // thick polyline -> closed polygon (miter joins), used for the check glyph
  const n = points.length, left = [], right = [];
  for (let i = 0; i < n; i++) {
    const p = points[i], a = points[Math.max(i - 1, 0)], b = points[Math.min(i + 1, n - 1)];
    const d = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
    let nx = -d.y, ny = d.x, scale = width / 2;
    if (i > 0 && i < n - 1) {
      const d1 = new THREE.Vector2(p.x - a.x, p.y - a.y).normalize(), d2 = new THREE.Vector2(b.x - p.x, b.y - p.y).normalize();
      const m = new THREE.Vector2(-(d1.y + d2.y), d1.x + d2.x).normalize();
      scale = width / 2 / Math.max(0.3, m.dot(new THREE.Vector2(-d1.y, d1.x)));
      nx = m.x; ny = m.y;
    }
    left.push(new THREE.Vector2(p.x + nx * scale, p.y + ny * scale));
    right.push(new THREE.Vector2(p.x - nx * scale, p.y - ny * scale));
  }
  return new THREE.Shape([...left, ...right.reverse()]);
}

export function checkToken(envMap, { r = 1.2, color = "#10B981" } = {}) {
  const g = new THREE.Group();
  const disc = new THREE.ExtrudeGeometry(new THREE.Shape().absarc(0, 0, r - 0.14, 0, Math.PI * 2), { depth: 0.3, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.14, bevelSegments: 10, curveSegments: 96 });
  disc.translate(0, 0, -0.15);
  const mat = new THREE.MeshPhysicalMaterial({ color, metalness: 0.0, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, envMap, envMapIntensity: 1.3, emissive: color, emissiveIntensity: 0.35, sheen: 0.4 });
  g.add(new THREE.Mesh(disc, mat));
  const pts = [new THREE.Vector2(-0.5, 0.02), new THREE.Vector2(-0.15, -0.34), new THREE.Vector2(0.52, 0.36)].map((v) => v.multiplyScalar(r));
  const glyph = new THREE.ExtrudeGeometry(strokeShape(pts, r * 0.2), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 6 });
  const white = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.25, clearcoat: 1, envMap, envMapIntensity: 0.8, emissive: "#ffffff", emissiveIntensity: 0.62 });
  const gm = new THREE.Mesh(glyph, white); gm.position.z = 0.29; g.add(gm);
  return g;
}

export function warnToken(envMap, { s = 2.4, color = "#F59E0B" } = {}) {
  const g = new THREE.Group();
  const h = s * Math.sqrt(3) / 2, r = s * 0.12;
  // rounded triangle
  const P = [new THREE.Vector2(0, h * 2 / 3), new THREE.Vector2(-s / 2, -h / 3), new THREE.Vector2(s / 2, -h / 3)];
  const shape = new THREE.Shape();
  for (let i = 0; i < 3; i++) {
    const p = P[i], a = P[(i + 2) % 3], b = P[(i + 1) % 3];
    const pa = a.clone().sub(p).normalize().multiplyScalar(r * 1.7), pb = b.clone().sub(p).normalize().multiplyScalar(r * 1.7);
    const s0 = p.clone().add(pa), s1 = p.clone().add(pb);
    if (i === 0) shape.moveTo(s0.x, s0.y); else shape.lineTo(s0.x, s0.y);
    shape.quadraticCurveTo(p.x, p.y, s1.x, s1.y);
  }
  shape.closePath();
  const tri = new THREE.ExtrudeGeometry(shape, { depth: 0.28, bevelEnabled: true, bevelThickness: 0.13, bevelSize: 0.12, bevelSegments: 10, curveSegments: 32 });
  tri.translate(0, 0, -0.14);
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, envMap, envMapIntensity: 1.3, emissive: color, emissiveIntensity: 0.3 });
  g.add(new THREE.Mesh(tri, mat));
  const white = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.25, clearcoat: 1, envMap, envMapIntensity: 0.8, emissive: "#ffffff", emissiveIntensity: 0.62 });
  const bar = new THREE.Mesh(new RoundedBoxGeometry(s * 0.1, s * 0.3, 0.16, 4, s * 0.045), white); bar.position.set(0, s * 0.05, 0.3); g.add(bar);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(s * 0.058, 24, 16), white); dot.position.set(0, -s * 0.19, 0.3); dot.scale.z = 0.6; g.add(dot);
  return g;
}
