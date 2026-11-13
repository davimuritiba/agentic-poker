import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/700.css';
import './estilos.css';

createRoot(document.getElementById('raiz') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
