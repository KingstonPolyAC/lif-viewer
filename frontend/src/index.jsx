import React from 'react';
import ReactDOM from 'react-dom/client';
import AppWrapper from './AppWrapper';
import Results from './Results';
import AthleteBoard from './AthleteBoard';
import { BrowserRouter, Routes, Route } from 'react-router-dom'; // Added BrowserRouter
import './style.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppWrapper />} />
        <Route path="/results" element={<Results />} />
        <Route path="/athlete" element={<AthleteBoard />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
