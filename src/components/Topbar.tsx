import type { SaveStatus } from "../hooks/useWorkbookPersistence";
import { SaveIndicator } from "./SaveIndicator";

interface Props {
  saveStatus: SaveStatus;
  onExport: () => void;
  onSaveTemplate: () => void;
  onLoadTemplate: () => void;
}

export function Topbar({ saveStatus, onExport, onSaveTemplate, onLoadTemplate }: Props) {
  return (
    <header
      style={{
        height: "var(--topbar-h)",
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: 12,
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontWeight: 700,
          fontSize: 13,
          color: "var(--accent)",
          letterSpacing: "0.04em",
          marginRight: 8,
        }}
      >
        cuentas-personales
      </span>

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <TopbarBtn onClick={onExport} title="Ctrl+E">
          Exportar .xlsx
        </TopbarBtn>
        <TopbarBtn onClick={onSaveTemplate}>
          Guardar plantilla
        </TopbarBtn>
        <TopbarBtn onClick={onLoadTemplate}>
          Plantillas
        </TopbarBtn>
      </div>

      <div style={{ marginLeft: "auto" }}>
        <SaveIndicator status={saveStatus} />
      </div>
    </header>
  );
}

function TopbarBtn({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: "transparent",
        border: "1px solid var(--border)",
        borderRadius: 4,
        color: "var(--text)",
        fontSize: 12,
        padding: "4px 10px",
        cursor: "pointer",
        transition: "border-color 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
        (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
      }}
    >
      {children}
    </button>
  );
}
