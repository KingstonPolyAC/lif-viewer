import React from 'react';
import ReactDOM from 'react-dom/client';
import AppWrapper from './AppWrapper';
import Results from './Results';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'; // Import routing components
import './style.css';

// Component to detect environment and route accordingly
function HomeRoute() {
  const isDesktopApp = window.location.protocol === 'wails:';

  // Desktop app: show control interface (AppWrapper)
  // Web browser: redirect to Results view (read-only multi-view)
  if (isDesktopApp) {
    return <AppWrapper />;
  } else {
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
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);