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
  const wrapperRef = useRef<HTMLDivElement>(null);
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

  // Prevent FortuneSheet from unmerging cells when Delete is pressed.
  // FortuneSheet's own delete handler removes the entire celldata entry (including
  // the `mc` property), which breaks merged cells visually. We intercept in the
  // capture phase before FortuneSheet sees the event, manually clear only the
  // cell value/formula/display via API (leaving mc intact), then stop propagation.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Delete") return;

      // Only act when NOT in cell edit mode (contenteditable) or any text input.
      const active = document.activeElement as HTMLElement | null;
      if (
        active?.contentEditable === "true" ||
        active?.tagName === "INPUT" ||
        active?.tagName === "TEXTAREA"
      ) return;

      const wb = workbookRef.current;
      if (!wb) return;

      const selection = wb.getSelection();
      if (!selection || selection.length === 0) return;

      const sheets = wb.getAllSheets();
      const activeSheet = sheets.find((s) => s.status === 1);
      const mergeConfig = activeSheet?.config?.merge ?? {};
      if (Object.keys(mergeConfig).length === 0) return; // no merges at all

      // Check whether any selected cell is part of a merge (top-left anchor or interior cell).
      let hasMerge = false;
      outer: for (const sel of selection) {
        for (let r = sel.row[0]; r <= sel.row[1]; r++) {
          for (let c = sel.column[0]; c <= sel.column[1]; c++) {
            if (mergeConfig[`${r}_${c}`]) { hasMerge = true; break outer; }
            const entry = activeSheet?.celldata?.find((cd) => cd.r === r && cd.c === c);
            if (entry?.v?.mc) { hasMerge = true; break outer; }
          }
        }
      }
      if (!hasMerge) return; // normal delete — let FortuneSheet handle it

      // Stop FortuneSheet from processing this Delete (it would strip mc from cells).
      e.stopImmediatePropagation();
      e.preventDefault();

      // Clear only value/display/formula; leave mc, bg, and all styles untouched.
      for (const sel of selection) {
        for (let r = sel.row[0]; r <= sel.row[1]; r++) {
          for (let c = sel.column[0]; c <= sel.column[1]; c++) {
            wb.setCellFormat(r, c, "v", null);
            wb.setCellFormat(r, c, "m", null);
            wb.setCellFormat(r, c, "f", null);
          }
        }
      }
    };

    // Capture phase so we run before any FortuneSheet listener on child elements.
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, []); // stable: only uses refs

  // Shift + wheel → horizontal scroll via FortuneSheet's own scrollbar element.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      const scrollbarX = el.querySelector<HTMLElement>(".luckysheet-scrollbar-x");
      if (!scrollbarX) return;
      e.preventDefault();
      scrollbarX.scrollLeft += e.deltaY;
    };

    // passive:false is required to allow preventDefault() on wheel events.
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

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

      <div ref={wrapperRef} className="fortune-sheet-wrapper">
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
