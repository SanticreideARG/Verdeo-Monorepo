import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { UpdatePrompt } from './components/UpdatePrompt.js';
import { App } from './routes/App.js';
import './styles.css';

const root = document.querySelector('#root');

if (!root) throw new Error('Root element was not found');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
    <UpdatePrompt />
  </StrictMode>,
);
