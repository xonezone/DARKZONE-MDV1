# Dark Zone MD - Docker image (BETA, used by Render and other Docker hosts)
FROM node:22-bookworm-slim

# ffmpeg for audio/video/stickers, curl for yt-dlp
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates git \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@10

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile \
 && pnpm --filter @workspace/api-server run build

# The bot looks for these two files in production
RUN mkdir -p artifacts/api-server/bin \
 && ln -sf "$(which ffmpeg)" artifacts/api-server/bin/ffmpeg \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
      -o artifacts/api-server/bin/yt-dlp \
 && chmod +x artifacts/api-server/bin/yt-dlp

ENV NODE_ENV=production

# WhatsApp login lives in this folder. Mount a persistent disk or volume here.
VOLUME ["/app/artifacts/api-server/data"]

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
