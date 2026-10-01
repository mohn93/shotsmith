import type { ResolvedConfig } from "../config/schema.js";
import { type HttpRequest, type Method, StoreError, type Transport, parseJson } from "./http.js";
import type { LocalSet } from "./local.js";
import { type PlannedSet, type RemoveReason, type UploadPlan, makePlan } from "./plan.js";

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
    const r = await this.d.transport({
      method,
      url,
      headers: { Authorization: `Bearer ${this.d.token()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = parseJson(r.text, "App Store Connect");
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
  const detail = ((data.errors ?? []) as Json[]).map((e) => e.detail ?? e.title).filter(Boolean).join("; ");
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
    r.state === "FAILED" ? "failed" : r.state !== "COMPLETE" ? "processing" : r.checksum && wanted.has(r.checksum) ? "duplicate" : "superseded";
  const remove = remote.filter((r) => !claimed.has(r.id)).map((r) => ({ id: r.id, checksum: r.checksum, reason: reason(r) }));
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
