# Changelog

All notable changes to this project are listed here.

## [1.4.0] - 2026-11-04
### Added
- **Pairing page** (`pair/`): a stand-alone web page that gets a WhatsApp pairing code and Session ID. Host it free on GitHub Pages or any static host
- **Pairing server** (`pair-server`): a small server that needs no database, Telegram or Clerk, so it can run on Render's free plan
- `Dockerfile.pair` and `render-pair.yaml` for the pairing server
- `PAIR_ALLOWED_ORIGINS` setting: only listed page addresses may use the server from a browser. `*` is not accepted
- The page tells people when a free server is waking up, and retries for about 90 seconds
- Guide: `docs/PAIR-PAGE.md`
- `.nojekyll` so GitHub Pages serves the page as it is

## [1.3.0] - 2026-11-02
### Added
- **Termux installer** (`termux.sh`): one command installs everything on an Android phone, asks for the Telegram token, and starts the bot. Includes `darkzone start | stop | restart | status | logs | token | update`
- Termux guide: `docs/TERMUX.md`
- Safe image loader: the bot now starts even when `sharp` cannot load. Only image commands report that they are unavailable

### Changed
- The dashboard login is optional. Without Clerk keys the bot, Telegram pairing and the Session ID page still work, instead of every web request failing
- README: the "Get Pair Code" buttons now open the Telegram pairing steps instead of a placeholder address
- README and hosting guide: Termux added

## [1.2.1] - 2026-11-02
### Changed
- README: colorful button grid (Fork, Get Pair Code, Render, Replit, Panel, VPS, Docker, community) and live stats badges
- README: new **Deploy in 3 Steps** section
- Pairing page: gradient buttons, **Copy code** button, a 2-minute countdown bar, live step chips and a rainbow header

## [1.2.0] - 2026-11-02
### Added
- **Session ID pairing**: a public page where someone enters their number, gets a pairing code, links WhatsApp, and receives a Session ID in their own WhatsApp chat. Off by default (`ENABLE_SESSION_PAIR=true` turns it on)
- **`SESSION_ID` setting**: the bot starts already linked, with no Telegram or dashboard pairing
- Limits on the pairing page: tries per visitor per hour and pairings at the same time
- Guide: `docs/SESSION-ID.md`
- The Session ID message is retried if the first send fails
- Starting from a `SESSION_ID` marks the main account active, so a database that saw an earlier logout still reconnects

## [1.1.1] - 2026-11-01
### Fixed
- Video downloads could send a **broken, cut-off video** when a download stopped halfway. They are now rejected and retried
- Retries now start from a clean folder, and "file too big" errors are no longer retried
- YouTube: added a second try with YouTube's normal clients, and turned on yt-dlp's JavaScript runtime (needed since yt-dlp 2025.11.12)
- `.musicsearch`, `.ytsearch`, `.charts` and `.trendingmusic` showed only **one** result. They now show up to 5 or 8
- `.musicsearch` and `.ytsearch` now play the same track they list first
- `.ttmp3` sent an MP3 labeled as MP4 audio, and fell back to a **video** when TikTok failed. Both fixed
- TikTok: handles `m.tiktok.com` links, relative media links, failed responses and oversized files
- `.ttslide` now sends TikTok photo slideshows (it never worked before)
- `.ig` and `.instagram` were taken over by `.reels`, which skipped the cooldown and limits. They use the guarded command again
- Playlist and channel lists now use the same yt-dlp settings as downloads
- Durations with decimals (like `3:5.5`) now show as `3:05`
- YouTube thumbnail links with `/live/` now work

### Added
- Optional `YTDLP_COOKIES_FILE` and `YTDLP_PROXY` settings for Instagram, YouTube and blocked hosts
- Downloader section in the troubleshooting guide

## [1.1.0] - 2026-11-01
### Added
- Hosting guide for Replit, Render, bot panels and Docker
- `render.yaml` Blueprint and "Deploy to Render" button
- `Dockerfile` and `.dockerignore`
- `panel-start.sh` for bot hosting panels
- WhatsApp linking through Telegram `/pair` in the docs

### Changed
- `.gitignore` now protects the WhatsApp login folder and downloaded tools

## [1.0.0] - 2026-11-01
### Added
- First public release of **Dark Zone MD**
- 500+ commands in 20 categories
- Web dashboard with WhatsApp linking and Telegram pairing
- AI, downloads, stickers, group protection, economy and games
- Docs: setup guide, command list, troubleshooting
- GitHub issue forms, pull request template and security policy
