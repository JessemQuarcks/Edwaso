'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { EASE_OUT } from '@/components/admin/motion';

// A template (unlike a layout) remounts on every navigation, so each page eases in.
export default function ConsoleTemplate({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE_OUT }}>
      {children}
    </motion.div>
  );
}
