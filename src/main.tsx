import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerPwa } from './pwa/registerPwa';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

void registerPwa();
