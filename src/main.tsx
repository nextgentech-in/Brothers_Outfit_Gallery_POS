import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void fetch('/api/desktop/status').then(async response => {
      if (response.ok && response.headers.get('content-type')?.includes('application/json') && (await response.json()).desktop) return;
      await navigator.serviceWorker.register('/sw.js');
    }).catch(() => {});
  });
}
