import type { ErrorCodeType } from '../errors/error-codes.js';
export type { AuthenticatedUserContext } from './express.js';

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  message?: string;
  data?: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
  [key: string]: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCodeType | string;
    message: string;
    details?: unknown;
    stack?: string;
  };
}

export type ApiResponseFormat<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedData<T> {
  items: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}
