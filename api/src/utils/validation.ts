import { z, type ZodTypeAny } from 'zod'
import { ApiError } from './errors.js'

/**
 * Request validation that throws instead of hand-building 400 responses.
 * The error handler turns these into the standard envelope:
 *   { error: { code, message, details?, requestId } }
 *
 * Use outside a handler's try/catch, or in one whose catch rethrows ApiError,
 * so the 400 isn't turned into a 500.
 */
export function parseOrThrow<T extends ZodTypeAny>(
  schema: T,
  input: unknown,
  message = 'Invalid request data'
): z.infer<T> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new ApiError(400, message, 'VALIDATION_ERROR', parsed.error.flatten())
  }
  return parsed.data
}

const uuidSchema = z.string().uuid()

/** Validates a UUID route parameter; 400 INVALID_ID otherwise. */
export function assertUuid(value: unknown, message = 'Invalid ID format'): asserts value is string {
  if (!uuidSchema.safeParse(value).success) {
    throw new ApiError(400, message, 'INVALID_ID')
  }
}
