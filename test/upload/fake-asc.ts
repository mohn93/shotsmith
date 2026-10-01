import crypto from "node:crypto";
import type { HttpRequest, HttpResponse, Transport } from "../../src/upload/http.js";

export const API = "https://api.appstoreconnect.apple.com";
type Json = Record<string, any>;
interface Shot { id: string; setId: string; fileName: string; fileSize: number; checksum: string | null; state: string; parts: Map<number, Buffer>; polls: number }
interface ShotSet { id: string; localizationId: string; display: string; shots: string[] }

const reply = (status: number, body?: unknown): HttpResponse => ({ status, text: body === undefined ? "" : JSON.stringify(body) });
const fail = (status: number, detail: string) => reply(status, { errors: [{ status: String(status), detail }] });
const entityError = (detail: string) => reply(409, { errors: [{ status: "409", code: "ENTITY_ERROR", detail }] });
const md5 = (b: Buffer) => crypto.createHash("md5").update(b).digest("hex");
// Version states in which App Store Connect accepts screenshot changes.
const EDITABLE = ["PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "INVALID_BINARY"];

// An in-memory App Store Connect. Responses follow the API's JSON:API shapes and the fields the DNS Kit uploader used
// against the live service. It is not a recording.
export class FakeAsc {
  apps = [{ id: "app1", bundleId: "com.example.demo" }];
  versions = [{ id: "ver1", appId: "app1", versionString: "1.1", state: "PREPARE_FOR_SUBMISSION" }];
  localizations = [{ id: "loc-en", versionId: "ver1", locale: "en-US" }, { id: "loc-de", versionId: "ver1", locale: "de-DE" }];
  sets: ShotSet[] = [];
  shots = new Map<string, Shot>();
  // "METHOD /path" of every call, in order.
  calls: string[] = [];
  // GETs a new screenshot answers with UPLOAD_COMPLETE before it turns COMPLETE (or FAILED with failProcessing).
  processingPolls = 1;
  failProcessing = false;
  uploadHost = "https://upload.fake.apple.com";
  // Items per list page; 0 returns whole lists.
  pageSize = 0;
  status401 = false;
  // The relationship PATCH that orders a set answers 204 but leaves the order as it was.
  ignoreReorder = false;
  // DELETE of a screenshot answers 500 and leaves the screenshot in place.
  failDelete = false;
  private n = 0;

  // Puts screenshots into a set as if uploaded earlier. The state defaults to COMPLETE.
  seed(localizationId: string, display: string, shots: { checksum: string | null; state?: string }[]): string[] {
    const set = this.setFor(localizationId, display) ?? this.addSet(localizationId, display);
    return shots.map((s) => {
      const shot = this.addShot(set, `seed-${this.n + 1}.jpg`, 0);
      shot.checksum = s.checksum;
      shot.state = s.state ?? "COMPLETE";
      return shot.id;
    });
  }

  setFor(localizationId: string, display: string): ShotSet | undefined {
    return this.sets.find((s) => s.localizationId === localizationId && s.display === display);
  }

  checksums(localizationId: string, display: string): (string | null)[] {
    return (this.setFor(localizationId, display)?.shots ?? []).map((id) => this.shots.get(id)!.checksum);
  }

  writes(): string[] {
    return this.calls.filter((c) => !c.startsWith("GET "));
  }

  transport: Transport = async (req: HttpRequest) => {
    const url = new URL(req.url);
    this.calls.push(`${req.method} ${url.pathname}`);
    if (/submission/i.test(url.pathname)) throw new Error(`the uploader must never submit for review (${req.method} ${url.pathname})`);
    if (url.origin === this.uploadHost && req.method === "PUT") {
      if (req.headers?.Authorization) throw new Error(`the API token must not go to an upload host (${req.method} ${url.pathname})`);
      return this.part(url, req);
    }
    if (url.origin !== API) return fail(404, `unknown host ${url.origin}`);
    if (this.status401 || !req.headers?.Authorization?.startsWith("Bearer ")) return fail(401, "Authentication credentials are missing or invalid.");
    return this.api(req.method, url, typeof req.body === "string" ? JSON.parse(req.body) : undefined);
  };

  // The version a write touches: its set or screenshot, or the localization a new set goes into.
  private versionOf(p: string, body: Json | undefined): { state: string } | undefined {
    let localizationId: string | undefined;
    let setId: string | undefined;
    let m: RegExpMatchArray | null;
    if (p === "/v1/appScreenshotSets") localizationId = body?.data?.relationships?.appStoreVersionLocalization?.data?.id;
    else if (p === "/v1/appScreenshots") setId = body?.data?.relationships?.appScreenshotSet?.data?.id;
    else if ((m = p.match(/^\/v1\/appScreenshotSets\/([^/]+)\/relationships\/appScreenshots$/))) setId = m[1];
    else if ((m = p.match(/^\/v1\/appScreenshots\/([^/]+)$/))) setId = this.shots.get(m[1])?.setId;
    if (setId) localizationId = this.sets.find((s) => s.id === setId)?.localizationId;
    const loc = this.localizations.find((l) => l.id === localizationId);
    return this.versions.find((v) => v.id === loc?.versionId);
  }

  private api(method: string, url: URL, body: Json | undefined): HttpResponse {
    const p = url.pathname;
    let m: RegExpMatchArray | null;
    if (method !== "GET") {
      const version = this.versionOf(p, body);
      if (version && !EDITABLE.includes(version.state)) return entityError(`The version is ${version.state}, so its screenshots cannot be changed`);
    }
    if (method === "GET" && p === "/v1/apps") {
      return this.list(url, this.apps.filter((a) => a.bundleId === url.searchParams.get("filter[bundleId]")).map((a) => ({ type: "apps", id: a.id, attributes: { bundleId: a.bundleId, name: "Demo" } })));
    }
    if (method === "GET" && (m = p.match(/^\/v1\/apps\/([^/]+)\/appStoreVersions$/))) {
      const app = m[1];
      const ios = url.searchParams.get("filter[platform]") === "IOS";
      return this.list(url, this.versions.filter((v) => v.appId === app && ios).map((v) => ({ type: "appStoreVersions", id: v.id, attributes: { platform: "IOS", versionString: v.versionString, appStoreState: v.state, appVersionState: v.state } })));
    }
    if (method === "GET" && (m = p.match(/^\/v1\/appStoreVersions\/([^/]+)\/appStoreVersionLocalizations$/))) {
      const version = m[1];
      return this.list(url, this.localizations.filter((l) => l.versionId === version).map((l) => ({ type: "appStoreVersionLocalizations", id: l.id, attributes: { locale: l.locale } })));
    }
    if (method === "GET" && (m = p.match(/^\/v1\/appStoreVersionLocalizations\/([^/]+)\/appScreenshotSets$/))) {
      const loc = m[1];
      return this.list(url, this.sets.filter((s) => s.localizationId === loc).map((s) => this.setJson(s)));
    }
    if (method === "POST" && p === "/v1/appScreenshotSets") {
      const d = body!.data;
      if (d.type !== "appScreenshotSets") return entityError(`data.type must be appScreenshotSets, got ${d.type}`);
      return reply(201, { data: this.setJson(this.addSet(d.relationships.appStoreVersionLocalization.data.id, d.attributes.screenshotDisplayType)) });
    }
    if (method === "GET" && (m = p.match(/^\/v1\/appScreenshotSets\/([^/]+)\/appScreenshots$/))) {
      const set = this.sets.find((s) => s.id === m![1]);
      if (!set) return fail(404, "no such set");
      return this.list(url, set.shots.map((id) => { const shot = this.shots.get(id)!; this.advance(shot); return this.shotJson(shot); }));
    }
    if (method === "PATCH" && (m = p.match(/^\/v1\/appScreenshotSets\/([^/]+)\/relationships\/appScreenshots$/))) {
      const set = this.sets.find((s) => s.id === m![1]);
      if (!set) return fail(404, "no such set");
      const items = body!.data as Json[];
      if (items.some((d) => d.type !== "appScreenshots")) return entityError("data.type must be appScreenshots");
      const ids = items.map((d) => String(d.id));
      if ([...ids].sort().join() !== [...set.shots].sort().join()) return fail(409, "The screenshots do not match the set");
      if (!this.ignoreReorder) set.shots = ids;
      return reply(204);
    }
    if (method === "POST" && p === "/v1/appScreenshots") {
      const d = body!.data;
      if (d.type !== "appScreenshots") return entityError(`data.type must be appScreenshots, got ${d.type}`);
      const set = this.sets.find((s) => s.id === d.relationships.appScreenshotSet.data.id);
      if (!set) return fail(404, "no such set");
      if (set.shots.length >= 10) return fail(409, "You can upload a maximum of 10 screenshots per set.");
      return reply(201, { data: this.shotJson(this.addShot(set, d.attributes.fileName, d.attributes.fileSize), true) });
    }
    if ((m = p.match(/^\/v1\/appScreenshots\/([^/]+)$/))) {
      const shot = this.shots.get(m[1]);
      if (!shot) return fail(404, "no such screenshot");
      if (method === "GET") {
        this.advance(shot);
        return reply(200, { data: this.shotJson(shot) });
      }
      if (method === "PATCH") {
        if (body!.data.type !== "appScreenshots") return entityError(`data.type must be appScreenshots, got ${body!.data.type}`);
        if (body!.data.id !== m[1]) return entityError(`data.id ${body!.data.id} does not match the path id ${m[1]}`);
        const a = body!.data.attributes;
        const bytes = Buffer.concat([...shot.parts.entries()].sort((x, y) => x[0] - y[0]).map((e) => e[1]));
        shot.checksum = a.sourceFileChecksum;
        shot.state = a.uploaded && bytes.length === shot.fileSize && md5(bytes) === a.sourceFileChecksum ? "UPLOAD_COMPLETE" : "FAILED";
        shot.polls = this.processingPolls;
        return reply(200, { data: this.shotJson(shot) });
      }
      if (method === "DELETE") {
        if (this.failDelete) return fail(500, "Backend error");
        const set = this.sets.find((s) => s.id === shot.setId)!;
        set.shots = set.shots.filter((id) => id !== shot.id);
        this.shots.delete(shot.id);
        return reply(204);
      }
    }
    return fail(404, `no route ${method} ${p}`);
  }

  // Each GET that shows a screenshot moves its processing one step on.
  private advance(shot: Shot): void {
    if (shot.state !== "UPLOAD_COMPLETE") return;
    if (shot.polls <= 0) shot.state = this.failProcessing ? "FAILED" : "COMPLETE";
    else shot.polls--;
  }

  private part(url: URL, req: HttpRequest): HttpResponse {
    const [, id, offset] = url.pathname.split("/");
    const shot = this.shots.get(id);
    if (!shot) return reply(404);
    // The part must carry the headers the reservation advertised.
    if (req.headers?.["Content-Type"] !== "image/jpeg") return fail(400, "The upload part lacks the Content-Type header it was told to send");
    shot.parts.set(Number(offset), Buffer.from(req.body as Uint8Array));
    return reply(200);
  }

  private list(url: URL, items: Json[]): HttpResponse {
    if (Number(url.searchParams.get("limit") ?? 0) > 200) return fail(400, "The limit parameter must not exceed 200");
    if (!this.pageSize) return reply(200, { data: items, links: { self: url.href } });
    const start = Number(url.searchParams.get("cursor") ?? 0);
    const links: Json = { self: url.href };
    if (start + this.pageSize < items.length) {
      const next = new URL(url.href);
      next.searchParams.set("cursor", String(start + this.pageSize));
      links.next = next.href;
    }
    return reply(200, { data: items.slice(start, start + this.pageSize), links });
  }

  private addSet(localizationId: string, display: string): ShotSet {
    const set = { id: `set${++this.n}`, localizationId, display, shots: [] as string[] };
    this.sets.push(set);
    return set;
  }

  private addShot(set: ShotSet, fileName: string, fileSize: number): Shot {
    const shot: Shot = { id: `shot${++this.n}`, setId: set.id, fileName, fileSize, checksum: null, state: "AWAITING_UPLOAD", parts: new Map(), polls: 0 };
    this.shots.set(shot.id, shot);
    set.shots.push(shot.id);
    return shot;
  }

  private setJson(s: ShotSet): Json {
    return { type: "appScreenshotSets", id: s.id, attributes: { screenshotDisplayType: s.display } };
  }

  // Two upload parts per file, so offsets are exercised.
  private shotJson(s: Shot, withOperations = false): Json {
    const half = Math.ceil(s.fileSize / 2);
    const op = (offset: number, length: number) => ({ method: "PUT", url: `${this.uploadHost}/${s.id}/${offset}`, offset, length, requestHeaders: [{ name: "Content-Type", value: "image/jpeg" }] });
    return {
      type: "appScreenshots",
      id: s.id,
      attributes: {
        fileName: s.fileName,
        fileSize: s.fileSize,
        sourceFileChecksum: s.checksum,
        assetDeliveryState: { state: s.state, errors: s.state === "FAILED" ? [{ code: "IMAGE_TOOL_FAILURE", description: "processing failed" }] : [], warnings: [] },
        uploadOperations: withOperations ? [op(0, half), op(half, s.fileSize - half)] : null,
      },
    };
  }
}
