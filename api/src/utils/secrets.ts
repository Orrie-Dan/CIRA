const isProduction = process.env.NODE_ENV === 'production'

export function getRequiredSecret(name: 'JWT_SECRET' | 'COOKIE_SECRET'): string {
  const value = process.env[name]
  if (value && value.length >= 32) {
    return value
  }

  if (isProduction) {
    throw new Error(
      `${name} must be set and at least 32 characters in production`
    )
  }

  const devFallback = `dev-only-${name}-change-me-in-production-32chars`
  return devFallback
}

export function validateProductionSecrets(): void {
  if (!isProduction) return

  getRequiredSecret('JWT_SECRET')
  getRequiredSecret('COOKIE_SECRET')
}
