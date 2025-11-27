import { Stack } from 'expo-router';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import { ErrorUtils } from 'react-native';
import { colors } from '../lib/theme';
import { OfflineBanner } from '../components/OfflineBanner';

// Set up global error handler immediately (before any components render)
// Only set up if ErrorUtils is available
if (ErrorUtils && typeof ErrorUtils.getGlobalHandler === 'function') {
  const originalErrorHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    // Check if this is an authentication error
    const errorMessage = error?.message || error?.toString() || '';
    const isAuthError = 
      errorMessage.includes('Not authenticated') ||
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('UNAUTHORIZED') ||
      (error as any)?.response?.status === 401 ||
      (error as any)?.code === 401 ||
      (error as any)?.code === 'UNAUTHORIZED';
    
    // Suppress authentication errors - don't log them
    if (isAuthError) {
      // Silently ignore authentication errors
      return;
    }
    
    // For non-authentication errors, use the original handler
    if (originalErrorHandler) {
      originalErrorHandler(error, isFatal);
    }
  });
}

// Intercept console.error immediately to suppress auth errors
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  // Check if any argument contains authentication error
  const hasAuthError = args.some((arg) => {
    if (typeof arg === 'string') {
      return arg.includes('Not authenticated') || 
             arg.includes('Unauthorized') ||
             arg.includes('UNAUTHORIZED') ||
             arg.includes('Failed to fetch notifications') ||
             arg.includes('Failed to fetch unread count');
    }
    if (arg instanceof Error) {
      const msg = arg.message || '';
      return msg.includes('Not authenticated') ||
             msg.includes('Unauthorized') ||
             msg.includes('UNAUTHORIZED');
    }
    if (arg?.response?.status === 401) {
      return true;
    }
    // Check stack traces
    if (typeof arg === 'object' && arg !== null) {
      const str = JSON.stringify(arg);
      if (str.includes('Not authenticated') || str.includes('notifications.ts')) {
        return true;
      }
    }
    return false;
  });

  // Don't log authentication errors
  if (!hasAuthError) {
    originalConsoleError.apply(console, args);
  }
};

// Preserve any properties that React Native might need
Object.setPrototypeOf(console.error, originalConsoleError);
Object.keys(originalConsoleError).forEach(key => {
  (console.error as any)[key] = (originalConsoleError as any)[key];
});

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    primaryContainer: colors.primaryLight + '20',
    secondary: colors.secondary,
    error: colors.error,
    background: colors.surface,
    surface: colors.background,
    surfaceVariant: colors.surfaceVariant,
    onPrimary: '#FFFFFF',
    onSecondary: '#FFFFFF',
    onBackground: colors.text,
    onSurface: colors.text,
  },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <OfflineBanner />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="help" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="about" />
        </Stack>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
