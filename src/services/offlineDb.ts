import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type {
  PendingCheck,
  CachedTemplate,
  CachedVehicle,
  CheckTemplate,
  Vehicle,
} from '@/types';

// ============================================================================
// IndexedDB Schema
// ============================================================================

interface TipperCheckDB extends DBSchema {
  pendingChecks: {
    key: string;
    value: PendingCheck;
    indexes: {
      'by-vehicle': string;
      'by-date': string;
    };
  };
  cachedTemplates: {
    key: string;
    value: CachedTemplate;
  };
  cachedVehicles: {
    key: string;
    value: CachedVehicle;
    indexes: {
      'by-org': string;
    };
  };
  draftCheck: {
    key: string;
    value: {
      id: string;
      data: Partial<PendingCheck>;
      updatedAt: string;
    };
  };
}

const DB_NAME = 'tippercheck-offline';
const DB_VERSION = 2;

let dbInstance: IDBPDatabase<TipperCheckDB> | null = null;

// ============================================================================
// Database Initialization
// ============================================================================

export async function getDb(): Promise<IDBPDatabase<TipperCheckDB>> {
  if (dbInstance) return dbInstance;

  try {
    dbInstance = await openDB<TipperCheckDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        console.log(`Upgrading IndexedDB from v${oldVersion} to v${DB_VERSION}`);

        // Version 1 -> 2: Fix cachedVehicles index (company_id -> org_id)
        if (oldVersion < 2 && db.objectStoreNames.contains('cachedVehicles')) {
          db.deleteObjectStore('cachedVehicles');
        }

        // Pending checks store
        if (!db.objectStoreNames.contains('pendingChecks')) {
          const pendingStore = db.createObjectStore('pendingChecks', {
            keyPath: 'client_id',
          });
          pendingStore.createIndex('by-vehicle', 'vehicle_id');
          pendingStore.createIndex('by-date', 'check_date');
        }

        // Cached templates store
        if (!db.objectStoreNames.contains('cachedTemplates')) {
          db.createObjectStore('cachedTemplates', { keyPath: 'template.id' });
        }

        // Cached vehicles store (recreated in v2 with correct index)
        if (!db.objectStoreNames.contains('cachedVehicles')) {
          const vehicleStore = db.createObjectStore('cachedVehicles', {
            keyPath: 'vehicle.id',
          });
          vehicleStore.createIndex('by-org', 'vehicle.org_id');
        }

        // Draft check store (for in-progress checks)
        if (!db.objectStoreNames.contains('draftCheck')) {
          db.createObjectStore('draftCheck', { keyPath: 'id' });
        }
      },
    });
  } catch (err) {
    console.error('Failed to open IndexedDB:', err);
    throw err;
  }

  return dbInstance;
}

// ============================================================================
// Pending Checks (offline-created checks awaiting sync)
// ============================================================================

export async function savePendingCheck(check: PendingCheck): Promise<void> {
  const db = await getDb();
  await db.put('pendingChecks', check);
}

export async function getPendingChecks(): Promise<PendingCheck[]> {
  try {
    const db = await getDb();
    const checks = await db.getAll('pendingChecks');
    console.log('getPendingChecks returning:', checks.length, 'checks');
    return checks;
  } catch (err) {
    console.error('Error getting pending checks:', err);
    return [];
  }
}

export async function getPendingCheckById(
  clientId: string
): Promise<PendingCheck | undefined> {
  const db = await getDb();
  return db.get('pendingChecks', clientId);
}

export async function deletePendingCheck(clientId: string): Promise<void> {
  const db = await getDb();
  await db.delete('pendingChecks', clientId);
}

export async function getPendingCheckCount(): Promise<number> {
  const db = await getDb();
  return db.count('pendingChecks');
}

export async function updatePendingCheckSyncAttempt(
  clientId: string,
  error: string
): Promise<void> {
  const db = await getDb();
  const check = await db.get('pendingChecks', clientId);
  if (check) {
    check.sync_attempts += 1;
    check.last_sync_error = error;
    await db.put('pendingChecks', check);
  }
}

