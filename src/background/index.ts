import { Connection } from "jsforce";
import {
  save,
  list,
  get,
  clear,
  clearAll,
  listAll,
  ApiCall,
  deleteByIds,
} from "./db";

// --- STATE & INTERFACE MANAGEMENT ---

// Using the more detailed TabState to support all features
interface TabState {
  sessionId: string;
  instanceUrl: string;
  jsforceConnection: Connection;
  detectedSObjects: Set<string>;
  sObjectDescribeCache: Map<string, any>;
  debugFlags: {
    apex: boolean;
    lwc: boolean;
  };
}

// Store the entire postData string to be parsed upon response
const requestDataMap = new Map<
  string,
  { requestedAt: number; postData: string; type: ApiCall["type"] }
>();
const attachedDebuggerTabs = new Set<number>();
const tabsState = new Map<number, TabState>();
const DEBUGGER_VERSION = "1.3";

// In-memory state for settings, with defaults
let isAuraCaptureEnabled = true;
let maxRequestEntries = 500;

// Function to load settings and listen for changes
async function initializeSettings() {
  const result = await chrome.storage.local.get([
    "isAuraCaptureEnabled",
    "maxRequestEntries",
  ]);
  if (result.isAuraCaptureEnabled !== undefined) {
    isAuraCaptureEnabled = result.isAuraCaptureEnabled;
  }
  if (result.maxRequestEntries !== undefined) {
    maxRequestEntries = result.maxRequestEntries;
  }
  console.log("Initial settings loaded:", {
    isAuraCaptureEnabled,
    maxRequestEntries,
  });
}

// Keep in-memory settings in sync with storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local") {
    if (changes.isAuraCaptureEnabled) {
      isAuraCaptureEnabled = changes.isAuraCaptureEnabled.newValue;
    }
    if (changes.maxRequestEntries) {
      maxRequestEntries = changes.maxRequestEntries.newValue;
    }
  }
});

initializeSettings();

// --- DEBUGGER & TAB LIFECYCLE ---

function attachDebugger(tabId: number) {
  if (attachedDebuggerTabs.has(tabId)) return;
  chrome.debugger.attach({ tabId }, DEBUGGER_VERSION, () => {
    if (chrome.runtime.lastError) {
      if (!chrome.runtime.lastError.message?.includes("cannot be debugged")) {
        console.error(
          `Debugger attach error for tab ${tabId}:`,
          chrome.runtime.lastError.message,
        );
      }
      return;
    }
    attachedDebuggerTabs.add(tabId);
    console.log(`Debugger attached to tab ${tabId}`);
    chrome.debugger.sendCommand({ tabId }, "Network.enable");
  });
}

function detachDebugger(tabId: number) {
  if (!attachedDebuggerTabs.has(tabId)) return;
  chrome.debugger.detach({ tabId }, () => {
    attachedDebuggerTabs.delete(tabId);
    console.log(`Debugger detached from tab ${tabId}`);
  });
}

const initializeTabState = async (tabId: number): Promise<void> => {
  try {
    const tab = await chrome.tabs.get(tabId);
    const tabUrl = tab.url;
    if (!tabUrl) {
      return;
    }
    const isSalesforceUrl = tabUrl.match(
      /https?:\/\/[a-zA-Z0-9-.]+\.(force|salesforce|visualforce)\.com/,
    );
    if (!isSalesforceUrl) {
      detachDebugger(tabId);
      tabsState.delete(tabId);
      return;
    }

    const instanceUrl = new URL(tabUrl).origin.replace(
      ".lightning.force.com",
      ".my.salesforce.com",
    );
    const cookie = await chrome.cookies.get({ url: instanceUrl, name: "sid" });

    if (!cookie) {
      tabsState.delete(tabId);
      detachDebugger(tabId);
      return;
    }
    attachDebugger(tabId);

    if (
      tabsState.has(tabId) &&
      tabsState.get(tabId)?.sessionId === cookie.value
    )
      return;

    // Create the full TabState object
    tabsState.set(tabId, {
      sessionId: cookie.value,
      instanceUrl,
      jsforceConnection: new Connection({
        instanceUrl,
        sessionId: cookie.value,
      }),
      detectedSObjects: new Set(),
      sObjectDescribeCache: new Map(),
      debugFlags: { apex: false, lwc: false },
    });
    console.log(`Tab ${tabId}: State initialized for ${instanceUrl}.`);
  } catch (e) {
    if (e instanceof Error && !e.message.includes("No tab with id")) {
      console.error(`Error initializing tab ${tabId}:`, e);
    }
  }
};

