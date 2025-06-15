/**
 * Content‑script proxy client that speaks the compact‑memory (v3) background
 * protocol.  Each call is a thin `chrome.runtime.sendMessage` wrapper that
 * returns the payload or throws on background error.
 */
export interface SettingsPayload {
  isAuraCaptureEnabled: boolean;
  maxRequestEntries: number;
}

export class ContentScriptClient {
  private async sendMessage<T>(message: { type: string; payload?: any }): Promise<T> {
    const resp = await chrome.runtime.sendMessage(message);
    if (resp?.status === "error") throw new Error(`background: ${resp.message}`);
    return resp.payload as T;
  }

  // ─────────────────────────  JSForce helpers  ─────────────────────────
  getRecord() {
    return this.sendMessage<any>({ type: "GET_RECORD" });
  }
  updateRecord(sObjectName: string, recordData: any) {
    return this.sendMessage<any>({ type: "UPDATE_RECORD", payload: { sObjectName, recordData } });
  }
  describeSObject(sObjectName: string) {
    return this.sendMessage<any>({ type: "DESCRIBE_SOBJECT", payload: { sObjectName } });
  }

  // LWC debug helpers
  getLwcDebugStatus() {
    return this.sendMessage<boolean>({ type: "GET_LWC_DEBUG_STATUS" });
  }
  toggleLwcDebug(enabled: boolean) {
    return this.sendMessage<boolean>({ type: "TOGGLE_LWC_DEBUG", payload: { enabled } });
  }

  // ─────────────────────────  Aura logs  ─────────────────────────
  getApiCall(id: string) {
    return this.sendMessage<any>({ type: "GET_API_CALL", payload: { id } });
  }
  listApiCalls() {
    return this.sendMessage<any[]>({ type: "LIST_API_CALLS" });
  }
  clearApiCalls() {
    return this.sendMessage<void>({ type: "CLEAR_API_CALLS" });
  }

  // ─────────────────────────  Settings  ─────────────────────────
  getSettings() {
    return this.sendMessage<SettingsPayload>({ type: "GET_SETTINGS" });
  }
  /** Pass a partial SettingsPayload, e.g. `{ maxRequestEntries: 1000 }` */
  setSettings(partial: Partial<SettingsPayload>) {
    return this.sendMessage<void>({ type: "SET_SETTINGS", payload: partial });
  }

  // convenience wrappers around setSettings ---------------------------
  setMaxRequestEntries(value: number) {
    return this.setSettings({ maxRequestEntries: value });
  }
  setAuraCaptureState(enable: boolean) {
    return this.setSettings({ isAuraCaptureEnabled: enable });
  }
  async getMaxRequestEntries() {
    const s = await this.getSettings();
    return s.maxRequestEntries;
  }
  async getAuraCaptureState() {
    const s = await this.getSettings();
    return s.isAuraCaptureEnabled;
  }
}

export const client = new ContentScriptClient();
