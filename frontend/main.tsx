import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import { initTelegramApp } from '@/lib/telegram';
import { useAuthStore } from '@/store/useAuthStore';
import '@/index.css';

initTelegramApp();
useAuthStore.getState().hydrateFromTelegram();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>
);
