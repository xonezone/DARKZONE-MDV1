import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { logger } from "./logger";
import { packAuthDir } from "./session-id";

/**
 * "Get a Session ID" pairing service.
 *
 * A visitor types their WhatsApp number, gets an 8-character pairing code, links
 * it in WhatsApp, and receives a Session ID as a WhatsApp message in their own
 * "Message yourself" chat. The Session ID is NEVER returned by the HTTP API and
 * is never logged.
 *
 * Every job is short-lived and isolated: its own temp folder and its own socket,
 * both thrown away when the job ends. Nothing is written to the database and
 * nothing is kept for the bot's normal tenants.
 *
 * Off unless ENABLE_SESSION_PAIR=true (see routes/session-pair.ts).
 */

export type PairStatus = "starting" | "waiting" | "linked" | "sent" | "failed" | "expired";
export type PairErrorCode = "BAD_NUMBER" | "BUSY" | "ACTIVE_NUMBER" | "FAILED";

export class PairError extends Error {
  readonly code: PairErrorCode;
  constructor(code: PairErrorCode, message: string) {
    super(message);
    this.name = "PairError";
    this.code = code;
  }
}

/** The small part of a Baileys socket that this module uses. */
export interface PairSocket {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ev: { on(event: string, handler: (...args: any[]) => void): void };
  requestPairingCode(number: string): Promise<string>;
  sendMessage(jid: string, content: { text: string }): Promise<unknown>;
  user?: { id?: string } | undefined;
  end(error?: Error | undefined): void;
}

export interface PairDeps {
  makeSocket(dir: string): Promise<{ sock: PairSocket; saveCreds: () => Promise<void> | void }>;
}

export interface PairOptions {
  /** How many pairing jobs may run at the same time. */
  maxConcurrent: number;
  /** A job that is not finished after this long is given up. */
  ttlMs: number;
  /** How long to wait for the socket to be ready to mint a code. */
  readyTimeoutMs: number;
  /** How long to wait for the final login files to be written after linking. */
  credsWaitMs: number;
  /** After the Session ID is sent, how long to keep the socket open so it flushes. */
  closeDelayMs: number;
  /** How long a finished job's status can still be read. */
  resultTtlMs: number;
  /** Pause between tries when sending a message fails. */
  sendRetryDelayMs: number;
}

const DEFAULTS: PairOptions = {
  maxConcurrent: 5,
  ttlMs: 180_000,
  readyTimeoutMs: 25_000,
  credsWaitMs: 8_000,
  closeDelayMs: 6_000,
  resultTtlMs: 10 * 60_000,
  sendRetryDelayMs: 1_500,
};

const RESTART_REQUIRED = 515; // WhatsApp asks for a reconnect right after linking

const INTRO =
  "✅ *Dark Zone MD — your Session ID*\n\n" +
  "It is in the next message. Copy it and paste it into the *SESSION_ID* setting of your bot.";
const WARNING =
  "⚠️ *Keep it private!*\n" +
  "• Anyone who has this Session ID can control your WhatsApp.\n" +
  "• Never share it, post it, or put it in a public file or GitHub repo.\n" +
  "• To cancel it: WhatsApp → *Linked devices* → log that device out.\n\n" +
  "_The pairing server deletes its own copy right after sending this._";

/** Digits only, 8–15 long, no leading zero (country code first). */
export function normalizeNumber(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) {
    throw new PairError("BAD_NUMBER", "Enter your number with the country code, digits only.");
  }
  return digits;
}

/** "9233...:12@s.whatsapp.net" → "9233...@s.whatsapp.net" (the self-chat id). */
export function toSelfJid(id: string): string {
  const [user] = id.split("@")[0].split(":");
  return `${user}@s.whatsapp.net`;
}

interface Job {
  id: string;
  number: string;
  dir: string;
  sock: PairSocket | null;
  status: PairStatus;
  finished: boolean;
  opened: boolean;
  restarts: number;
  timer: NodeJS.Timeout | null;
  readyResolve: (() => void) | null;
}

