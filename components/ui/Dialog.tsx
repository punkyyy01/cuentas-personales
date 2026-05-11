'use client';

import { useEffect, type ReactNode } from 'react';
import { motion } from 'framer-motion';

interface Props {
  title:    string;
  onClose:  () => void;
  children: ReactNode;
  width?:   number;
}

const OVERLAY = { hidden: { opacity: 0 }, show: { opacity: 1 } };
const CARD    = {
  hidden: { opacity: 0, scale: 0.97, y: -8 },
  show:   { opacity: 1, scale: 1,    y:  0 },
};
const TRANSITION = { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const };

export default function Dialog({ title, onClose, children, width = 480 }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <motion.div
      className="dialog-overlay"
      variants={OVERLAY}
      initial="hidden"
      animate="show"
      exit="hidden"
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        className="dialog-card"
        style={{ width, maxWidth: 'calc(100vw - 32px)' }}
        variants={CARD}
        initial="hidden"
        animate="show"
        exit="hidden"
        transition={TRANSITION}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <span className="dialog-title">{title}</span>
          <button className="btn btn-icon" onClick={onClose} aria-label="Cerrar">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="11" y2="11" />
              <line x1="11" y1="1" x2="1" y2="11" />
            </svg>
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
