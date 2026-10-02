import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { AppRoot } from './app/App.jsx';

createRoot(document.getElementById('root')).render(<AppRoot />);