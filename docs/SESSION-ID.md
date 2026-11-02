# 🔑 Session ID Guide

A **Session ID** is one long line of text that holds the login of a linked WhatsApp device. Paste it into a bot's `SESSION_ID` setting and the bot starts already linked. No Telegram and no dashboard needed.

It starts with `DARKZONE~`.

> 🔒 **A Session ID is like a password.** Anyone who has it can control that WhatsApp account. Never share it, post it, or put it in a public file or repo.

This guide has three parts:

1. [I want a Session ID](#1-i-want-a-session-id) (for users)
2. [Use a Session ID](#2-use-a-session-id-in-your-bot) (for your bot)
3. [Run the pairing page](#3-run-the-pairing-page-bot-owner) (for the bot owner)

---

## 1. I want a Session ID

1. Open the owner's pairing page. It looks like `https://THEIR-BOT-URL/api/session-pair`.
2. Type your WhatsApp number with the country code, with no `+` or spaces. Example: `923001234567`.
3. Tick the box. Tap **Get pairing code**.
4. On your phone open WhatsApp.
5. Go to **Settings → Linked devices → Link a device**.
6. Tap **Link with phone number instead**.
7. Type the 8-character code from the page. You have about 2 minutes.
8. Open your own chat, called **Message yourself**. You will get **3 messages**:
   - a short note
   - the **Session ID** (the long one, starting with `DARKZONE~`)
   - a safety reminder
9. Copy the long message. That is your Session ID.

**Do not remove the new device** from *Linked devices*. That device **is** your bot's login. If you remove it, the Session ID stops working.

**To cancel a Session ID:** open *Linked devices* in WhatsApp and log that device out.

### What the pairing server can see

While you link, the pairing server briefly holds your WhatsApp login so it can make the Session ID. It:

- sends the Session ID **only** to your own WhatsApp chat
- **never** shows it on the web page
- **never** writes it in logs or a database
- **deletes** its copy a few seconds after sending

Still, the person who runs the server could change its code. **Only use a pairing page run by someone you trust**, like the owner of the bot you want to use. If you are not sure, link your WhatsApp on a server you run yourself.

---

## 2. Use a Session ID in your bot

Add one setting to your bot:

```
SESSION_ID=DARKZONE~...the whole long text...
```

Where to put it:

| Host | Where |
|---|---|
| Render | Environment → add `SESSION_ID` |
| Replit | Secrets (the lock icon) |
| Bot panel | Variables or Startup tab |
| VPS | In your `.env` file |

Then start the bot. In the log you should see `WhatsApp session restored from SESSION_ID`.

**Good to know:**

- The bot still needs its normal settings (`DATABASE_URL` and the Clerk keys). The **Telegram token is optional** when you use a Session ID.
- The number you linked becomes the **bot owner**, unless you already set an owner.
- Restarting with the **same** Session ID is safe. The bot keeps its own updated login files.
- Using a **different** Session ID replaces the old login.
- If the log says `SESSION_ID is invalid and was ignored`, copy the **whole** message again. It must start with `DARKZONE~` and have no spaces or line breaks.
- **One Session ID, one bot.** Do not run the same Session ID in two places at once. WhatsApp will log one of them out.

---

## 3. Run the pairing page (bot owner)

The pairing page is **off by default**. While someone pairs, your server briefly handles their WhatsApp login. Turn it on only if you are happy to take that responsibility.

### Turn it on

Add this setting and restart:

```
ENABLE_SESSION_PAIR=true
```

Your page is at:

```
https://YOUR-BOT-URL/api/session-pair
```

Put that link in the README, where it says `YOUR_BOT_URL`.

### Limits (optional settings)

| Setting | Default | What it does |
|---|:---:|---|
| `PAIR_MAX_PER_HOUR` | 3 | Tries each visitor gets per hour |
| `PAIR_MAX_CONCURRENT` | 5 | Pairings that can run at the same time (maximum 20) |

Each pairing opens a real WhatsApp connection for up to 3 minutes, so keep the second number low on small servers.

### How it protects people

- The Session ID is sent **only** to the linked person's own WhatsApp chat.
- It is **not** in any web response, log, or database.
- Each pairing uses its own temporary folder, deleted when it ends. Leftover folders from a crash are swept away automatically.
- A person must tick a box that explains what happens.
- The page tells people to keep the Session ID private.

### Your responsibilities

- Do **not** add code that saves or logs Session IDs.
- Tell people plainly what the page does, as the page does now.
- Keep the server updated and its keys private.
- Follow WhatsApp's rules and your local laws. Never pair a number without its owner's permission.

### If something goes wrong

| Problem | Fix |
|---|---|
| Page says "turned off" | Set `ENABLE_SESSION_PAIR=true` and restart |
| "The pairing service is busy" | Too many pairings at once. Wait a minute or raise `PAIR_MAX_CONCURRENT` |
| "Could not get a pairing code" | The server could not reach WhatsApp. Check the server's internet and try again |
| Code does not work in WhatsApp | It expired. Get a new one and type it within 2 minutes |
| Visitors behind a proxy all share limits | Make sure your host sends the `X-Forwarded-For` header (Render and Replit do) |

> 🧪 **Beta note:** this feature was tested with a simulated WhatsApp connection. It could not be tested against live WhatsApp from where it was written. If something does not work for you, open an [issue](../../../issues/new/choose) and paste the error. **Remove any Session ID first.**
