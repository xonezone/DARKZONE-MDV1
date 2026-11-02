import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";

/**
 * Session ID = the WhatsApp login files of ONE linked device, packed into a
 * single text string so it can be pasted into the `SESSION_ID` setting of
 * another deployment of this bot.
 *
 * Format:  DARKZONE~<base64url( gzip( JSON { "creds.json": "...", ... } ) )>
 *
 * A Session ID is as powerful as the WhatsApp password of that device. Never log
 * it, never return it from an API, and only ever hand it to its owner.
 */
export const SESSION_PREFIX = "DARKZONE~";

/** A WhatsApp text message tops out around 64k characters; stay well under. */
const MAX_PACKED_CHARS = 55_000;
/** Refuse to inflate more than this when unpacking (guards against zip bombs). */
const MAX_UNPACKED_BYTES = 4 * 1024 * 1024;
/** Marker file that remembers which SESSION_ID an auth dir was restored from. */
export const SOURCE_MARKER = ".session-source";

const SAFE_NAME = /^[A-Za-z0-9_.-]+\.json$/;

function isSafeName(name: string): boolean {
  return SAFE_NAME.test(name) && !name.includes("..");
}

function readAuthFiles(dir: string, onlyCreds: boolean): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of fs.readdirSync(dir)) {
    if (!isSafeName(name)) continue;
    if (onlyCreds && name !== "creds.json") continue;
    const full = path.join(dir, name);
    if (!fs.statSync(full).isFile()) continue;
    files[name] = fs.readFileSync(full, "utf8");
  }
  return files;
}

function encode(files: Record<string, string>): string {
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(files), "utf8"), { level: 9 });
  return SESSION_PREFIX + gz.toString("base64url");
}

/**
 * Pack a Baileys multi-file auth directory into a Session ID. The full state
 * (identity + pre-keys + app-state keys) is preferred because it restores
 * cleanly; if that would be too long to send in one message we fall back to
 * `creds.json` alone, which is enough to log back in.
 */
export function packAuthDir(dir: string): string {
  const all = readAuthFiles(dir, false);
  if (!all["creds.json"]) throw new Error("creds.json not found");
  const full = encode(all);
  if (full.length <= MAX_PACKED_CHARS) return full;
  return encode({ "creds.json": all["creds.json"] });
}

/** Validate and decode a Session ID into its files. Throws on anything unexpected. */
export function unpackSession(sessionId: string): Record<string, string> {
  const raw = sessionId.trim();
  if (!raw.startsWith(SESSION_PREFIX)) throw new Error("Session ID has the wrong prefix");
  let json: string;
  try {
    const gz = Buffer.from(raw.slice(SESSION_PREFIX.length), "base64url");
    json = zlib.gunzipSync(gz, { maxOutputLength: MAX_UNPACKED_BYTES }).toString("utf8");
  } catch {
    throw new Error("Session ID is damaged or incomplete");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Session ID is damaged");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Session ID is damaged");
  }
  const files: Record<string, string> = {};
  for (const [name, content] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isSafeName(name) || typeof content !== "string") {
      throw new Error("Session ID contains an unexpected file");
    }
    files[name] = content;
  }
  const credsText = files["creds.json"];
  if (!credsText) throw new Error("Session ID has no creds.json");
  try {
    const creds = JSON.parse(credsText) as Record<string, unknown>;
    if (!creds.noiseKey || !creds.signedIdentityKey) throw new Error("not creds");
  } catch {
    throw new Error("Session ID has invalid credentials");
  }
  return files;
}

/** The phone number (digits only) a creds object belongs to, or null. */
export function numberFromCreds(credsText: string): string | null {
  try {
    const creds = JSON.parse(credsText) as { me?: { id?: string } };
    const id = creds.me?.id;
    if (!id) return null;
    const digits = id.split("@")[0].split(":")[0].replace(/\D/g, "");
    return digits || null;
  } catch {
    return null;
  }
}

function hashOf(sessionId: string): string {
  return crypto.createHash("sha256").update(sessionId.trim()).digest("hex");
}

/**
 * Write a Session ID into an auth directory.
 *  - nothing is written if the directory was already restored from this exact ID
 *    (Baileys keeps updating creds.json while it runs; we must not overwrite it
 *    on every restart);
 *  - a different ID replaces the old login files.
 * Returns whether files were written and the phone number of the session.
 */
export function restoreSessionToDir(
  sessionId: string,
  dir: string,
): { restored: boolean; number: string | null } {
  const files = unpackSession(sessionId);
  const number = numberFromCreds(files["creds.json"]);
  const marker = path.join(dir, SOURCE_MARKER);
  const hash = hashOf(sessionId);

  if (fs.existsSync(path.join(dir, "creds.json"))) {
    let same = false;
    try {
      same = fs.readFileSync(marker, "utf8").trim() === hash;
    } catch {
      /* no marker */
    }
    if (same) return { restored: false, number };
    // Different (or unknown) source: replace the old login files.
    for (const name of fs.readdirSync(dir)) {
      if (isSafeName(name)) fs.rmSync(path.join(dir, name), { force: true });
    }
  }

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, { mode: 0o600 });
  }
  fs.writeFileSync(marker, hash, { mode: 0o600 });
  return { restored: true, number };
}
