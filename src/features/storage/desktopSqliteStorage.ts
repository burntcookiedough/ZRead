import { isTauriRuntime } from "@/app/runtime";

export const DESKTOP_DATABASE_URL = "sqlite:zread.db";

export async function initializeDesktopDatabase(): Promise<void> {
  if (!isTauriRuntime) {
    return;
  }

  const { default: Database } = await import("@tauri-apps/plugin-sql");
  const db = await Database.load(DESKTOP_DATABASE_URL);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS zread_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await db.execute(
    "INSERT OR REPLACE INTO zread_metadata (key, value) VALUES ($1, $2)",
    ["schema_health", "ok"]
  );
}
