import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { composeScreen, missingCapture } from "./device.js";
import { ctx, state, waitFor } from "./runtime.js";

export function createRenderer(o: { supersample?: number; z?: number } = {}): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  r.setPixelRatio(state.scale * (o.supersample ?? 1));
  r.setSize(state.W, state.H);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NoToneMapping;
  Object.assign(r.domElement.style, { position: "absolute", left: "0", top: "0", zIndex: String(o.z ?? 5) });
  state.root!.appendChild(r.domElement);
  return r;
}

export function pagePerspective(fov = 14): THREE.PerspectiveCamera {
  const W = state.W, H = state.H;
  const d = (H / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const cam = new THREE.PerspectiveCamera(fov, W / H, d * 0.2, d * 4);
  cam.position.set(W / 2, -H / 2, d);
  cam.lookAt(W / 2, -H / 2, 0);
  return cam;
}

export const at = (x: number, y: number, z = 0): THREE.Vector3 => new THREE.Vector3(x, -y, z);

export function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: new THREE.Color(0.006, 0.008, 0.014) })));
  const white = new THREE.Color(1, 0.98, 0.95), tint = new THREE.Color(0.35, 0.55, 1.0), o = new THREE.Vector3();
  const box = (w: number, h: number, pos: THREE.Vector3, color: THREE.Color, k: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(o); env.add(m);
  };
  box(26, 14, new THREE.Vector3(-14, 18, 16), white, 6);
  box(5, 40, new THREE.Vector3(22, 4, 14), white, 5);
  box(3, 34, new THREE.Vector3(-24, 0, -8), tint, 5.4);
  box(40, 10, new THREE.Vector3(0, -20, 10), tint, 1.2);
  box(10, 10, new THREE.Vector3(8, 10, 30), white, 1.8);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return tex;
}

function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`Could not load ${src}`)); i.src = src;
});

// Built at the reference scale (screen 7.2 units wide), then scaled so the screen is `width` world units wide.
export async function phone3d(o: { capture: string; width: number; finish?: "graphite" | "silver"; renderer: THREE.WebGLRenderer; envMap?: THREE.Texture; repaint?: boolean }): Promise<THREE.Group> {
  const c = ctx();
  if (c.target.platform !== "iphone" && c.target.platform !== "android-phone") throw new Error(`phone3d supports phone targets only, not ${c.target.platform}`);
  const file = c.captures.files[o.capture];
  if (!file) throw missingCapture(c, o.capture);
  if (file.fallback) state.warnings.push(`capture.fallback: "${o.capture}" for ${c.locale.code} uses ${file.url}`);
  const img = await waitFor(loadImage(file.url));
  const scr = composeScreen(img, { repaint: o.repaint });
  const screenImg = await waitFor(loadImage(scr.url));
  const tex = new THREE.Texture(screenImg);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = o.renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;

  const android = c.target.platform === "android-phone";
  const sw = 7.2, sh = (sw * scr.h) / scr.w, bw = sw + 0.56, bh = sh + 0.56, d = 0.825, bevel = 0.14, core = d - bevel * 2;
  const envMap = o.envMap ?? studioEnvironment(o.renderer);
  const frame = o.finish === "silver" ? "#d9dadd" : "#3a3c42";
  const g = new THREE.Group();
  const bodyShape = roundedRectShape(bw - bevel * 2, bh - bevel * 2, android ? 0.9 : 1.36);
  const body = new THREE.ExtrudeGeometry(bodyShape, { depth: core, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 12, curveSegments: 64 });
  body.translate(0, 0, -core / 2);
  const frameMat = new THREE.MeshPhysicalMaterial({ color: frame, metalness: 1, roughness: 0.26, envMap, envMapIntensity: 1, clearcoat: 0.3, clearcoatRoughness: 0.2 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: "#010102", metalness: 0, roughness: 0.08, envMap, envMapIntensity: 0.35, clearcoat: 1, clearcoatRoughness: 0.03 });
  g.add(new THREE.Mesh(body, [glassMat, frameMat]));
  const btn = (x: number, y: number, len: number) => { const m = new THREE.Mesh(new RoundedBoxGeometry(0.18, len, 0.36, 4, 0.06), frameMat); m.position.set(x, y, 0); g.add(m); };
  if (android) { btn(bw / 2, 3.6, 1.6); btn(bw / 2, 1.6, 1.0); }
  else { btn(-bw / 2, 5.0, 0.75); btn(-bw / 2, 3.6, 1.3); btn(-bw / 2, 2.05, 1.3); btn(bw / 2, 3.3, 1.9); }
  const screenShape = roundedRectShape(sw, sh, (scr.r / scr.w) * sw);
  const screenGeo = new THREE.ShapeGeometry(screenShape, 32);
  const pos = screenGeo.attributes.position, uv = screenGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + sw / 2) / sw, (pos.getY(i) + sh / 2) / sh);
  uv.needsUpdate = true;
  const screen = new THREE.Mesh(screenGeo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.z = d / 2 + 0.002;
  g.add(screen);
  g.scale.setScalar(o.width / sw);

  state.captures.add(file.url);
  state.devices.push({ platform: c.target.platform, capture: o.capture, statusBar: c.captures.statusBar, repaint: !!o.repaint, screen: [scr.w, scr.h] });
  return g;
}
