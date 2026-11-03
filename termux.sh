#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
#  Dark Zone MD  -  Termux installer and manager (BETA)
#
#  Install (asks for your Telegram bot token):
#      bash termux.sh install
#
#  After that you can use the short command:
#      darkzone start | stop | restart | status | logs | token | update
# ──────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/xonezone/DARKZONE-MDV1.git}"
APP_DIR="${DARKZONE_DIR:-$HOME/darkzone-bot}"
PREFIX_DIR="${PREFIX:-/data/data/com.termux/files/usr}"
PGDATA="${PGDATA_DIR:-$PREFIX_DIR/var/lib/postgresql}"
DB_NAME="darkzone"
PID_FILE="$APP_DIR/bot.pid"
LOG_FILE="$APP_DIR/bot.log"
ENV_FILE="$APP_DIR/.env"

# ── pretty output ─────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_R=$'\033[31m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_B=$'\033[34m'; C_P=$'\033[35m'; C_X=$'\033[0m'
else
  C_R=""; C_G=""; C_Y=""; C_B=""; C_P=""; C_X=""
fi
step() { printf '\n%s━━ %s%s\n' "$C_P" "$1" "$C_X"; }
ok()   { printf '%s✅ %s%s\n' "$C_G" "$1" "$C_X"; }
info() { printf '%s👉 %s%s\n' "$C_B" "$1" "$C_X"; }
warn() { printf '%s⚠️  %s%s\n' "$C_Y" "$1" "$C_X"; }
die()  { printf '%s❌ %s%s\n' "$C_R" "$1" "$C_X" >&2; exit 1; }

trap 'printf "%s❌ Something failed near line %s of termux.sh. Send a screenshot of this screen to get help.%s\n" "$C_R" "$LINENO" "$C_X" >&2' ERR

# ── small helpers ─────────────────────────────────────────────────────────────
have() { command -v "$1" >/dev/null 2>&1; }

need_termux() {
  if [[ "$PREFIX_DIR" != *com.termux* && "${DARKZONE_ALLOW_NON_TERMUX:-}" != "1" ]]; then
    die "This script is made for Termux on Android. For other computers see docs/DEPLOY.md."
  fi
}

ask_tty() { # ask_tty "prompt" [silent]   reads from the keyboard, or from stdin when there is no keyboard
  local prompt="$1" silent="${2:-}" reply="" src=/dev/stdin
  if ( : </dev/tty ) 2>/dev/null; then src=/dev/tty; fi
  if [ -n "$silent" ]; then
    read -rsp "$prompt" reply <"$src" || true
    printf '\n' >&2
  else
    read -rp "$prompt" reply <"$src" || true
  fi
  printf '%s' "$reply"
}

# Set KEY='value' in the .env file (replaces an existing line, keeps the rest).
env_set() {
  local key="$1" value="$2" tmp
  case "$value" in *"'"*) die "The value for $key must not contain a single quote (')." ;; esac
  mkdir -p "$APP_DIR"; touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
  tmp="$(mktemp "$APP_DIR/.env.XXXXXX")"
  grep -v "^${key}=" "$ENV_FILE" > "$tmp" || true
  printf "%s='%s'\n" "$key" "$value" >> "$tmp"
  chmod 600 "$tmp"; mv "$tmp" "$ENV_FILE"
}

env_get() { # prints the value of KEY from .env (without quotes), or nothing
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^$1='\(.*\)'\$/\1/p" "$ENV_FILE" | head -n1
}

load_env() { set -a; . "$ENV_FILE"; set +a; }

bot_pid() { [ -f "$PID_FILE" ] && cat "$PID_FILE" 2>/dev/null || true; }
bot_running() {
  local p st
  p="$(bot_pid)"
  [ -n "$p" ] || return 1
  kill -0 "$p" 2>/dev/null || return 1
  st="$(awk '{print $3}' "/proc/$p/stat" 2>/dev/null || true)"   # a "Z" (zombie) means it already exited
  [ "$st" != "Z" ]
}

local_db() { [[ "$(env_get DATABASE_URL)" == *127.0.0.1* ]]; }

