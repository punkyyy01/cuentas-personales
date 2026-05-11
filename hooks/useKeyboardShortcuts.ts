'use client';

import { useEffect } from 'react';

interface Shortcuts {
  onUndo:             () => void;
  onRedo:             () => void;
  onCommandPalette?:  () => void;
}

export function useKeyboardShortcuts({ onUndo, onRedo, onCommandPalette }: Shortcuts) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        onRedo();
      } else if (e.key === 'k') {
        e.preventDefault();
        onCommandPalette?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onUndo, onRedo, onCommandPalette]);
}
