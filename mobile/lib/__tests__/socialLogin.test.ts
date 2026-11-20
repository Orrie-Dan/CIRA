const mockPost = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: () => ({
      post: (...args: unknown[]) => mockPost(...args),
      get: jest.fn(),
      interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    }),
  },
}));

const mockSetStoredToken = jest.fn(async (_token: string) => undefined);
jest.mock('../tokenStorage', () => ({
  getStoredToken: jest.fn(async () => null),
  setStoredToken: (token: string) => mockSetStoredToken(token),
  clearStoredToken: jest.fn(async () => undefined),
}));

import { apiClient } from '../api';

const user = { id: 'u1', email: 'u@test.com', role: 'citizen' };

describe('ApiClient social login', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockSetStoredToken.mockClear();
  });

  it('posts the Google ID token and stores the returned session token', async () => {
    mockPost.mockResolvedValue({ data: { token: 'jwt-g', user } });

    const res = await apiClient.loginWithGoogle('google-id-token');

    expect(mockPost).toHaveBeenCalledWith('/auth/google', { idToken: 'google-id-token' });
    expect(mockSetStoredToken).toHaveBeenCalledWith('jwt-g');
    expect(res.user).toEqual(user);
  });

  it('posts the Apple ID token with the name Apple only sends once', async () => {
    mockPost.mockResolvedValue({ data: { token: 'jwt-a', user } });

    await apiClient.loginWithApple('apple-id-token', { givenName: 'Ada', familyName: 'L' });

    expect(mockPost).toHaveBeenCalledWith('/auth/apple', {
      idToken: 'apple-id-token',
      fullName: { givenName: 'Ada', familyName: 'L' },
    });
    expect(mockSetStoredToken).toHaveBeenCalledWith('jwt-a');
  });

  it('surfaces the API error message and stores nothing on failure', async () => {
    mockPost.mockRejectedValue({
      response: { status: 401, data: { error: { message: 'Invalid Google token' } } },
    });

    await expect(apiClient.loginWithGoogle('bad')).rejects.toThrow('Invalid Google token');
    expect(mockSetStoredToken).not.toHaveBeenCalled();
  });
});
