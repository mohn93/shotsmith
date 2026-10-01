// Dot-matrix globe whose land mask was reprojected from the app's own propagation map
// (an equirectangular land/water image at inputs/landmask.png), with glowing server pins and propagation arcs.
import * as THREE from "three";

export const SERVERS = [
  ["Dallas", 32.8, -96.8], ["New York", 40.7, -74.0], ["Ashburn", 39.0, -77.5], ["Toronto", 43.7, -79.4],
  ["São Paulo", -23.5, -46.6], ["London", 51.5, -0.1], ["Paris", 48.9, 2.35], ["Amsterdam", 52.4, 4.9],
  ["Frankfurt", 50.1, 8.7], ["Zurich", 47.4, 8.5], ["Milan", 45.5, 9.2], ["Vienna", 48.2, 16.4],
  ["Warsaw", 52.2, 21.0], ["Stockholm", 59.3, 18.1], ["Madrid", 40.4, -3.7], ["Athens", 38.0, 23.7],
  ["Istanbul", 41.0, 29.0], ["Bucharest", 44.4, 26.1], ["Cairo", 30.0, 31.2], ["Dubai", 25.2, 55.3],
  ["Mumbai", 19.1, 72.9], ["Singapore", 1.35, 103.8], ["Jakarta", -6.2, 106.8],
];

export function latLonToVec(lat, lon, r = 1) {
  const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo));
}

