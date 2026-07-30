import {StrictMode} from 'react';
import {createRoot, Root} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

let reactRoot: Root | null = null;

export function mountVoidSurvivor(containerId: string) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  if (!reactRoot) {
    reactRoot = createRoot(container);
  }
  
  reactRoot.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

export function unmountVoidSurvivor() {
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }
}

Object.assign(window, { mountVoidSurvivor, unmountVoidSurvivor });
