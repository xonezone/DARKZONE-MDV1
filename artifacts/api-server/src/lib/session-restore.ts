import { db, tenantsTable, LEGACY_TENANT_ID } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { authDirFor } from "./whatsapp";
import { getConfig, setConfig } from "./config";
import { restoreSessionToDir } from "./session-id";

/**
 * If the SESSION_ID setting is present, write it into the main account's login
 * folder BEFORE the bot connects, so the bot starts already linked to that
 * WhatsApp account (no Telegram or dashboard pairing needed).
 *
 * - The same SESSION_ID on every restart is a no-op (Baileys keeps updating its
 *   own files; we must not overwrite them).
 * - A different SESSION_ID replaces the old login.
 * - A bad SESSION_ID is logged (never printed) and ignored; the bot still starts.
 */
export async function restoreSessionFromEnv(): Promise<void> {
  const raw = process.env.SESSION_ID?.trim();
  if (!raw) return;
  try {
    const { restored, number } = restoreSessionToDir(raw, authDirFor(LEGACY_TENANT_ID));
    logger.info({ restored }, restored ? "WhatsApp session restored from SESSION_ID" : "SESSION_ID already applied");
    if (restored) {
      // On boot the bot only reconnects accounts marked "active". A database that
      // saw an earlier logout keeps the main account as "disconnected", so mark it
      // active again, otherwise the restored login would never connect.
      await db
        .update(tenantsTable)
        .set({ status: "active" })
        .where(eq(tenantsTable.id, LEGACY_TENANT_ID));
    }
    // Make the linked number the bot owner, unless an owner was already chosen.
    if (number && !(await getConfig("ownerNumber", LEGACY_TENANT_ID))) {
      await setConfig("ownerNumber", number, LEGACY_TENANT_ID);
    }
  } catch (err) {
    logger.error(
      { reason: err instanceof Error ? err.message : "unknown" },
      "SESSION_ID is invalid and was ignored. Get a fresh one from the pairing page.",
    );
  }
}
