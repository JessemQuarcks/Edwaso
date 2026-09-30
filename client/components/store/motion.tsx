'use client';

import type { ReactNode } from 'react';
import { motion, MotionConfig, type Variants } from 'motion/react';

// Storefront motion. Reveals run once as content scrolls into view; transform and opacity only.
// <StoreMotion> turns transforms off for visitors who ask their OS for reduced motion.

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export function StoreMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: 'div' | 'section' | 'li';
}) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -80px 0px' }}
      transition={{ duration: 0.6, delay, ease: EASE_OUT }}
    >
      {children}
    </Tag>
  );
}

const group: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const groupItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT } },
};

/** Children marked <RevealItem> fade up one after another when the group scrolls into view. */
export function RevealGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={group}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={groupItem}>
      {children}
    </motion.div>
  );
}