const SKIP = new Set((new URLSearchParams(location.search).get('skip') || '').split(','));
export function makeGlobe(mask, { R = 6, center = [22, 8], hub = "Frankfurt", arcsTo = null, lightDir = new THREE.Vector3(-0.5, 0.6, 0.65) } = {}) {
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.rotation.order = "XYZ";
  g.rotation.set(THREE.MathUtils.degToRad(center[0]), THREE.MathUtils.degToRad(-center[1]), 0);
  root.add(g);

  mask.colorSpace = THREE.NoColorSpace;
  mask.minFilter = THREE.LinearFilter; mask.generateMipmaps = false;

  // --- sphere with procedural dot grid ---
  const sphereMat = new THREE.ShaderMaterial({
    uniforms: { uMask: { value: mask }, uLight: { value: lightDir.clone().normalize() }, uStep: { value: 1.5 } },
    vertexShader: `varying vec3 vObj; varying vec3 vN; varying vec3 vV;
      void main(){ vObj = normalize(position); vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uMask; uniform vec3 uLight; uniform float uStep; varying vec3 vObj; varying vec3 vN; varying vec3 vV;
      const float PI = 3.14159265;
      void main(){
        float lat = degrees(asin(clamp(vObj.y, -1.0, 1.0)));
        vec2 xz = vObj.xz; if (dot(xz, xz) < 1e-7) xz = vec2(0.0, 1.0);
        float lon = degrees(atan(xz.x, xz.y));
        float row = floor((lat + 90.0) / uStep);
        float latc = -90.0 + (row + 0.5) * uStep;
        float n = max(1.0, floor(360.0 * cos(radians(latc)) / uStep));
        float sp = 360.0 / n;
        float col = floor((lon + 180.0) / sp);
        float lonc = -180.0 + (col + 0.5) * sp;
        vec2 dd = vec2((lon - lonc) * cos(radians(lat)), lat - latc) / uStep;
        float d = length(dd);
        float aa = fwidth(d) * 1.2;
        float land = texture2D(uMask, vec2((lonc + 180.0) / 360.0, (latc + 90.0) / 180.0)).r;
        land = smoothstep(0.35, 0.65, land);
        float dotR = mix(0.2, 0.34, land);
        float dotA = 1.0 - smoothstep(dotR - aa, dotR + aa, d);
        float ndl = dot(normalize(vN), normalize((viewMatrix * vec4(uLight, 0.0)).xyz));
        float lit = 0.25 + 0.95 * smoothstep(-0.35, 0.9, ndl);
        float facing = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
        vec3 base = mix(vec3(0.004, 0.009, 0.03), vec3(0.012, 0.03, 0.09), lit * 0.8);
        vec3 landCol = mix(vec3(0.14, 0.28, 0.85), vec3(0.55, 0.70, 0.98), smoothstep(0.3, 1.1, lit)) * (0.22 + 0.62 * lit);
        vec3 seaCol = vec3(0.07, 0.13, 0.35) * lit;
        vec3 c = base + dotA * mix(seaCol * 0.35, landCol, land);
        float rim = pow(1.0 - facing, 3.0);
        c += vec3(0.15, 0.35, 1.0) * rim * 0.9;
        c = (c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0) ? min(c, vec3(8.0)) : vec3(0.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  sphereMat.extensions = { derivatives: true };
  if (!SKIP.has('sphere')) g.add(new THREE.Mesh(new THREE.SphereGeometry(R, 160, 120), sphereMat));

  // --- atmosphere ---
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.14, 96, 64), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { uR: { value: R } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){
        float f = clamp(dot(-normalize(vN), normalize(vV)), 0.0, 1.0);  // 0 at outer edge, ~0.48 at globe limb
        float glow = pow(smoothstep(0.0, 0.5, f), 2.6);
        gl_FragColor = vec4(vec3(0.12, 0.34, 1.0) * glow * 0.85, 1.0);
      }`,
  }));
  if (!SKIP.has('atmo')) root.add(atmo);

  // --- pins ---
  const green = new THREE.Color("#10B981");
  const pinCore = new THREE.MeshBasicMaterial({ color: green.clone().multiplyScalar(5.5) });
  const ringMat = new THREE.MeshBasicMaterial({ color: green.clone().multiplyScalar(1.4), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { uC: { value: new THREE.Color("#34d399").multiplyScalar(1.6) } },
    vertexShader: `varying float vH; void main(){ vH = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uC; varying float vH; void main(){ gl_FragColor = vec4(uC * pow(clamp(1.0 - vH, 0.0, 1.0), 1.6), 1.0); }`,
  });
  const byName = {};
  for (const [name, lat, lon] of SERVERS) {
    const p = latLonToVec(lat, lon, R);
    const n = p.clone().normalize();
    const pin = new THREE.Group();
    pin.position.copy(p);
    pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    const core = new THREE.Mesh(new THREE.SphereGeometry(R * 0.012, 16, 12), pinCore); pin.add(core);
    const ring = new THREE.Mesh(new THREE.RingGeometry(R * 0.02, R * 0.027, 48), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = R * 0.002; pin.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.004, R * 0.004, R * 0.16, 12, 1, true), beamMat);
    beam.position.y = R * 0.08; pin.add(beam);
    if (!SKIP.has('pins')) g.add(pin);
    byName[name] = { lat, lon, p };
  }

  // --- propagation arcs from the hub ---
  const hubP = byName[hub].p;
  const targets = arcsTo || SERVERS.map((s) => s[0]).filter((n) => n !== hub);
  for (const name of targets) {
    const t = byName[name].p;
    const ang = hubP.angleTo(t);
    const mid = hubP.clone().add(t).normalize().multiplyScalar(R * (1.0 + 0.1 + ang * 0.28));
    const curve = new THREE.QuadraticBezierCurve3(hubP.clone().multiplyScalar(1.001), mid, t.clone().multiplyScalar(1.001));
    const geo = new THREE.TubeGeometry(curve, 96, R * 0.0036, 8, false);
    const mat = new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { uA: { value: new THREE.Color("#3b82f6") }, uB: { value: new THREE.Color("#5eead4") } },
      vertexShader: `varying float vT; void main(){ vT = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uA, uB; varying float vT; void main(){
          float fade = smoothstep(0.0, 0.12, vT) * (0.35 + 0.65 * vT);
          vec3 c = mix(uA, uB, vT) * (0.6 + 1.9 * pow(clamp(vT, 0.0, 1.0), 3.0));
          gl_FragColor = vec4(c * fade, 1.0); }`,
    });
    if (!SKIP.has('arcs')) g.add(new THREE.Mesh(geo, mat));
  }
  // hub marker: brighter, blue
  const hubMesh = new THREE.Mesh(new THREE.SphereGeometry(R * 0.02, 20, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color("#60a5fa").multiplyScalar(6) }));
  hubMesh.position.copy(hubP); g.add(hubMesh);

  root.userData = { spin: g };
  return root;
}
