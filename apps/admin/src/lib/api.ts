import { authResponseSchema, type AuthResponse } from '@qrgenerator/contracts';

const apiBase = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000'
).replace(/\/$/, '');

export type AuthenticatedRequest = (
  path: string,
  init?: RequestInit,
) => Promise<Response>;

export function apiRequest(path: string, init: RequestInit = {}) {
  return fetch(`${apiBase}/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
}

export async function failureMessage(response: Response) {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; details?: { message?: string }[] };
    };
    return (
      body.error?.details?.[0]?.message ??
      body.error?.message ??
      `Request failed (${response.status})`
    );
  } catch {
    return `Request failed (${response.status})`;
  }
}

let sessionRestore: Promise<AuthResponse | null> | undefined;

export function restoreSession() {
  sessionRestore ??= apiRequest('/auth/refresh', { method: 'POST' })
    .then(async (response) =>
      response.ok ? authResponseSchema.parse(await response.json()) : null,
    )
    .catch(() => null);
  return sessionRestore;
}

export async function refreshSession() {
  const response = await apiRequest('/auth/refresh', { method: 'POST' });
  return response.ok ? authResponseSchema.parse(await response.json()) : null;
}
