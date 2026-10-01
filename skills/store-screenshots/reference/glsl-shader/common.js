// Shared building blocks for the b-glsl screenshot set.
// Layers: Canvas2D "ui" (device + type) -> uploaded as texture -> one WebGL2 composite
// pass that draws the shader background, god rays, ui, per-screen effects, grain + dither.
export const W = 1260, H = 2736;
export const CAP_W = 2428, CAP_H = 5275, CAP_R = 408; // capture corner radius (px)

export const loadImg = (src) => new Promise((res, rej) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src;
});

export async function loadFonts() {
  const faces = [
    ["Inter", "/fonts/Inter-Regular.ttf", "400"],
    ["Inter", "/fonts/Inter-Bold.ttf", "700"],
    ["Inter", "/fonts/Inter-ExtraBold.ttf", "800"],
  ];
  await Promise.all(faces.map(async ([f, u, w]) => {
    const ff = new FontFace(f, `url(${u})`, { weight: w }); await ff.load(); document.fonts.add(ff);
  }));
}

export function canvas(w = W, h = H) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}

export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}

// Device geometry for a given screen width. Returns rects used by the shader too.
export function deviceGeom(x, y, screenW) {
  const s = screenW / CAP_W;
  const b = Math.round(screenW * 0.03); // bezel
  const sr = CAP_R * s;
  return {
    s, b, x, y, screenW, screenH: CAP_H * s,
    ox: x - b, oy: y - b, ow: screenW + 2 * b, oh: CAP_H * s + 2 * b, or: sr + b,
    sr,
  };
}

// Flat device with a thin dark titanium bezel drawn by hand.
export function drawDevice(ctx, img, g, opts = {}) {
  const { ox, oy, ow, oh, or, x, y, screenW, screenH, sr, b } = g;
  ctx.save();
  // soft contact shadow
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 90; ctx.shadowOffsetY = 40;
  rr(ctx, ox, oy, ow, oh, or); ctx.fillStyle = "#0b0d12"; ctx.fill();
  ctx.restore();
  // frame body
  ctx.save();
  const fg = ctx.createLinearGradient(ox, oy, ox + ow, oy + oh);
  fg.addColorStop(0, "#3a4150"); fg.addColorStop(0.18, "#1a1e27"); fg.addColorStop(0.55, "#0e1117");
  fg.addColorStop(0.85, "#1c212b"); fg.addColorStop(1, "#2f3542");
  rr(ctx, ox, oy, ow, oh, or); ctx.fillStyle = fg; ctx.fill();
  // outer rim highlight
  const rg = ctx.createLinearGradient(ox, oy, ox + ow * 0.6, oy + oh * 0.6);
  rg.addColorStop(0, "rgba(200,215,255,0.75)"); rg.addColorStop(0.25, "rgba(140,160,210,0.18)");
  rg.addColorStop(0.7, "rgba(255,255,255,0.05)"); rg.addColorStop(1, "rgba(150,170,230,0.35)");
  ctx.lineWidth = 2.5; rr(ctx, ox + 1.25, oy + 1.25, ow - 2.5, oh - 2.5, or - 1.25); ctx.strokeStyle = rg; ctx.stroke();
  // inner black glass edge
  rr(ctx, x - b * 0.42, y - b * 0.42, screenW + b * 0.84, screenH + b * 0.84, sr + b * 0.42);
  ctx.fillStyle = "#020305"; ctx.fill();
  // screen
  rr(ctx, x, y, screenW, screenH, sr); ctx.fillStyle = "#000"; ctx.fill();
  ctx.save(); rr(ctx, x, y, screenW, screenH, sr); ctx.clip();
  ctx.drawImage(img, x, y, screenW, screenH);
  // glass sheen: very faint diagonal
  const sh = ctx.createLinearGradient(x, y, x + screenW, y + screenH * 0.5);
  sh.addColorStop(0, "rgba(255,255,255,0.07)"); sh.addColorStop(0.35, "rgba(255,255,255,0.0)");
  ctx.fillStyle = sh; ctx.fillRect(x, y, screenW, screenH);
  ctx.restore();
  // side buttons
  ctx.fillStyle = "#1b2029";
  const bw = 7;
  rr(ctx, ox - bw + 1, oy + oh * 0.13, bw, oh * 0.035, 3); ctx.fill();
  rr(ctx, ox - bw + 1, oy + oh * 0.19, bw, oh * 0.06, 3); ctx.fill();
  rr(ctx, ox - bw + 1, oy + oh * 0.265, bw, oh * 0.06, 3); ctx.fill();
  rr(ctx, ox + ow - 1, oy + oh * 0.21, bw, oh * 0.09, 3); ctx.fill();
  ctx.restore();
}

// Silhouette mask of the device (white on black) for god rays / glow.
export function deviceMask(g, scale = 0.25, blur = 0) {
  const c = canvas(Math.round(W * scale), Math.round(H * scale));
  const x = c.getContext("2d");
  x.fillStyle = "#000"; x.fillRect(0, 0, c.width, c.height);
  x.scale(scale, scale);
  if (blur) x.filter = `blur(${blur}px)`;
  rr(x, g.ox, g.oy, g.ow, g.oh, g.or); x.fillStyle = "#fff"; x.fill();
  return c;
}

