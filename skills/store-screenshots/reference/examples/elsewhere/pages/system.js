// Elsewhere "Last light, elsewhere": one golden-hour coastline across a strip of five screens.
// Each page is a window onto the strip: the landscape shader, the 3D camera and the postcard waves are evaluated in
// strip coordinates with a per-screen offset, so neighbouring screens join exactly at the seams.
// Layout is in the kit's 1260-wide logical stage. Words come from claims.json only (t, t.el, headline).
import * as THREE from "three";
import { headline, t } from "shotsmith/kit";

export const C = {
  gold: "#FFD7A0", apricot: "#F29A5B", coral: "#E0707A", mauve: "#A8639E", violet: "#4B4A8C",
  indigo: "#1B1E44", ink: "#120F24", cream: "#FFF6EA", sub: "rgba(255,240,226,0.92)",
};

export function el(tag, attrs = {}, parent, html) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style" && typeof v === "object") Object.assign(n.style, v);
    else n.setAttribute(k, v);
  }
  if (html != null) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
}
export function box(parent, css, html) {
  const n = el("div", {}, parent, html);
  n.style.cssText = "position:absolute;" + css;
  return n;
}

// ---------- shared geometry (logical px, strip coordinates) ----------
// iPhone (tall) and Android (p916) are two panoramas with the same story; anchors follow each stage's height.
export function geo(s) {
  const H = s.H, HORIZON = Math.round(H * 0.575);
  const TOP = s.pick({ tall: 196, p916: 150 });
  return {
    W: s.W, H, HORIZON, TOP,
    SUN: { x: 1010, y: HORIZON - 132, r: 96 },
    MOON: { x: 4 * 1260 + 960, y: Math.round(H * 0.30), r: 50 },
    // the opener's postmark; its cancellation waves run on into screen 2
    PM: { x: 1058, y: TOP + 66, r: 100 },
    size: s.pick({ tall: 150, p916: 140 }),
  };
}

