'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_OUT } from './motion';

type Variant = 'success' | 'error';
interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: Variant;
}

type ToastFn = (title: string, options?: { description?: string; variant?: Variant }) => void;
const ToastContext = createContext<ToastFn | null>(null);

export function useToast(): ToastFn {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast must be used inside <Toaster>');
  return toast;
}

const DURATION_MS = 4000;

/** Brief confirmations ("Order marked as shipped") in the corner, announced to screen readers. */
export default function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback<ToastFn>(
    (title, { description, variant = 'success' } = {}) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, title, description, variant }]);
      setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss]
  );

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = t.variant === 'error' ? AlertCircle : CheckCircle2;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, transition: { duration: 0.2 } }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
                role={t.variant === 'error' ? 'alert' : 'status'}
                className="pointer-events-auto flex items-start gap-3 rounded-xl bg-popover p-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10"
              >
                <Icon
                  className={cn('mt-0.5 size-4 shrink-0', t.variant === 'error' ? 'text-destructive' : 'text-delta-good')}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.title}</p>
                  {t.description && <p className="mt-0.5 text-muted-foreground">{t.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="rounded-md p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