export function headline(ctx, lines, { y, size = 124, lh = 1.04, sub, subSize = 46, subGap = 44, align = "center", x = W / 2, grad } = {}) {
  ctx.save();
  ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${size}px Inter`;
  ctx.letterSpacing = `${-size * 0.035}px`;
  let yy = y;
  const top = y - size;
  const bottom = y + (lines.length - 1) * size * lh;
  const g = ctx.createLinearGradient(0, top, 0, bottom + size * 0.2);
  (grad || [[0, "#ffffff"], [1, "#b9cdfc"]]).forEach(([o, c]) => g.addColorStop(o, c));
  ctx.shadowColor = "rgba(0,8,30,0.6)"; ctx.shadowBlur = 40;
  for (const l of lines) { ctx.fillStyle = g; ctx.fillText(l, x, yy); yy += size * lh; }
  if (sub) {
    ctx.shadowBlur = 20;
    ctx.font = `400 ${subSize}px Inter`; ctx.letterSpacing = `${-subSize * 0.01}px`;
    ctx.fillStyle = "rgba(205,218,248,0.78)";
    const sy = yy - size * lh + subGap + subSize;
    (Array.isArray(sub) ? sub : [sub]).forEach((s, i) => ctx.fillText(s, x, sy + i * subSize * 1.35));
  }
  ctx.restore();
}

// Small pill "eyebrow" label above the headline.
export function eyebrow(ctx, text, { y, color = "#60a5fa" }) {
  ctx.save();
  ctx.font = `700 34px Inter`; ctx.letterSpacing = "5px";
  const tw = ctx.measureText(text).width;
  const pw = tw + 70, ph = 64, px = (W - pw) / 2;
  rr(ctx, px, y, pw, ph, ph / 2);
  ctx.fillStyle = "rgba(37,99,235,0.14)"; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "rgba(96,165,250,0.45)"; ctx.stroke();
  ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2 + 2.5, y + ph / 2 + 2);
  ctx.restore();
}

// ---------------- WebGL2 ----------------
export const GLSL_COMMON = /* glsl */`
precision highp float;
uniform vec2 uRes;
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x),u.y); }
float fbm(vec2 p){ float a=.5, s=0.; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<6;i++){ s+=a*vnoise(p); p=m*p; a*=.5; } return s; }
float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056,0.00583715)))); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
float fbm3(vec2 p){ float a=.5, s=0.; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<3;i++){ s+=a*vnoise(p); p=m*p; a*=.5; } return s/.875; }
const vec3 BLUE = vec3(.145,.388,.922);
const vec3 CYAN = vec3(.13,.70,.95);
const vec3 GREEN = vec3(.063,.725,.506);
const vec3 VIOLET = vec3(.40,.25,.90);
// Base night gradient shared by the set.
vec3 night(vec2 uv){ // uv: x 0..1, y 0..(H/W)
  vec3 c = mix(vec3(.010,.016,.040), vec3(.018,.030,.080), smoothstep(0.,1.2,uv.y));
  return mix(c, vec3(.006,.009,.024), smoothstep(1.3,2.17,uv.y));
}
// Aurora curtain: a ribbon along y0(x) with vertical ray striations. Returns premultiplied light.
vec3 curtain(vec2 uv, float y0, float amp, float freq, float seed, float width, vec3 c1, vec3 c2){
  float x = uv.x;
  float w = fbm3(vec2(x*freq*.6+seed, seed*1.7));
  float yc = y0 + amp*(sin(x*freq+seed*3.1)*.6 + (w-.5)*1.6);
  float dy = uv.y - yc;
  // soft lower edge, long upward fade (like real aurora)
  float prof = dy<0. ? exp(-pow(dy/(width*2.6),2.)) : exp(-pow(dy/(width*.55),2.));
  float stri = fbm3(vec2(x*38.+seed*9., uv.y*1.2 + seed)); // vertical rays
  stri = .45 + .9*pow(stri, 2.2);
  float hue = fbm3(vec2(x*2.2+seed*4., seed));
  vec3 col = mix(c1, c2, smoothstep(.3,.7,hue));
  float fade = smoothstep(-.05,.25,x)*smoothstep(1.05,.75,x) *.6 + .4;
  return col * prof * stri * fade;
}
// Silk: low-frequency domain warp with thin luminous folds. Returns (color light).
vec3 silk(vec2 uv, float seed, float freq, vec3 c1, vec3 c2, vec3 c3){
  vec2 q = uv*vec2(1.0,.62)*freq;
  vec2 w = vec2(fbm3(q*1.2+seed), fbm3(q*1.2+seed+vec2(5.2,1.3)));
  vec2 w2 = vec2(fbm3(q*1.4+2.2*w+vec2(1.7,9.2)), fbm3(q*1.4+2.2*w+vec2(8.3,2.8)));
  float f = fbm3(q*.9 + 2.0*w2 + seed*1.7);
  float ph = f*10. + uv.x*1.5;
  float folds = pow(1.-abs(sin(ph)), 9.);
  float soft = pow(1.-abs(sin(ph)), 2.);
  vec3 col = mix(c1, c2, smoothstep(.35,.75,w2.x));
  col = mix(col, c3, smoothstep(.55,.85,w.y)*.7);
  float body = smoothstep(.25,.85,f);
  return col * (folds*.9 + soft*.18) * body;
}
// Mesh-gradient glow field: a few big, noise-warped colour pools. No lines, no busy texture.
vec3 meshGlow(vec2 uv, vec2 core, float seed){
  vec2 w = vec2(fbm3(uv*1.1+seed), fbm3(uv*1.1+seed+7.3))-.5;
  vec2 u = uv + w*.45;
  vec3 c = vec3(0.);
  c += BLUE  * .42 * exp(-pow(length((u-core)*vec2(.85,1.25))/.46,2.));
  c += CYAN  * .16 * exp(-pow(length((u-core-vec2(.12,-.08))*vec2(1.,1.4))/.22,2.));
  c += VIOLET* .16 * exp(-pow(length((u-vec2(core.x-.55,core.y+.55))*vec2(1.,.8))/.40,2.));
  c += GREEN * .08 * exp(-pow(length((u-vec2(core.x+.55,core.y+.35))*vec2(1.,.8))/.35,2.));
  return c;
}
// Thin signal rings radiating from c, broken into arcs by angular noise.
float signalRings(vec2 p, vec2 c, float spacing, float px_w, float seed){
  vec2 d = p-c; float r = length(d); float a = atan(d.y,d.x);
  float k = abs(fract(r/spacing+.5)-.5)*spacing;         // px to nearest ring
  float line = exp(-pow(k/px_w,2.));
  float ring = floor(r/spacing);
  float arcs = smoothstep(.42,.62, vnoise(vec2(a*3.2+ring*1.7+seed, ring*.9+seed)));
  return line * arcs;
}
// Ribbon of thin phase-shifted waves (signal trace motif). p in px.
float waveY(float x, float yBase, float amp, float freq, float tilt, float t, float seed, float cx, float envW){
  float env = exp(-pow((x-cx)/envW,2.));
  float ph = t*2.4 + seed;
  return yBase + tilt*(x-cx) + amp*env*(sin(x*freq + ph)*.75 + sin(x*freq*2.3 - ph*1.3)*.25) * (.55+.45*sin(t*3.14159));
}
vec3 waveRibbon(vec2 p, float yBase, float amp, float freq, float tilt, float seed, float cx, float envW, vec3 c1, vec3 c2){
  vec3 acc = vec3(0.);
  for(int i=0;i<22;i++){
    float t = float(i)/21.;
    float y = waveY(p.x, yBase, amp, freq, tilt, t, seed, cx, envW);
    float y2 = waveY(p.x+1., yBase, amp, freq, tilt, t, seed, cx, envW);
    float d = abs(p.y-y)/sqrt(1.+(y2-y)*(y2-y));
    float line = exp(-pow(d/1.1,2.)) + .06*exp(-d/14.);
    acc += mix(c1,c2,t) * line;
  }
  return acc/4.;
}
// pixel coords, y down (matches Canvas2D)
vec2 px(){ return vec2(gl_FragCoord.x, uRes.y-gl_FragCoord.y); }
vec3 finish(vec3 c, vec2 p, float grain){
  float g = hash12(p*1.37+17.7) + hash12(p*0.71+3.1) - 1.0;
  c += g*grain;
  c += (ign(p)-.5)/255.;
  return c;
}
`;

export function initGL(cvs) {
  const gl = cvs.getContext("webgl2", { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
  if (!gl) throw new Error("no webgl2");
  return gl;
}

export function program(gl, fsSrc) {
  const vs = `#version 300 es
  in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;
  const mk = (t, s) => {
    const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      console.error(log); throw new Error(log);
    }
    return sh;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fsSrc));
  gl.bindAttribLocation(p, 0, "a"); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

export function texture(gl, src, { premul = true, mip = false } = {}) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premul);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export function run(gl, prog, { textures = {}, uniforms = {} }) {
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  let unit = 0;
  for (const [name, t] of Object.entries(textures)) {
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(gl.getUniformLocation(prog, name), unit); unit++;
  }
  for (const [name, v] of Object.entries(uniforms)) {
    const loc = gl.getUniformLocation(prog, name);
    if (loc === null) continue;
    if (typeof v === "number") gl.uniform1f(loc, v);
    else if (v.length === 2) gl.uniform2fv(loc, v);
    else if (v.length === 3) gl.uniform3fv(loc, v);
    else if (v.length === 4) gl.uniform4fv(loc, v);
  }
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.finish();
}

export function pageShell() {
  document.body.style.cssText = "margin:0;background:#000;overflow:hidden";
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  c.style.cssText = `display:block;width:${W}px;height:${H}px`;
  document.body.appendChild(c);
  return c;
}