// ---------- the landscape (GLSL, strip coordinates) ----------
const GLSL = `#version 300 es
precision highp float; out vec4 o;
uniform vec2 uRes; uniform float uPX, uOff, uH, uHor; uniform vec3 uSun, uMoon;
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float hash11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x),u.y); }
float fbm(vec2 p){ float a=.5, s=0.; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<6;i++){ s+=a*vnoise(p); p=m*p; a*=.5; } return s; }
float n1(float x){ float i=floor(x), f=fract(x); float u=f*f*(3.-2.*f); return mix(hash11(i),hash11(i+1.),u); }
float fbm1(float x){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n1(x); x=x*2.07+13.1; a*=.5; } return s; }
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 srgb(vec3 c){ return pow(max(c,0.), vec3(1./2.2)); }
vec3 hx(float r,float g,float b){ return lin(vec3(r,g,b)/255.); }
// evening palette per screen (index 0..4), interpolated along the strip
vec3 pal(int row, float e){
  vec3 a[5];
  if(row==0){ a[0]=hx(244.,146.,108.); a[1]=hx(246.,138.,118.); a[2]=hx(206.,112.,150.); a[3]=hx(118.,98.,168.); a[4]=hx(52.,52.,108.); }
  else if(row==1){ a[0]=hx(196.,112.,128.); a[1]=hx(150.,86.,128.); a[2]=hx(104.,70.,132.); a[3]=hx(60.,56.,118.); a[4]=hx(26.,30.,72.); }
  else { a[0]=hx(48.,36.,86.); a[1]=hx(40.,32.,82.); a[2]=hx(32.,28.,74.); a[3]=hx(22.,24.,62.); a[4]=hx(11.,13.,38.); }
  float x=clamp(e,0.,4.); int i=int(floor(min(x,3.999))); float f=smoothstep(0.,1.,x-float(i));
  vec3 c0=a[0], c1=a[1];
  if(i==1){c0=a[1];c1=a[2];} else if(i==2){c0=a[2];c1=a[3];} else if(i==3){c0=a[3];c1=a[4];}
  return mix(c0,c1,f);
}
// hill ridge height above the horizon (logical px) for layer k at strip x
float ridge(float x, float k){
  float s = x/1260.;
  float env = .15 + .85*exp(-pow((s-.18)/.33,2.)) + .75*exp(-pow((s-2.45)/.75,2.)) + 1.25*exp(-pow((s-4.35)/.7,2.));
  env *= 1. - .92*exp(-pow((s-.86)/.22,2.));            // open sea under the sun
  float amp = mix(250., 120., k/2.) * env;
  float h = fbm1(x/(420.-k*90.) + k*7.3) * 1.25 - .28;
  h += .18*fbm1(x/(90.-k*20.) + k*3.1);
  return max(h,0.)*amp + (2.-k)*6.;
}
// town lights on hill layer k at (X,Y); edge = px below that layer's ridge line
vec3 lightsAt(float X, float Y, float k, float edge, float e){
  float lights = smoothstep(.9, 3.2, e);
  if (lights <= 0.) return vec3(0.);
  float town = smoothstep(.40, .68, .7*n1(X/380. + 11.) + .3*n1(X/140. + 3.));
  vec2 g = vec2(X, Y) / vec2(11., 10.);
  vec2 gi = floor(g);
  vec2 gf = fract(g) - .5 - (vec2(hash12(gi+4.), hash12(gi+7.)) - .5)*.5;
  float shore = exp(-(uHor - Y)/(55. + 40.*k));
  float p = .11*k*lights*(.3 + town*1.4)*(.5 + shore*1.3);
  // no point lights within a few px of a seam: the seam check compares single columns, and a lit dot cut by the
  // seam reads as a step there even though the strip is continuous
  float seam = abs(X - 1260.*floor(X/1260. + .5));
  float on = step(1. - p, hash12(gi + k*31.)) * smoothstep(6., 22., edge) * smoothstep(5., 9., seam);
  float sz = .15 + .13*hash12(gi+13.);
  float dt = smoothstep(sz, sz*.25, length(gf));
  vec3 lc = mix(hx(255.,186.,112.), hx(255.,226.,170.), hash12(gi+2.));
  return lc * on * dt * (1.2 + hash12(gi+9.)) * lights + lc * .03 * lights * town * shore * k * smoothstep(10., 60., edge);
}
void main(){
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uPX;   // logical px in this screen, y down
  float X = fc.x + uOff, Y = fc.y;
  float e = X/1260. - .5;                                           // 0 at the centre of screen 1
  vec3 hor = pal(0,e), mid = pal(1,e), zen = pal(2,e);
  vec2 sd = vec2(X-uSun.x, Y-uSun.y);
  float sunNear = exp(-dot(sd,sd)/(2.*900.*900.));
  vec3 col;
  float hY = uHor;
  if (Y < hY) {
    float t = clamp((hY - Y)/hY, 0., 1.);
    col = mix(hor, mid, smoothstep(0., .45, t));
    col = mix(col, zen, smoothstep(.38, 1., t));
    col += lin(vec3(1.,.44,.30)) * .34 * exp(-dot(sd,sd)/(2.*560.*560.));
    col += lin(vec3(1.,.55,.36)) * .22 * exp(-dot(sd*vec2(.42,1.5),sd*vec2(.42,1.5))/(2.*240.*240.));
    vec2 cq = vec2(X/1150., Y/165.);
    vec2 wq = vec2(fbm(cq*1.2+1.7), fbm(cq*1.2+8.3));
    float cl = fbm(cq + wq*.9);
    float clb = fbm(cq + wq*.9 + vec2(0., .32));
    float band = smoothstep(.16,.28,t)*(1.-smoothstep(.44,.6,t)) + .6*smoothstep(.64,.7,t)*(1.-smoothstep(.76,.86,t));
    float dens = smoothstep(.5,.74,cl) * band;
    float rim = clamp((cl - clb)*5., 0., 1.);
    vec3 shade = mix(zen, mid, .55) * 1.05;
    vec3 lit = mix(mid*1.3, lin(vec3(1.,.66,.48))*1.05, clamp(sunNear*1.5 + .3*(1.-e/4.),0.,1.));
    col = mix(col, mix(shade, lit, .25 + .75*rim), dens*.8);
    float night = smoothstep(1.6, 3.8, e);
    vec2 sc = vec2(X,Y)/9.; vec2 sg = floor(sc);
    float st = step(.996, hash12(sg)) * smoothstep(.35,.9,t) * night * (1.-dens);
    col += vec3(1.,.95,.88) * st * (.2 + .8*hash12(sg+5.)) * smoothstep(.45, .05, length(fract(sc)-.5));
    vec2 md = vec2(X-uMoon.x, Y-uMoon.y); float mdl = length(md);
    col += hx(150.,160.,220.) * .10 * exp(-mdl/260.) * step(1., uMoon.z);
    col += hx(200.,205.,240.) * .18 * exp(-max(mdl-uMoon.z,0.)/22.) * step(1., uMoon.z);
    float mdisk = (1. - smoothstep(uMoon.z-1.5, uMoon.z+1.5, mdl)) * step(1., uMoon.z);
    vec3 mc = hx(246.,240.,226.) * (.9 - .16*smoothstep(.5,.75, fbm(md/38. + 2.)));
    col = mix(col, mc, mdisk);
    col += hor * .2 * exp(-(hY-Y)/70.);
    float d = length(sd);
    float disk = 1. - smoothstep(uSun.z-2., uSun.z+2., d);
    col += lin(vec3(1.,.52,.30)) * .34 * exp(-d*d/(2.*150.*150.));
    col += lin(vec3(1.,.52,.34)) * .20 * exp(-d/430.);
    vec3 dc = mix(lin(vec3(1.,.96,.88)), lin(vec3(1.,.84,.62)), pow(clamp(d/uSun.z,0.,1.),3.));
    col += lin(vec3(1.,.66,.42)) * .32 * exp(-max(d-uSun.z,0.)/16.) * (1.-disk);
    col = mix(col, dc*.97, disk);
    float strand = exp(-pow((Y - uSun.y - 38.)/9., 2.)) * smoothstep(.35,.7, fbm(vec2(X/260., 3.3)));
    strand += .7*exp(-pow((Y - uSun.y + 22.)/5., 2.)) * smoothstep(.45,.75, fbm(vec2(X/190., 9.1)));
    col = mix(col, mix(col, lin(vec3(.86,.52,.50)), .55), clamp(strand,0.,1.) * exp(-pow((X-uSun.x)/420.,2.)));
    for (int i=0;i<3;i++){
      float k = float(i);
      float r = ridge(X, k);
      float edge = r - (hY - Y);
      float m = smoothstep(-.8, .8, edge);
      if (m > 0.) {
        float depth = 1. - k/2.;
        vec3 hc = mix(mix(zen, mid, .4) * .6, hor * .72, depth*.6);
        hc += lin(vec3(1.,.58,.4)) * .35 * sunNear * depth;
        hc += hor * .22 * exp(-edge/16.) * (1.-depth*.4);
        hc = mix(hc, hor*.8, .25*exp(-(hY-Y)/40.));
        if (i > 0) hc += lightsAt(X, Y, k, edge, e);
        col = mix(col, hc, m);
      }
    }
  } else {
    float dy = Y - hY + 1.;
    float t = clamp(dy / (uH - hY), 0., 1.);
    vec3 refl = mix(hor*.92, mix(mid, zen, .55)*.6, smoothstep(0., .5, t));
    col = mix(refl, hx(22.,16.,38.), smoothstep(.3, 1., t));
    vec2 wp = vec2((X - uSun.x)/dy * 55., 9000./dy);
    mat2 rot0 = mat2(.98,.2,-.2,.98);
    float n  = fbm(wp*vec2(.05, .9));
    float n2 = fbm(rot0*(wp*vec2(.22, 3.2)) + 4.1);
    float calm = exp(-dy/500.);
    col += mix(mid, hor, .6) * .16 * smoothstep(.55, .85, n) * calm * (1. - smoothstep(400., 900., dy));
    col *= 1. + (.16*smoothstep(.3,.7,n) - .08) * calm;
    float wdt = 28. + dy * .22;
    float path = exp(-pow((X - uSun.x)/wdt, 2.));
    vec3 gc = lin(vec3(1.,.80,.56));
    float glint = smoothstep(.58, .9, n2) * (.5 + .8*smoothstep(.4,.8,n));
    mat2 rot = mat2(.96,.28,-.28,.96);
    float spark = pow(smoothstep(.62, .95, fbm(rot*(wp*vec2(.9, 9.)) + 2.7)), 3.);
    col += gc * path * (glint*1.05*exp(-dy/300.) + spark*1.5*exp(-dy/220.)) * (1. - smoothstep(260., 620., dy));
    col += gc * .30 * path * exp(-dy/180.);
    col += lin(vec3(1.,.62,.42)) * .35 * exp(-dy/45.) * exp(-pow((X-uSun.x)/560.,2.));
    for (int i=0;i<3;i++){
      float k = float(i);
      float r = ridge(X + (n2-.5)*22., k) * .92;
      float m = smoothstep(-6., 6., r - dy) * (.5 + .5*smoothstep(.2,.6,n));
      col = mix(col, mix(zen, mid, .35)*.5, .5 * m * (1.-t));
    }
    float nightS = smoothstep(.9, 3.2, e);
    if (nightS > 0. && dy < 160.) {
      float rx = X + (n2 - .5) * 7.;
      vec3 rl = vec3(0.);
      for (int j=1;j<3;j++){ float k = float(j);
        for (int s2=0;s2<3;s2++){ float my = uHor - (dy * .8 + float(s2) * 3.5);
          float ed = ridge(rx, k) - (uHor - my);
          if (ed > 0.) rl += lightsAt(rx, my, k, ed, e) / 3.; } }
      col += rl * .55 * exp(-dy/90.) * (.6 + .4*smoothstep(.3,.7,n2));
    }
    float mw = 14. + dy * .16;
    float mpath = exp(-pow((X - uMoon.x)/mw, 2.)) * step(1., uMoon.z);
    col += hx(214.,222.,255.) * mpath * (smoothstep(.6, .9, n2)*.55*exp(-dy/260.) + .12*exp(-dy/120.));
    col += hor * .45 * exp(-dy/3.);
  }
  col += lin(vec3(1.,.62,.42)) * .05 * exp(-length(sd)/700.);
  float vy = Y/uH;
  col *= mix(1., .5, smoothstep(.70, 1., vy));
  col *= mix(.8, 1., smoothstep(0., .22, vy));
  vec3 s = srgb(col);
  float g = hash12(fc*uPX*1.37+17.7) + hash12(fc*uPX*.71+3.1) - 1.;
  s += g*.018 + (hash12(fc*uPX+.5) + hash12(fc*uPX*1.9+7.) - 1.)/255.;
  o = vec4(s, 1.);
}`;

