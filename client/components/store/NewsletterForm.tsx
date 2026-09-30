'use client';

import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function NewsletterForm({ tone = 'default' }: { tone?: 'default' | 'inverted' }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState('');
  const inverted = tone === 'inverted';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('sending');
    setError('');
    try {
      await api('/newsletter', { method: 'POST', body: { email } });
      setState('done');
    } catch (err) {
      setError(errorMessage(err));
      setState('idle');
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {state === 'done' ? (
        <motion.p
          key="done"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-sm font-medium"
          role="status"
        >
          <CheckCircle2 className="size-5 text-emerald-500" /> You’re on the list. Thanks for subscribing!
        </motion.p>
      ) : (
        <motion.form key="form" onSubmit={submit} exit={{ opacity: 0, y: -8 }} className="flex w-full max-w-md flex-col gap-2">
          <div
            className={cn(
              'flex items-center gap-1 rounded-full border p-1 pl-4 transition-shadow focus-within:ring-3',
              inverted ? 'border-background/20 bg-background/10 focus-within:ring-background/30' : 'bg-background focus-within:ring-ring/40'
            )}
          >
            <label htmlFor={`newsletter-${tone}`} className="sr-only">
              Email address
            </label>
            <input
              id={`newsletter-${tone}`}
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn('h-9 min-w-0 flex-1 bg-transparent text-sm outline-none', inverted ? 'placeholder:text-background/60' : 'placeholder:text-muted-foreground')}
            />
            <button
              type="submit"
              disabled={state === 'sending'}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors disabled:opacity-60',
                inverted ? 'bg-background text-foreground hover:bg-background/90' : 'bg-foreground text-background hover:bg-foreground/90'
              )}
            >
              {state === 'sending' ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Subscribe
            </button>
          </div>
          {error && <p className="px-4 text-xs text-red-500">{error}</p>}
        </motion.form>
      )}
    </AnimatePresence>
  );
}
