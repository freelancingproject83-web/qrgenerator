import { publicCodeResponseSchema } from '@qrgenerator/contracts';

const apiBase = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000'
).replace(/\/$/, '');

export type PublicCode = ReturnType<
  typeof publicCodeResponseSchema.parse
>['code'];

export async function fetchPublicCode(token: string, signal: AbortSignal) {
  const response = await fetch(
    `${apiBase}/api/v1/public/codes/${encodeURIComponent(token)}`,
    {
      signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    },
  );

  if (response.status === 404) {
    throw new Error(
      'This identifier is not registered. Please contact the medicine supplier.',
    );
  }
  if (!response.ok) {
    throw new Error(
      'The registry is temporarily unavailable. Please try again later.',
    );
  }
  return publicCodeResponseSchema.parse(await response.json()).code;
}
