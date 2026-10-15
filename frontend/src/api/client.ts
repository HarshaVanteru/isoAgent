export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const UNREACHABLE_MESSAGE = 'Cannot reach the backend. Check that the API server is running.';
export const BACKEND_ERROR_MESSAGE =
  'The backend did not respond correctly. Check that it is running and review its logs.';

const API_PREFIX = '/api';

interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
}

/** The only place the app talks to the backend. POSTs when a body is given. */
export async function request<T>(path: string, { body, signal }: RequestOptions = {}): Promise<T> {
  const init: RequestInit =
    body === undefined
      ? { signal }
      : { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, init);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(UNREACHABLE_MESSAGE, 0);
  }
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const fallback = response.status >= 500 ? BACKEND_ERROR_MESSAGE : `Request failed (${response.status}).`;
    throw new ApiError(detailMessage(data) ?? fallback, response.status);
  }
  return (await response.json()) as T;
}

function detailMessage(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('detail' in data)) return null;
  const { detail } = data;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const first: unknown = detail[0];
    if (typeof first === 'object' && first !== null && 'msg' in first && typeof first.msg === 'string') {
      return first.msg;
    }
  }
  return null;
}

export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
