import * as XLSX from "xlsx";
import type { Sheet, CellWithRowAndCol, Cell } from "@fortune-sheet/core";

function fortuneSheetToXlsx(sheets: Sheet[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const ws: XLSX.WorkSheet = {};
    const celldata: CellWithRowAndCol[] = sheet.celldata ?? [];
    let maxRow = 0;
    let maxCol = 0;

    for (const { r, c, v } of celldata) {
      if (!v) continue;
      const cell = v as Cell;
      const xlsxCell: XLSX.CellObject = { t: "s", v: "" };

      if (cell.f) {
        xlsxCell.f = cell.f.startsWith("=") ? cell.f.slice(1) : cell.f;
        xlsxCell.t = typeof cell.v === "number" ? "n" : "s";
        xlsxCell.v = cell.v ?? 0;
      } else if (typeof cell.v === "number") {
        xlsxCell.t = "n";
        xlsxCell.v = cell.v;
      } else if (typeof cell.v === "boolean") {
        xlsxCell.t = "b";
        xlsxCell.v = cell.v;
      } else {
        xlsxCell.t = "s";
        xlsxCell.v = cell.m ?? cell.v ?? "";
      }

      const addr = XLSX.utils.encode_cell({ r, c });
      ws[addr] = xlsxCell;

      if (r > maxRow) maxRow = r;
      if (c > maxCol) maxCol = c;
    }

    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
    XLSX.utils.book_append_sheet(wb, ws, sheet.name ?? "Sheet");
  }

  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "Hoja 1");
  }

  return wb;
}

export function exportToXlsx(sheets: Sheet[]): void {
  const wb = fortuneSheetToXlsx(sheets);
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `cuentas-${date}.xlsx`);
}
