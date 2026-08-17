import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
  maxHeight?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  role?: 'dialog' | 'alertdialog';
  borderColor?: string;
  zIndex?: number;
}

export default function Modal({
  onClose,
  children,
  maxWidth = 480,
  maxHeight,
  ariaLabel,
  ariaLabelledBy,
  role = 'dialog',
  borderColor = '#292929',
  zIndex = 200,
}: ModalProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex, background: 'rgba(0,0,0,.82)', display: 'grid', placeItems: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        role={role}
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        style={{
          width: '100%',
          maxWidth,
          maxHeight,
          overflowY: maxHeight ? 'auto' : undefined,
          background: '#101010',
          border: `1px solid ${borderColor}`,
          borderRadius: 16,
          padding: 24,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
