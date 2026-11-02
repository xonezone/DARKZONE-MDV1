import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { createRateLimiter, getPairManager, PairError } from "../lib/session-pair";

/**
 * Public "Get a Session ID" pairing page.
 *
 *   GET  /api/session-pair              the web page
 *   POST /api/session-pair/start        { number, consent }  ->  { id, code }
 *   GET  /api/session-pair/status/:id   ->  { status }
 *
 * The Session ID itself is sent to the user's own WhatsApp chat. It is never part
 * of any HTTP response.
 *
 * This feature is OFF unless ENABLE_SESSION_PAIR=true, because while pairing the
 * server briefly handles the visitor's WhatsApp login.
 */
const router: IRouter = Router();

const perHour = Number(process.env.PAIR_MAX_PER_HOUR);
const limiter = createRateLimiter(Number.isFinite(perHour) && perHour > 0 ? perHour : 3, 60 * 60_000);

function enabled(): boolean {
  return process.env.ENABLE_SESSION_PAIR === "true";
}

function clientKey(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
  return first || req.ip || req.socket.remoteAddress || "unknown";
}

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

router.get("/session-pair", (_req, res) => {
  noStore(res);
  res.type("html").send(PAGE);
});

router.get("/session-pair/status", (_req, res) => {
  noStore(res);
  res.json({ enabled: enabled() });
});

