// three.js building blocks for e-flighty: transparent supersampled layer over the atmosphere canvas,
// dotted globe from the app's own map mask, glowing server pins + query arcs, contour-line terrain.
// Adapted from a-three/lib.js + a-three/globe.js. Glows are additive sprites (no bloom pass, so
// nothing white ever blows out); the transparent canvas composites additively over the backdrop.
import * as THREE from "three";
import { W, H, PX, el } from "./system.js";

export function layer(stage, { z = 2, pr = 2 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(pr * PX);
  renderer.setSize(W, H);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.domElement.className = "bg";
  renderer.domElement.style.zIndex = z;
  stage.appendChild(renderer.domElement);
  return renderer;
}

// Pixel-space orthographic camera: world x = px, world y = -px (y down on the page).
export function pixelCamera() {
  const cam = new THREE.OrthographicCamera(0, W, 0, -H, -10000, 10000);
  cam.position.set(0, 0, 5000);
  return cam;
}

export const SERVERS = [
  ["Dallas", 32.8, -96.8], ["New York", 40.7, -74.0], ["Ashburn", 39.0, -77.5], ["Toronto", 43.7, -79.4],
  ["São Paulo", -23.5, -46.6], ["London", 51.5, -0.1], ["Paris", 48.9, 2.35], ["Amsterdam", 52.4, 4.9],
  ["Frankfurt", 50.1, 8.7], ["Zurich", 47.4, 8.5], ["Milan", 45.5, 9.2], ["Vienna", 48.2, 16.4],
  ["Warsaw", 52.2, 21.0], ["Stockholm", 59.3, 18.1], ["Madrid", 40.4, -3.7], ["Athens", 38.0, 23.7],
  ["Istanbul", 41.0, 29.0], ["Bucharest", 44.4, 26.1], ["Cairo", 30.0, 31.2], ["Dubai", 25.2, 55.3],
  ["Mumbai", 19.1, 72.9], ["Singapore", 1.35, 103.8], ["Jakarta", -6.2, 106.8],
];

export function latLon(lat, lon, r = 1) {
  const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo));
}

