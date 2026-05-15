import { useEffect, useRef, useState } from "react";
import type { Sheet } from "@fortune-sheet/core";
import type { TemplateRecord } from "../lib/db";

interface Props {
  mode: "save" | "load";
  templates: TemplateRecord[];
  currentSheets: Sheet[];
  onSave: (name: string, data: Sheet[]) => Promise<void>;
  onLoad: (data: Sheet[]) => void;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

export function TemplateModal({ mode, templates, currentSheets, onSave, onLoad, onDelete, onClose }: Props) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "save") inputRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    await onSave(trimmed, currentSheets);
    setSaving(false);
    onClose();
  }

  function handleLoad(record: TemplateRecord) {
    onLoad(record.data);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        {mode === "save" ? (
          <>
            <h2>Guardar como plantilla</h2>
            <input
              ref={inputRef}
              type="text"
              placeholder="Nombre de la plantilla"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            />
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={!name.trim() || saving}
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Plantillas</h2>
            <p className="modal-section-title">Selecciona una plantilla para cargarla</p>
            {templates.length === 0 ? (
              <p className="template-empty">No hay plantillas guardadas todavía.</p>
            ) : (
              <ul className="template-list">
                {templates.map((t) => (
                  <li key={t.id} className="template-item">
                    <span onClick={() => handleLoad(t)}>{t.name}</span>
                    <div className="template-item-actions">
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 12, padding: "4px 8px" }}
                        onClick={() => handleLoad(t)}
                      >
                        Cargar
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ fontSize: 12, padding: "4px 8px" }}
                        onClick={() => onDelete(t.id)}
                      >
                        Borrar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
