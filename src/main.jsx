/**
 * Axiom Forge - Main Entry Point
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import FloatingProgress from './components/FloatingProgress';
import './styles/index.css';

// Determine which component to render based on route
const isFloatingWindow = window.location.hash.includes('/floating') || 
                         window.location.pathname.includes('/floating');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isFloatingWindow ? (
      <FloatingProgress />
    ) : (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    )}
  </React.StrictMode>
);
