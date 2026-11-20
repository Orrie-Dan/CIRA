import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Session token storage.
 *
 * On iOS/Android the token lives in the OS keychain/keystore via
 * expo-secure-store (encrypted at rest, not included in backups the way
 * AsyncStorage's plain files are). SecureStore is unavailable on web, so web
 * falls back to AsyncStorage.
 *
 * Older app versions stored the token in AsyncStorage. The first read moves it
 * into SecureStore and deletes the plaintext copy, so upgrading users stay
 * signed in.
 */
const TOKEN_KEY = 'auth_token';

function isSecureStoreAvailable(): boolean {
  return Platform.OS !== 'web';
}

export async function getStoredToken(): Promise<string | null> {
  if (!isSecureStoreAvailable()) {
    return AsyncStorage.getItem(TOKEN_KEY);
  }

  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) return token;

  // One-time migration from the old plaintext location.
  const legacy = await AsyncStorage.getItem(TOKEN_KEY);
  if (!legacy) return null;

  await SecureStore.setItemAsync(TOKEN_KEY, legacy);
  await AsyncStorage.removeItem(TOKEN_KEY);
  return legacy;
}

export async function setStoredToken(token: string): Promise<void> {
  if (!isSecureStoreAvailable()) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  // Make sure no plaintext copy from an older version lingers.
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function clearStoredToken(): Promise<void> {
  // Clear both locations so a legacy copy can't resurrect the session.
  await AsyncStorage.removeItem(TOKEN_KEY);
  if (isSecureStoreAvailable()) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}
