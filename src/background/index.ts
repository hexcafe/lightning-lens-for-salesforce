// background.ts  – compact‑memory edition (v3)
// ----------------------------------------------------------
// ❶  DATABASE  (Dexie)  ⇢ payloads stored as JSON strings
// ❷  TAB META only (LRU‑trimmed), JSForce connection built on demand
// ❸  50‑entry LRU for sObject describes
// ❹  Periodic GC to evict idle tabs
// ❺  Full router incl. GET/UPDATE/DESCRIBE helpers
// ----------------------------------------------------------

import { Connection } from "jsforce";
import Dexie, { Table } from "dexie";
// import { compressToUTF16, decompressFromUTF16 } from "lz-string"; // optional

// ────────────────────────────────────────────────────────────
// 1. DATABASE
// ────────────────────────────────────────────────────────────
export interface AuraRequestLog {
  id: string; // primary key (rowId)
  tabId: number;
  auraActionId: string;
  scope: string;
  functionName: string;
  name: string;
  requestedAt: number;
  respondedAt?: number;
  duration?: number;
  requestPayload?: string; // JSON / compressed string
  responsePayload?: string;
  state: "INCOMPLETE" | "SUCCESS" | "ERROR" | string;
  errors?: any[] | null;
}

class LLensDB extends Dexie {
  public auraRequests!: Table<AuraRequestLog, string>;
  constructor() {
    super("LightningLensForSalesforceDB");
    this.version(2).stores({
      auraRequests: "id, tabId, auraActionId, scope, functionName, requestedAt",
    });
  }
}
const db = new LLensDB();

// ────────────────────────────────────────────────────────────
// 2. LIGHT TAB META  +  LRU DESCRIBE CACHE
// ────────────────────────────────────────────────────────────
interface TabMeta {
  sessionId: string;
  instanceUrl: string;
  lastUsed: number;
}
const tabMeta = new Map<number, TabMeta>();
const DESCRIBE_LRU_LIMIT = 50;
const describeLRU = new Map<string, any>();

function lruSet(key: string, val: any) {
  if (describeLRU.has(key)) describeLRU.delete(key);
  describeLRU.set(key, val);
  if (describeLRU.size > DESCRIBE_LRU_LIMIT) {
    const oldest = describeLRU.keys().next().value;
    if (oldest) {
      describeLRU.delete(oldest);
    }
  }
}
function lruGet(key: string) {
  if (!describeLRU.has(key)) return undefined;
  const v = describeLRU.get(key);
  describeLRU.delete(key);
  describeLRU.set(key, v);
  return v;
}

function freshConnection(meta: TabMeta) {
  return new Connection({
    version: "60.0",
    instanceUrl: meta.instanceUrl,
    sessionId: meta.sessionId,
  });
}

// ────────────────────────────────────────────────────────────
// 3. SETTINGS  (persisted)
// ────────────────────────────────────────────────────────────
const settings = { isAuraCaptureEnabled: true, maxRequestEntries: 500 };
chrome.storage.local
  .get(Object.keys(settings))
  .then((stored) => Object.assign(settings, stored));
chrome.storage.onChanged.addListener((c, ns) => {
  if (ns !== "local") return;
  Object.entries(c).forEach(([k, { newValue }]) => {
    if (k in settings) (settings as any)[k] = newValue;
  });
});

// ────────────────────────────────────────────────────────────
// 4. TAB INIT + GC
// ────────────────────────────────────────────────────────────
async function initTab(tabId: number) {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!tab?.url) return;
  if (
    !/https?:\/\/[\w.-]+\.(force|salesforce|visualforce)\.com/.test(tab.url)
  ) {
    tabMeta.delete(tabId);
    return;
  }
  const origin = new URL(tab.url).origin.replace(
    /\.lightning\.force\.com$/,
    ".my.salesforce.com",
  );
  const sid = await chrome.cookies.get({ url: origin, name: "sid" });
  if (!sid) {
    tabMeta.delete(tabId);
    return;
  }
  const meta = tabMeta.get(tabId);
  if (meta && meta.sessionId === sid.value) {
    meta.lastUsed = Date.now();
    return;
  }
  tabMeta.set(tabId, {
    sessionId: sid.value,
    instanceUrl: origin,
    lastUsed: Date.now(),
  });
}
chrome.tabs.onActivated.addListener(({ tabId }) => initTab(tabId));
chrome.tabs.onUpdated.addListener((id, info) => {
  if (info.status === "complete") initTab(id);
});
chrome.tabs.onRemoved.addListener((id) => tabMeta.delete(id));
setInterval(() => {
  // 10‑min idle eviction
  const now = Date.now();
  for (const [id, meta] of tabMeta)
    if (now - meta.lastUsed > 600_000) tabMeta.delete(id);
}, 300_000);

// ────────────────────────────────────────────────────────────
// 5. UTIL
// ────────────────────────────────────────────────────────────
const safeJSON = (o: any) => {
  try {
    return JSON.stringify(o);
  } catch {
    return undefined;
  }
};
async function trimDB() {
  const cnt = await db.auraRequests.count();
  if (cnt > settings.maxRequestEntries) {
    const over = cnt - settings.maxRequestEntries;
    const olds = await db.auraRequests
      .orderBy("requestedAt")
      .limit(over)
      .primaryKeys();
    await db.auraRequests.bulkDelete(olds as string[]);
  }
}

