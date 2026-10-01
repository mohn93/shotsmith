import fs from "node:fs";
import path from "node:path";
import type { ResolvedConfig } from "../config/schema.js";
import { type HttpRequest, type Method, StoreError, type Transport, parseBody } from "./http.js";
import type { LocalFile, LocalSet } from "./local.js";
import { type AppliedSet, type PlannedSet, type RemoveReason, type UploadPlan, type UploadReport, makePlan, samePlan } from "./plan.js";
import { md5 } from "./util.js";

export const ASC = "https://api.appstoreconnect.apple.com";
// Version states in which screenshots can still change.
export const EDITABLE = ["PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "INVALID_BINARY"];

export interface AppleDeps { transport: Transport; token: () => string; log?: (line: string) => void; now?: () => number; sleep?: (ms: number) => Promise<void> }
type Json = Record<string, any>;
interface Resource { id: string; attributes: Json }
export interface RemoteShot { id: string; fileName: string | null; checksum: string | null; state: string | null }
export interface AppleSet { plan: PlannedSet; local: LocalSet; localizationId: string; setId: string | null }

export class AscClient {
  constructor(private readonly d: AppleDeps) {}

  async request(method: Method, route: string, body?: Json): Promise<Json> {
    const url = route.startsWith("https://") ? route : `${ASC}${route}`;
    // links.next comes from the response; it is followed only within the API.
    if (!url.startsWith(`${ASC}/`)) throw new Error(`App Store Connect pointed to ${url}; Shotsmith only calls ${ASC}`);
    // Shotsmith never submits for review, whatever the plan says.
    if (/submission/i.test(new URL(url).pathname)) throw new Error(`Refusing ${method} ${route}: Shotsmith never submits for review`);
    const r = await this.d.transport({
      method,
      url,
      headers: { Authorization: `Bearer ${this.d.token()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = parseBody(r, "App Store Connect");
    if (r.status >= 400) throw new StoreError(ascMessage(method, url, r.status, data), r.status);
    return data;
  }

  // Every page of a list, following links.next.
  async all(route: string): Promise<Resource[]> {
    const out: Resource[] = [];
    for (let next: string | undefined = route; next; ) {
      const page = await this.request("GET", next);
      out.push(...((page.data ?? []) as Resource[]));
      next = page.links?.next;
    }
    return out;
  }

  // Upload parts go to the URLs App Store Connect hands out, with their own headers and without the API token.
  raw(req: HttpRequest) {
    return this.d.transport(req);
  }
}

function ascMessage(method: string, url: string, status: number, data: Json): string {
  const detail = ((data.errors ?? []) as Json[]).map((e) => e.detail ?? e.title).filter(Boolean).join("; ").replace(/\.+$/, "") || String(data.rawBody ?? "");
  const what = `${method} ${url.slice(ASC.length).split("?")[0]} failed (${status})${detail ? `: ${detail}` : ""}`;
  if (status === 401) return `${what}. App Store Connect did not accept the API key: check the issuer id, key id and key file`;
  if (status === 403) return `${what}. The API key's role cannot do this; it needs the App Manager or Admin role`;
  return what;
}

export function appleApp(cfg: ResolvedConfig): string {
  if (!cfg.apple) throw new Error(`shotsmith.config.json has no "apple": { "bundleId" }; add the app's bundle id to upload to App Store Connect`);
  return cfg.apple.bundleId;
}

const stateOf = (v: Resource): string => v.attributes.appVersionState ?? v.attributes.appStoreState;
const named = (vs: Resource[]) => vs.map((v) => `${v.attributes.versionString} (${stateOf(v)})`).join(", ");

async function editableVersion(c: AscClient, bundleId: string, wanted?: string): Promise<{ id: string; version: string }> {
  const app = (await c.all(`/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`)).find((a) => a.attributes.bundleId === bundleId);
  if (!app) throw new Error(`No app with bundle id ${bundleId} in App Store Connect for this API key`);
  const versions = await c.all(`/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=200`);
  const pick = (v: Resource) => ({ id: v.id, version: String(v.attributes.versionString) });
  if (wanted) {
    const v = versions.find((x) => x.attributes.versionString === wanted);
    if (!v) throw new Error(`Version ${wanted} not found for ${bundleId}; versions: ${named(versions) || "none"}`);
    if (!EDITABLE.includes(stateOf(v))) throw new Error(`Version ${wanted} is ${stateOf(v)}, so its screenshots cannot change. Create a new version in App Store Connect, or pick an editable one with --app-version`);
    return pick(v);
  }
  const editable = versions.filter((v) => EDITABLE.includes(stateOf(v)));
  if (!editable.length) {
    throw new Error(`No editable App Store version for ${bundleId} (${named(versions) || "no versions"}). Screenshots change only on a version in Prepare for Submission or a rejected state; create a new version in App Store Connect first`);
  }
  if (editable.length > 1) throw new Error(`Several editable versions: ${named(editable)}. Pick one with --app-version`);
  return pick(editable[0]);
}

export const shotOf = (r: Resource): RemoteShot => ({
  id: r.id,
  fileName: r.attributes.fileName ?? null,
  checksum: r.attributes.sourceFileChecksum ?? null,
  state: r.attributes.assetDeliveryState?.state ?? null,
});

// Keeps each finished screenshot whose MD5 matches an export (one per page), removes the rest and uploads what is
// missing. A set that already matches in content and order is unchanged.
export function planAppleSet(local: LocalSet, remote: RemoteShot[]): PlannedSet {
  const claimed = new Set<string>();
  const keep: PlannedSet["keep"] = [], upload: PlannedSet["upload"] = [];
  for (const f of local.files) {
    const hit = remote.find((r) => !claimed.has(r.id) && r.state === "COMPLETE" && r.checksum === f.md5);
    if (hit) { claimed.add(hit.id); keep.push({ id: hit.id, file: f.rel }); } else upload.push({ file: f.rel, checksum: f.md5 });
  }
  const wanted = new Set(local.files.map((f) => f.md5));
  const reason = (r: RemoteShot): RemoveReason =>
    r.state === "FAILED" ? "failed" : r.state === "AWAITING_UPLOAD" ? "unfinished" : r.state !== "COMPLETE" ? "processing" : r.checksum && wanted.has(r.checksum) ? "duplicate" : "superseded";
  const remove = remote.filter((r) => !claimed.has(r.id)).map((r) => ({ id: r.id, checksum: r.checksum, reason: reason(r), fileName: r.fileName }));
  const unchanged = !upload.length && !remove.length && remote.map((r) => r.id).join() === keep.map((k) => k.id).join();
  return {
    locale: local.locale, storeLocale: local.storeLocale, target: local.target, slot: local.slot,
    status: unchanged ? "unchanged" : "change", keep, remove, upload, order: local.files.map((f) => f.rel),
  };
}

// Reads the editable version's screenshot sets and plans each locale and display type. Only GET requests.
export async function planApple(cfg: ResolvedConfig, local: LocalSet[], o: { version?: string }, deps: AppleDeps): Promise<{ plan: UploadPlan; sets: AppleSet[] }> {
  const bundleId = appleApp(cfg);
  const c = new AscClient(deps);
  const version = await editableVersion(c, bundleId, o.version);
  const localizations = await c.all(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=200`);
  const problems = new Set<string>();
  const setLists = new Map<string, Resource[]>();
  const sets: AppleSet[] = [];
  for (const l of local) {
    const loc = localizations.find((x) => x.attributes.locale === l.storeLocale);
    if (!loc) {
      problems.add(`Version ${version.version} has no ${l.storeLocale} localization; add the language in App Store Connect first, or leave out locale ${l.locale} with -l`);
      continue;
    }
    if (!setLists.has(loc.id)) setLists.set(loc.id, await c.all(`/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=200`));
    const set = setLists.get(loc.id)!.find((s) => s.attributes.screenshotDisplayType === l.slot);
    const remote = set ? (await c.all(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=200`)).map(shotOf) : [];
    sets.push({ plan: planAppleSet(l, remote), local: l, localizationId: loc.id, setId: set?.id ?? null });
  }
  const plan = makePlan({ store: "apple", app: bundleId, version: version.version, sets: sets.map((s) => s.plan), problems: [...problems] }, new Date(deps.now?.() ?? Date.now()));
  return { plan, sets };
}

export const PROCESSING_LIMIT_MS = 5 * 60_000;
const POLL_START_MS = 2000;
const POLL_MAX_MS = 10_000;
interface Run { log: (line: string) => void; now: () => number; sleep: (ms: number) => Promise<void> }

// Recomputes the plan and applies it only when it matches the saved plan the user reviewed. Never submits for review.
export async function applyApple(cfg: ResolvedConfig, local: LocalSet[], o: { version?: string }, saved: UploadPlan | null, deps: AppleDeps): Promise<UploadReport> {
  const now = deps.now ?? Date.now;
  const fresh = await planApple(cfg, local, { version: o.version ?? saved?.version ?? undefined }, deps);
  if (fresh.plan.problems.length) throw new Error(`The plan has problems, so nothing was changed:\n- ${fresh.plan.problems.join("\n- ")}`);
  samePlan(cfg, saved, fresh.plan);
  const c = new AscClient(deps);
  const run: Run = { log: deps.log ?? (() => {}), now, sleep: deps.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms))) };
  const report: UploadReport = {
    store: "apple", app: fresh.plan.app, version: fresh.plan.version, digest: fresh.plan.digest, editId: null, editExpiresAt: null,
    startedAt: new Date(now()).toISOString(), finishedAt: "", ok: false, error: null, sets: [],
  };
  try {
    for (const s of fresh.sets) {
      // The record goes into the report first, so a failure still shows what was done to this set.
      const rec: AppliedSet = { locale: s.plan.locale, storeLocale: s.plan.storeLocale, target: s.plan.target, slot: s.plan.slot, status: "failed", deleted: [], uploaded: [], order: [] };
      report.sets.push(rec);
      await applySet(c, s, rec, run);
    }
    report.ok = true;
  } catch (e) {
    report.error = (e as Error).message;
  }
  report.finishedAt = new Date(now()).toISOString();
  return report;
}

