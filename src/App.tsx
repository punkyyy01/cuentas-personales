import { useCallback, useEffect, useRef, useState } from "react";
import { Workbook, type WorkbookInstance } from "@fortune-sheet/react";
import "@fortune-sheet/react/dist/index.css";
import type { Sheet } from "@fortune-sheet/core";
import "./styles/globals.css";
import { Topbar } from "./components/Topbar";
import { TemplateModal } from "./components/TemplateModal";
import { useWorkbookPersistence } from "./hooks/useWorkbookPersistence";
import { useTemplates } from "./hooks/useTemplates";
import { exportToXlsx } from "./lib/exportXlsx";

type ModalState = "save-template" | "load-template" | null;

export default function App() {
  const workbookRef = useRef<WorkbookInstance>(null);
  const sheetsRef = useRef<Sheet[]>([]);
  const { initialData, saveStatus, onChange, forceSave } = useWorkbookPersistence();
  const { templates, save: saveTemplate, remove: deleteTemplate } = useTemplates();
  const [modal, setModal] = useState<ModalState>(null);

  const handleChange = useCallback(
    (data: Sheet[]) => {
      sheetsRef.current = data;
      onChange(data);
    },
    [onChange]
  );

  const handleExport = useCallback(() => {
    const sheets = workbookRef.current?.getAllSheets() ?? sheetsRef.current;
    exportToXlsx(sheets);
  }, []);

  const handleForceSave = useCallback(async () => {
    const sheets = workbookRef.current?.getAllSheets() ?? sheetsRef.current;
    if (sheets.length > 0) await forceSave(sheets);
  }, [forceSave]);

  const handleLoadTemplate = useCallback(
    (data: Sheet[]) => {
      // Merge template sheets into current workbook as new sheets
      const current = workbookRef.current?.getAllSheets() ?? sheetsRef.current;
      const newSheets = data.map((s, i) => ({
        ...s,
        id: crypto.randomUUID(),
        order: (current.length + i),
        status: i === 0 ? 1 : 0,
        name: deduplicateName(s.name ?? "Hoja", current),
      }));
      const merged = [...current.map((s) => ({ ...s, status: 0 })), ...newSheets];
      sheetsRef.current = merged;
      forceSave(merged);
      // FortuneSheet doesn't have a direct "reset" API; reload via key trick
      window.location.reload();
    },
    [forceSave]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        handleForceSave();
      }
      if (e.ctrlKey && e.key === "e") {
        e.preventDefault();
        handleExport();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleForceSave, handleExport]);

  if (!initialData) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        Cargando…
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
      }}
    >
      <Topbar
        saveStatus={saveStatus}
        onExport={handleExport}
        onSaveTemplate={() => setModal("save-template")}
        onLoadTemplate={() => setModal("load-template")}
      />

      <div className="fortune-sheet-wrapper">
        <Workbook
          ref={workbookRef}
          data={initialData}
          onChange={handleChange}
          showToolbar
          showFormulaBar
          showSheetTabs
          lang="es"
        />
      </div>

      {modal && (
        <TemplateModal
          mode={modal === "save-template" ? "save" : "load"}
          templates={templates}
          currentSheets={workbookRef.current?.getAllSheets() ?? sheetsRef.current}
          onSave={saveTemplate}
          onLoad={handleLoadTemplate}
          onDelete={deleteTemplate}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function deduplicateName(base: string, existing: Sheet[]): string {
  const names = new Set(existing.map((s) => s.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}
