# Changelog

All notable changes to this project are listed here.

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
