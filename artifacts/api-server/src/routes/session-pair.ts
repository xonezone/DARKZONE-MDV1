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
<meta name="theme-color" content="#0f0c29">
<title>Dark Zone MD — Get your Session ID</title>
<style>
  :root{--bg:#0f0c29;--card:#1b1740;--line:#3a3378;--text:#f1eeff;--mute:#b3addf;--p:#7c3aed;--pk:#ec4899;--gr:#22c55e;--bl:#3b82f6;--am:#f59e0b}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;color:var(--text);
    background:radial-gradient(900px 500px at 15% -10%,#4c1d95 0%,transparent 60%),radial-gradient(900px 500px at 95% 110%,#831843 0%,transparent 55%),var(--bg);
    font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .card{position:relative;width:100%;max-width:480px;background:linear-gradient(180deg,#1f1a4d,#171338);border:1px solid var(--line);border-radius:22px;padding:28px 24px 22px;
    box-shadow:0 24px 70px rgba(0,0,0,.55),0 0 0 1px rgba(167,139,250,.08) inset;overflow:hidden}
  .rainbow{position:absolute;left:0;right:0;top:0;height:5px;background:linear-gradient(90deg,#7c3aed,#ec4899,#f59e0b,#22c55e,#3b82f6,#7c3aed);background-size:300% 100%;animation:slide 6s linear infinite}
  @keyframes slide{to{background-position:300% 0}}
  h1{margin:6px 0 2px;font-size:26px;letter-spacing:.3px}
  h1 span{background:linear-gradient(90deg,#c4b5fd,#f9a8d4);-webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{margin:0 0 16px;color:var(--mute);font-size:14px}
  .chips{display:flex;gap:8px;margin:0 0 6px}
  .chip{flex:1;text-align:center;font-size:12px;font-weight:600;padding:8px 4px;border-radius:12px;border:1px solid var(--line);color:var(--mute);background:#120f33;transition:.25s}
  .chip b{display:block;font-size:15px}
  .chip.on{color:#fff;border-color:transparent;background:linear-gradient(135deg,#7c3aed,#ec4899);box-shadow:0 6px 18px rgba(124,58,237,.45);transform:translateY(-1px)}
  .chip.done{color:#bbf7d0;border-color:rgba(34,197,94,.5);background:rgba(34,197,94,.12)}
  label{display:block;font-size:13px;color:var(--mute);margin:16px 0 6px}
  input[type=tel]{width:100%;padding:14px 15px;border-radius:14px;border:1px solid var(--line);background:#120f33;color:var(--text);font-size:18px;letter-spacing:.6px}
  input[type=tel]:focus{outline:2px solid #a78bfa;border-color:transparent}
  .consent{display:flex;gap:10px;align-items:flex-start;margin-top:16px;font-size:13px;color:var(--mute)}
  .consent input{margin-top:3px;width:18px;height:18px;accent-color:#ec4899}
  .btn{display:block;width:100%;margin-top:18px;padding:15px;border:0;border-radius:14px;color:#fff;font-size:16px;font-weight:700;letter-spacing:.3px;cursor:pointer;
    background:linear-gradient(120deg,#7c3aed,#ec4899,#f59e0b);background-size:220% 100%;transition:transform .15s,box-shadow .15s,background-position .6s;box-shadow:0 10px 26px rgba(236,72,153,.35)}
  .btn:hover:not(:disabled){transform:translateY(-2px);background-position:100% 0;box-shadow:0 14px 32px rgba(236,72,153,.5)}
  .btn:active:not(:disabled){transform:translateY(0)}
  .btn:disabled{opacity:.45;cursor:not-allowed;box-shadow:none;filter:grayscale(.4)}
  .btn.copy{margin-top:12px;padding:12px;font-size:15px;background:linear-gradient(120deg,#06b6d4,#3b82f6);box-shadow:0 8px 22px rgba(59,130,246,.4)}
  .msg{margin-top:16px;padding:12px 14px;border-radius:14px;font-size:14px;display:none}
  .msg.err{display:block;background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.45);color:#fecaca}
  .msg.ok{display:block;background:rgba(34,197,94,.14);border:1px solid rgba(34,197,94,.5);color:#bbf7d0;font-weight:600}
  .msg.info{display:block;background:rgba(167,139,250,.13);border:1px solid rgba(167,139,250,.45);color:#ddd6fe}
  .code{display:none;margin-top:18px;text-align:center}
  .digits{font:800 40px/1.15 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:7px;padding:18px 10px;border-radius:16px;background:#120f33;border:2px dashed #a78bfa}
  .digits span{background:linear-gradient(90deg,#c4b5fd,#f9a8d4,#fcd34d);-webkit-background-clip:text;background-clip:text;color:transparent}
  .timer{margin-top:12px;font-size:13px;color:var(--mute)} .timer b{color:#fcd34d;font-size:15px}
  .bar{height:7px;border-radius:99px;background:#120f33;margin-top:8px;overflow:hidden}
  .bar i{display:block;height:100%;width:100%;border-radius:99px;background:linear-gradient(90deg,#22c55e,#f59e0b,#ef4444);transition:width 1s linear}
  ol{margin:14px 0 0;padding-left:20px;text-align:left;color:var(--mute);font-size:14px} ol li{margin:5px 0} ol b{color:#e9d5ff}
  .warn{margin:20px 0 0;font-size:12px;color:var(--mute);border-top:1px solid var(--line);padding-top:14px}
  .off{display:none;text-align:center;color:var(--mute);padding:10px 0}
</style>
</head>
<body>
<main class="card">
  <div class="rainbow"></div>
  <h1>🌑 <span>Dark Zone MD</span></h1>
  <p class="sub">Get your WhatsApp <b>Session ID</b> in 3 easy steps</p>

  <div class="chips">
    <div id="s1" class="chip on"><b>1</b>Your number</div>
    <div id="s2" class="chip"><b>2</b>Link WhatsApp</div>
    <div id="s3" class="chip"><b>3</b>Get Session ID</div>
  </div>

  <div id="off" class="off">This pairing service is turned off on this server.</div>

  <div id="form">
    <label for="num">📱 Your WhatsApp number (with country code)</label>
    <input id="num" type="tel" inputmode="numeric" autocomplete="tel" placeholder="923001234567" maxlength="20">
    <label class="consent"><input id="ok" type="checkbox">
      <span>I understand this server briefly handles my WhatsApp login to make a Session ID, and I will never share my Session ID with anyone.</span></label>
    <button id="go" class="btn" disabled>🔑 Get pairing code</button>
  </div>

  <div id="msg" class="msg"></div>

  <div id="code" class="code">
    <div class="digits"><span id="digits"></span></div>
    <button id="copy" class="btn copy" type="button">📋 Copy code</button>
    <div class="timer">Code expires in <b id="left">2:00</b><div class="bar"><i id="barfill"></i></div></div>
    <ol>
      <li>Open <b>WhatsApp</b> on your phone</li>
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
  var num=$("num"), ok=$("ok"), go=$("go"), msg=$("msg"), code=$("code"), digits=$("digits"),
      copy=$("copy"), left=$("left"), fill=$("barfill"), poller=null, ticker=null, raw="";

  function show(kind, text){ msg.className = "msg " + kind; msg.textContent = text; }
  function step(n){ for (var i=1;i<=3;i++){ $("s"+i).className = "chip" + (i<n ? " done" : (i===n ? " on" : "")); } }
  function refresh(){ go.disabled = !(ok.checked && num.value.replace(/\\D/g,"").length >= 8); }
  function stop(){ if (poller) clearInterval(poller); if (ticker) clearInterval(ticker); }
  function fmt(s){ var m=Math.floor(s/60), r=s%60; return m + ":" + (r<10 ? "0" : "") + r; }
  num.addEventListener("input", refresh); ok.addEventListener("change", refresh);

  fetch(base + "/status").then(function(r){return r.json()}).then(function(j){
    if (!j.enabled) { $("form").style.display="none"; $("off").style.display="block"; }
  }).catch(function(){});

  function countdown(){
    var total = 120, t = total;
    left.textContent = fmt(t); fill.style.width = "100%";
    ticker = setInterval(function(){
      t--;
      if (t < 0) { clearInterval(ticker); left.textContent = "expired"; fill.style.width = "0%"; return; }
      left.textContent = fmt(t); fill.style.width = Math.round(t * 100 / total) + "%";
    }, 1000);
  }

  function poll(id){
    var tries = 0;
    poller = setInterval(function(){
      tries++;
      fetch(base + "/status/" + id).then(function(r){return r.json()}).then(function(j){
        if (j.status === "linked") { step(3); show("info", "Linked! Preparing your Session ID..."); }
        if (j.status === "sent") {
          stop(); code.style.display = "none"; step(4);
          show("ok", "🎉 Done! Your Session ID was sent to your WhatsApp chat (Message yourself). Copy it from there.");
        }
        if (j.status === "failed" || j.status === "expired") {
          stop(); code.style.display = "none"; step(1);
          $("form").style.display = "block"; go.disabled = false;
          show("err", j.status === "expired" ? "The code expired. Please try again." : "Something went wrong. Please try again.");
        }
      }).catch(function(){ if (tries > 80) stop(); });
    }, 3000);
  }

  copy.addEventListener("click", function(){
    function done(){ copy.textContent = "✅ Copied!"; setTimeout(function(){ copy.textContent = "📋 Copy code"; }, 1500); }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(raw).then(done, function(){}); return;
      }
    } catch (e) {}
    try {
      var ta = document.createElement("textarea"); ta.value = raw; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta); done();
    } catch (e2) {}
  });

  go.addEventListener("click", function(){
    go.disabled = true; msg.className = "msg"; code.style.display = "none";
    show("info", "Getting your code...");
    fetch(base + "/start", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ number: num.value, consent: ok.checked }) })
    .then(function(r){ return r.json().then(function(j){ return {ok:r.ok, j:j}; }); })
    .then(function(res){
      if (!res.ok) { show("err", res.j.error || "Something went wrong."); go.disabled=false; return; }
      raw = String(res.j.code || "");
      digits.textContent = raw.length === 8 ? raw.slice(0,4) + "-" + raw.slice(4) : raw;
      $("form").style.display = "none"; code.style.display = "block"; step(2);
      show("info", "Waiting for you to enter the code in WhatsApp...");
      poll(res.j.id); countdown();
    }).catch(function(){ show("err", "Could not reach the server."); go.disabled=false; });
  });
})();
</script>
</body>
</html>`;

export default router;
