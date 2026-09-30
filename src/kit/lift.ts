import type { Device } from "./device.js";
import { state } from "./runtime.js";

export interface LiftOptions {
  region: [number, number, number, number]; scale?: number; radius?: number; inset?: number; shadow?: string;
  mode?: "cover" | "recess"; at?: [number, number]; z?: number;
}

export function lift(d: Device, o: LiftOptions): HTMLDivElement {
  const [x0, y0, x1, y1] = o.region;
  const inset = o.inset ?? 2, scale = o.scale ?? 1.08, z = o.z ?? 30;
  const mode = o.mode ?? (d.tilted ? "recess" : "cover");
  if (mode === "cover" && o.at) throw new Error("lift: 'at' moves the card off its source region, which would show the row twice; use mode 'recess'");
  if (mode === "cover" && scale < 1) throw new Error("lift: a covering card must be at least as large as its region (scale >= 1)");

  const cw = x1 - x0 - 2 * inset, ch = y1 - y0 - 2 * inset;
  const crop = document.createElement("canvas"); crop.width = cw; crop.height = ch;
  crop.getContext("2d")!.drawImage(d.image, x0 + inset, y0 + inset, cw, ch, 0, 0, cw, ch);
  const w = cw * d.k * scale, h = ch * d.k * scale, radius = (o.radius ?? 28) * d.k * scale;

  if (mode === "recess") {
    const [rx, ry] = d.toLocal(x0, y0);
    const rec = document.createElement("div");
    Object.assign(rec.style, { position: "absolute", left: `${rx}px`, top: `${ry}px`, width: `${(x1 - x0) * d.k}px`, height: `${(y1 - y0) * d.k}px`,
      background: d.pixel(Math.max(0, x0 - 4), (y0 + y1) / 2), borderRadius: `${radius / scale}px`, boxShadow: "inset 0 6px 18px rgba(0,0,0,0.12)", zIndex: "1" });
    d.el.appendChild(rec);
  }

  const card = document.createElement("div");
  crop.style.width = "100%"; crop.style.height = "100%"; crop.style.display = "block";
  card.appendChild(crop);
  const [cx, cy] = o.at ?? (d.tilted ? d.toLocal((x0 + x1) / 2, (y0 + y1) / 2) : d.toStage((x0 + x1) / 2, (y0 + y1) / 2));
  Object.assign(card.style, { position: "absolute", left: `${cx - w / 2}px`, top: `${cy - h / 2}px`, width: `${w}px`, height: `${h}px`,
    borderRadius: `${radius}px`, overflow: "hidden", zIndex: String(z), boxShadow: o.shadow ?? "0 40px 80px -24px rgba(0,0,0,0.45)" });
  if (d.tilted) { card.style.transform = "translateZ(60px)"; d.el.appendChild(card); }
  else state.root!.appendChild(card);
  state.lifts++;
  return card;
}