async function trimDatabase() {
  try {
    const allCalls = await listAll();
    if (allCalls.length > maxRequestEntries) {
      const callsToDelete = allCalls.slice(maxRequestEntries);
      const idsToDelete = callsToDelete.map((call) => call.id);
      if (idsToDelete.length > 0) {
        await deleteByIds(idsToDelete);
        console.log(
          `Trimmed ${idsToDelete.length} old entries from the database.`,
        );
      }
    }
  } catch (e) {
    console.error("Failed to trim database:", e);
  }
}

chrome.tabs.onActivated.addListener((activeInfo) =>
  initializeTabState(activeInfo.tabId),
);
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete" && tab.url) {
    initializeTabState(tabId);
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  detachDebugger(tabId);
  tabsState.delete(tabId);
});

// --- DEBUGGER EVENT LISTENER (CORE LOGIC) ---

chrome.debugger.onEvent.addListener((source, method, params: any) => {
  if (
    !isAuraCaptureEnabled ||
    !source.tabId ||
    !attachedDebuggerTabs.has(source.tabId)
  )
    return;

  if (
    method === "Network.requestWillBeSent" &&
    params.request.url.includes("/aura") &&
    params.request.method === "POST"
  ) {
    const url = new URL(params.request.url);
    let type: ApiCall["type"] = "Other";

    if (url.searchParams.has("aura.RecordUi.getRecordWithFields")) {
      type = "RecordUi";
    } else if (url.searchParams.has("aura.ApexAction.execute")) {
      type = "ApexAction";
    } else {
      return;
    }

    requestDataMap.set(params.requestId, {
      requestedAt: Date.now(),
      postData: params.request.postData,
      type,
    });
  }

  if (
    method === "Network.responseReceived" &&
    requestDataMap.has(params.requestId)
  ) {
    chrome.debugger.sendCommand(
      { tabId: source.tabId },
      "Network.getResponseBody",
      { requestId: params.requestId },
      (body: any) => {
        const requestInfo = requestDataMap.get(params.requestId);
        requestDataMap.delete(params.requestId);

        if (chrome.runtime.lastError || !body || !requestInfo) return;

        const respondedAt = Date.now();
        const responsePayload = JSON.parse(body.body);
        const requestBody = new URLSearchParams(requestInfo.postData);
        const requestMessage = JSON.parse(requestBody.get("message") || "{}");

        // Create a map of response actions for efficient lookup
        const responseActionsById = new Map(
          responsePayload.actions.map((action: any) => [action.id, action]),
        );

        // Iterate over the REQUEST actions to "unwrap" the batch
        for (const requestAction of requestMessage.actions) {
          const responseAction = responseActionsById.get(requestAction.id);
          if (!responseAction) continue; // Skip if no matching response action found

          const finalCall: ApiCall = {
            id: crypto.randomUUID(),
            tabId: source.tabId!!,
            type: requestInfo.type,
            requestedAt: requestInfo.requestedAt,
            respondedAt,
            duration: respondedAt - requestInfo.requestedAt,
            requestPayload: requestAction, // Save the individual request action
            responsePayload: responseAction, // Save the individual response action
            //@ts-ignore
            status: responseAction.state === "SUCCESS" ? "Success" : "Error",
          };

          save(finalCall).then(trimDatabase);
        }
      },
    );
  }
});

// --- MESSAGE LISTENER FOR CLIENT ---