# ── install steps ─────────────────────────────────────────────────────────────
install_packages() {
  step "1/8  Installing the tools (this can take a few minutes)"
  export DEBIAN_FRONTEND=noninteractive APT_LISTCHANGES_FRONTEND=none
  pkg update -y || warn "pkg update had a problem. If installing fails next, run: termux-change-repo"
  pkg install -y git curl nodejs-lts python ffmpeg postgresql
  if ! have yt-dlp; then
    pkg install -y yt-dlp || pip install -U yt-dlp || warn "Could not install yt-dlp. Downloader commands will not work."
  fi
  local major
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$major" -lt 22 ]; then
    info "Node $major is too old. Trying the newest Node..."
    pkg install -y nodejs
    major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  fi
  [ "$major" -ge 22 ] || die "The bot needs Node 22 or newer, but Termux gave Node $major. Run 'pkg upgrade' and try again."
  ok "Tools ready (Node $(node -v))"
}

install_pnpm() {
  step "2/8  Installing pnpm"
  if ! have pnpm; then npm install -g pnpm@10; fi
  have pnpm || die "pnpm did not install. Try: npm install -g pnpm@10"
  ok "pnpm $(pnpm -v)"
}

fetch_source() {
  step "3/8  Downloading the bot to $APP_DIR"
  if [ -d "$APP_DIR/.git" ]; then
    (cd "$APP_DIR" && git checkout -- pnpm-workspace.yaml pnpm-lock.yaml 2>/dev/null || true; git pull --ff-only)
  else
    git clone --depth 1 "$REPO_URL" "$APP_DIR"
  fi
  ok "Bot files ready"
}

# The project only installs the Linux x64 build of esbuild (a Replit setting).
# A phone needs the Android build, so allow it for this copy only.
patch_for_android() {
  local raw arch
  raw="${DARKZONE_UNAME_M:-$(uname -m)}"
  case "$raw" in
    aarch64|arm64) arch="arm64" ;;
    armv7l|armv8l|arm*) arch="arm" ;;
    x86_64) arch="x64" ;;
    *) warn "Unknown phone type '$raw'. Build tools may not install."; return 0 ;;
  esac
  sed -i "/@esbuild\/android-${arch}/d" "$APP_DIR/pnpm-workspace.yaml"
  ok "Allowed the Android build tools ($arch)"
}

install_deps() {
  step "4/8  Installing the bot's packages (the slowest step, please wait)"
  (
    cd "$APP_DIR"
    export NODE_OPTIONS="--max-old-space-size=2048"
    pnpm install --filter "@workspace/api-server..." --no-frozen-lockfile --config.confirmModulesPurge=false
  )
  ok "Packages installed"
}

setup_postgres() {
  step "5/8  Setting up the database"
  local existing
  existing="$(env_get DATABASE_URL)"
  if [ -n "${DATABASE_URL:-}" ]; then
    env_set DATABASE_URL "$DATABASE_URL"; ok "Using the DATABASE_URL you provided"; return 0
  fi
  if [ -n "$existing" ] && [[ "$existing" != *127.0.0.1* ]]; then ok "Keeping your existing DATABASE_URL"; return 0; fi

  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    mkdir -p "$PGDATA"
    initdb -D "$PGDATA" -E UTF8 -A trust   # only reachable from this phone (localhost)
  fi
  pg_up
  createdb "$DB_NAME" 2>/dev/null || true
  env_set DATABASE_URL "postgresql://$(whoami)@127.0.0.1:5432/$DB_NAME"
  ok "Database ready"
}

pg_up() {
  if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then return 0; fi
  if ! pg_ctl -D "$PGDATA" -l "$PGDATA/server.log" -w start >/dev/null 2>&1; then
    rm -f "$PGDATA/postmaster.pid"   # left behind when Android killed Termux
    pg_ctl -D "$PGDATA" -l "$PGDATA/server.log" -w start >/dev/null 2>&1 \
      || die "The database would not start. See: $PGDATA/server.log"
  fi
}

# Start the phone's own database, but only when the bot is set up to use it.
start_postgres() { local_db || return 0; pg_up; }

