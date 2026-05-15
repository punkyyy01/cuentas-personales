import { openDB, type IDBPDatabase } from "idb";
import type { Sheet } from "@fortune-sheet/core";

const DB_NAME = "cuentas-personales";
const DB_VERSION = 1;
const STORE_WORKBOOK = "workbook";
const STORE_TEMPLATES = "templates";

export type TemplateRecord = {
  id: string;
  name: string;
  createdAt: number;
  data: Sheet[];
};

let _db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_WORKBOOK)) {
        db.createObjectStore(STORE_WORKBOOK);
      }
      if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
        db.createObjectStore(STORE_TEMPLATES, { keyPath: "id" });
      }
    },
  });
  return _db;
}

export async function loadWorkbook(): Promise<Sheet[] | null> {
  const db = await getDB();
  const data = await db.get(STORE_WORKBOOK, "current");
  return (data as Sheet[] | undefined) ?? null;
}

export async function saveWorkbook(sheets: Sheet[]): Promise<void> {
  const db = await getDB();
  await db.put(STORE_WORKBOOK, sheets, "current");
}

export async function listTemplates(): Promise<TemplateRecord[]> {
  const db = await getDB();
  const all = await db.getAll(STORE_TEMPLATES);
  return (all as TemplateRecord[]).sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveTemplate(name: string, data: Sheet[]): Promise<TemplateRecord> {
  const db = await getDB();
  const record: TemplateRecord = {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    data,
  };
  await db.put(STORE_TEMPLATES, record);
  return record;
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_TEMPLATES, id);
}
