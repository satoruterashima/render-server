import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

const el = document.getElementById('root');
if (!el) {
  document.body.insertAdjacentHTML('beforeend', '<div style="padding:12px;color:#fff">ERROR: #root が見つかりません</div>');
} else {
  createRoot(el).render(<App />);
}
