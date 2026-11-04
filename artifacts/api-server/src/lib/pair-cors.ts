/**
 * CORS for the pairing API, so a pairing page hosted on ANOTHER address (for
 * example GitHub Pages) can call it from the browser.
 *
 * Only exact origins listed in PAIR_ALLOWED_ORIGINS are allowed, for example:
 *   PAIR_ALLOWED_ORIGINS=https://yourname.github.io
 * `*` is deliberately NOT supported: it would let any website use your server
 * to run pairings.
 */
type Req = { method?: string; headers: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): unknown; status(code: number): { end(): unknown } };

export function allowedOrigins(): string[] {
  return (process.env.PAIR_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((o) => o !== "*" && /^https?:\/\/[^/\s]+$/i.test(o));
}

/** Adds CORS headers for allowed origins. Returns true if it already answered (a preflight). */
export function applyCors(req: Req, res: Res): boolean {
  const raw = req.headers.origin;
  const origin = (Array.isArray(raw) ? raw[0] : raw)?.replace(/\/+$/, "");
  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
