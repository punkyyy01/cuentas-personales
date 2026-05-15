import type { SaveStatus } from "../hooks/useWorkbookPersistence";

interface Props {
  status: SaveStatus;
}

const labels: Record<SaveStatus, string> = {
  idle: "",
  saving: "Guardando…",
  saved: "Guardado",
};

export function SaveIndicator({ status }: Props) {
  if (status === "idle") return null;
  return (
    <span
      style={{
        fontSize: 12,
        color: status === "saved" ? "#6dbf6d" : "#888",
        transition: "opacity 0.3s",
      }}
    >
      {labels[status]}
    </span>
  );
}
