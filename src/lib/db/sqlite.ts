import "server-only";

import path from "node:path";
import Database from "better-sqlite3";

let db: Database.Database | null = null;

export const DEFAULT_PROGRAM_ID = "braude-software-2026";

export function getDatabasePath() {
  return process.env.DEGREE_DB_PATH ?? path.join(process.cwd(), "data", "degree-planner.sqlite");
}

export function getDb() {
  if (!db) {
    db = new Database(getDatabasePath(), { readonly: true, fileMustExist: true });
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
  }

  return db;
}