export async function resetAllSyncAttempts(): Promise<number> {
  const db = await getDb();
  const checks = await db.getAll('pendingChecks');
  let resetCount = 0;

  for (const check of checks) {
    if (check.sync_attempts > 0) {
      check.sync_attempts = 0;
      check.last_sync_error = null;
      await db.put('pendingChecks', check);
      resetCount++;
    }
  }

  console.log(`Reset sync attempts for ${resetCount} checks`);
  return resetCount;
}

// ============================================================================
// Cached Templates (for offline access)
// ============================================================================

export async function cacheTemplates(templates: CheckTemplate[]): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction('cachedTemplates', 'readwrite');
    const now = new Date().toISOString();

    for (const template of templates) {
      await tx.store.put({
        template,
        cached_at: now,
      });
    }

    await tx.done;
  } catch (err) {
    console.error('Error caching templates:', err);
  }
}

export async function getCachedTemplates(): Promise<CheckTemplate[]> {
  try {
    const db = await getDb();
    const cached = await db.getAll('cachedTemplates');
    return cached.map((c) => c.template);
  } catch (err) {
    console.error('Error getting cached templates:', err);
    return [];
  }
}

export async function getCachedTemplateById(
  id: string
): Promise<CheckTemplate | undefined> {
  const db = await getDb();
  const cached = await db.get('cachedTemplates', id);
  return cached?.template;
}

export async function getCachedTemplateByCode(
  code: string
): Promise<CheckTemplate | undefined> {
  const db = await getDb();
  const all = await db.getAll('cachedTemplates');
  const match = all.find((c) => c.template.code === code);
  return match?.template;
}

// ============================================================================
// Cached Vehicles (for offline vehicle selection)
// ============================================================================

export async function cacheVehicles(vehicles: Vehicle[]): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction('cachedVehicles', 'readwrite');
    const now = new Date().toISOString();

    for (const vehicle of vehicles) {
      await tx.store.put({
        vehicle,
        cached_at: now,
      });
    }

    await tx.done;
  } catch (err) {
    console.error('Error caching vehicles:', err);
  }
}

export async function getCachedVehicles(): Promise<Vehicle[]> {
  try {
    const db = await getDb();
    const cached = await db.getAll('cachedVehicles');
    return cached.map((c) => c.vehicle);
  } catch (err) {
    console.error('Error getting cached vehicles:', err);
    return [];
  }
}

export async function getCachedVehicleById(
  id: string
): Promise<Vehicle | undefined> {
  const db = await getDb();
  const cached = await db.get('cachedVehicles', id);
  return cached?.vehicle;
}

export async function getCachedVehiclesByOrg(
  orgId: string
): Promise<Vehicle[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('cachedVehicles', 'by-org', orgId);
  return all.map((c) => c.vehicle);
}

// ============================================================================
// Draft Check (in-progress check that hasn't been submitted)
// ============================================================================

const DRAFT_KEY = 'current-draft';

export async function saveDraftCheck(
  data: Partial<PendingCheck>
): Promise<void> {
  const db = await getDb();
  await db.put('draftCheck', {
    id: DRAFT_KEY,
    data,
    updatedAt: new Date().toISOString(),
  });
}

export async function getDraftCheck(): Promise<Partial<PendingCheck> | null> {
  const db = await getDb();
  const draft = await db.get('draftCheck', DRAFT_KEY);
  return draft?.data ?? null;
}

export async function clearDraftCheck(): Promise<void> {
  const db = await getDb();
  await db.delete('draftCheck', DRAFT_KEY);
}

// ============================================================================
// Utility Functions
// ============================================================================

export async function clearAllOfflineData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ['pendingChecks', 'cachedTemplates', 'cachedVehicles', 'draftCheck'],
    'readwrite'
  );
  await Promise.all([
    tx.objectStore('pendingChecks').clear(),
    tx.objectStore('cachedTemplates').clear(),
    tx.objectStore('cachedVehicles').clear(),
    tx.objectStore('draftCheck').clear(),
  ]);
  await tx.done;
}

export function generateClientId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
