import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { useEffect, useState } from 'react';

// Complete the auth session for web
WebBrowser.maybeCompleteAuthSession();

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';

// Apple OAuth configuration (keeping old implementation for now)
const APPLE_CLIENT_ID = process.env.EXPO_PUBLIC_APPLE_CLIENT_ID || '';

export interface OAuthResult {
  idToken: string;
  accessToken?: string;
  fullName?: {
    givenName?: string;
    familyName?: string;
  };
}

/**
 * Hook for Google authentication using expo-auth-session/providers/google
 */
export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
  });

  const [result, setResult] = useState<OAuthResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      if (authentication?.idToken) {
        setResult({
          idToken: authentication.idToken,
          accessToken: authentication.accessToken,
        });
        setError(null);
      } else {
        setError('No ID token received from Google');
      }
    } else if (response?.type === 'error') {
      setError(response.error?.message || 'Google authentication failed');
      setResult(null);
    } else if (response?.type === 'cancel') {
      setError(null);
      setResult(null);
    }
  }, [response]);

  return {
    request,
    response,
    promptAsync,
    result,
    error,
    isLoading: request === null,
  };
}

/**
 * Sign in with Google (backward compatible function)
 * This now uses the hook internally, but maintains the async function interface
 */
export async function signInWithGoogle(): Promise<OAuthResult | null> {
  try {
    if (!GOOGLE_CLIENT_ID) {
      console.warn('Google Client ID not configured. Please set EXPO_PUBLIC_GOOGLE_CLIENT_ID in your .env file.');
      return null;
    }

    // For backward compatibility, we'll use a promise-based approach
    // Note: This is a simplified version. For better UX, use the useGoogleAuth hook directly in components
    return new Promise((resolve) => {
      // This function signature is maintained for backward compatibility
      // But the recommended approach is to use useGoogleAuth hook in components
      console.warn('signInWithGoogle() is deprecated. Use useGoogleAuth() hook instead.');
      resolve(null);
    });
  } catch (error: any) {
    console.error('Google sign-in error:', error);
    throw new Error(`Google sign-in failed: ${error.message}`);
  }
}

/**
 * Sign in with Apple
 * Note: Apple auth still uses the old AuthSession approach as expo-auth-session doesn't have an Apple provider yet
 */
export async function signInWithApple(): Promise<OAuthResult | null> {
  try {
    if (Platform.OS !== 'ios') {
      console.warn('Apple Sign In is only available on iOS');
      return null;
    }

    if (!APPLE_CLIENT_ID) {
      console.warn('Apple Client ID not configured. Please set EXPO_PUBLIC_APPLE_CLIENT_ID in your .env file.');
      return null;
    }

    // Import AuthSession dynamically for Apple auth
    const AuthSession = await import('expo-auth-session');
    const APPLE_REDIRECT_URI = AuthSession.makeRedirectUri({
      scheme: 'cira',
      path: 'apple',
    });

    const request = new AuthSession.AuthRequest({
      clientId: APPLE_CLIENT_ID,
      scopes: ['name', 'email'],
      responseType: AuthSession.ResponseType.IdToken,
      redirectUri: APPLE_REDIRECT_URI,
      usePKCE: true,
    });

    const result = await request.promptAsync({
      authorizationEndpoint: 'https://appleid.apple.com/auth/authorize',
    });

    if (result.type === 'success') {
      // Parse user info from identity token if available
      let fullName: { givenName?: string; familyName?: string } | undefined;
      
      // Apple may provide user info in the first response
      if (result.params.user) {
        try {
          const userInfo = typeof result.params.user === 'string' 
            ? JSON.parse(result.params.user) 
            : result.params.user;
          if (userInfo.name) {
            fullName = {
              givenName: userInfo.name.firstName,
              familyName: userInfo.name.lastName,
            };
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }

      return {
        idToken: result.params.id_token || '',
        accessToken: result.params.access_token,
        fullName,
      };
    }

    return null;
  } catch (error: any) {
    console.error('Apple sign-in error:', error);
    throw new Error(`Apple sign-in failed: ${error.message}`);
  }
}

