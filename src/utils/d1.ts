// Helper para queries D1 con manejo de errores
import { error } from "./response";

type Row = Record<string, unknown>;

export async function queryAll(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<Row[]> {
  try {
    const stmt = db.prepare(sql);
    const result = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
    return result.results as Row[];
  } catch (e) {
    console.error("D1 queryAll error:", e);
    throw e;
  }
}

export async function queryOne(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<Row | null> {
  try {
    const stmt = db.prepare(sql);
    const result = params.length > 0 ? await stmt.bind(...params).first() : await stmt.first();
    return result as Row | null;
  } catch (e) {
    console.error("D1 queryOne error:", e);
    throw e;
  }
}

export async function execute(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<D1Result> {
  try {
    const stmt = db.prepare(sql);
    return params.length > 0 ? await stmt.bind(...params).run() : await stmt.run();
  } catch (e) {
    console.error("D1 execute error:", e);
    throw e;
  }
}

export function handleDbError(e: unknown): Response {
  const message = e instanceof Error ? e.message : "Database error";
  console.error("Database error:", message);
  return error(message, 500);
}
