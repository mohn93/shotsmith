import crypto from "node:crypto";
import type { HttpRequest, HttpResponse, Transport } from "../../src/upload/http.js";

export const PLAY = "https://androidpublisher.googleapis.com";
interface Img { id: string; sha256: string; sha1: string }
type Slots = Map<string, Img[]>;      // image type -> images in order
type Listings = Map<string, Slots>;   // language -> slots

const reply = (status: number, body?: unknown): HttpResponse => ({ status, text: body === undefined ? "" : JSON.stringify(body) });
const fail = (code: number, message: string) => reply(code, { error: { code, message, status: code === 403 ? "PERMISSION_DENIED" : "FAILED_PRECONDITION" } });
const hash = (alg: string, b: Buffer) => crypto.createHash(alg).update(b).digest("hex");
const clone = (l: Listings): Listings => new Map([...l].map(([lang, slots]) => [lang, new Map([...slots].map(([s, imgs]) => [s, [...imgs]]))]));

// An in-memory Google Play Developer API (androidpublisher v3 edits). Responses follow the documented shapes and the
// fields the DNS Kit uploader used against the live service. It is not a recording.
export class FakePlay {
  pkg = "com.example.demo";
  live: Listings;
  edits = new Map<string, Listings>();
  calls: string[] = [];
  forbidden = false;
  // The service answers every upload with a wrong sha256.
  corruptUploads = false;
  // The service answers :validate with 400.
  failValidate = false;
  private imageN = 0;
  private editN = 1000;

  constructor(languages = ["en-US", "de-DE"]) {
    this.live = new Map(languages.map((l) => [l, new Map()]));
  }

  seed(language: string, slot: string, shas: string[]): void {
    this.live.get(language)!.set(slot, shas.map((sha256) => ({ id: `img${++this.imageN}`, sha256, sha1: "" })));
  }

  shas(language: string, slot: string, from: Listings = this.live): string[] {
    return (from.get(language)?.get(slot) ?? []).map((i) => i.sha256);
  }

  writes(): string[] {
    return this.calls.filter((c) => !c.startsWith("GET "));
  }

  transport: Transport = async (req: HttpRequest) => {
    const url = new URL(req.url);
    this.calls.push(`${req.method} ${url.pathname}`);
    if (url.origin !== PLAY) return fail(404, `unknown host ${url.origin}`);
    if (req.headers?.Authorization !== "Bearer play-token") return fail(401, "Request had invalid authentication credentials.");
    if (this.forbidden) return fail(403, "The caller does not have permission");
    const m = url.pathname.match(/^\/(upload\/)?androidpublisher\/v3\/applications\/([^/]+)\/edits(?:\/([^/:]+))?(?::(validate|commit))?(\/listings(?:\/([^/]+)\/([^/]+))?)?$/);
    if (!m) return fail(404, `no route ${url.pathname}`);
    const [, upload, pkg, editId, action, listings, lang, slot] = m;
    if (decodeURIComponent(pkg) !== this.pkg) return fail(404, `Package not found: ${pkg}.`);
    if (!editId) {
      if (req.method !== "POST") return fail(404, "no route");
      const id = String(++this.editN);
      this.edits.set(id, clone(this.live));
      return reply(200, { id, expiryTimeSeconds: "9999999999" });
    }
    const edit = this.edits.get(editId);
    if (!edit) return fail(400, "This Edit has been deleted.");
    if (action === "validate" && this.failValidate) return fail(400, "Validation failed");
    if (action === "validate") return reply(200, { id: editId });
    if (action === "commit") {
      this.live = edit;
      this.edits.delete(editId);
      return reply(200, { id: editId });
    }
    if (!listings) {
      if (req.method !== "DELETE") return fail(404, "no route");
      this.edits.delete(editId);
      return reply(204);
    }
    if (!lang) return reply(200, { kind: "androidpublisher#listingsListResponse", listings: [...edit.keys()].map((language) => ({ language, title: "Demo" })) });
    const slots = edit.get(decodeURIComponent(lang));
    if (!slots) return fail(404, "Listing not found");
    const images = slots.get(slot) ?? [];
    if (upload && req.method === "POST") {
      if (images.length >= 8) return fail(400, "Too many images");
      const bytes = Buffer.from(req.body as Uint8Array);
      const img = { id: `img${++this.imageN}`, sha256: this.corruptUploads ? "0".repeat(64) : hash("sha256", bytes), sha1: hash("sha1", bytes) };
      slots.set(slot, [...images, img]);
      return reply(200, { image: { ...img, url: `https://play-lh.example/${img.id}` } });
    }
    if (req.method === "GET") return reply(200, images.length ? { images: images.map((i) => ({ ...i, url: `https://play-lh.example/${i.id}` })) } : {});
    if (req.method === "DELETE") {
      slots.set(slot, []);
      return reply(200, { deleted: images });
    }
    return fail(404, "no route");
  };
}