export async function loadMask(url = "/inputs/landmask.png") {
  const t = await new THREE.TextureLoader().loadAsync(url);
  t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

// Pure additive onto a transparent canvas: rgb adds, alpha untouched, so the browser composites
// the glow additively over the atmosphere canvas underneath.
export function additive(m) {
  m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
  m.transparent = true; m.depthWrite = false;
  return m;
}

// Soft radial sprite texture (for glows).
let _glowTex = null;
export function glowTex() {
  if (_glowTex) return _glowTex;
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (let i = 0; i <= 16; i++) { const t = i / 16; g.addColorStop(t, `rgba(255,255,255,${Math.exp(-t * t * 7) * (1 - t)})`); }
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}
export function glow(color, size, intensity = 1) {
  const m = additive(new THREE.ShaderMaterial({ depthTest: false,
    uniforms: { uC: { value: new THREE.Color(color).multiplyScalar(intensity) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.,0.,0.,1.);
      vec2 sc = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz)); mv.xy += position.xy * sc; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uC; varying vec2 vUv; void main(){ float r = length(vUv - .5) * 2.; float a = exp(-r*r*5.) * (1. - smoothstep(.8, 1., r)); gl_FragColor = vec4(uC * a, 0.); }` }));
  const s = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); s.scale.set(size, size, 1); s.renderOrder = 10; return s;
}

// Dotted globe. pal: { body, land, sea, rim, atmo } hex strings.
export function globe(mask, { R = 500, center = [30, 10], step = 1.6, pal, lightDir = [-0.4, 0.7, 0.6], hub = "Frankfurt", arcsTo = null, arcA, arcB, pinColor, arcWidth = 1, arcLift = 0.28, pinSize = 1, atmoStrength = 1, pins = true, arcs = true } = {}) {
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.rotation.order = "XYZ";
  g.rotation.set(THREE.MathUtils.degToRad(center[0]), THREE.MathUtils.degToRad(-center[1]), 0);
  root.add(g);
  const col = (h) => new THREE.Color(h);
  const sphereMat = new THREE.ShaderMaterial({
    uniforms: { uMask: { value: mask }, uLight: { value: new THREE.Vector3(...lightDir).normalize() }, uStep: { value: step },
      uBody: { value: col(pal.body) }, uLand: { value: col(pal.land) }, uSea: { value: col(pal.sea) }, uRim: { value: col(pal.rim) } },
    vertexShader: `varying vec3 vObj; varying vec3 vN; varying vec3 vV;
      void main(){ vObj = normalize(position); vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vV = projectionMatrix[3][3] > 0.5 ? vec3(0.,0.,1.) : normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uMask; uniform vec3 uLight, uBody, uLand, uSea, uRim; uniform float uStep; varying vec3 vObj; varying vec3 vN; varying vec3 vV;
      void main(){
        float lat = degrees(asin(clamp(vObj.y, -1.0, 1.0)));
        vec2 xz = vObj.xz; if (dot(xz, xz) < 1e-7) xz = vec2(0.0, 1.0);
        float lon = degrees(atan(xz.x, xz.y));
        float row = floor((lat + 90.0) / uStep);
        float latc = -90.0 + (row + 0.5) * uStep;
        float n = max(1.0, floor(360.0 * cos(radians(latc)) / uStep));
        float sp = 360.0 / n;
        float colI = floor((lon + 180.0) / sp);
        float lonc = -180.0 + (colI + 0.5) * sp;
        vec2 dd = vec2((lon - lonc) * cos(radians(lat)), lat - latc) / uStep;
        float d = length(dd);
        float aa = fwidth(d) * 1.1;
        float land = texture2D(uMask, vec2((lonc + 180.0) / 360.0, (latc + 90.0) / 180.0)).r;
        land = smoothstep(0.35, 0.65, land);
        float dotR = mix(0.17, 0.33, land);
        float dotA = 1.0 - smoothstep(dotR - aa, dotR + aa, d);
        vec3 N = normalize(vN);
        float ndl = dot(N, normalize((viewMatrix * vec4(uLight, 0.0)).xyz));
        float lit = 0.18 + 1.0 * smoothstep(-0.4, 0.95, ndl);
        float facing = clamp(dot(N, normalize(vV)), 0.0, 1.0);
        vec3 c = uBody * (0.55 + 0.45 * lit);
        c += dotA * mix(uSea * 0.5, uLand, land) * lit;
        float rim = pow(1.0 - facing, 2.6);
        c += uRim * rim * 0.9;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  sphereMat.extensions = { derivatives: true };
  g.add(new THREE.Mesh(new THREE.SphereGeometry(R, 192, 144), sphereMat));

  // atmosphere halo (additive, back side)
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.16, 128, 96), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uC: { value: col(pal.atmo).multiplyScalar(atmoStrength) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0);
      vV = projectionMatrix[3][3] > 0.5 ? vec3(0.,0.,1.) : normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main(){
        float f = clamp(dot(-normalize(vN), normalize(vV)), 0.0, 1.0);
        float glow = pow(smoothstep(0.0, 0.5, f), 3.0);
        gl_FragColor = vec4(uC * glow, 0.0); }`,
  }));
  additive(atmo.material);
  root.add(atmo);

  // pins + arcs
  const byName = {};
  const pc = col(pinColor || pal.land);
  for (const [name, lat, lon] of SERVERS) {
    const p = latLon(lat, lon, R);
    byName[name] = p;
    if (!pins) continue;
    const core = new THREE.Mesh(new THREE.SphereGeometry(R * 0.009 * pinSize, 16, 12), new THREE.MeshBasicMaterial({ color: pc.clone().lerp(new THREE.Color(1, 1, 1), 0.55) }));
    core.position.copy(p.clone().multiplyScalar(1.002)); g.add(core);
    const ring = new THREE.Mesh(new THREE.RingGeometry(R * 0.017 * pinSize, R * 0.022 * pinSize, 48), new THREE.MeshBasicMaterial({ color: pc, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.copy(p.clone().multiplyScalar(1.003)); ring.lookAt(p.clone().multiplyScalar(2)); g.add(ring);
    const facing = p.clone().applyEuler(g.rotation).z / R;
    if (facing > 0.08) { const gl = glow(pc, R * 0.14 * pinSize, 0.8 * Math.min(1, facing * 2.5)); gl.position.copy(p.clone().multiplyScalar(1.01)); g.add(gl); }
  }
  const hubP = byName[hub];
  const targets = arcsTo || SERVERS.map((s) => s[0]).filter((n) => n !== hub);
  const cA = col(arcA || pal.rim), cB = col(arcB || pal.land);
  for (const name of (arcs ? targets : [])) {
    const t = byName[name];
    const ang = hubP.angleTo(t);
    const mid = hubP.clone().add(t).normalize().multiplyScalar(R * (1.0 + 0.06 + ang * arcLift));
    const curve = new THREE.QuadraticBezierCurve3(hubP.clone(), mid, t.clone());
    const geo = new THREE.TubeGeometry(curve, 120, R * 0.0032 * arcWidth, 8, false);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: cA }, uB: { value: cB } },
      vertexShader: `varying float vT; void main(){ vT = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uA, uB; varying float vT; void main(){
          float fade = smoothstep(0.0, 0.15, vT) * (0.35 + 0.65 * vT);
          vec3 c = mix(uA, uB, vT) * (0.55 + 0.9 * pow(vT, 2.0));
          gl_FragColor = vec4(c * fade, 0.0); }`,
    });
    additive(mat);
    g.add(new THREE.Mesh(geo, mat));
  }
  if (arcs) { const hubG = glow(cB, R * 0.3, hubP.clone().applyEuler(g.rotation).z > 0 ? 1.2 : 0); hubG.position.copy(hubP.clone().multiplyScalar(1.01)); g.add(hubG); }
  root.userData = { spin: g, byName };
  return root;
}

// ---------- studio lighting (softboxes -> PMREM), from a-three/lib.js ----------
export function studioEnvironment(renderer, { key = 6, rim = 9, fill = 1.2, tint = new THREE.Color(0.45, 0.35, 1.0) } = {}) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: new THREE.Color(0.01, 0.008, 0.02) })));
  const box = (w, h, pos, color, intensity) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(0, 0, 0); env.add(m);
  };
  const white = new THREE.Color(1, 0.98, 0.96);
  box(26, 14, new THREE.Vector3(-14, 18, 16), white, key);
  box(5, 40, new THREE.Vector3(22, 4, 14), white, rim * 0.55);
  box(3, 34, new THREE.Vector3(-24, 0, -8), tint, rim * 0.6);
  box(40, 10, new THREE.Vector3(0, -20, 10), tint, fill);
  box(10, 10, new THREE.Vector3(8, 10, 30), white, fill * 1.5);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.02);
  pmrem.dispose();
  return rt.texture;
}

// Perspective camera where the z=0 plane maps 1 unit = 1 page px (x right, y up = -page y).
export function pagePerspective(fov = 14) {
  const cam = new THREE.PerspectiveCamera(fov, W / H, 10, 100000);
  const d = (H / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  cam.position.set(W / 2, -H / 2, d);
  cam.lookAt(W / 2, -H / 2, 0);
  return cam;
}

export async function svgTexture(svg, size = 512) {
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement("canvas"); c.width = c.height = size;
  c.getContext("2d").drawImage(img, 0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
