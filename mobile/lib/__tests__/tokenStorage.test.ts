jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockSecureStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStore.delete(key);
  }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getStoredToken, setStoredToken, clearStoredToken } from '../tokenStorage';

const KEY = 'auth_token';

describe('tokenStorage (native)', () => {
  beforeEach(async () => {
    mockSecureStore.clear();
    await AsyncStorage.clear();
    Platform.OS = 'ios';
  });

  it('stores the token in SecureStore, not AsyncStorage', async () => {
    await setStoredToken('jwt-1');

    expect(mockSecureStore.get(KEY)).toBe('jwt-1');
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await getStoredToken()).toBe('jwt-1');
  });

  it('moves a legacy AsyncStorage token into SecureStore on first read', async () => {
    await AsyncStorage.setItem(KEY, 'legacy-jwt');

    expect(await getStoredToken()).toBe('legacy-jwt');

    expect(mockSecureStore.get(KEY)).toBe('legacy-jwt');
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('removes a lingering plaintext copy when a new token is saved', async () => {
    await AsyncStorage.setItem(KEY, 'old-jwt');

    await setStoredToken('new-jwt');

    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await getStoredToken()).toBe('new-jwt');
  });

  it('clears both locations on logout', async () => {
    mockSecureStore.set(KEY, 'jwt');
    await AsyncStorage.setItem(KEY, 'legacy-jwt');

    await clearStoredToken();

    expect(mockSecureStore.has(KEY)).toBe(false);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await getStoredToken()).toBeNull();
  });

  it('returns null when no token exists anywhere', async () => {
    expect(await getStoredToken()).toBeNull();
  });
});

describe('tokenStorage (web fallback)', () => {
  beforeEach(async () => {
    mockSecureStore.clear();
    await AsyncStorage.clear();
    Platform.OS = 'web';
  });

  afterAll(() => {
    Platform.OS = 'ios';
  });

  it('uses AsyncStorage because SecureStore is unavailable on web', async () => {
    await setStoredToken('web-jwt');

    expect(await AsyncStorage.getItem(KEY)).toBe('web-jwt');
    expect(mockSecureStore.has(KEY)).toBe(false);
    expect(await getStoredToken()).toBe('web-jwt');

    await clearStoredToken();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });
});
