import React from 'react';
import ReactDOM from 'react-dom/client';
import AppWrapper from './AppWrapper';
import Results from './Results';
import AthleteBoard from './AthleteBoard';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './style.css';

// Desktop app shows the control dashboard; web browsers redirect to /results
function HomeRoute() {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  const isDesktopApp = hostname === '' || hostname === 'wails.localhost' || protocol === 'wails:';

  if (isDesktopApp) {
    return <AppWrapper />;
  }
  return <Navigate to="/results" replace />;
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
