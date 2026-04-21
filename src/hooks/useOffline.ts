import { useState, useEffect, useCallback } from 'react';
import { getPendingCheckCount, resetAllSyncAttempts } from '@/services/offlineDb';
import { syncPendingChecks } from '@/services/syncManager';
import type { OfflineState, SyncResult } from '@/types';

export function useOffline() {
  const [state, setState] = useState<OfflineState>({
    isOffline: !navigator.onLine,
    wasOffline: false,
    pendingCount: 0,
  });
  const [isSyncing, setIsSyncing] = useState(false);

  // Update pending count
  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingCheckCount();
    setState((prev) => ({ ...prev, pendingCount: count }));
  }, []);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setState((prev) => ({
        ...prev,
        isOffline: false,
        wasOffline: prev.isOffline,
      }));

      // Clear wasOffline after showing "Connection Restored"
      setTimeout(() => {
        setState((prev) => ({ ...prev, wasOffline: false }));
      }, 3000);
    };

    const handleOffline = () => {
      setState((prev) => ({
        ...prev,
        isOffline: true,
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial pending count
    refreshPendingCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshPendingCount]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (!state.isOffline && state.pendingCount > 0) {
      syncPendingChecks().then(() => {
        refreshPendingCount();
      });
    }
  }, [state.isOffline, state.pendingCount, refreshPendingCount]);

  // Manual sync trigger
  const triggerSync = useCallback(async (): Promise<SyncResult> => {
    if (state.isOffline) {
      return {
        success: false,
        synced_count: 0,
        failed_count: 0,
        errors: ['Cannot sync while offline'],
      };
    }

    setIsSyncing(true);
    try {
      const result = await syncPendingChecks();
      await refreshPendingCount();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [state.isOffline, refreshPendingCount]);

  // Reset failed syncs and retry
  const retryFailedSyncs = useCallback(async (): Promise<SyncResult> => {
    if (state.isOffline) {
      return {
        success: false,
        synced_count: 0,
        failed_count: 0,
        errors: ['Cannot sync while offline'],
      };
    }

    setIsSyncing(true);
    try {
      // Reset all sync attempts first
      await resetAllSyncAttempts();
      // Then trigger sync
      const result = await syncPendingChecks();
      await refreshPendingCount();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [state.isOffline, refreshPendingCount]);

  return {
    ...state,
    isSyncing,
    triggerSync,
    retryFailedSyncs,
    refreshPendingCount,
  };
}