get_token() {
  step "6/8  Your Telegram bot token"
  local token="${TELEGRAM_BOT_TOKEN:-}" tries=0 reply user
  info "Make a bot in Telegram: open @BotFather, send /newbot, and copy the token it gives you."
  while :; do
    if [ -z "$token" ]; then
      token="$(ask_tty "Paste your Telegram bot token and press Enter (it will not show): " silent)"
    fi
    token="${token//[[:space:]]/}"
    if [[ "$token" =~ ^[0-9]{5,}:[A-Za-z0-9_-]{30,}$ ]]; then
      if reply="$(curl -fsS --max-time 20 -K - <<<"url = \"https://api.telegram.org/bot${token}/getMe\"" 2>/dev/null)"; then
        user="$(printf '%s' "$reply" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')"
        env_set TELEGRAM_BOT_TOKEN "$token"
        TG_USER="${user:-your_bot}"
        ok "Token accepted. Your bot is @$TG_USER"
        return 0
      fi
      warn "Telegram did not accept that token (or there is no internet)."
    else
      warn "That does not look like a bot token. It looks like 123456789:ABCdef..."
    fi
    token=""; tries=$((tries + 1))
    [ "$tries" -lt 3 ] || die "No working token after 3 tries. Run 'bash termux.sh token' to try again."
  done
}

write_settings() {
  env_set NODE_ENV production
  env_set PORT "${PORT:-8080}"
  env_set LOG_LEVEL info
  env_set TELEGRAM_POLLING 1
  # A phone is small. Allow yourself plus a few more linked WhatsApp accounts.
  [ -n "$(env_get MAX_WA_TENANTS)" ] || env_set MAX_WA_TENANTS 5
  # Optional: start already linked (see docs/SESSION-ID.md)
  [ -z "${SESSION_ID:-}" ] || env_set SESSION_ID "$SESSION_ID"
}

link_tools() {
  step "7/8  Connecting ffmpeg and yt-dlp"
  mkdir -p "$APP_DIR/artifacts/api-server/bin"
  have ffmpeg && ln -sf "$(command -v ffmpeg)" "$APP_DIR/artifacts/api-server/bin/ffmpeg" || warn "ffmpeg not found: stickers and audio effects will not work."
  have yt-dlp && ln -sf "$(command -v yt-dlp)" "$APP_DIR/artifacts/api-server/bin/yt-dlp" || warn "yt-dlp not found: download commands will not work."
  ok "Tools connected"
}

prepare_bot() {
  step "8/8  Building the bot"
  (
    cd "$APP_DIR"
    export NODE_OPTIONS="--max-old-space-size=2048"
    load_env
    pnpm --filter @workspace/db run push-force
    pnpm --filter @workspace/api-server run build
  )
  [ -f "$APP_DIR/artifacts/api-server/dist/index.mjs" ] || die "The build did not produce the bot file. Scroll up for the error."
  ok "Bot built"
}

install_launcher() {
  local bin="$PREFIX_DIR/bin/darkzone"
  mkdir -p "$PREFIX_DIR/bin"
  printf '#!/usr/bin/env bash\nexec bash "%s/termux.sh" "$@"\n' "$APP_DIR" > "$bin"
  chmod +x "$bin"
}

# ── run the bot ───────────────────────────────────────────────────────────────
cmd_start() {
  [ -f "$APP_DIR/artifacts/api-server/dist/index.mjs" ] || die "The bot is not installed yet. Run: bash termux.sh install"
  if bot_running; then ok "The bot is already running (pid $(bot_pid))"; return 0; fi
  start_postgres
  have termux-wake-lock && termux-wake-lock || true
  if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE")" -gt 5242880 ]; then mv -f "$LOG_FILE" "$LOG_FILE.old"; fi
  (
    cd "$APP_DIR"
    load_env
    nohup node --enable-source-maps artifacts/api-server/dist/index.mjs >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
  )
  sleep "${DARKZONE_START_WAIT:-6}"
  if bot_running; then
    ok "Dark Zone MD is running (pid $(bot_pid))"
    info "See the log any time with:  darkzone logs"
  else
    warn "The bot stopped right after starting. Last lines of the log:"
    tail -n 15 "$LOG_FILE" 2>/dev/null || true
    die "Fix the problem above, then run: darkzone start"
  fi
}

