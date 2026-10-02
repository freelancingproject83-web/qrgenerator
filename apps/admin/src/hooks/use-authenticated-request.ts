import { useCallback } from 'react';
import type { AuthResponse } from '@qrgenerator/contracts';
import {
  apiRequest,
  refreshSession,
  type AuthenticatedRequest,
} from '../lib/api';

export function useAuthenticatedRequest(
  session: AuthResponse,
  setSession: (session: AuthResponse | null) => void,
): AuthenticatedRequest {
  return useCallback(
    async (path: string, init: RequestInit = {}) => {
      const send = (accessToken: string) =>
        apiRequest(path, {
          ...init,
          headers: {
            ...init.headers,
            Authorization: `Bearer ${accessToken}`,
          },
        });

      let response = await send(session.accessToken);
      if (response.status !== 401) return response;

      const next = await refreshSession();
      if (!next) {
        setSession(null);
        return response;
      }
      setSession(next);
      response = await send(next.accessToken);
      return response;
    },
    [session.accessToken, setSession],
  );
}