// ────────────────────────────────────────────────────────────
// 6. LOG PERSISTENCE
// ────────────────────────────────────────────────────────────
async function logStart(p: any, tabId: number) {
  await db.auraRequests.put({
    id: p.id,
    tabId,
    auraActionId: p.auraActionId,
    scope: p.scope ?? "",
    functionName: p.functionName ?? "",
    name: p.name ?? "",
    requestPayload: safeJSON(p.params ?? p.request),
    requestedAt: p.requestedAt,
    state: "INCOMPLETE",
  });
  trimDB();
}
async function logComplete(p: any) {
  await db.auraRequests
    .where("id")
    .equals(p.id)
    .modify({
      auraActionId: p.auraActionId,
      state: p.state,
      responsePayload: safeJSON(p.returnValue),
      errors: p.errors,
      respondedAt: p.respondedAt,
      duration: p.respondedAt - (p.requestedAt || p.respondedAt),
    });
  trimDB();
}

// ────────────────────────────────────────────────────────────
// 7. ROUTER
// ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!tabId) {
    sendResponse({ status: "error", message: "no tab" });
    return false;
  }
  const { type, payload } = msg;
  (async () => {
    switch (type) {
      case "AURA_REQUEST_START":
        if (settings.isAuraCaptureEnabled) await logStart(payload, tabId);
        break;
      case "AURA_REQUEST_COMPLETE":
        if (settings.isAuraCaptureEnabled) await logComplete(payload);
        break;

      // ── JSForce helpers (fresh connection each time) ──
      case "GET_RECORD": {
        const meta = tabMeta.get(tabId);
        if (!meta) throw new Error("no session");
        const conn = freshConnection(meta);
        const tab = await chrome.tabs.get(tabId);
        const m = tab.url?.match(
          /\/lightning\/r\/([^\/]+)\/([a-zA-Z0-9]{15,18})\/view/,
        );
        if (!m) throw new Error("not record page");
        return conn.sobject(m[1]).retrieve(m[2]);
      }
      case "UPDATE_RECORD": {
        const meta = tabMeta.get(tabId);
        if (!meta) throw new Error("no session");
        const conn = freshConnection(meta);
        if (!payload.sObjectName || !payload.recordData?.Id)
          throw new Error("bad payload");
        return conn.sobject(payload.sObjectName).update(payload.recordData);
      }
      case "DESCRIBE_SOBJECT": {
        const name = payload.sObjectName;
        if (!name) throw new Error("sObjectName required");
        const cached = lruGet(name);
        if (cached) return cached;
        const meta = tabMeta.get(tabId);
        if (!meta) throw new Error("no session");
        const conn = freshConnection(meta);
        const desc = await conn.sobject(name).describe();
        lruSet(name, desc);
        return desc;
      }
      case "RUN_SOQL": {
        const q = payload.query;
        if (!q) throw new Error("query required");
        const meta = tabMeta.get(tabId);
        if (!meta) throw new Error("no session");
        const conn = freshConnection(meta);
        return conn.query(q);
      }

      case "GET_LWC_DEBUG_STATUS": {
        const meta = tabMeta.get(tabId);
        if (!meta) throw new Error("no session");
        const conn = freshConnection(meta);
        const userInfo = await conn.identity();
        const qr = await conn.query<{
          UserPreferencesUserDebugModePref: boolean;
        }>(
          `SELECT UserPreferencesUserDebugModePref FROM User WHERE Id='${userInfo.user_id}'`,
        );
        return qr.records[0]?.UserPreferencesUserDebugModePref ?? false;
      }
      case "TOGGLE_LWC_DEBUG": {
        const meta = tabMeta.get(tabId);
        if (!meta) throw new Error("no session");
        const conn = freshConnection(meta);
        const userInfo = await conn.identity();
        await conn.sobject("User").update({
          Id: userInfo.user_id,
          UserPreferencesUserDebugModePref: payload.enabled,
        });
        return payload.enabled;
      }

      case "GET_API_CALL":
        return db.auraRequests.get(payload.id);
      case "LIST_API_CALLS":
        return (
          await db.auraRequests
            .where("tabId")
            .equals(tabId)
            .sortBy("requestedAt")
        ).reverse();
      case "CLEAR_API_CALLS":
        await db.auraRequests.where("tabId").equals(tabId).delete();
        return null;
      case "GET_SETTINGS":
        return settings;
      case "SET_SETTINGS":
        Object.assign(settings, payload);
        await chrome.storage.local.set(payload);
        if (payload.maxRequestEntries) trimDB();
        return null;
      default:
        throw new Error("unknown type");
    }
  })()
    .then((payload) => sendResponse({ status: "success", payload }))
    .catch((e) => sendResponse({ status: "error", message: e.message }))
    .finally(() => false);
  return true;
});
