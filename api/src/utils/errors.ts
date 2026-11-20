export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const isProduction = process.env.NODE_ENV === 'production'

/** Fastify error handler: maps any thrown error to the API error envelope. */
export function fastifyErrorHandler(
  error: unknown,
  request: { id: string },
  reply: { code(statusCode: number): { send(payload: unknown): unknown } }
) {
  let statusCode = 500
  if (error instanceof ApiError) {
    statusCode = error.statusCode
  } else if (error && typeof error === 'object' && 'statusCode' in error) {
    statusCode = (error as any).statusCode
  } else if (error && typeof error === 'object' && 'status' in error) {
    statusCode = (error as any).status
  }

  return reply.code(statusCode).send(errorHandler(error, request.id))
}

export function errorHandler(error: unknown, requestId: string) {
  if (error instanceof ApiError) {
    return {
      error: {
        code: error.code || 'API_ERROR',
        message: error.message,
        details: error.details,
        requestId,
      },
    }
  }
  
  // Handle Fastify validation errors
  if (error && typeof error === 'object' && 'validation' in error) {
    const validationError = error as any
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: validationError.message || 'Validation failed',
        details: validationError.validation || validationError.details,
        requestId,
      },
    }
  }
  
  // Handle errors with statusCode property (like Fastify errors)
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const httpError = error as any
    return {
      error: {
        code: httpError.code || `HTTP_${httpError.statusCode}`,
        message: httpError.message || 'An error occurred',
        details: httpError.details,
        requestId,
        statusCode: httpError.statusCode,
      },
    }
  }
  
  // Handle standard Error objects
  if (error instanceof Error) {
    return {
      error: {
        code: 'INTERNAL_ERROR',
        message: isProduction
          ? 'An unexpected error occurred'
          : error.message || 'An unexpected error occurred',
        ...(isProduction ? {} : { details: error.stack }),
        requestId,
      },
    }
  }
  
  // Fallback for unknown error types
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: String(error),
      requestId,
    },
  }
}

