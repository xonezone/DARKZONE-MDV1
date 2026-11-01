#!/usr/bin/env bash
# Dark Zone MD - one-file start script for bot hosting panels (BETA).
# Use this as the panel's startup command:   bash panel-start.sh
# First start takes a few minutes. It installs, builds and downloads ffmpeg + yt-dlp.
set -e
cd "$(dirname "$0")"

PNPM="npx --yes pnpm@10"
BIN=artifacts/api-server/bin
mkdir -p "$BIN"

# Load .env if you made one (panels can also use their own Variables tab)
if [ -f .env ]; then set -a; . ./.env; set +a; fi
export NODE_ENV="${NODE_ENV:-production}"

# 1) Packages
if [ ! -d node_modules ]; then
  echo "==> Installing packages..."
  $PNPM install --frozen-lockfile
fi

# 2) Build the bot
if [ ! -f artifacts/api-server/dist/index.mjs ]; then
  echo "==> Building the bot..."
  $PNPM --filter @workspace/api-server run build
fi

# 3) yt-dlp
if [ ! -x "$BIN/yt-dlp" ]; then
  echo "==> Downloading yt-dlp..."
  curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o "$BIN/yt-dlp" \
    || echo "!! Could not download yt-dlp. Download commands will not work."
  chmod +x "$BIN/yt-dlp" 2>/dev/null || true
fi

# 4) ffmpeg
if [ ! -x "$BIN/ffmpeg" ]; then
  if command -v ffmpeg >/dev/null 2>&1; then
    ln -sf "$(command -v ffmpeg)" "$BIN/ffmpeg"
  else
    echo "==> Downloading ffmpeg..."
    case "$(uname -m)" in
      aarch64|arm64) FF=arm64 ;;
      *)             FF=amd64 ;;
    esac
    curl -fsSL "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${FF}-static.tar.xz" -o /tmp/ffmpeg.tar.xz \
      && tar -xf /tmp/ffmpeg.tar.xz -C /tmp \
      && cp /tmp/ffmpeg-*-static/ffmpeg "$BIN/ffmpeg" \
      && chmod +x "$BIN/ffmpeg" \
      || echo "!! Could not get ffmpeg. Stickers, audio and video commands will not work."
    rm -rf /tmp/ffmpeg.tar.xz /tmp/ffmpeg-*-static
  fi
fi

echo "==> Starting Dark Zone MD..."
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
