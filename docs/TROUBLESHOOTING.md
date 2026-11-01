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
| `403` when pushing to GitHub | Wrong password | Use a **token** as the password, with the `repo` box ticked |
| Push says `fetch first` | The GitHub repo already has files | Pull first, or use a new empty repo |

## Still stuck?

1. Run `pm2 logs darkzone` and read the last error lines.
2. Open an [issue](../../../issues/new/choose) and paste the error.
   **Remove any tokens, keys or phone numbers first.**
3. Or chat with the owner on [WhatsApp](https://wa.me/923309333332).
