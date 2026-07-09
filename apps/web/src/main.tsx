import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ToastProvider } from './components/Toast';
import SplashScreen from './components/SplashScreen';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function Root() {
  // Show splash once per browser session
  const [splashDone, setSplashDone] = useState(
    () => sessionStorage.getItem('oiano-splash') === '1'
  );

  function handleSplashDone() {
    sessionStorage.setItem('oiano-splash', '1');
    setSplashDone(true);
  }

  return (
    <>
      {!splashDone && <SplashScreen onDone={handleSplashDone} />}
      <div style={{ visibility: splashDone ? 'visible' : 'hidden' }}>
        <App />
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <Root />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
