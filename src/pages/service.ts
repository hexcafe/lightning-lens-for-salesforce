/**
 * This is a proxy client for use in content scripts.
 * Its methods send messages to the background script to perform the actual API calls.
 */
export class ContentScriptClient {
  /**
   * Sends a message to the background script and returns the response payload.
   * @param message - The message object to send.
   * @returns A promise that resolves with the payload from the background script's response.
   */
  private async sendMessage<T>(message: {
    type: string;
    payload?: any;
  }): Promise<T> {
    // In a real extension, you might add more robust error checking here.
    const response = await chrome.runtime.sendMessage(message);
    if (response.status === "error") {
      // Propagate a clear error message from the background script
      throw new Error(`Extension background error: ${response.message}`);
    }
    return response.payload;
  }

  // --- JSforce API Actions ---

  getRecord(): Promise<any> {
    return this.sendMessage({ type: "GET_RECORD" });
  }

  updateRecord(sObjectName: string, recordData: any): Promise<any> {
    return this.sendMessage({
      type: "UPDATE_RECORD",
      payload: { sObjectName, recordData },
    });
  }

  describeSObject(sObjectName: string): Promise<any> {
    return this.sendMessage({
      type: "DESCRIBE_SOBJECT",
      payload: { sObjectName },
    });
  }

  getLwcDebugStatus(): Promise<boolean> {
    return this.sendMessage({ type: "GET_LWC_DEBUG_STATUS" });
  }

  toggleLwcDebug(enabled: boolean): Promise<void> {
    return this.sendMessage({
      type: "TOGGLE_LWC_DEBUG",
      payload: { enabled },
    });
  }

  // --- API Call Interception Actions ---

  getApiCall(id: string): Promise<any> {
    return this.sendMessage({ type: "GET_API_CALL", payload: { id } });
  }

  listApiCalls(): Promise<any[]> {
    return this.sendMessage({ type: "LIST_API_CALLS" });
  }

  listAllApiCalls(): Promise<any[]> {
    return this.sendMessage({ type: "LIST_ALL_API_CALLS" });
  }

  clearApiCalls(): Promise<void> {
    return this.sendMessage({ type: "CLEAR_API_CALLS" });
  }

  clearAllApiCalls(): Promise<void> {
    return this.sendMessage({ type: "CLEAR_ALL_API_CALLS" });
  }

  // --- Settings Actions ---

  setMaxRequestEntries(value: number): Promise<void> {
    return this.sendMessage({
      type: "SET_MAX_REQUEST_ENTRIES",
      payload: { value },
    });
  }

  async getMaxRequestEntries(): Promise<number> {
    const payload = await this.sendMessage<{ value: number }>({
      type: "GET_MAX_REQUEST_ENTRIES",
    });
    return payload.value;
  }

  setAuraCaptureState(enable: boolean): Promise<void> {
    return this.sendMessage({
      type: "SET_AURA_CAPTURE_STATE",
      payload: { enable },
    });
  }

  async getAuraCaptureState(): Promise<boolean> {
    const payload = await this.sendMessage<{ enabled: boolean }>({
      type: "GET_AURA_CAPTURE_STATE",
    });
    return payload.enabled;
  }
}

// Export a singleton instance for easy use in your content scripts
export const client = new ContentScriptClient();
