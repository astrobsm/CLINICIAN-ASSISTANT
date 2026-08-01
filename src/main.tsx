import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './pwa';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// Offline operation and installability both depend on this. It is safe to fire
// and forget: failure is reported through the offline status in Settings, not
// by breaking start-up.
void registerServiceWorker();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