const handleApiRequest = async (
  tabId: number,
  handler: (state: TabState) => Promise<any>,
  sendResponse: (response: any) => void,
) => {
  const tabState = tabsState.get(tabId);
  if (!tabState) {
    const errorMessage = "Salesforce session not initialized for this tab.";
    sendResponse({ status: "error", message: errorMessage });
    return;
  }
  try {
    const payload = await handler(tabState);
    sendResponse({ status: "success", payload });
  } catch (error: any) {
    sendResponse({ status: "error", message: error.message });
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (!tabId) {
    sendResponse({
      status: "error",
      message: "Message must be sent from a tab.",
    });
    return false;
  }

  (async () => {
    // Ensure state is ready before processing any message
    await initializeTabState(tabId);

    const { type, payload } = message;

    switch (type) {
      // JSforce client actions
      case "GET_RECORD":
        handleApiRequest(
          tabId,
          async (state) => {
            const tab = await chrome.tabs.get(tabId);
            const match = tab.url?.match(
              /\/lightning\/r\/([a-zA-Z0-9_]+(?:__c)?)\/([a-zA-Z0-9]{15,18})\/view/,
            );
            if (!match) throw new Error("Not a standard record page.");
            return state.jsforceConnection.sobject(match[1]).retrieve(match[2]);
          },
          sendResponse,
        );
        break;
      case "UPDATE_RECORD":
        handleApiRequest(
          tabId,
          (state) => {
            if (!payload.sObjectName || !payload.recordData?.Id)
              throw new Error("Invalid payload for update.");
            return state.jsforceConnection
              .sobject(payload.sObjectName)
              .update(payload.recordData);
          },
          sendResponse,
        );
        break;
      case "DESCRIBE_SOBJECT":
        handleApiRequest(
          tabId,
          async (state) => {
            if (!payload.sObjectName)
              throw new Error("sObjectName is required.");
            if (state.sObjectDescribeCache.has(payload.sObjectName)) {
              return state.sObjectDescribeCache.get(payload.sObjectName);
            }
            const result = await state.jsforceConnection
              .sobject(payload.sObjectName)
              .describe();
            state.sObjectDescribeCache.set(payload.sObjectName, result);
            return result;
          },
          sendResponse,
        );
        break;
      case "GET_LWC_DEBUG_STATUS":
        handleApiRequest(
          tabId,
          async (state) => {
            const userInfo = await state.jsforceConnection.identity();
            const result = await state.jsforceConnection.query<{
              UserPreferencesUserDebugModePref: boolean;
            }>(
              `SELECT UserPreferencesUserDebugModePref FROM User WHERE Id = '${userInfo.user_id}'`,
            );
            const isEnabled =
              result.records[0]?.UserPreferencesUserDebugModePref || false;
            state.debugFlags.lwc = isEnabled;
            return isEnabled;
          },
          sendResponse,
        );
        break;
      case "TOGGLE_LWC_DEBUG":
        handleApiRequest(
          tabId,
          async (state) => {
            const userInfo = await state.jsforceConnection.identity();
            await state.jsforceConnection.sobject("User").update({
              Id: userInfo.user_id,
              UserPreferencesUserDebugModePref: payload.enabled,
            });
            state.debugFlags.lwc = payload.enabled;
            return payload.enabled;
          },
          sendResponse,
        );
        break;

      // Debugger-based API call actions
      case "GET_API_CALL":
        if (!payload?.id)
          throw new Error("An 'id' is required to get an API call.");
        get(payload.id).then((result) =>
          sendResponse({ status: "success", payload: result }),
        );
        break;
      case "LIST_API_CALLS":
        list(tabId).then((result) =>
          sendResponse({ status: "success", payload: result }),
        );
        break;
      case "LIST_ALL_API_CALLS":
        listAll().then((result) =>
          sendResponse({ status: "success", payload: result }),
        );
        break;
      case "CLEAR_API_CALLS":
        clear(tabId).then(() => sendResponse({ status: "success" }));
        break;
      case "CLEAR_ALL_API_CALLS":
        clearAll().then(() => sendResponse({ status: "success" }));
        break;

      // Settings Actions
      case "GET_MAX_REQUEST_ENTRIES":
        sendResponse({
          status: "success",
          payload: { value: maxRequestEntries },
        });
        break;
      case "SET_MAX_REQUEST_ENTRIES":
        maxRequestEntries = Number(payload.value) || 500;
        await chrome.storage.local.set({ maxRequestEntries });
        sendResponse({ status: "success" });
        trimDatabase();
        break;
      case "GET_AURA_CAPTURE_STATE":
        sendResponse({
          status: "success",
          payload: { enabled: isAuraCaptureEnabled },
        });
        break;
      case "SET_AURA_CAPTURE_STATE":
        isAuraCaptureEnabled = !!payload.enable;
        await chrome.storage.local.set({ isAuraCaptureEnabled });
        sendResponse({ status: "success" });
        break;

      default:
        sendResponse({
          status: "error",
          message: `Unknown message type: ${type}`,
        });
    }
  })();
  return true; // Indicate that sendResponse will be called asynchronously.
});
