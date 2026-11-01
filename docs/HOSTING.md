# ☁️ Hosting Options

Pick the place that fits you. All of them run the same bot.

> 🧪 **Beta note:** the Replit, Render and panel guides below were written from the bot's code and each host's documentation. If a step does not work for you, please [open an issue](../../../issues/new/choose) and we will fix it.

## ⚡ Quick comparison

| Host | Best for | Stays online 24/7? | Cost | Difficulty |
|---|---|:---:|---|:---:|
| 🟠 **Replit** | Easiest. Bot and dashboard together | Only with a paid Deployment | Free to try | ⭐ |
| 🟣 **Render** | Cloud hosting with one click | Only on a paid plan | Paid plan needed | ⭐⭐ |
| 🟢 **Bot panel** (Pterodactyl style) | Cheap bot hosts | Yes, on most panels | Cheap | ⭐⭐ |
| 🖥️ **VPS** | Full control | Yes | Paid | ⭐⭐⭐ |

## ⚠️ Read this first: WhatsApp login must be saved

Your WhatsApp login is saved in this folder:

```
artifacts/api-server/data/wa-auth/
```

If the host **wipes that folder** when it restarts, the bot **logs out** and you must link again.

- ✅ Good: a panel, a VPS, or a host with a **persistent disk**
- ❌ Bad: a free host that resets its files on every restart or deploy

Also, **free web hosts go to sleep** when nobody visits them. A sleeping bot does not answer messages.

## 📲 Linking WhatsApp (works on every host)

You do **not** need the dashboard to link. Use your Telegram bot:

1. Open your bot in Telegram and send `/start`
2. Send `/pair 923001234567` with **your own number** (country code, no `+`)
3. Telegram sends a pairing code
4. In WhatsApp go to **Linked devices → Link a device → Link with phone number instead**
5. Type the code
6. Send **`.menu`** to your bot. 🎉

Other Telegram commands: `/qr` (link with a QR code), `/disconnect` (unlink), `/link` (code to sign in to the dashboard).

---

## 🟠 Replit

Your project was built on Replit, so it fits well. Replit also gives you ffmpeg and yt-dlp already.

1. Open: **https://replit.com/github/xonezone/DARKZONE-MDV1**
2. Tap **Import from GitHub**.
3. Open **Secrets** (the lock icon) and add the keys from the [README table](../README.md#%EF%B8%8F-environment-variables).
   Set `DATABASE_URL` to a PostgreSQL link. Use Replit's PostgreSQL if it offers one, or a free one from Neon.
4. Open the **Shell** and run:

```bash
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
```

5. Link WhatsApp with Telegram `/pair` (see above).

**To keep it online 24/7:** use Replit's **Deployments** (a Reserved VM type stays awake). A normal free Repl sleeps.

---

## 🟣 Render

This repo has a `render.yaml` file, so Render can set it up for you.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/xonezone/DARKZONE-MDV1)

1. Tap the button above and log in to Render.
2. Fill in the secret values it asks for (`DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, Clerk keys, AI keys).
3. Tap **Apply** and wait for the build.
4. Open **Logs**. You should see `Server listening`.
5. Link WhatsApp with Telegram `/pair`.

**Good to know:**
- The blueprint uses a **paid plan** because it needs a **disk** (to keep your WhatsApp login) and must **stay awake**.
- On the **free plan** a web service sleeps after about 15 minutes with no visitors, and it has no disk.
  A free Render bot will log out and go quiet.
- `DATABASE_URL` is a separate PostgreSQL. [Neon](https://neon.tech) and [Supabase](https://supabase.com) both have free plans.
- The dashboard is **not** part of this blueprint. You do not need it, because Telegram does the linking.

---

## 🟢 Bot hosting panel (Pterodactyl style)

Many cheap bot hosts use a panel. The steps are almost the same on all of them.

1. Create a **Node.js** server. Choose the newest Node version, **22 or higher**.
2. Put the bot files on it. Use one of these:
   - **Git:** if the panel has a "Git repository" box, enter `https://github.com/xonezone/DARKZONE-MDV1.git`
   - **Upload:** download the repo as a zip from GitHub (**Code → Download ZIP**), upload it in the **File Manager**, and unzip it
3. Add your settings. Use the panel's **Variables** or **Startup** tab, or upload a `.env` file made from `.env.example`.
4. Set the **startup command** to:

```
bash panel-start.sh
```

5. Press **Start**. The first start takes a few minutes. It installs packages, builds the bot, and downloads ffmpeg and yt-dlp.
6. Wait for `Server listening` in the console.
7. Link WhatsApp with Telegram `/pair`.

**Good to know:**
- Panels keep their files between restarts, so your WhatsApp login is saved. ✅
- If your panel has a **port** setting, make sure `PORT` is set to the port the panel gave you.
- If the panel blocks `npx` or downloads, ask the host's support, or use a VPS instead.

---

## 🖥️ VPS (your own server)

Full steps are in the [Setup & Deploy Guide](DEPLOY.md).

---

## 🐳 Docker (advanced)

A `Dockerfile` is included.

```bash
docker build -t darkzone-md .
docker run -d --name darkzone \
  --env-file .env \
  -p 8080:8080 -e PORT=8080 \
  -v darkzone-data:/app/artifacts/api-server/data \
  darkzone-md
```

The `-v` line keeps your WhatsApp login when the container restarts.

---

## 🔒 Safety on every host

- Never put `.env` or the `wa-auth` folder on GitHub. They are already ignored.
- If a key leaks, delete it and make a new one.
- If your WhatsApp session leaks, go to **Linked devices** in WhatsApp and log that device out.
