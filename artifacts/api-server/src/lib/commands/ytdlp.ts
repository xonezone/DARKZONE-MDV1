import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../logger";
import { runProcess } from "./proc";
import { getFfmpegPath } from "./ffmpeg";

export interface YtMeta {
  title: string;
  duration: number | null;
  uploader: string | null;
  ext: string | null;
  /** Canonical page URL of the resolved track (used to show/relink the exact item). */
  webpageUrl: string | null;
}

export interface YtDownload {
  buffer: Buffer;
  ext: string;
}

/**
 * Force the YouTube `android_vr` player client. YouTube rejects yt-dlp's default
 * web clients from datacenter IPs; `android_vr` works for search, m4a audio
 * (format 140) and mp4 video. NOTE: opus/webm streams (e.g. format 251) return
 * HTTP 403 from this host, so audio MUST prefer `[ext=m4a]` (see the format
 * selectors in handlers/download.ts / downloads2.ts). The arg is namespaced to
 * youtube, so it's a harmless no-op for other extractors (soundcloud, tiktok,
 * instagram, etc.).
 */
const YT_EXTRACTOR_ARGS = ["--extractor-args", "youtube:player_client=android_vr"];

/**
 * Network-resilience flags applied to every yt-dlp invocation. SoundCloud (the
 * audio backend) intermittently throttles this host's IP; without a per-socket
 * timeout a single stalled read hangs the whole process until the hard SIGKILL
 * timeout and the command fails outright (observed in production as
 * "`.../bin/yt-dlp timed out after 45000ms` cmd=play"). `--socket-timeout`
 * bounds each network read so a stalled connection errors fast and is retried
 * instead of hanging; the retry flags absorb transient extractor / HTTP /
 * HLS-fragment failures so a flaky resolve recovers within the window.
 */
const NET_ARGS = [
  "--socket-timeout",
  "30",
  "--retries",
  "5",
  "--extractor-retries",
  "3",
  "--fragment-retries",
  "10",
];

/**
 * Extra yt-dlp flags the bot owner can switch on with environment variables:
 *  - YTDLP_COOKIES_FILE  path to a Netscape-format cookies.txt. Instagram (and
 *    some YouTube videos) only work when yt-dlp is logged in. Use a throwaway
 *    account and NEVER commit this file.
 *  - YTDLP_PROXY         a proxy URL (http://, https://, socks5://...) for hosts
 *    whose IP is blocked by YouTube / TikTok / Instagram.
 */
function userArgs(): string[] {
  const out: string[] = [];
  const cookies = process.env.YTDLP_COOKIES_FILE?.trim();
  if (cookies) {
    if (existsSync(cookies)) out.push("--cookies", cookies);
    else logger.warn({ cookies }, "YTDLP_COOKIES_FILE is set but the file does not exist");
  }
  const proxy = process.env.YTDLP_PROXY?.trim();
  if (proxy) out.push("--proxy", proxy);
  return out;
}

let jsRuntimeArgs: string[] | null = null;

/**
 * Since yt-dlp 2025.11.12 YouTube needs an external JavaScript runtime to solve
 * its player challenges (Deno is picked up automatically; Node must be enabled
 * explicitly). This bot already runs on Node, so point yt-dlp at it. Older
 * yt-dlp builds reject the flag, so only pass it when `--help` lists it.
 */
async function getJsRuntimeArgs(r: YtRunner): Promise<string[]> {
  if (jsRuntimeArgs) return jsRuntimeArgs;
  try {
    const { stdout } = await runProcess(r.cmd, [...r.baseArgs, "--help"], { timeoutMs: 30_000 });
    jsRuntimeArgs = /--js-runtimes/.test(stdout) ? ["--js-runtimes", `node:${process.execPath}`] : [];
    return jsRuntimeArgs;
  } catch {
    return []; // don't cache a failed probe
  }
}

function isYoutubeTarget(target: string): boolean {
  return /^ytsearch\d*:|(^|\/\/|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)(\/|$)/i.test(target);
}

/**
 * Argument sets to try, in order. YouTube: first the proven `android_vr` client,
 * then YouTube's default clients with the JS runtime (android_vr gets blocked
 * from time to time). Other sites: the same plain set twice for a transient retry.
 */
async function attemptSets(r: YtRunner, target: string, retryOtherSites: boolean): Promise<string[][]> {
  const common = [...NET_ARGS, ...(await getJsRuntimeArgs(r)), ...userArgs()];
  if (isYoutubeTarget(target)) {
    return [[...common, ...YT_EXTRACTOR_ARGS], [...common]];
  }
  return retryOtherSites ? [[...common], [...common]] : [[...common]];
}

