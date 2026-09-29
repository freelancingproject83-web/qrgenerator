import { useEffect, useState } from 'react';
import { publicCodeResponseSchema } from '@qrgenerator/contracts';

export function ScanPage({ token }: { token: string }) {
  const [result, setResult] = useState<{ title: string; message: string }>({
    title: 'Checking identifier…',
    message: 'Please wait while the registry is contacted.',
  });
  useEffect(() => {
    const controller = new AbortController();
    const base = (
      import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000'
    ).replace(/\/$/, '');
    fetch(`${base}/api/v1/public/codes/${encodeURIComponent(token)}`, {
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
      .then(async (response) => {
        if (response.status === 404)
          return {
            title: 'Identifier not found',
            message:
              'This code is not registered here. Contact the supplier; do not infer medicine authenticity from this page.',
          };
        if (!response.ok) throw new Error('Lookup unavailable');
        const { code } = publicCodeResponseSchema.parse(await response.json());
        return {
          title:
            code.status === 'revoked'
              ? 'Code revoked'
              : 'Medicine details not published',
          message: code.message,
        };
      })
      .then(setResult)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setResult({
            title: 'Verification unavailable',
            message:
              'The registry could not be reached. Try again later or contact the supplier. This is not a valid or invalid medicine result.',
          });
      });
    return () => controller.abort();
  }, [token]);
  return (
    <main className="page">
      <span className="eyebrow">Medicine code registry · Demo</span>
      <section aria-live="polite">
        <h1>{result.title}</h1>
        <p>{result.message}</p>
      </section>
      <p>
        Identifier: <code>{token}</code>
      </p>
      <p>
        A barcode can be copied. This service does not currently certify
        authenticity or provide medical advice.
      </p>
    </main>
  );
}
