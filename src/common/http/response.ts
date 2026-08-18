import type { Response } from 'express';
import { HttpStatus, type HttpStatusType } from './http-status.js';
import { ErrorCode, type ErrorCodeType } from '../errors/error-codes.js';
import type { ApiSuccessResponse, ApiErrorResponse } from '../types/index.js';

interface SuccessOptions<T> {
  data?: T | undefined;
  message?: string | undefined;
  statusCode?: HttpStatusType | undefined;
  meta?: Record<string, unknown> | undefined;
}

interface ErrorOptions {
  code?: ErrorCodeType | string | undefined;
  message?: string | undefined;
  statusCode?: HttpStatusType | undefined;
  details?: unknown;
  stack?: string | undefined;
}

export class ApiResponse {
  public static success<T>(res: Response, options: SuccessOptions<T> = {}): Response {
    const { data, message, statusCode = HttpStatus.OK, meta } = options;

    const responseBody: ApiSuccessResponse<T> = {
      success: true,
      ...(message !== undefined && { message }),
      ...(data !== undefined && { data }),
      ...(meta !== undefined && { meta }),
    };

    return res.status(statusCode).json(responseBody);
  }

  public static error(res: Response, options: ErrorOptions = {}): Response {
    const {
      code = ErrorCode.INTERNAL_SERVER_ERROR,
      message = 'An unexpected error occurred',
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR,
      details,
      stack,
    } = options;

    const responseBody: ApiErrorResponse = {
      success: false,
      error: {
        code,
        message,
        ...(details !== undefined && { details }),
        ...(stack !== undefined && { stack }),
      },
    };

    return res.status(statusCode).json(responseBody);
  }
}
