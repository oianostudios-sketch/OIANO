import { useEffect, useRef, type ReactNode } from 'react';

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
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusableSelector = [
      'a[href]', 'button:not([disabled])', 'input:not([disabled])',
      'select:not([disabled])', 'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
      .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');

    (focusable()[0] ?? dialog)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const controls = focusable();
      if (!controls.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex, background: 'rgba(0,0,0,.82)', display: 'grid', placeItems: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role={role}
        tabIndex={-1}
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