router.post("/session-pair/start", async (req, res) => {
  noStore(res);
  if (!enabled()) {
    res.status(503).json({ error: "The pairing service is turned off on this server." });
    return;
  }
  const body = (req.body ?? {}) as { number?: unknown; consent?: unknown };
  if (body.consent !== true) {
    res.status(400).json({ error: "Please tick the box to confirm you understand." });
    return;
  }
  if (!limiter.allow(clientKey(req))) {
    res.status(429).json({ error: "Too many tries. Please wait an hour and try again." });
    return;
  }
  try {
    const { id, code } = await getPairManager().start(body.number);
    res.json({ id, code });
  } catch (err) {
    if (err instanceof PairError) {
      const status = err.code === "BAD_NUMBER" ? 400 : err.code === "ACTIVE_NUMBER" ? 409 : err.code === "BUSY" ? 503 : 500;
      res.status(status).json({ error: err.message });
      return;
    }
    logger.error({ reason: err instanceof Error ? err.message : "unknown" }, "session pair route error");
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

router.get("/session-pair/status/:id", (req, res) => {
  noStore(res);
  const id = String(req.params.id ?? "");
  if (!/^[0-9a-f]{32}$/.test(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const status = getPairManager().status(id);
  if (!status) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ status });
});

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Dark Zone MD — Get your Session ID</title>
<style>
  :root{--bg:#0f0c29;--card:#1b1740;--line:#332d6b;--text:#ece9ff;--mute:#a9a3d6;--accent:#a78bfa;--ok:#34d399;--bad:#f87171}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;
    background:radial-gradient(1200px 600px at 50% -10%,#302b63 0%,var(--bg) 60%);color:var(--text);
    font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .card{width:100%;max-width:460px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:26px;
    box-shadow:0 20px 60px rgba(0,0,0,.45)}
  h1{margin:0 0 4px;font-size:22px} .sub{margin:0 0 18px;color:var(--mute);font-size:14px}
  label{display:block;font-size:13px;color:var(--mute);margin:14px 0 6px}
  input[type=tel]{width:100%;padding:13px 14px;border-radius:12px;border:1px solid var(--line);background:#120f33;color:var(--text);font-size:17px;letter-spacing:.5px}
  input[type=tel]:focus{outline:2px solid var(--accent);border-color:transparent}
  .consent{display:flex;gap:10px;align-items:flex-start;margin-top:16px;font-size:13px;color:var(--mute)}
  .consent input{margin-top:3px;accent-color:#7c3aed}
  button{width:100%;margin-top:18px;padding:14px;border:0;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#a78bfa);color:#fff;font-size:16px;font-weight:600;cursor:pointer}
  button:disabled{opacity:.5;cursor:not-allowed}
  .msg{margin-top:16px;padding:12px 14px;border-radius:12px;font-size:14px;display:none}
  .msg.err{display:block;background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.4);color:#fecaca}
  .msg.ok{display:block;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.4);color:#bbf7d0}
  .msg.info{display:block;background:rgba(167,139,250,.12);border:1px solid rgba(167,139,250,.4);color:#ddd6fe}
  .code{display:none;margin-top:18px;text-align:center}
  .code .digits{font:700 36px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:6px;padding:16px;border-radius:14px;background:#120f33;border:1px dashed var(--accent)}
  ol{margin:12px 0 0;padding-left:20px;text-align:left;color:var(--mute);font-size:14px} ol li{margin:4px 0}
  .warn{margin-top:20px;font-size:12px;color:var(--mute);border-top:1px solid var(--line);padding-top:14px}
  .off{display:none;text-align:center;color:var(--mute)}
</style>
</head>
<body>
<main class="card">
  <h1>🌑 Dark Zone MD</h1>
  <p class="sub">Get your WhatsApp Session ID</p>

  <div id="off" class="off">This pairing service is turned off on this server.</div>

  <div id="form">
    <label for="num">Your WhatsApp number (with country code)</label>
    <input id="num" type="tel" inputmode="numeric" autocomplete="tel" placeholder="923001234567" maxlength="20">
    <label class="consent"><input id="ok" type="checkbox">
      <span>I understand this server briefly handles my WhatsApp login to make a Session ID, and I will never share my Session ID with anyone.</span></label>
    <button id="go" disabled>Get pairing code</button>
  </div>

  <div id="msg" class="msg"></div>

  <div id="code" class="code">
    <div class="digits" id="digits"></div>
    <ol>
      <li>Open WhatsApp on your phone</li>
      <li>Go to <b>Settings → Linked devices → Link a device</b></li>
      <li>Tap <b>Link with phone number instead</b></li>
      <li>Type the code above</li>
    </ol>
  </div>

  <p class="warn">🔒 Your Session ID is sent to your own WhatsApp chat (&ldquo;Message yourself&rdquo;). It is never shown on this page. It works like a password: anyone who has it can control your WhatsApp.</p>
</main>
<script>
(function(){
  var base = location.pathname.replace(/\\/+$/, "");
  var $ = function(id){ return document.getElementById(id); };
  var num=$("num"), ok=$("ok"), go=$("go"), msg=$("msg"), code=$("code"), digits=$("digits"), timer=null;

  function show(kind, text){ msg.className = "msg " + kind; msg.textContent = text; }
  function refresh(){ go.disabled = !(ok.checked && num.value.replace(/\\D/g,"").length >= 8); }
  num.addEventListener("input", refresh); ok.addEventListener("change", refresh);

  fetch(base + "/status").then(function(r){return r.json()}).then(function(j){
    if (!j.enabled) { $("form").style.display="none"; $("off").style.display="block"; }
  }).catch(function(){});

  function poll(id){
    var tries = 0;
    timer = setInterval(function(){
      tries++;
      fetch(base + "/status/" + id).then(function(r){return r.json()}).then(function(j){
        if (j.status === "linked") show("info", "Linked! Preparing your Session ID...");
        if (j.status === "sent")   { clearInterval(timer); code.style.display="none"; show("ok", "Done! Your Session ID was sent to your WhatsApp chat (Message yourself). Copy it from there."); }
        if (j.status === "failed" || j.status === "expired") { clearInterval(timer); code.style.display="none"; $("form").style.display="block"; go.disabled=false; show("err", j.status === "expired" ? "The code expired. Please try again." : "Something went wrong. Please try again."); }
      }).catch(function(){ if (tries > 80) clearInterval(timer); });
    }, 3000);
  }

  go.addEventListener("click", function(){
    go.disabled = true; msg.className = "msg"; code.style.display = "none";
    show("info", "Getting your code...");
    fetch(base + "/start", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ number: num.value, consent: ok.checked }) })
    .then(function(r){ return r.json().then(function(j){ return {ok:r.ok, j:j}; }); })
    .then(function(res){
      if (!res.ok) { show("err", res.j.error || "Something went wrong."); go.disabled=false; return; }
      var c = String(res.j.code || ""); digits.textContent = c.length === 8 ? c.slice(0,4) + "-" + c.slice(4) : c;
      $("form").style.display = "none"; code.style.display = "block";
      show("info", "Waiting for you to enter the code in WhatsApp...");
      poll(res.j.id);
    }).catch(function(){ show("err", "Could not reach the server."); go.disabled=false; });
  });
})();
</script>
</body>
</html>`;

export default router;
