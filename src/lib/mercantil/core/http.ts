// ============================================================================
// WUIPI MERCANTIL SDK — HTTP Client
// Centralized HTTP layer with retry, logging, and error handling
// ============================================================================

import { getApiHeaders } from './config';

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  headers: Record<string, string>;
  requestId?: string;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export class MercantilApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'MercantilApiError';
    this.status = error.status;
    this.code = error.code;
    this.details = error.details;
  }
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  clientId: string;
  body?: Record<string, unknown>;
  timeout?: number;
  retries?: number;
}

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 2;
const RETRY_DELAY = 1000;

/**
 * Makes an authenticated request to the Mercantil API.
 */
export async function apiRequest<T = unknown>(
  options: RequestOptions
): Promise<ApiResponse<T>> {
  const {
    method,
    url,
    clientId,
    body,
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
  } = options;

  const headers = getApiHeaders(clientId);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseData = await response.json();

      if (!response.ok) {
        throw new MercantilApiError({
          status: response.status,
          code: responseData?.code || `HTTP_${response.status}`,
          message: responseData?.message || response.statusText,
          details: responseData,
        });
      }

      return {
        ok: true,
        status: response.status,
        data: responseData as T,
        headers: Object.fromEntries(response.headers.entries()),
        requestId: response.headers.get('x-request-id') || undefined,
      };
    } catch (error) {
      lastError = error as Error;

      // Don't retry on 4xx errors (client errors)
      if (error instanceof MercantilApiError && error.status >= 400 && error.status < 500) {
        throw error;
      }

      // Retry on 5xx or network errors
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError || new Error('[MercantilSDK] Request failed after retries');
}
