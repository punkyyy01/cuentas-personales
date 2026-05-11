'use client';

import { useCallback, useRef, useState } from 'react';

export interface UndoableOp {
  description: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export function useUndoRedo() {
  const past   = useRef<UndoableOp[]>([]);
  const future = useRef<UndoableOp[]>([]);
  const [, bump] = useState(0);

  const sync = useCallback(() => bump(n => n + 1), []);

  const push = useCallback((op: UndoableOp) => {
    past.current.push(op);
    future.current = [];
    sync();
  }, [sync]);

  const undo = useCallback(async () => {
    const op = past.current.pop();
    if (!op) return;
    await op.undo();
    future.current.push(op);
    sync();
  }, [sync]);

  const redo = useCallback(async () => {
    const op = future.current.pop();
    if (!op) return;
    await op.redo();
    past.current.push(op);
    sync();
  }, [sync]);

  return {
    push,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
