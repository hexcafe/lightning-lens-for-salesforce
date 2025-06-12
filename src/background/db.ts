import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface ApiCall {
  id: string;
  tabId: number; // The ID of the tab that originated the call
  requestedAt: number; // Timestamp when the request was made
  respondedAt: number; // Timestamp when the response was received
  duration: number; // The difference in milliseconds
  requestPayload: any;
  responsePayload: any;
  status: 'Success' | 'Error';
  type: 'ApexAction' | 'RecordUi' | 'Other'; // The type of API call
}


// --- DATABASE SCHEMA ---

interface UnifiedDB extends DBSchema {
  apiCalls: {
    key: string; // The key is now a string (for UUIDs)
    value: ApiCall;
    indexes: { requestedAt: number; type: string; tabId: number };
  };
}

const DB_NAME = 'SalesforceDevTools';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<UnifiedDB>> | null = null;

function getDb() {
    if (!dbPromise) {
        dbPromise = openDB<UnifiedDB>(DB_NAME, DB_VERSION, {
            upgrade(db) {
                // If an old 'apiCalls' store exists, delete it to recreate with the new schema
                if (db.objectStoreNames.contains('apiCalls')) {
                    db.deleteObjectStore('apiCalls');
                }

                const store = db.createObjectStore('apiCalls', {
                    keyPath: 'id', // The primary key is the 'id' field
                });
                store.createIndex('requestedAt', 'requestedAt'); // Index for sorting all calls by time
                store.createIndex('type', 'type'); // Index for filtering by call type
                store.createIndex('tabId', 'tabId'); // Index for filtering by tab ID
            },
        });
    }
    return dbPromise;
}

/**
 * Saves an API call to the IndexedDB store.
 * @param call - The API call data to store.
 */
export async function save(call: ApiCall): Promise<void> {
  const db = await getDb();
  await db.add('apiCalls', call);
}

/**
 * Retrieves a single API call by its ID (UUID).
 * @param id The ID of the call to retrieve.
 * @returns A promise that resolves to the ApiCall, or undefined if not found.
 */
export async function get(id: string): Promise<ApiCall | undefined> {
    const db = await getDb();
    return db.get('apiCalls', id);
}

/**
 * Retrieves all API calls for a specific tab, sorted by the most recent.
 * @param tabId - The ID of the tab to retrieve calls for.
 * @returns A promise that resolves to an array of API calls for the given tab.
 */
export async function list(tabId: number): Promise<ApiCall[]> {
  const db = await getDb();
  const calls = await db.getAllFromIndex('apiCalls', 'tabId', tabId);
  // Sort in-memory since we're not using a compound index for simplicity here
  return calls.sort((a, b) => b.requestedAt - a.requestedAt);
}

/**
 * Retrieves all API calls from all tabs, sorted by the most recent.
 * @returns A promise that resolves to an array of all API calls.
 */
export async function listAll(): Promise<ApiCall[]> {
  const db = await getDb();
  return db.getAllFromIndex('apiCalls', 'requestedAt').then(items => items.reverse());
}

/**
 * Clears all stored API calls for a specific tab from the database.
 * @param tabId - The ID of the tab to clear calls for.
 */
export async function clear(tabId: number): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('apiCalls', 'readwrite');
    const index = tx.store.index('tabId');
    let cursor = await index.openCursor(tabId);
    while (cursor) {
        cursor.delete();
        cursor = await cursor.continue();
    }
    await tx.done;
}

/**
 * Clears all stored API calls from the database.
 */
export async function clearAll(): Promise<void> {
  const db = await getDb();
  await db.clear('apiCalls');
}

/**
 * Deletes a list of API calls by their IDs.
 * @param ids - An array of UUIDs to delete.
 */
export async function deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDb();
    const tx = db.transaction('apiCalls', 'readwrite');
    await Promise.all(ids.map(id => tx.store.delete(id)));
    await tx.done;
}
