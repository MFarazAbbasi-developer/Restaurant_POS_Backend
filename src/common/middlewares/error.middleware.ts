import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';
import { HttpStatus, type HttpStatusType } from '../http/http-status.js';
import { ApiResponse } from '../http/response.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';

export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  let statusCode: HttpStatusType = HttpStatus.INTERNAL_SERVER_ERROR;
  let errorCode: string = ErrorCode.INTERNAL_SERVER_ERROR;
  let message: string = 'An unexpected error occurred';
  let details: unknown = undefined;

  // 1. Custom AppError instances
  if (error instanceof AppError) {
    statusCode = error.statusCode as HttpStatusType;
    errorCode = error.errorCode;
    message = error.message;
    details = error.details;

    if (!error.isOperational) {
      logger.error({ error, stack: error.stack }, `[Non-Operational AppError]: ${error.message}`);
    }
  }
  // 2. Zod validation errors
  else if (error instanceof ZodError) {
    statusCode = HttpStatus.BAD_REQUEST;
    errorCode = ErrorCode.VALIDATION_ERROR;
    message = 'Validation failed';
    details = error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    }));
  }
  // 3. Prisma database errors
  else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    statusCode = HttpStatus.BAD_REQUEST;
    errorCode = ErrorCode.DATABASE_ERROR;

    switch (error.code) {
      case 'P2002': {
        const target = (error.meta?.target as string[])?.join(', ') ?? 'field';
        message = `Unique constraint violation on: ${target}`;
        statusCode = HttpStatus.CONFLICT;
        errorCode = ErrorCode.CONFLICT;
        break;
      }
      case 'P2025': {
        message = (error.meta?.cause as string) ?? 'Record not found';
        statusCode = HttpStatus.NOT_FOUND;
        errorCode = ErrorCode.NOT_FOUND;
        break;
      }
      case 'P2003': {
        message = 'Foreign key constraint failed on the database';
        break;
      }
      default: {
        message = `Database error occurred (${error.code})`;
        break;
      }
    }
    logger.error({ prismaError: error }, `[Prisma Known Error]: ${error.message}`);
  } else if (error instanceof Prisma.PrismaClientInitializationError) {
    statusCode = HttpStatus.SERVICE_UNAVAILABLE;
    errorCode = ErrorCode.SERVICE_UNAVAILABLE;
    message = 'Database service is currently unavailable';
    logger.error({ prismaError: error }, '[Prisma Initialization Error]');
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    statusCode = HttpStatus.BAD_REQUEST;
    errorCode = ErrorCode.BAD_REQUEST;
    message = 'Invalid database query parameters';
    logger.error({ prismaError: error }, '[Prisma Validation Error]');
  }
  // 4. Fallback unknown errors
  else {
    logger.error(
      {
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack,
      },
      `[Unhandled Exception]: ${error.message}`,
    );

    if (env.NODE_ENV === 'development') {
      message = error.message || 'Internal Server Error';
    }
  }

  const stack = env.NODE_ENV === 'development' ? error.stack : undefined;

  ApiResponse.error(res, {
    statusCode,
    code: errorCode,
    message,
    details,
    stack,
  });
};
