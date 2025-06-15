/**
 * @file Apex Injector: emits START / COMPLETE messages that align with the
 *   redesigned Dexie schema.  The primary‑key `id` (rowId) is a UUID we create,
 *   while `auraActionId` comes from `ActionResult.getId()` when the call
 *   completes.  background.ts stitches them together via that rowId.
 */

(function () {
  const APEX_RAW_FN = "executeGlobalControllerRawResponse";
  const APEX_FN = "executeGlobalController";
  const RETRIES = 20;
  const INTERVAL = 500;

  // ───────── helper to find dot‑paths for a given function name ─────────
  const findPaths = (root, name, seen = new Set()) => {
    if (!root || typeof root !== "object" || seen.has(root)) return [];
    seen.add(root);
    return Object.entries(root).flatMap(([k, v]) => {
      if (typeof v === "function" && v.name === name) return [k];
      if (v && typeof v === "object")
        return findPaths(v, name, seen).map((s) => `${k}.${s}`);
      return [];
    });
  };

  // ───────── core wrapper ─────────
  const makeLogger = (fn) => {
    if (fn.__wrapped) return fn;

    const wrapper = async function (...args) {
      const rowId = crypto.randomUUID(); // DB row primary‑key
      const requestedAt = Date.now();

      const qualified = args[0] || ""; // e.g. "ApexActionController.execute"
      const params = args[1] || {};
      const scope = qualified.split(".")[0] || "";
      let functionName = qualified.split(".").pop() || qualified;
      let friendlyName = functionName;
      if (scope === "ApexActionController") {
        const ns = params.namespace ? params.namespace + "." : "";
        const cls = params.classname || "Unknown";
        const method = params.method || functionName;
        functionName = method;
        friendlyName = `${ns}${cls}.${method}`;
      } else if (
        scope === "RecordUiController" &&
        functionName === "getRecordWithFields"
      ) {
        const recordId = params.recordId || "";
        friendlyName = `getRecordWithFields:${recordId}`;
      }

      // START message (no auraActionId yet)
      window.postMessage(
        {
          type: "AURA_REQUEST_START",
          payload: {
            id: rowId,
            scope,
            functionName,
            name: friendlyName,
            params,
            requestedAt,
          },
        },
        "*",
      );

      console.groupCollapsed(
        `%c[${scope}] → ${friendlyName}`,
        "color:#0bf;font-weight:bold",
      );
      console.debug("Params:", params);

      try {
        const res = await fn.apply(this, args);
        const respondedAt = Date.now();
        const auraActionId =
          typeof res?.getId === "function" ? res.getId() : "";

        console.log(
          `✅ SUCCESS in ${(respondedAt - requestedAt).toFixed(1)}ms`,
          res,
        );
        console.groupEnd();

        window.postMessage(
          {
            type: "AURA_REQUEST_COMPLETE",
            payload: {
              id: rowId,
              auraActionId,
              state: res?.getState?.() ?? "SUCCESS",
              returnValue: res?.getReturnValue?.(),
              errors: res?.getError?.(),
              requestedAt,
              respondedAt,
            },
          },
          "*",
        );
        return res;
      } catch (err) {
        const respondedAt = Date.now();
        console.error("❌ ERROR", err);
        console.groupEnd();

        window.postMessage(
          {
            type: "AURA_REQUEST_COMPLETE",
            payload: {
              id: rowId,
              auraActionId: "", // unknown on failure path
              state: "ERROR",
              errors: [{ message: err.message || String(err) }],
              requestedAt,
              respondedAt,
            },
          },
          "*",
        );
        throw err;
      }
    };
    wrapper.__wrapped = true;
    return wrapper;
  };

  // ───────── bootstrap ─────────
  const init = async () => {
    for (let i = 0; i < RETRIES; i++) {
      const [rawPath] = findPaths(window, APEX_RAW_FN);
      if (!rawPath) {
        await new Promise((r) => setTimeout(r, INTERVAL));
        continue;
      }

      const host = rawPath
        .split(".")
        .slice(0, -1)
        .reduce((o, k) => o?.[k], window);
      if (!host || typeof host[APEX_FN] !== "function") return;
      if (window.__AURA_CAPTURE_ENABLED === false) return;

      host[APEX_RAW_FN] = makeLogger(host[APEX_RAW_FN].bind(host));
      host[APEX_FN] = makeLogger(host[APEX_FN].bind(host));
      console.log("[ApexInjector] Wrappers installed ✔︎");
      return;
    }
    console.warn("[ApexInjector] Timed out: Apex helpers not found");
  };

  init();
})();
