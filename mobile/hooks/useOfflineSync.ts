import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { syncPendingReports } from '../lib/sync';
import { getSyncQueue } from '../lib/storage';
import { useNetworkStatus } from '../lib/network';

const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function useOfflineSync() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const { isConnected } = useNetworkStatus();
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Update pending count
  const updatePendingCount = useCallback(async () => {
    const queue = await getSyncQueue();
    setPendingCount(queue.length);
  }, []);

  // Perform sync
  const performSync = useCallback(async () => {
    if (!isConnected || isSyncing) {
      return;
    }

    try {
      setIsSyncing(true);
      const result = await syncPendingReports();
      setLastSyncTime(Date.now());
      
      // Update pending count after sync
      await updatePendingCount();
      
      if (__DEV__) {
        console.log('Sync completed:', result);
      }
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isConnected, isSyncing, updatePendingCount]);

  // Manual sync trigger
  const syncNow = useCallback(async () => {
    if (isSyncing) {
      return;
    }
    await performSync();
  }, [isSyncing, performSync]);

  // Sync on app launch (when online)
  useEffect(() => {
    if (isConnected) {
      // Small delay to ensure app is fully loaded
      const timer = setTimeout(() => {
        performSync();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []); // Only on mount

  // Sync when network reconnects
  useEffect(() => {
    if (isConnected && !isSyncing) {
      performSync();
    }
  }, [isConnected]); // When connectivity changes

  // Background sync every 5 minutes when online
  useEffect(() => {
    if (isConnected) {
      syncIntervalRef.current = setInterval(() => {
        if (!isSyncing) {
          performSync();
        }
      }, SYNC_INTERVAL);

      return () => {
        if (syncIntervalRef.current) {
          clearInterval(syncIntervalRef.current);
        }
      };
    } else {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    }
  }, [isConnected, isSyncing, performSync]);

  // Sync when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        isConnected
      ) {
        performSync();
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isConnected, performSync]);

  // Initial pending count load
  useEffect(() => {
    updatePendingCount();
  }, [updatePendingCount]);

  // Update pending count periodically
  useEffect(() => {
    const interval = setInterval(updatePendingCount, 10000); // Every 10 seconds
    return () => clearInterval(interval);
  }, [updatePendingCount]);

  return {
    syncNow,
    pendingCount,
    isSyncing,
    lastSyncTime,
    isOnline: isConnected ?? false,
  };
}