class SizeLimitError extends Error {
  constructor() {
    super("file exceeds size limit");
    this.name = "SizeLimitError";
  }
}

/**
 * Resolve which yt-dlp to run. We vendor the official **self-contained**
 * PyInstaller build (`yt-dlp_linux`) at `artifacts/api-server/bin/yt-dlp` and
 * run it DIRECTLY (not through `python3`). Two reasons:
 *  1. The Nix-provided `yt-dlp` is pinned to a release whose SoundCloud-search
 *     extractor is broken (it builds an
 *     `api.soundcloud.com/tracks/soundcloud%3Atracks%3A...` URL no extractor
 *     matches).
 *  2. The previous approach — a yt-dlp *zipapp* run via the Nix `python3` —
 *     loaded the Nix store's `libssl.so.3` for HTTPS, and that file was
 *     corrupted (EIO: "cannot read file data") in the published image, so
 *     EVERY audio command died at `fetchMeta` with an SSL ImportError that a
 *     republish kept reusing. The self-contained binary bundles its own CPython
 *     + OpenSSL (extracted to /tmp at runtime), so it never touches the
 *     (corruptible) Nix openssl.
 * The binary is committed, so it survives any deploy regardless of how the
 * image is built. Falls back to the bare `yt-dlp` binary only if the vendored
 * file is somehow missing.
 */
interface YtRunner {
  cmd: string;
  baseArgs: string[];
}

let runner: YtRunner | null = null;

function getRunner(): YtRunner {
  if (runner) return runner;
  // The app always runs as the bundled `dist/index.mjs`, so `import.meta.url`
  // anchors us to `.../artifacts/api-server/dist` regardless of cwd (dev runs
  // from the package dir, production from the repo root).
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const vendored = join(moduleDir, "..", "bin", "yt-dlp");
  if (existsSync(vendored)) {
    // Run the self-contained binary directly so it uses its OWN bundled OpenSSL,
    // never the Nix store's (which can be corrupted in the published image).
    runner = { cmd: vendored, baseArgs: [] };
  } else {
    // Last-resort fallback: the Nix-provided yt-dlp has a broken SoundCloud
    // search extractor, so audio downloads will fail. Surface it loudly.
    logger.warn(
      { vendored },
      "vendored yt-dlp missing — falling back to system yt-dlp (SoundCloud search likely broken)",
    );
    runner = { cmd: "yt-dlp", baseArgs: [] };
  }
  return runner;
}

/**
 * Fetch metadata for a yt-dlp target (URL or `scsearch1:`/`ytsearch1:` query)
 * without downloading the media. Throws if the target can't be resolved.
 */
export async function fetchMeta(target: string): Promise<YtMeta> {
  const r = getRunner();
  let lastErr: unknown = null;
  for (const extra of await attemptSets(r, target, false)) {
    try {
      const { code, stdout, stderr } = await runProcess(
        r.cmd,
        [...r.baseArgs, "-j", "--no-warnings", "--no-playlist", ...extra, "--", target],
        { timeoutMs: 90_000 },
      );
      if (code !== 0 || !stdout.trim()) {
        throw new Error(`yt-dlp metadata failed (${code}): ${stderr.slice(-200)}`);
      }
      const firstLine = stdout.trim().split("\n")[0] ?? "{}";
      const j = JSON.parse(firstLine) as Record<string, unknown>;
      return {
        title: typeof j.title === "string" ? j.title : "media",
        duration: typeof j.duration === "number" ? j.duration : null,
        uploader: typeof j.uploader === "string" ? j.uploader : null,
        ext: typeof j.ext === "string" ? j.ext : null,
        webpageUrl: typeof j.webpage_url === "string" ? j.webpage_url : null,
      };
    } catch (err) {
      lastErr = err;
      logger.warn({ err, target }, "yt-dlp metadata attempt failed");
      // A timeout means the network is the problem; a second client won't help.
      if (err instanceof Error && /timed out/i.test(err.message)) break;
    }
  }
  throw lastErr;
}

/**
 * List the entries of a playlist / channel / search WITHOUT downloading
 * (`--flat-playlist`). Pass `ytsearchN:query` to get N search results.
 * Never throws: returns [] when nothing could be read.
 */
