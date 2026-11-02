# 🛠️ Troubleshooting

Find your problem, then try the fix.

| Problem | Likely cause | Fix |
|---|---|---|
| `command not found: pnpm` | pnpm is not installed | `npm install -g pnpm`, then reopen the terminal |
| `PORT environment variable is required` | `.env` was not loaded | Start with `./start.sh`, not with `pnpm ... start` |
| Bot starts but nothing is saved | Wrong `DATABASE_URL` | Check the link, then run the database push step again |
| `vendored ffmpeg binary is missing` | `bin/ffmpeg` is missing in production | See step 5 in the [deploy guide](DEPLOY.md) |
| Music or video commands fail | `yt-dlp` is missing or old | Download the latest `yt-dlp_linux` into `artifacts/api-server/bin/yt-dlp` |
| Stickers or audio effects fail | ffmpeg problem | Check `ffmpeg -version` works, and `bin/ffmpeg` exists |
| AI commands do not answer | No AI key | Add at least one AI key to `.env`, then restart |
| Dashboard login does not work | Wrong Clerk keys | Check `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` |
| Telegram pairing does nothing | Wrong bot token | Make a new token in @BotFather and update `.env` |
| Bot logged out of WhatsApp | Session ended or WhatsApp unlinked it | Open the dashboard and link again |
| Bot logs out after every restart | The host wipes the `wa-auth` folder | Use a host with a persistent disk, a panel, or a VPS. See [Hosting Options](HOSTING.md) |
| Bot stops answering after a while | A free host put it to sleep | Use a paid plan, a panel, or a VPS |
| Render build fails | Blueprint is in beta | Open an issue with the build log |
| Panel start takes very long | First start installs and builds | Wait a few minutes and watch the console |
| Log says "SESSION_ID is invalid and was ignored" | The Session ID was cut off, or has extra spaces | Copy the whole message again. It starts with `DARKZONE~` |
| Bot starts but is not linked after I set SESSION_ID | The bot already has an older login saved | Remove the old `artifacts/api-server/data/wa-auth` folder, or set a new SESSION_ID. A different ID replaces the old one |
| Pairing page says "turned off" | The owner has not turned it on | Set `ENABLE_SESSION_PAIR=true`, then restart |
| Pairing code does not work in WhatsApp | The code expired (about 2 minutes) | Get a new code, and enter it quickly |
| Pairing page says "Too many tries" | Limit per visitor per hour | Wait an hour, or raise `PAIR_MAX_PER_HOUR` |
| `403` when pushing to GitHub | Wrong password | Use a **token** as the password, with the `repo` box ticked |
| Push says `fetch first` | The GitHub repo already has files | Pull first, or use a new empty repo |

## 🎵 Downloader problems (YouTube, TikTok, Instagram)

| Problem | Likely cause | Fix |
|---|---|---|
| YouTube says "not available" or "Sign in to confirm you are not a bot" | yt-dlp is old, or your host IP is blocked | Update yt-dlp (see below). Then try `YTDLP_COOKIES_FILE` or `YTDLP_PROXY` |
| Every YouTube link fails after it worked before | YouTube changed something | Update yt-dlp. It must be version **2025.11.12 or newer** |
| Instagram says "login required" or "rate limit" | Instagram only shows most posts to logged-in users | Set `YTDLP_COOKIES_FILE` (see below) |
| TikTok does not download | The free tikwm service is down or busy | The bot tries yt-dlp automatically. Try again later |
| Audio says "something is wrong with the audio file" | ffmpeg is missing | See step 5 in the [deploy guide](DEPLOY.md) |
| `.play` song name works but option **2** (video) does not | Video by song name is not supported | Send a **link**, then choose 2 |
| Video is "too large" | The limit is 64 MB for video and 50 MB for audio | Pick a shorter or smaller video |

**Update yt-dlp** (run on your server, then restart the bot):

```bash
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
  -o artifacts/api-server/bin/yt-dlp
chmod +x artifacts/api-server/bin/yt-dlp
```

**Use cookies for Instagram or YouTube:**
1. Use a **spare account**, never your main one.
2. Log in on a computer browser, and export the cookies as a `cookies.txt` file (a "cookies.txt" browser extension does this).
3. Upload `cookies.txt` to your server. **Never upload it to GitHub.**
4. Add this line to `.env`, then restart: `YTDLP_COOKIES_FILE=/full/path/to/cookies.txt`

## Still stuck?

1. Run `pm2 logs darkzone` and read the last error lines.
2. Open an [issue](../../../issues/new/choose) and paste the error.
   **Remove any tokens, keys or phone numbers first.**
3. Or chat with the owner on [WhatsApp](https://wa.me/923309333332).
