import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../lib/api';
import { useAuth } from './useAuth';
import type { Notification } from '../types';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Helper function to check if token exists
async function hasAuthToken(): Promise<boolean> {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    return !!token;
  } catch {
    return false;
  }
}

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const POLLING_INTERVAL = 30000; // 30 seconds

export function useNotifications() {
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch notifications from API
  const fetchNotifications = useCallback(async (unreadOnly = false) => {
    // Only fetch if user is authenticated
    if (!isAuthenticated || !user) {
      return;
    }

    // Check if token exists before making API call - do this first to prevent errors
    const tokenExists = await hasAuthToken();
    if (!tokenExists) {
      // Silently return without making API call
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.getNotifications({
        limit: 50,
        offset: 0,
        unreadOnly,
      });
      setNotifications(response.data);
    } catch (err: any) {
      // Silently handle authentication errors (401, "Not authenticated", etc.)
      const errorMessage = err?.message || err?.toString() || '';
      const isAuthError = 
        err?.silent ||
        err?.response?.status === 401 ||
        errorMessage.includes('Not authenticated') ||
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('UNAUTHORIZED') ||
        err?.code === 'UNAUTHORIZED' ||
        err?.code === 401;
      
      if (isAuthError) {
        // Silently handle - don't log or set error state
        setNotifications([]);
        setUnreadCount(0);
        return;
      }
      // Only set error for non-authentication errors
      setError(err.message || 'Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    // Only fetch if user is authenticated
    if (!isAuthenticated || !user) {
      setUnreadCount(0);
      return;
    }

    // Check if token exists before making API call - do this first to prevent errors
    const tokenExists = await hasAuthToken();
    if (!tokenExists) {
      // Silently return without making API call
      setUnreadCount(0);
      return;
    }

    try {
      const response = await apiClient.getUnreadCount();
      setUnreadCount(response.count);
    } catch (err: any) {
      // Silently handle authentication errors (401, "Not authenticated", etc.)
      const errorMessage = err?.message || err?.toString() || '';
      const isAuthError = 
        err?.silent ||
        err?.response?.status === 401 ||
        errorMessage.includes('Not authenticated') ||
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('UNAUTHORIZED') ||
        err?.code === 'UNAUTHORIZED' ||
        err?.code === 401;
      
      if (isAuthError) {
        // Silently handle - don't log
        setUnreadCount(0);
        return;
      }
      // Only log non-authentication errors (but they should be rare now)
    }
  }, [isAuthenticated, user]);

  // Mark notification as read
  const markAsRead = useCallback(async (id: string) => {
    try {
      await apiClient.markNotificationAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      await fetchUnreadCount();
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
      throw err;
    }
  }, [fetchUnreadCount]);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      await apiClient.markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
      throw err;
    }
  }, []);

  // Setup push notifications
  const setupPushNotifications = useCallback(async () => {
    try {
      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('Push notification permissions not granted');
        return;
      }

      // Get device token
      // projectId is optional - Expo can infer it from app.json in managed workflow
      // In bare workflow or if inference fails, we need to provide it explicitly
      let tokenData: Notifications.ExpoPushToken;
      try {
        const tokenOptions: { projectId?: string } = {};
        if (process.env.EXPO_PUBLIC_PROJECT_ID) {
          tokenOptions.projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
        }
        tokenData = await Notifications.getExpoPushTokenAsync(tokenOptions);
      } catch (err: any) {
        // If projectId is missing and can't be inferred, log warning and skip push notifications
        if (err.message?.includes('projectId')) {
          console.warn('Push notifications disabled: projectId not configured. Set EXPO_PUBLIC_PROJECT_ID in your .env file or configure it in app.json');
          return;
        }
        throw err;
      }
      const token = tokenData.data;

      // Register token with backend
      const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
      await apiClient.registerDeviceToken(token, platform);

      // Store token locally
      await AsyncStorage.setItem('push_token', token);

      // Setup notification listeners
      const receivedListener = Notifications.addNotificationReceivedListener((notification) => {
        // Handle notification received while app is in foreground
        console.log('Notification received:', notification);
        fetchUnreadCount();
      });

      const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
        // Handle notification tap
        const data = response.notification.request.content.data;
        if (data?.reportId) {
          // Navigate to report - this will be handled by the app
          console.log('Navigate to report:', data.reportId);
        }
      });

      return () => {
        receivedListener.remove();
        responseListener.remove();
      };
    } catch (err) {
      console.error('Failed to setup push notifications:', err);
    }
  }, [fetchUnreadCount]);

  // Start polling for notifications
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // Only start polling if authenticated
    if (!isAuthenticated || !user) {
      return;
    }

    pollingIntervalRef.current = setInterval(() => {
      // Double-check authentication before each poll
      if (isAuthenticated && user) {
        fetchUnreadCount();
        fetchNotifications(true); // Only fetch unread
      } else {
        // Stop polling if no longer authenticated
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    }, POLLING_INTERVAL);
  }, [isAuthenticated, user, fetchNotifications, fetchUnreadCount]);

  // Initialize notifications only when authenticated
  useEffect(() => {
    let isMounted = true;
    let initTimer: NodeJS.Timeout | null = null;

    const initializeNotifications = async () => {
      // Wait for auth to finish loading
      if (authLoading) {
        return;
      }

      if (!isAuthenticated || !user) {
        // Clear notifications and stop polling if not authenticated
        if (isMounted) {
          setNotifications([]);
          setUnreadCount(0);
        }
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        return;
      }

      // Wait for token to be available before making API calls
      const tokenExists = await hasAuthToken();
      if (!tokenExists || !isMounted) {
        if (isMounted) {
          setNotifications([]);
          setUnreadCount(0);
        }
        return;
      }

      // User is authenticated and token is available, fetch notifications
      // Add a small delay to ensure everything is ready
      initTimer = setTimeout(() => {
        if (!isMounted) return;
        
        try {
          fetchNotifications().catch(() => {
            // Silently handle - already handled in fetchNotifications
          });
          fetchUnreadCount().catch(() => {
            // Silently handle - already handled in fetchUnreadCount
          });
          setupPushNotifications().catch(() => {
            // Silently handle push notification setup errors
          });
          startPolling();
        } catch (err) {
          // Silently handle any initialization errors
        }
      }, 150);
    };

    initializeNotifications();

    return () => {
      isMounted = false;
      if (initTimer) {
        clearTimeout(initTimer);
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [authLoading, isAuthenticated, user, fetchNotifications, fetchUnreadCount, setupPushNotifications, startPolling]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    refresh: () => {
      fetchNotifications();
      fetchUnreadCount();
    },
  };
}