export function landscape(s, slice, { z = 0 } = {}) {
  const G = geo(s), BW = s.target.w, BH = s.target.h;
  const cvs = el("canvas", { width: BW, height: BH }, s.root);
  cvs.style.cssText = `position:absolute;left:0;top:0;width:${s.W}px;height:${s.H}px;z-index:${z}`;
  const gl = cvs.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false });
  const mk = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const prog = gl.createProgram();
  gl.attachShader(prog, mk(gl.VERTEX_SHADER, `#version 300 es
  in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`));
  gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, GLSL));
  gl.bindAttribLocation(prog, 0, "a"); gl.linkProgram(prog); gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);
  gl.uniform2f(U("uRes"), BW, BH); gl.uniform1f(U("uPX"), s.scale); gl.uniform1f(U("uOff"), slice * s.W);
  gl.uniform1f(U("uH"), s.H); gl.uniform1f(U("uHor"), G.HORIZON);
  gl.uniform3f(U("uSun"), G.SUN.x, G.SUN.y, G.SUN.r); gl.uniform3f(U("uMoon"), G.MOON.x, G.MOON.y, G.MOON.r);
  gl.viewport(0, 0, BW, BH); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.finish();
  return cvs;
}

// ---------- three.js ----------
// Perspective camera where 1 world unit = 1 logical px at z = 0, looking at this screen of the strip.
// World x runs along the strip, world y = -page y. Tight near/far: no z-fighting on the tile decals.
export function stripCamera(s, slice, fov = 14) {
  const d = (s.H / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const cam = new THREE.PerspectiveCamera(fov, s.W / s.H, d * 0.5, d * 2);
  const cx = slice * s.W + s.W / 2;
  cam.position.set(cx, -s.H / 2, d); cam.lookAt(cx, -s.H / 2, 0);
  return cam;
}
// Dusk studio: a low warm sun to the right, mauve sky above, a coral rim, dark sea below.
export function warmEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: new THREE.Color(0.03, 0.02, 0.06) })));
  const add = (w, h, pos, color, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(0, 0, 0); env.add(m); };
  add(30, 12, new THREE.Vector3(18, 6, 14), "#ffc38a", 5);
  add(40, 8, new THREE.Vector3(0, 24, 8), "#8f6fb8", 1.6);
  add(6, 36, new THREE.Vector3(-24, 0, 6), "#e0707a", 2.2);
  add(40, 10, new THREE.Vector3(0, -22, 10), "#2a2050", 1.0);
  add(12, 12, new THREE.Vector3(4, 8, 30), "#fff1dc", 1.4);
  const pm = new THREE.PMREMGenerator(renderer); const rt = pm.fromScene(env, 0.02); pm.dispose();
  return rt.texture;
}
export async function svgTexture(svg, size = 512) {
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement("canvas"); c.width = c.height = size;
  c.getContext("2d").drawImage(img, 0, 0, size, size);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}