export async function listFlat(
  target: string,
  limit: number,
): Promise<{ title: string; url: string }[]> {
  const r = getRunner();
  try {
    const extra = [...NET_ARGS, ...(await getJsRuntimeArgs(r)), ...userArgs()];
    const { code, stdout } = await runProcess(
      r.cmd,
      [...r.baseArgs, "--flat-playlist", "-J", "--no-warnings", ...extra, "--", target],
      { timeoutMs: 60_000 },
    );
    if (code !== 0 || !stdout.trim()) return [];
    const doc = JSON.parse(stdout.trim()) as {
      entries?: { title?: string; url?: string }[];
    };
    return (doc.entries ?? [])
      .slice(0, limit)
      .map((e) => ({ title: e.title ?? "unknown", url: e.url ?? "" }));
  } catch (err) {
    logger.warn({ err, target }, "yt-dlp list failed");
    return [];
  }
}

/** Remove anything a previous (failed) attempt left behind in the temp dir. */
async function clearMedia(dir: string): Promise<void> {
  for (const f of await readdir(dir)) {
    await rm(join(dir, f), { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Download a yt-dlp target into a Buffer. Uses a unique temp dir that is always
 * cleaned up. `--max-filesize` aborts oversized downloads before they complete;
 * when that happens (or nothing is produced) this throws.
 */
export async function download(
  target: string,
  opts: { format: string; audio?: boolean; maxSizeMb: number },
): Promise<YtDownload> {
  const r = getRunner();
  const dir = await mkdtemp(join(tmpdir(), "ytdl-"));
  try {
    const args = [
      ...r.baseArgs,
      "-o",
      join(dir, "media.%(ext)s"),
      "--no-warnings",
      "--no-playlist",
      "--no-part",
      "--max-filesize",
      `${opts.maxSizeMb}M`,
      "-f",
      opts.format,
    ];
    if (opts.audio) {
      // Point yt-dlp's audio-extraction postprocessor at the vendored static
      // ffmpeg. Without this it resolves ffmpeg from PATH (the Nix-store binary),
      // which is corrupted in the published image and dies with `spawn EIO` —
      // yt-dlp then ships the raw SoundCloud container and WhatsApp rejects it as
      // "something is wrong with the audio file". `--ffmpeg-location` accepts the
      // binary path directly.
      args.push("--ffmpeg-location", getFfmpegPath());
      args.push("-x", "--audio-format", "mp3", "--audio-quality", "5");
    }

    // YouTube intermittently blocks datacenter IPs / clients. Try each argument
    // set in turn (see attemptSets) and keep the last error.
    let lastErr: unknown = null;
    const sets = await attemptSets(r, target, true);
    for (let attempt = 0; attempt < sets.length; attempt++) {
      try {
        await clearMedia(dir); // never reuse a half-written file from a failed try
        const { code, stderr } = await runProcess(
          r.cmd,
          [...args, ...sets[attempt], "--", target],
          { timeoutMs: 180_000 },
        );
        const files = await readdir(dir);
        const file = files.find((f) => f.startsWith("media.") && !/\.(part|ytdl|temp)$/i.test(f));
        if (!file) {
          if (/max-filesize|larger than/i.test(stderr)) throw new SizeLimitError();
          throw new Error(`yt-dlp produced no file (${code}): ${stderr.slice(-200)}`);
        }
        // With --no-part a download that dies halfway leaves a truncated file at
        // its final name. For plain video downloads (no post-processing) a
        // non-zero exit therefore means the file is incomplete: reject it
        // instead of sending a broken video. Audio keeps the old behaviour: when
        // the mp3 conversion fails yt-dlp exits non-zero but the original
        // container is intact and is sent with the right mimetype.
        if (code !== 0 && !opts.audio) {
          throw new Error(`yt-dlp exited ${code} with a partial file: ${stderr.slice(-200)}`);
        }
        const fullPath = join(dir, file);
        // Post-processing (e.g. audio extraction) can produce a file even when
        // --max-filesize couldn't pre-check an unknown remote size; enforce a hard
        // cap before buffering the whole thing into memory.
        const { size } = await stat(fullPath);
        if (size === 0) throw new Error("yt-dlp produced an empty file");
        if (size > opts.maxSizeMb * 1024 * 1024 * 1.2) throw new SizeLimitError();
        const buffer = await readFile(fullPath);
        const ext = file.split(".").pop() ?? "bin";
        return { buffer, ext };
      } catch (err) {
        lastErr = err;
        // Too big stays too big, and a timeout means the network is the problem.
        if (err instanceof SizeLimitError) break;
        if (err instanceof Error && /timed out/i.test(err.message)) break;
        if (attempt < sets.length - 1) {
          logger.warn({ err, target, attempt }, "yt-dlp download failed, retrying");
          await new Promise((res) => setTimeout(res, 1200));
        }
      }
    }
    throw lastErr;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