cmd_stop() {
  if bot_running; then
    kill "$(bot_pid)" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do bot_running || break; sleep 1; done
    bot_running && kill -9 "$(bot_pid)" 2>/dev/null || true
    ok "Bot stopped"
  else
    info "The bot was not running"
  fi
  rm -f "$PID_FILE"
  have termux-wake-unlock && termux-wake-unlock || true
}

cmd_status() {
  if bot_running; then ok "Bot: running (pid $(bot_pid))"; else warn "Bot: stopped"; fi
  if local_db; then
    if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then ok "Database: running"; else warn "Database: stopped"; fi
  fi
  if [ -f "$LOG_FILE" ]; then info "Last log lines:"; tail -n 5 "$LOG_FILE"; fi
}

cmd_logs() { [ -f "$LOG_FILE" ] || die "No log yet. Start the bot first."; tail -n "${1:-40}" -f "$LOG_FILE"; }

cmd_token() {
  [ -d "$APP_DIR" ] || die "Install first: bash termux.sh install"
  get_token
  info "Restarting the bot with the new token..."
  cmd_stop; cmd_start
  show_next_steps
}

cmd_update() {
  [ -d "$APP_DIR/.git" ] || die "Install first: bash termux.sh install"
  local was_running=0; bot_running && was_running=1
  cmd_stop
  fetch_source
  patch_for_android
  link_tools
  install_deps
  start_postgres
  prepare_bot
  ok "Updated"
  [ "$was_running" -eq 1 ] && cmd_start || info "Start it with: darkzone start"
}

show_next_steps() {
  local u="${TG_USER:-your_bot}"
  cat <<EOF

${C_G}══════════════════════════════════════════════${C_X}
${C_G}  🎉 Dark Zone MD is ready!${C_X}
${C_G}══════════════════════════════════════════════${C_X}

Now link your WhatsApp from Telegram:

  1. Open Telegram and find  ${C_P}@${u}${C_X}
  2. Send   /start
  3. Send   /pair 923001234567      (your own number, with country code, no +)
  4. In WhatsApp: Settings → Linked devices → Link a device
     → "Link with phone number instead" → type the code the bot sends
  5. Send  .menu  to your bot on WhatsApp 🎉

Handy commands:
  darkzone status    darkzone logs    darkzone stop    darkzone start    darkzone update

⚠️  Anyone who finds your Telegram bot can link THEIR WhatsApp to it.
   Keep the bot's @username private. At most ${MAX_WA_TENANTS_SHOWN:-5} accounts can link.

📱 Termux tips: keep the Termux notification on, and turn off battery
   optimization for Termux, or Android may stop the bot.
EOF
}

cmd_install() {
  need_termux
  printf '%s\n' "${C_P}🌑 Dark Zone MD · Termux installer${C_X}"
  install_packages
  install_pnpm
  fetch_source
  patch_for_android
  install_deps
  setup_postgres
  get_token
  write_settings
  link_tools
  prepare_bot
  install_launcher
  MAX_WA_TENANTS_SHOWN="$(env_get MAX_WA_TENANTS)"
  cmd_start
  show_next_steps
}

usage() {
  cat <<EOF
Dark Zone MD for Termux

  bash termux.sh install     install everything (asks for your Telegram token)
  darkzone start             start the bot
  darkzone stop              stop the bot
  darkzone restart           stop and start
  darkzone status            is it running?
  darkzone logs              watch the log (Ctrl+C to leave)
  darkzone token             change the Telegram bot token
  darkzone update            get the newest version
EOF
}

case "${1:-install}" in
  install)   cmd_install ;;
  start)     cmd_start ;;
  stop)      cmd_stop ;;
  restart)   cmd_stop; cmd_start ;;
  status)    cmd_status ;;
  logs)      shift || true; cmd_logs "${1:-40}" ;;
  token)     cmd_token ;;
  update)    cmd_update ;;
  help|-h|--help) usage ;;
  *) usage; exit 1 ;;
esac
