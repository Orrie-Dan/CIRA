import bcrypt from 'bcryptjs'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/** Emails are stored and compared lowercased and trimmed. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export interface JWTPayload {
  userId: string
  email: string
  role: string
  /** Must equal user_account.token_version; bumping the column revokes the token. */
  tv: number
}
