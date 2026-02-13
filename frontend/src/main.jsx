import React from 'react';
import ReactDOM from 'react-dom/client';
import AppWrapper from './AppWrapper';
import Results from './Results';
import AthleteBoard from './AthleteBoard';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'; // Import routing components
import './style.css';

// Component to detect environment and route accordingly
function HomeRoute() {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  const isDesktopApp = hostname === '' || hostname === 'wails.localhost' || protocol === 'wails:';

  console.log('[ROUTING]', { hostname, protocol, isDesktopApp });

  // Desktop app: show control interface (AppWrapper)
  // Web browser: redirect to Results view (read-only multi-view)
  if (isDesktopApp) {
    console.log('[ROUTING] Showing desktop AppWrapper');
    return <AppWrapper />;
  } else {
    console.log('[ROUTING] Redirecting to /results');
    return <Navigate to="/results" replace />;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/results" element={<Results />} />
        <Route path="/athlete" element={<AthleteBoard />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);