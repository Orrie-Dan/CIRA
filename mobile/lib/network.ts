import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState, useCallback } from 'react';

/**
 * Check if device is currently online
 */
export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected ?? false;
}

/**
 * Hook to monitor network connectivity status
 */
export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [connectionType, setConnectionType] = useState<string | null>(null);

  useEffect(() => {
    // Get initial state
    NetInfo.fetch().then((state) => {
      setIsConnected(state.isConnected ?? false);
      setConnectionType(state.type);
    });

    // Subscribe to network state updates
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? false);
      setConnectionType(state.type);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return { isConnected, connectionType };
}

/**
 * Listen for network connectivity changes
 */
export function onNetworkChange(callback: (isConnected: boolean) => void): () => void {
  const unsubscribe = NetInfo.addEventListener((state) => {
    callback(state.isConnected ?? false);
  });

  return unsubscribe;
}

