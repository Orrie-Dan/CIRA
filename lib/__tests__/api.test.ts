/** @jest-environment jsdom */

const TOKEN_KEY = 'auth_token'

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

describe('web api token helpers', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores and reads auth token', () => {
    setToken('abc123')
    expect(getToken()).toBe('abc123')
  })

  it('clears auth token', () => {
    setToken('abc123')
    clearToken()
    expect(getToken()).toBeNull()
  })
})
