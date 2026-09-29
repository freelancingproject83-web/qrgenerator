import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ScanPage } from './ScanPage';
import { codeTokenSchema } from '@qrgenerator/contracts';
import './styles.css';

const token = codeTokenSchema.safeParse(window.location.pathname.slice(1));
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {token.success ? (
      <ScanPage token={token.data} />
    ) : window.location.pathname === '/' ? (
      <App />
    ) : (
      <main className="page">
        <h1>Page not found</h1>
        <p>This is not a recognized code link.</p>
      </main>
    )}
  </React.StrictMode>,
);