// Fills `rec` as it goes: on failure it keeps status "failed" and what was done so far.
async function applySet(c: AscClient, s: AppleSet, rec: AppliedSet, run: Run): Promise<void> {
  const { plan: p, local } = s;
  const md5Of = (file: string) => local.files.find((f) => f.rel === file)!.md5;
  if (p.status === "unchanged") {
    rec.status = "unchanged";
    rec.order = p.keep.map((k) => ({ file: k.file, id: k.id, checksum: md5Of(k.file) }));
    return;
  }
  const where = `${p.storeLocale} ${p.slot}`;
  try {
    // Before the first write, so an export that changed since the plan costs nothing.
    for (const f of local.files) if (md5(fs.readFileSync(f.file)) !== f.md5) throw new Error(`${f.rel} changed after the plan was made; run the plan again`);
    const setId = s.setId ?? String((await c.request("POST", "/v1/appScreenshotSets", {
      data: { type: "appScreenshotSets", attributes: { screenshotDisplayType: p.slot }, relationships: { appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: s.localizationId } } } },
    })).data.id);
    // A set holds at most 10 screenshots, so there is no room to stage new ones beside the old: remove first.
    for (const r of p.remove) {
      await c.request("DELETE", `/v1/appScreenshots/${r.id}`);
      rec.deleted.push(r.id);
      run.log(`${where}: deleted ${r.id} (${r.reason})`);
    }
    const ids = new Map(p.keep.map((k) => [k.file, k.id]));
    for (const u of p.upload) {
      const id = await uploadShot(c, setId, local.files.find((f) => f.rel === u.file)!);
      ids.set(u.file, id);
      rec.uploaded.push({ file: u.file, id });
      run.log(`${where}: uploaded ${u.file}`);
    }
    await waitProcessed(c, setId, rec.uploaded.map((u) => u.id), run);
    const wanted = p.order.map((file) => ({ file, id: ids.get(file)!, checksum: md5Of(file) }));
    await c.request("PATCH", `/v1/appScreenshotSets/${setId}/relationships/appScreenshots`, { data: wanted.map((x) => ({ type: "appScreenshots", id: x.id })) });
    // Read back what App Store Connect now holds.
    const after = (await c.all(`/v1/appScreenshotSets/${setId}/appScreenshots?limit=200`)).map(shotOf);
    const same = after.length === wanted.length && after.every((a, i) => a.id === wanted[i].id && a.checksum === wanted[i].checksum && a.state === "COMPLETE");
    if (!same) throw new Error("after the upload the set differs from the export in order or content");
    run.log(`${where}: ${after.length} screenshot(s) in order and verified`);
    // The report records what the store returned.
    rec.order = after.map((a, i) => ({ file: wanted[i].file, id: a.id, checksum: a.checksum! }));
    rec.status = "changed";
  } catch (e) {
    throw new Error(`${where}: ${(e as Error).message}`);
  }
}

