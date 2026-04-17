/**
 * Structured Error Hierarchy
 *
 * All application errors extend AppError. Use specific subclasses
 * to classify errors — the centralized handler uses these to determine
 * HTTP status codes and what to expose to clients.
 */

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true // vs programmer error
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class ValidationError extends AppError {
  constructor(public field: string, message: string) {
    super(`VALIDATION_${field.toUpperCase()}`, message, 400)
    this.name = 'ValidationError'
  }
}

export class AuthError extends AppError {
  constructor(message: string = 'Authentication required') {
    super('AUTH_ERROR', message, 401)
    this.name = 'AuthError'
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied') {
    super('FORBIDDEN', message, 403)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super('NOT_FOUND', `${resource}${id ? ` (${id})` : ''} not found`, 404)
    this.name = 'NotFoundError'
  }
}

export class PaymentError extends AppError {
  constructor(message: string, public razorpayCode?: string) {
    super('PAYMENT_ERROR', message, 402)
    this.name = 'PaymentError'
  }
}

export class ExternalAPIError extends AppError {
  constructor(service: string, message: string, public originalError?: unknown) {
    super(`EXTERNAL_${service.toUpperCase()}`, message, 502)
    this.name = 'ExternalAPIError'
  }
}

export class RateLimitError extends AppError {
  constructor(public retryAfterMs?: number) {
    super('RATE_LIMIT', 'Too many requests', 429)
    this.name = 'RateLimitError'
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists') {
    super('CONFLICT', message, 409)
    this.name = 'ConflictError'
  }
}
