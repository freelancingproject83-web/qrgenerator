import { useEffect, useState } from 'react';
import { healthResponseSchema } from '@qrgenerator/contracts';

type ApiStatus = 'checking' | 'online' | 'offline';

export function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');

  useEffect(() => {
    const controller = new AbortController();
    const baseUrl =
      import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';

    fetch(`${baseUrl}/health`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('API is unavailable');
        return healthResponseSchema.parse(await response.json());
      })
      .then(() => setApiStatus('online'))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setApiStatus('offline');
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="page">
      <span className="eyebrow">QR Generator · User app</span>
      <h1>Your workspace is ready.</h1>
      <p>
        The user frontend is connected to the shared API contract and ready for
        product features.
      </p>
      <div className="status">API status: {apiStatus}</div>
    </main>
  );
}
