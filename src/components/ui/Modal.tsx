'use client';

import { ReactNode, RefObject, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface ModalProps {
  children: ReactNode;
  onClose: () => void;
  /** Sizing of the dialog box, e.g. `w-full max-w-md`. Width belongs here, not on the child:
   *  the box is a shrink-wrapped flex item, so a percentage width on the child has nothing to
   *  resolve against and the dialog drifts off-centre on phones. */
  className?: string;
  /** Id of the visible title, announced as the dialog's name. */
  labelledBy?: string;
  /** Accessible name when there is no visible title to point at. */
  ariaLabel?: string;
  /** Id(s) of the text that explains the dialog (space-separated), announced after its name. */
  describedBy?: string;
  /** Close on a click outside the box (default true). Pass false while e.g. a form is mid-submit. */
  closeOnBackdrop?: boolean;
  /** Where focus goes on close when the opener is gone, e.g. the menu button whose (now
   *  unmounted) item opened the dialog. Defaults to the element focused when it opened. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const focusablesIn = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('[inert]'));

/**
 * Modal dialog: portal + backdrop, `role="dialog"` with `aria-modal`, Escape and a backdrop
 * click close it (the backdrop unless `closeOnBackdrop` is false), Tab/Shift+Tab stay inside,
 * and focus returns to the opener (or `returnFocusRef`) on close.
 */
export function Modal({
  children,
  onClose,
  className,
  labelledBy,
  ariaLabel,
  describedBy,
  closeOnBackdrop = true,
  returnFocusRef,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Callers pass inline closures; keep the latest one without re-running the mount effect
  // (which would steal focus back to the first field on every keystroke).
  const onCloseRef = useRef(onClose);
  const returnFocusRefRef = useRef(returnFocusRef);
  useEffect(() => {
    onCloseRef.current = onClose;
    returnFocusRefRef.current = returnFocusRef;
  });

  useEffect(() => {
    const returnFocusTo = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog) (focusablesIn(dialog)[0] ?? dialog).focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = focusablesIn(dialog);
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      const target = returnFocusRefRef.current?.current ?? returnFocusTo;
      if (target?.isConnected) target.focus();
    };
  }, []);

  if (typeof window === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop: it covers the whole wrapper, so this is where clicks outside the box land. */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden
        onClick={closeOnBackdrop ? () => onClose() : undefined}
      />

      {/* Modal Content */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : ariaLabel}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cn(
          'relative z-10 max-h-full overflow-y-auto outline-none animate-in fade-in zoom-in-95 duration-200',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
