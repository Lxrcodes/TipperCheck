import { WifiOff, Wifi, CloudOff, RefreshCw, Loader2 } from 'lucide-react';

interface OfflineBannerProps {
  isOffline: boolean;
  wasOffline: boolean;
  pendingCount: number;
  isSyncing?: boolean;
  onRetrySync?: () => void;
  onRetryFailed?: () => void;
}

export function OfflineBanner({
  isOffline,
  wasOffline,
  pendingCount,
  isSyncing = false,
  onRetrySync,
  onRetryFailed,
}: OfflineBannerProps) {
  // Don't show anything if online, never was offline, and no pending data
  if (!isOffline && !wasOffline && pendingCount === 0) {
    return null;
  }

  // Currently offline
  if (isOffline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white">
        <div className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium">
          <WifiOff className="w-4 h-4 animate-pulse" />
          <span>No Connection - Checks will sync when back online</span>
        </div>
      </div>
    );
  }

  // Back online with pending data
  if (pendingCount > 0) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white">
        <div className="flex items-center justify-between px-4 py-2 text-sm font-medium">
          <div className="flex items-center gap-2">
            <CloudOff className="w-4 h-4" />
            <span>
              {pendingCount} check{pendingCount !== 1 ? 's' : ''} pending upload
            </span>
          </div>
          {(onRetryFailed || onRetrySync) && (
            <button
              onClick={onRetryFailed ?? onRetrySync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1 bg-white/20 rounded hover:bg-white/30 disabled:opacity-50 transition-colors"
            >
              {isSyncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>{isSyncing ? 'Syncing...' : 'Retry Sync'}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Just came back online (show briefly)
  if (wasOffline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-green-600 text-white animate-fade-out">
        <div className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium">
          <Wifi className="w-4 h-4" />
          <span>Connection Restored</span>
        </div>
      </div>
    );
  }

  return null;
}
