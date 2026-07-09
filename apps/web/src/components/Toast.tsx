import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
let idCounter = 0;

const STYLE: Record<ToastType, { border: string; bg: string; text: string; dot: string }> = {
  success: { border: '#1e4030', bg: '#0d1f16', text: '#5aba8a', dot: '#5aba8a' },
  error:   { border: '#3a1818', bg: '#1a0a0a', text: '#e07070', dot: '#e07070' },
  info:    { border: '#3a2e10', bg: '#1a1508', text: '#C9A84C', dot: '#C9A84C' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const add = useCallback((message: string, type: ToastType) => {
    const id = ++idCounter;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]); // cap at 5
    timers.current.set(id, setTimeout(() => dismiss(id), 4000));
  }, [dismiss]);

  const value: ToastContextValue = {
    success: (msg) => add(msg, 'success'),
    error:   (msg) => add(msg, 'error'),
    info:    (msg) => add(msg, 'info'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <>
          <style>{`
            @keyframes toast-in {
              from { opacity: 0; transform: translateY(6px); }
              to   { opacity: 1; transform: none; }
            }
          `}</style>
          <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end',
            pointerEvents: 'none',
          }}>
            {toasts.map((t) => {
              const s = STYLE[t.type];
              return (
                <div
                  key={t.id}
                  onClick={() => dismiss(t.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: s.bg, border: `1px solid ${s.border}`,
                    color: s.text, padding: '10px 14px',
                    maxWidth: 340, minWidth: 220,
                    cursor: 'pointer', fontSize: 13, lineHeight: 1.45,
                    animation: 'toast-in 0.18s ease',
                    pointerEvents: 'all',
                  }}
                >
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: s.dot, flexShrink: 0,
                  }} />
                  {t.message}
                </div>
              );
            })}
          </div>
        </>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside <ToastProvider>');
  return ctx;
}
