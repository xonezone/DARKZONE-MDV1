# 🚀 Setup & Deploy Guide

This guide takes you from zero to a running **Dark Zone MD** on an Ubuntu or Debian server (VPS).
Using something else? The same steps work on most Linux machines.

## ✅ What you need

| Thing | Why |
|---|---|
| **Node.js 22+** | Runs the bot |
| **pnpm 10+** | Installs the packages (`npm install -g pnpm`) |
| **PostgreSQL** database | Saves settings, groups, economy and more (Neon or Supabase free plans work) |
| **ffmpeg** | Audio, video and sticker commands |
| **yt-dlp** | Music and video download commands |
| **Telegram bot token** | Pairing. Make one with [@BotFather](https://t.me/BotFather) |
| **Clerk keys** | Dashboard login. Free at [clerk.com](https://clerk.com) |
| AI keys *(optional)* | OpenAI, Gemini or OpenRouter for the AI commands |

## 1️⃣ Install the tools

```bash
sudo apt update
sudo apt install -y git curl ffmpeg
npm install -g pnpm pm2
```

Install Node.js 22 from [nodejs.org](https://nodejs.org) if you do not have it.

## 2️⃣ Download the bot

```bash
git clone https://github.com/xonezone/DARKZONE-MDV1.git
cd DARKZONE-MDV1
pnpm install
```

## 3️⃣ Add your settings

```bash
cp .env.example .env
nano .env
```

Fill in every line. Use the table in the [README](../README.md#%EF%B8%8F-environment-variables).
Set `NODE_ENV=production` on a server.

> 🔒 Never upload `.env` to GitHub. It is already ignored.

## 4️⃣ Create the database tables

The bot does not read `.env` by itself. Load it first, then push the tables:

```bash
set -a; . ./.env; set +a
pnpm --filter @workspace/db run push
```

## 5️⃣ Add ffmpeg and yt-dlp for production

In production mode the bot looks for these two files and stops if they are missing:

```
artifacts/api-server/bin/ffmpeg
artifacts/api-server/bin/yt-dlp
```

Add them like this:

```bash
mkdir -p artifacts/api-server/bin

# ffmpeg: link the one you installed in step 1
ln -sf "$(which ffmpeg)" artifacts/api-server/bin/ffmpeg

# yt-dlp: download the official self-contained Linux build
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
  -o artifacts/api-server/bin/yt-dlp
chmod +x artifacts/api-server/bin/yt-dlp
```

Keep yt-dlp fresh. Run the `curl` line again when downloads stop working.

## 6️⃣ Build and start

```bash
pnpm --filter @workspace/api-server run build
./start.sh
```

`start.sh` loads your `.env` and starts the bot. You should see `Server listening`.

## 7️⃣ Keep it running 24/7 with PM2

```bash
pm2 start ./start.sh --name darkzone
pm2 save
pm2 startup
```

Useful PM2 commands:

| Command | What it does |
|---|---|
| `pm2 logs darkzone` | Watch the live log |
| `pm2 restart darkzone` | Restart the bot |
| `pm2 stop darkzone` | Stop the bot |
| `pm2 status` | See if it is running |

## 8️⃣ Link your WhatsApp

Open your bot in Telegram and send `/pair 923001234567` (your own number, with country code, no `+`).
Type the code it gives you in WhatsApp under **Linked devices → Link a device → Link with phone number instead**.
When it connects, send **`.menu`** to your bot. 🎉

> Prefer another host? See [Hosting Options](HOSTING.md) for Replit, Render and bot panels.

## 🖥️ About the dashboard (optional)

The dashboard is a separate React app in `artifacts/whatsapp-dashboard`. It needs two values when it starts:

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/whatsapp-dashboard run dev
```

It calls the bot server at `/api`, so both must be reachable on the same website address. On a server, put them behind one reverse proxy such as Nginx or Caddy.

> ℹ️ This project was built on Replit, which does that routing for you. Hosting the dashboard somewhere else may need small changes. If you get stuck, ask in an [issue](../../../issues/new/choose).

## 🔄 Updating the bot

```bash
git pull
pnpm install
pnpm --filter @workspace/api-server run build
pm2 restart darkzone
```

## 🔒 Safety checklist

- [ ] `.env` is **not** on GitHub
- [ ] No WhatsApp session or login files are on GitHub
- [ ] You use a spare WhatsApp number if you can
- [ ] Old keys are deleted if they ever leaked
