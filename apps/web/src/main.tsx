import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AccountQueryProvider from './components/AccountQueryProvider';
import App from './App';
import { ToastProvider } from './components/Toast';
import SplashScreen from './components/SplashScreen';
import './index.css';
import './styles/experience-tokens.css';

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
    <BrowserRouter>
      <AccountQueryProvider>
        <ToastProvider>
          <Root />
        </ToastProvider>
      </AccountQueryProvider>
    </BrowserRouter>
  </React.StrictMode>
);
