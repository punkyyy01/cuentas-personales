'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

export interface Command {
  id: string;
  title: string;
  subtitle?: string;
  shortcut?: string;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

export default function CommandPalette({ open, onClose, commands }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(c => (c.title + ' ' + (c.subtitle ?? '')).toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, Math.max(0, filtered.length - 1))); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[active];
        if (cmd) { cmd.run(); onClose(); }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose, active, filtered]);

  if (!open) return null;

  return (
    <motion.div
      className="cmdk-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        className="cmdk-card"
        initial={{ opacity: 0, scale: 0.98, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -8 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
      >
        <div className="cmdk-input-row">
          <input
            ref={inputRef}
            className="cmdk-input"
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0); }}
            placeholder="Escribe un comando…"
            spellCheck={false}
          />
          <div className="cmdk-hint">Esc</div>
        </div>

        <div className="cmdk-list" role="listbox" aria-label="Comandos">
          {filtered.length === 0 ? (
            <div className="cmdk-empty">Sin resultados</div>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.id}
                className={`cmdk-item${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => { c.run(); onClose(); }}
              >
                <div className="cmdk-item-main">
                  <div className="cmdk-title">{c.title}</div>
                  {c.subtitle && <div className="cmdk-sub">{c.subtitle}</div>}
                </div>
                {c.shortcut && <div className="cmdk-kbd">{c.shortcut}</div>}
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