export function glowSprite(color, size, a = 1) {
  const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d");
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (let i = 0; i <= 16; i++) { const f = i / 16; g.addColorStop(f, `rgba(255,255,255,${Math.exp(-f * f * 6) * (1 - f)})`); }
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color, transparent: true, opacity: a, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  sp.scale.set(size, size, 1); return sp;
}

// ---------- line icons (64 grid) ----------
const LS = (sw) => `fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
export const ICONS = {
  plane: (sw) => `<g ${LS(sw)}><path d="M29 8c1.6-2.6 4.4-2.6 6 0 .6 1 .9 2.2.9 3.4V25l19 11v5.5L36 36v11l6 4.5V56l-10-3-10 3v-4.5l6-4.5V36L9 41.5V36l19-11V11.4c0-1.2.4-2.4 1-3.4z"/></g>`,
  clock: (sw) => `<g ${LS(sw)}><circle cx="32" cy="32" r="24"/><path d="M32 18v14l9 6"/></g>`,
  list: (sw) => `<g ${LS(sw)}><rect x="12" y="8" width="40" height="48" rx="7"/><path d="M21 22h22M21 32h22M21 42h14"/></g>`,
  calendar: (sw) => `<g ${LS(sw)}><rect x="8" y="12" width="48" height="42" rx="7"/><path d="M8 26h48M21 6v11M43 6v11"/><path d="M19 38h6M31 38h6M43 38h2"/></g>`,
  bookmark: (sw) => `<g ${LS(sw)}><path d="M17 8h30a3 3 0 0 1 3 3v45L32 44 14 56V11a3 3 0 0 1 3-3z"/></g>`,
  pin: (sw) => `<g ${LS(sw)}><path d="M32 56s18-17 18-30a18 18 0 0 0-36 0c0 13 18 30 18 30z"/><circle cx="32" cy="26" r="6.5"/></g>`,
};
export function icon(k, { size = 64, color = C.cream, sw = 4.4 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" style="display:block">${ICONS[k](sw).replaceAll("currentColor", color)}</svg>`;
}