export interface PairManager {
  start(rawNumber: unknown): Promise<{ id: string; code: string }>;
  status(id: string): PairStatus | null;
  activeCount(): number;
}

export function createPairManager(deps: PairDeps, overrides: Partial<PairOptions> = {}): PairManager {
  const opts: PairOptions = { ...DEFAULTS, ...overrides };
  const active = new Map<string, Job>();
  const results = new Map<string, { status: PairStatus; expires: number }>();

  function finish(job: Job, final: PairStatus): void {
    if (job.finished) return;
    job.finished = true;
    if (job.timer) clearTimeout(job.timer);
    job.status = final;
    results.set(job.id, { status: final, expires: Date.now() + opts.resultTtlMs });
    active.delete(job.id);
    try {
      job.sock?.end(undefined); // close WITHOUT logging out: the Session ID must stay valid
    } catch {
      /* already closed */
    }
    try {
      fs.rmSync(job.dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }

  async function waitForCreds(job: Job): Promise<void> {
    const file = path.join(job.dir, "creds.json");
    const until = Date.now() + opts.credsWaitMs;
    while (Date.now() < until) {
      try {
        const c = JSON.parse(fs.readFileSync(file, "utf8")) as { registered?: boolean; me?: { id?: string } };
        if (c.registered && c.me?.id) return;
      } catch {
        /* not written yet */
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  /** A message sent right after linking can fail once while WhatsApp finishes setting up. */
  async function sendWithRetry(sock: PairSocket, jid: string, text: string): Promise<void> {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await sock.sendMessage(jid, { text });
        return;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, opts.sendRetryDelayMs));
      }
    }
    throw lastErr;
  }

  async function onOpen(job: Job, sock: PairSocket): Promise<void> {
    if (job.opened) return;
    job.opened = true;
    job.status = "linked";
    try {
      await waitForCreds(job);
      if (job.finished) return;
      const sessionId = packAuthDir(job.dir);
      const meId = sock.user?.id;
      const jid = toSelfJid(meId ?? `${job.number}@s.whatsapp.net`);
      await sendWithRetry(sock, jid, INTRO);
      await sendWithRetry(sock, jid, sessionId);
      await sendWithRetry(sock, jid, WARNING);
      job.status = "sent";
      setTimeout(() => finish(job, "sent"), opts.closeDelayMs);
    } catch (err) {
      // Never log the error object blindly: keep it to the message only.
      logger.warn({ jobId: job.id, reason: err instanceof Error ? err.message : "unknown" }, "session pair failed after linking");
      finish(job, "failed");
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onUpdate(job: Job, sock: PairSocket, u: any): void {
    if (job.finished || sock !== job.sock) return; // ignore sockets we already replaced
    if (u?.qr && job.readyResolve) {
      job.readyResolve();
      job.readyResolve = null;
    }
    if (u?.connection === "open") {
      void onOpen(job, sock);
    } else if (u?.connection === "close") {
      if (job.status === "sent") return;
      const code = u?.lastDisconnect?.error?.output?.statusCode;
      if (code === RESTART_REQUIRED && job.restarts < 3) {
        // The user entered the code: WhatsApp wants a fresh connection.
        job.restarts += 1;
        job.status = "linked";
        try {
          sock.end(undefined);
        } catch {
          /* ignore */
        }
        void connect(job).catch(() => finish(job, "failed"));
      } else {
        finish(job, job.status === "waiting" || job.status === "starting" ? "expired" : "failed");
      }
    }
  }

  async function connect(job: Job): Promise<void> {
    const { sock, saveCreds } = await deps.makeSocket(job.dir);
    job.sock = sock;
    sock.ev.on("creds.update", () => {
      void Promise.resolve(saveCreds()).catch(() => undefined);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sock.ev.on("connection.update", (u: any) => onUpdate(job, sock, u));
  }

  return {
    activeCount: () => active.size,

    status(id: string): PairStatus | null {
      const live = active.get(id);
      if (live) return live.status;
      const done = results.get(id);
      if (done && done.expires > Date.now()) return done.status;
      if (done) results.delete(id);
      return null;
    },

    async start(rawNumber: unknown): Promise<{ id: string; code: string }> {
      const number = normalizeNumber(rawNumber);
      for (const j of active.values()) {
        if (j.number === number) {
          throw new PairError("ACTIVE_NUMBER", "A pairing for this number is already running. Wait a minute and try again.");
        }
      }
      if (active.size >= opts.maxConcurrent) {
        throw new PairError("BUSY", "The pairing service is busy. Please try again in a minute.");
      }

      const job: Job = {
        id: crypto.randomBytes(16).toString("hex"),
        number,
        dir: fs.mkdtempSync(path.join(os.tmpdir(), "dz-pair-")),
        sock: null,
        status: "starting",
        finished: false,
        opened: false,
        restarts: 0,
        timer: null,
        readyResolve: null,
      };
      active.set(job.id, job);
      job.timer = setTimeout(
        () => finish(job, job.status === "linked" ? "failed" : "expired"),
        opts.ttlMs,
      );

      try {
        let readyTimer: NodeJS.Timeout | undefined;
        const ready = new Promise<void>((resolve, reject) => {
          job.readyResolve = resolve;
          readyTimer = setTimeout(() => reject(new Error("socket not ready")), opts.readyTimeoutMs);
        });
        try {
          await connect(job);
          await ready;
        } finally {
          if (readyTimer) clearTimeout(readyTimer);
        }
        if (job.finished || !job.sock) throw new Error("connection closed");
        const code = await job.sock.requestPairingCode(number);
        job.status = "waiting";
        return { id: job.id, code };
      } catch (err) {
        finish(job, "failed");
        logger.warn({ jobId: job.id, reason: err instanceof Error ? err.message : "unknown" }, "session pair could not start");
        throw new PairError("FAILED", "Could not get a pairing code right now. Please try again.");
      }
    },
  };
}

/** Delete temp folders a crashed process left behind (they hold login files). */
export function sweepStalePairDirs(maxAgeMs = 15 * 60_000): number {
  let removed = 0;
  try {
    for (const name of fs.readdirSync(os.tmpdir())) {
      if (!name.startsWith("dz-pair-")) continue;
      const full = path.join(os.tmpdir(), name);
      try {
        if (Date.now() - fs.statSync(full).mtimeMs > maxAgeMs) {
          fs.rmSync(full, { recursive: true, force: true });
          removed += 1;
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return removed;
}

/** Simple in-memory limiter: at most `max` hits per `windowMs` for each key. */
export function createRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    allow(key: string): boolean {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      }
      return true;
    },
  };
}

let cachedVersion: [number, number, number] | undefined;

/** The real Baileys connection used in production. */
export function createBaileysDeps(): PairDeps {
  return {
    async makeSocket(dir: string) {
      const { state, saveCreds } = await useMultiFileAuthState(dir);
      if (!cachedVersion) {
        try {
          cachedVersion = (await fetchLatestBaileysVersion()).version as [number, number, number];
        } catch {
          /* fall back to Baileys' built-in default version */
        }
      }
      const sock = makeWASocket({
        ...(cachedVersion ? { version: cachedVersion } : {}),
        auth: state,
        // Silent: Baileys debug output can contain account details.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logger: logger.child({ module: "session-pair" }, { level: "silent" }) as any,
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        qrTimeout: 120_000,
      });
      return { sock: sock as unknown as PairSocket, saveCreds };
    },
  };
}

let singleton: PairManager | null = null;

/** The shared manager used by the HTTP routes. */
export function getPairManager(): PairManager {
  if (!singleton) {
    sweepStalePairDirs();
    setInterval(() => sweepStalePairDirs(), 10 * 60_000).unref();
    const max = Number(process.env.PAIR_MAX_CONCURRENT);
    singleton = createPairManager(createBaileysDeps(), {
      ...(Number.isFinite(max) && max > 0 ? { maxConcurrent: Math.min(Math.floor(max), 20) } : {}),
    });
  }
  return singleton;
}
