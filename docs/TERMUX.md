# 📱 Run Dark Zone MD on your phone (Termux)

Run the whole bot on an Android phone. You run **one command**, paste your **Telegram bot token**, and then link WhatsApp from Telegram.

> 🧪 **Beta:** this guide and the installer were written from the bot's code and tested with a *simulated* Termux. They were not tested on a real phone. If a step fails, send a screenshot of the error and it will be fixed.

## ✅ What you need

| Thing | Notes |
|---|---|
| An Android phone | Android 7 or newer, about **3 GB free space** and **3 GB RAM** or more |
| **Termux** | Install it from **F-Droid** ([f-droid.org](https://f-droid.org)). The Play Store version is old and broken |
| Internet | The first install downloads a lot |
| A **Telegram bot token** | See step 1 |

## 1️⃣ Make your Telegram bot (1 minute)

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Choose a name and a username (it must end in `bot`)
4. BotFather gives you a **token** like `123456789:ABCdef...`. Copy it

🔒 The token is a password for your bot. Never share it. If it leaks, send `/revoke` to BotFather.

## 2️⃣ Install (one command)

Open Termux and paste this:

```bash
pkg install -y curl && curl -fsSLO https://raw.githubusercontent.com/xonezone/DARKZONE-MDV1/main/termux.sh && bash termux.sh install
```

When it asks, **paste your token** and press Enter. You will not see it appear. That is normal.

The first install takes about **10 to 30 minutes**. It installs the tools, sets up a small database on your phone, builds the bot, and starts it. Keep Termux open and the screen on.

When it finishes you will see **🎉 Dark Zone MD is ready!**

## 3️⃣ Link WhatsApp from Telegram

1. Open Telegram and find your bot
2. Send `/start`
3. Send `/pair 923001234567` (use **your own number**, with the country code and no `+`)
4. The bot sends you a code
5. In WhatsApp go to **Settings → Linked devices → Link a device → Link with phone number instead**
6. Type the code
7. Send **`.menu`** to your bot on WhatsApp 🎉

Other Telegram commands: `/qr` (link with a QR code), `/disconnect` (unlink).

## 🎮 Everyday commands

After the install you get a short command called `darkzone`:

| Command | What it does |
|---|---|
| `darkzone status` | Is the bot running? |
| `darkzone logs` | Watch the live log (press Ctrl+C to leave) |
| `darkzone stop` | Stop the bot |
| `darkzone start` | Start the bot (also starts the database) |
| `darkzone restart` | Stop and start |
| `darkzone token` | Change the Telegram bot token |
| `darkzone update` | Get the newest version of the bot |

After you restart your phone or close Termux, just open Termux and type `darkzone start`.

## 🔋 Keep it running

Android likes to stop background apps. To help:

- Keep the **Termux notification** in the notification bar. The bot asks Android to keep the phone awake while it runs
- Open Android **Settings → Apps → Termux → Battery** and choose **Unrestricted** (or turn off battery optimization)
- Keep the phone charged and connected to Wi-Fi if you can
- On some phones, Android 12 and newer can still stop Termux's background programs. If the bot keeps stopping, search for "disable phantom process killer" for your phone

If it stops, open Termux and run `darkzone start`.

## 📌 What works and what does not

| Feature | On Termux |
|---|---|
| WhatsApp commands, AI, groups, games, economy | ✅ Works |
| Telegram pairing (`/pair`) | ✅ Works |
| Downloaders (YouTube, TikTok, Instagram) | ✅ Works if ffmpeg and yt-dlp installed. The installer adds them |
| Sticker and image commands | ⚠️ May not work. They use a program (`sharp`) that often cannot run on Android. The bot still starts. Those commands say they are not available |
| Web dashboard login | ❌ Off. It needs Clerk keys and a public address |
| The public **Session ID** pairing page | ❌ Not reachable from outside your phone. Use Telegram `/pair` |

## 🔒 Safety

- **Keep your bot's @username private.** Anyone who finds it can send `/pair` and link *their own* WhatsApp to your bot, using your phone's resources. The installer limits this to **5 accounts**. Change `MAX_WA_TENANTS` in `~/darkzone-bot/.env` to lower it
- The `.env` file holds your token. It is set so only Termux can read it. Never upload it to GitHub
- Do not post your log without checking it first

## 🗄️ Use your own database (optional)

By default the installer makes a small PostgreSQL database on your phone. To use a cloud one (for example Neon), give the installer its link:

```bash
DATABASE_URL='postgresql://user:password@host/db?sslmode=require' bash termux.sh install
```

## 🧩 Start already linked with a Session ID (optional)

```bash
SESSION_ID='DARKZONE~...' bash termux.sh install
```

See the [Session ID guide](SESSION-ID.md).

## 🛠️ Problems

| Problem | Fix |
|---|---|
| `pkg update` fails or hangs | Run `termux-change-repo`, pick a mirror near you, and run the install again |
| "Node ... too old" | Run `pkg upgrade -y`, then the install command again |
| Install stops during the packages step | The phone may be out of memory or space. Close other apps, free some space, and run the install command again. It continues where it stopped |
| "The build did not produce the bot file" | Scroll up for the red error. Send a screenshot |
| Telegram does not accept my token | Copy it again from BotFather. It looks like `123456789:ABC...` with no spaces. Then run `darkzone token` |
| The bot does not answer in Telegram | Run `darkzone status` and `darkzone logs`. Check that the token is right |
| "The database would not start" | Run `cat $PREFIX/var/lib/postgresql/server.log` and send me the last lines |
| WhatsApp code does not work | It expires in about 2 minutes. Send `/pair` again for a new one |
| Bot stops after a while | See [Keep it running](#-keep-it-running) |
| Stickers do not work | See the table above. This is a phone limit |

## 🧹 Remove it

```bash
darkzone stop
rm -rf ~/darkzone-bot
rm -f $PREFIX/bin/darkzone
pg_ctl -D $PREFIX/var/lib/postgresql stop
rm -rf $PREFIX/var/lib/postgresql
```

Also open WhatsApp → **Linked devices** and log out the device.

## ℹ️ Where are the files?

The installer puts the bot in its **own folder**, `~/darkzone-bot`. If you also keep a copy of the repo to edit and push to GitHub (for example `~/DarkZone-MD`), the two stay separate. The Termux copy needs small changes to install on a phone, and those must never be pushed.
