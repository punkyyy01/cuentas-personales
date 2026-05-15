import { useCallback, useEffect, useState } from "react";
import type { Sheet } from "@fortune-sheet/core";
import { listTemplates, saveTemplate, deleteTemplate, type TemplateRecord } from "../lib/db";

export function useTemplates() {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);

  const refresh = useCallback(async () => {
    const list = await listTemplates();
    setTemplates(list);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    async (name: string, data: Sheet[]): Promise<void> => {
      await saveTemplate(name, data);
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await deleteTemplate(id);
      await refresh();
    },
    [refresh]
  );

  return { templates, save, remove };
}
