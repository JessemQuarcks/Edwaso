'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';

// Remounts on every navigation, so each storefront page fades in.
export default function ShopTemplate({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
      {children}
    </motion.div>
  );
}
