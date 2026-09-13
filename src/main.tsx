import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { ensurePersistentStorage } from './db/persistentStorage';
import './styles/index.css';

// Before the first render rather than inside a component: this asks once per
// load and has nothing to do with any screen, so a component that mounts twice
// under StrictMode has no business owning it.
ensurePersistentStorage();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* The last resort. Everything worth surviving on its own is wrapped closer
        to where it lives; this one only catches what got past those, and its
        only honest offer is a reload. */}
    <ErrorBoundary label="Genie" variant="page">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
