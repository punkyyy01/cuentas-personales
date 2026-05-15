import { useCallback, useEffect, useRef, useState } from "react";
import type { Sheet } from "@fortune-sheet/core";
import { loadWorkbook, saveWorkbook } from "../lib/db";

export type SaveStatus = "idle" | "saving" | "saved";

const DEBOUNCE_MS = 500;

export function useWorkbookPersistence() {
  const [initialData, setInitialData] = useState<Sheet[] | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Sheet[] | null>(null);

  useEffect(() => {
    loadWorkbook().then((saved) => {
      if (saved && saved.length > 0) {
        setInitialData(saved);
      } else {
        setInitialData(defaultWorkbook());
      }
    });
  }, []);

  const persistNow = useCallback(async (sheets: Sheet[]) => {
    setSaveStatus("saving");
    await saveWorkbook(sheets);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }, []);

  const onChange = useCallback(
    (sheets: Sheet[]) => {
      pendingRef.current = sheets;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (pendingRef.current) persistNow(pendingRef.current);
      }, DEBOUNCE_MS);
    },
    [persistNow]
  );

  const forceSave = useCallback(async (sheets: Sheet[]) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await persistNow(sheets);
  }, [persistNow]);

  return { initialData, saveStatus, onChange, forceSave };
}

function defaultWorkbook(): Sheet[] {
  return [
    {
      name: "Hoja 1",
      id: crypto.randomUUID(),
      status: 1,
      order: 0,
      celldata: [],
    },
  ];
}
