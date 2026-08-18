import { ErrorCode, type ErrorCodeType } from './error-codes.js';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: ErrorCodeType;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    errorCode: ErrorCodeType = ErrorCode.INTERNAL_SERVER_ERROR,
    isOperational: boolean = true,
    details?: unknown,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    this.details = details;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request', details?: unknown) {
    super(message, 400, ErrorCode.BAD_REQUEST, true, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: unknown) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, true, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized access', details?: unknown) {
    super(message, 401, ErrorCode.UNAUTHORIZED, true, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden - insufficient permissions', details?: unknown) {
    super(message, 403, ErrorCode.FORBIDDEN, true, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', details?: unknown) {
    super(message, 404, ErrorCode.NOT_FOUND, true, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists or conflict occurred', details?: unknown) {
    super(message, 409, ErrorCode.CONFLICT, true, details);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message: string = 'Unprocessable entity', details?: unknown) {
    super(message, 422, ErrorCode.UNPROCESSABLE_ENTITY, true, details);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', details?: unknown) {
    super(message, 500, ErrorCode.INTERNAL_SERVER_ERROR, false, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable', details?: unknown) {
    super(message, 503, ErrorCode.SERVICE_UNAVAILABLE, true, details);
  }
}