// ---------- type ----------
// A soft dusk halo under type on the sky: it keeps large text above 3:1 where the coral glow is brightest.
// It follows the glyphs, so it never reaches a seam.
export const HALO = "text-shadow:0 2px 28px rgba(44,14,52,.42),0 1px 6px rgba(44,14,52,.22)";
const EYEBROW = `font:700 34px/1 var(--font-text);letter-spacing:.34em;color:${C.gold};text-transform:uppercase;white-space:nowrap;${HALO}`;
export function eyebrow(s, id, { left, top, align = "left" }) {
  const e = t.el("div", id, s.root);
  // tracking adds space after the last letter; pad the other side so centred and right-aligned eyebrows stay true
  const pad = align === "left" ? "" : align === "center" ? "padding-left:.34em;" : "margin-right:-.34em;";
  const pos = align === "left" ? `left:${left}px;` : `left:70px;width:${s.W - 140}px;text-align:${align};`;
  e.style.cssText = `position:absolute;${pos}top:${top}px;z-index:40;${EYEBROW};${pad}`;
  return e;
}

// The headline's last line in Fraunces italic, sun gold: the postcard's handwritten second voice.
// The claim's own line break decides the lines, so the text stays exactly the claim.
export function accentLast(h) {
  const nodes = [...h.childNodes];
  const i = nodes.findLastIndex((n) => n.nodeName === "BR");
  if (i < 0) return;
  const span = el("span", {}, null);
  span.style.cssText = `font-family:var(--font-accent);font-weight:420;color:${C.gold};font-variation-settings:"opsz" 144,"SOFT" 100,"WONK" 1`;
  for (const n of nodes.slice(i + 1)) span.appendChild(n);
  h.appendChild(span);
}