// Reserve, upload the parts, then commit with the MD5 checksum. A reservation that cannot be finished is deleted, so it
// does not stay in the set as an unfinished screenshot.
async function uploadShot(c: AscClient, setId: string, f: LocalFile): Promise<string> {
  const bytes = fs.readFileSync(f.file);
  if (md5(bytes) !== f.md5) throw new Error(`${f.rel} changed after the plan was made; run the plan again`);
  const shot = (await c.request("POST", "/v1/appScreenshots", {
    data: { type: "appScreenshots", attributes: { fileName: path.basename(f.file), fileSize: bytes.length }, relationships: { appScreenshotSet: { data: { type: "appScreenshotSets", id: setId } } } },
  })).data as Resource;
  try {
    await sendParts(c, shot, f, bytes);
  } catch (e) {
    const gone = await c.request("DELETE", `/v1/appScreenshots/${shot.id}`).then(() => null, (d: Error) => d);
    if (!gone) throw e;
    throw new Error(`${(e as Error).message}. The unfinished screenshot ${shot.id} could not be deleted (${gone.message}); delete it in App Store Connect`);
  }
  return shot.id;
}

async function sendParts(c: AscClient, shot: Resource, f: LocalFile, bytes: Buffer): Promise<void> {
  for (const op of (shot.attributes.uploadOperations ?? []) as Json[]) {
    const url = new URL(op.url);
    // The file only ever goes to Apple.
    if (url.protocol !== "https:" || !(url.hostname === "apple.com" || url.hostname.endsWith(".apple.com"))) {
      throw new Error(`App Store Connect asked for an upload to ${url.origin}; refusing to send ${f.rel} outside apple.com`);
    }
    const headers = Object.fromEntries(((op.requestHeaders ?? []) as Json[]).map((h) => [String(h.name), String(h.value)]));
    const r = await c.raw({ method: op.method as Method, url: op.url, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
    if (r.status >= 300) throw new StoreError(`uploading part of ${f.rel} failed (${r.status})`, r.status);
  }
  await c.request("PATCH", `/v1/appScreenshots/${shot.id}`, { data: { type: "appScreenshots", id: shot.id, attributes: { uploaded: true, sourceFileChecksum: f.md5 } } });
}

// One list request per round, not one per screenshot; the wait grows from 2 to 10 seconds.
async function waitProcessed(c: AscClient, setId: string, ids: string[], run: Run): Promise<void> {
  const deadline = run.now() + PROCESSING_LIMIT_MS;
  let pending = [...ids];
  let wait = POLL_START_MS;
  while (pending.length) {
    const shots = new Map((await c.all(`/v1/appScreenshotSets/${setId}/appScreenshots?limit=200`)).map((r) => [r.id, r]));
    const next: string[] = [];
    for (const id of pending) {
      const shot = shots.get(id);
      if (!shot) throw new Error(`screenshot ${id} disappeared from the set`);
      const delivery = shot.attributes.assetDeliveryState ?? {};
      if (delivery.state === "FAILED") throw new Error(`App Store Connect could not process screenshot ${id}: ${JSON.stringify(delivery.errors ?? [])}`);
      if (delivery.state !== "COMPLETE") next.push(id);
    }
    pending = next;
    if (!pending.length) return;
    if (run.now() >= deadline) {
      throw new Error(`${pending.length} screenshot(s) still processing after 5 minutes. Plan again later: finished screenshots are kept and unfinished ones replaced`);
    }
    await run.sleep(wait);
    wait = Math.min(Math.round(wait * 1.5), POLL_MAX_MS);
  }
}
