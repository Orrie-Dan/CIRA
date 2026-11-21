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

// The verify screen called these methods before they existed, so email
// verification after sign-up crashed.
describe('ApiClient OTP verification', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockSetStoredToken.mockClear();
  });

  it('verifyOTP posts the code and stores the session token', async () => {
    mockPost.mockResolvedValue({ data: { user, token: 'jwt-1', verified: true } });

    const res = await apiClient.verifyOTP({ code: '123456', email: 'u@test.com', phone: '0788123456' });

    expect(mockPost).toHaveBeenCalledWith('/auth/verify-otp', { code: '123456', email: 'u@test.com', phone: '0788123456' });
    expect(mockSetStoredToken).toHaveBeenCalledWith('jwt-1');
    expect(res.token).toBe('jwt-1');
  });

  it('verifyOTP stores nothing when the server issues no session', async () => {
    mockPost.mockResolvedValue({ data: { user, verified: true, requiresEmailVerification: true } });

    const res = await apiClient.verifyOTP({ code: '123456', phone: '0788123456' });

    expect(mockSetStoredToken).not.toHaveBeenCalled();
    expect(res.requiresEmailVerification).toBe(true);
  });

  it('verifyOTP surfaces the API error message', async () => {
    mockPost.mockRejectedValue({
      response: { status: 400, data: { error: { message: 'Invalid or expired verification code' } } },
    });

    await expect(apiClient.verifyOTP({ code: '000000', email: 'u@test.com' })).rejects.toThrow(
      'Invalid or expired verification code'
    );
    expect(mockSetStoredToken).not.toHaveBeenCalled();
  });

  it('sendOTP posts to /auth/send-otp', async () => {
    mockPost.mockResolvedValue({ data: { message: 'If an account exists, a verification code has been sent.' } });

    await apiClient.sendOTP({ email: 'u@test.com' });

    expect(mockPost).toHaveBeenCalledWith('/auth/send-otp', { email: 'u@test.com' });
  });
});