// Headline block: eyebrow, serif headline (line 2 italic gold), optional subline; align left | center | right.
// Every screen puts its eyebrow at the same height and its headline at the same size.
export async function title(s, { eyebrow: eb, id, sub, align = "left" }) {
  const G = geo(s), side = 96;
  eyebrow(s, eb, { left: side + 4, top: G.TOP, align });
  const left = align === "left" ? side : 70, width = align === "center" ? s.W - 140 : s.W - side - 70;
  const h = box(s.root, `left:${left}px;top:${G.TOP + 70}px;width:${width}px;z-index:40;text-align:${align};color:${C.cream};` +
    `font-family:var(--font-display);font-weight:560;letter-spacing:-0.02em;${HALO};font-variation-settings:"opsz" 144,"SOFT" 60,"WONK" 0`);
  const fit = await headline(h, id, { maxSize: G.size, maxLines: 2, lineHeight: 1.0 });
  accentLast(h);
  let bottom = fit.bottom;
  if (sub) {
    const p = t.el("div", sub, s.root);
    p.style.cssText = `position:absolute;left:${left}px;top:${fit.bottom + 30}px;width:${width}px;z-index:40;text-align:${align};` +
      `font:400 ${s.pick({ tall: 50, p916: 46 })}px/1.3 var(--font-text);letter-spacing:-0.005em;color:${C.sub};${HALO}`;
    bottom = p.getBoundingClientRect().bottom / s.scale;
  }
  return { h, fit, bottom };
}

// ---------- postcard cancellation waves ----------
// Drawn in strip coordinates, so the opener's waves run on into screen 2 and fade out there.
export function wavePaths(G, x0, x1) {
  let paths = "";
  for (let i = 0; i < 4; i++) {
    const y = G.PM.y - 42 + i * 28;
    let d = `M ${x0} ${y}`;
    for (let x = x0; x < x1; x += 36) d += " q 9 -9 18 0 t 18 0";
    paths += `<path d="${d}" stroke-width="3"/>`;
  }
  return paths;
}
export function waves(s, slice, { fadeTo, opacity = 0.55 }) {
  const G = geo(s), off = slice * s.W, x0 = G.PM.x + G.PM.r + 14;
  // The fade is a CSS gradient mask on the layer, which needs no <mask> element inside the SVG.
  const fade = `linear-gradient(to right, #000 0, transparent ${fadeTo - off}px)`;
  box(s.root, `left:0;top:0;width:${s.W}px;height:${s.H}px;z-index:30;opacity:${opacity};-webkit-mask-image:${fade};mask-image:${fade}`,
    `<svg width="${s.W}" height="${s.H}" viewBox="${off} 0 ${s.W} ${s.H}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="${C.gold}">${wavePaths(G, x0, fadeTo)}</svg>`);
}

// ---------- light and shadow ----------
// A soft colored pool behind a phone. closest-side reaches zero at the box's edges, so the pool stays inside its own
// screen and never makes a step at a seam.
export function pool(s, { top, height, rgb, a, z = 5 }) {
  return box(s.root, `left:0;top:${top}px;width:${s.W}px;height:${height}px;z-index:${z};` +
    `background:radial-gradient(closest-side, rgba(${rgb},${a}), rgba(${rgb},0) 100%)`);
}
// The trial's layered dusk shadow for a lifted card of height h (logical px), with a thin light rim.
export function cardShadow(h, a = 0.5, spread = 1) {
  return `0 ${h * 0.28 * spread}px ${h * 0.5 * spread}px -${h * 0.12 * spread}px rgba(40,14,40,${a}), ` +
    `0 ${h * 0.08 * spread}px ${h * 0.14 * spread}px -${h * 0.04 * spread}px rgba(40,14,40,${a * 0.8}), 0 0 0 1.5px rgba(255,255,255,0.35)`;
}
