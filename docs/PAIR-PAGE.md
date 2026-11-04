# 🌐 Pairing Page (get a pairing code on a website)

This lets people get a **WhatsApp pairing code** and a **Session ID** from a web page, with no Telegram bot and no Termux.

> 🧪 **Beta:** written from the bot's code and tested with a *simulated* WhatsApp. It has not been tested with real WhatsApp yet. Try it first with a **spare number**.

## 🧩 How it works

```
  Pairing PAGE                  Pairing SERVER                 WhatsApp
 (GitHub Pages or       ──►   (Render, free plan)     ──►    (makes the code)
  any static host)             makes the pairing code
                                      │
                                      ▼
                       Session ID is sent to the person's
                         own WhatsApp chat (Message yourself)
```

**Why two parts?** A static host such as *as-static-hosting.onrender.com* only shows files. It cannot talk to WhatsApp. The **server** does that. The **page** is just the form.

| Part | Where it lives | Cost |
|---|---|---|
| **Pairing page** | `pair/` folder in this repo | Free |
| **Pairing server** | Render (Web Service, Docker) | Free plan works |

The server needs **no database, no Telegram token and no Clerk keys.**

---

## 🚀 Step A: Start the pairing server on Render

1. Log in to [render.com](https://render.com)
2. Tap **New → Web Service**
3. Connect your GitHub and choose **DARKZONE-MDV1**
4. Set:
   - **Language / Runtime:** Docker
   - **Dockerfile Path:** `./Dockerfile.pair`
   - **Instance Type:** Free
5. Under **Environment Variables** add:

| Name | Value |
|---|---|
| `PAIR_ALLOWED_ORIGINS` | The address of your pairing **page** (see Step C). For GitHub Pages: `https://xonezone.github.io` |

6. Tap **Create Web Service** and wait for the build (about 5 to 10 minutes)
7. Open `https://YOUR-SERVICE.onrender.com/healthz`. You should see `{"status":"ok"}`

Your server's address is the `https://YOUR-SERVICE.onrender.com` shown at the top of the Render page. **Write it down.**

> 💡 You can also open `https://YOUR-SERVICE.onrender.com/` straight away. The server shows the same pairing page itself, so you can test before doing Steps B and C.

**Optional settings:**

| Name | Default | What it does |
|---|:---:|---|
| `PAIR_MAX_PER_HOUR` | 3 | Tries each visitor gets per hour |
| `PAIR_MAX_CONCURRENT` | 5 | Pairings at the same time (maximum 20) |

---

## 🔗 Step B: Tell the page where the server is

The page reads one line from `pair/config.js`:

```js
window.PAIR_API = "https://YOUR-PAIR-SERVER.onrender.com/api/session-pair";
```

Change `YOUR-PAIR-SERVER` to your server's name. In Termux, with your own name instead of `my-service`:

```
cd ~/DarkZone-MD
sed -i 's|YOUR-PAIR-SERVER|my-service|' pair/config.js
cat pair/config.js
```

Then save and upload it:

```
git add .
git commit -m "Set pairing server address"
git push
```

---

## 🌍 Step C: Publish the page

### Option 1: GitHub Pages ✅ (recommended)

It is free, it is your own repo, and nobody else shares its address.

1. Open your repo on GitHub, then **Settings → Pages**
2. Under **Build and deployment**, choose **Deploy from a branch**
3. Branch: **main**, folder: **/ (root)**, then **Save**
4. Wait about a minute. Your page is at:

```
https://xonezone.github.io/DARKZONE-MDV1/pair/
```

In Step A, `PAIR_ALLOWED_ORIGINS` must be exactly `https://xonezone.github.io` (no path, no slash).

### Option 2: as-static-hosting.onrender.com

1. Make a zip with `index.html` and `config.js` at the top (not inside a folder). In Termux:

```
pkg install -y zip
cd ~/DarkZone-MD/pair
zip ~/storage/downloads/pair-page.zip index.html config.js
```

2. Open the site, type a **Site Name**, choose the zip, and tap **Upload Site**
3. Add its address to `PAIR_ALLOWED_ORIGINS` on Render. Use only the part up to `.com`, for example `https://as-static-hosting.onrender.com`. To allow both pages, separate them with a comma

**Be careful with this option:**
- It is a **third-party site**. Its owner could change your page.
- Every site uploaded there shares **one address**. Because of that, another person's page on it could also use your pairing server.
- Uploaded sites may be **wiped** when that site restarts.

---

## ✅ Step D: Test it

1. Open your pairing page
2. If the server was asleep it says **"The server is waking up"**. Wait up to a minute
3. Type your **spare** WhatsApp number with the country code, tick the box, and tap **Get pairing code**
4. In WhatsApp go to **Settings → Linked devices → Link a device → Link with phone number instead**, and type the code
5. Your **Session ID** arrives in your own WhatsApp chat (*Message yourself*)

Then put the Session ID in your bot's `SESSION_ID` setting. See the [Session ID guide](SESSION-ID.md).

---

## 🔘 Make the README button open it

After the page works, point the **GET PAIR CODE** buttons at it:

```
cd ~/DarkZone-MD
sed -i 's|docs/HOSTING.md#-linking-whatsapp-works-on-every-host|https://xonezone.github.io/DARKZONE-MDV1/pair/|g' README.md
git add . && git commit -m "Point pair buttons at the pairing page" && git push
```

---

## 😴 The free plan sleeps

Render's free web services go to sleep after about 15 minutes with no visitors. The first visit after that takes up to a minute. The page tells people it is waking up. While someone is pairing, the page checks every 3 seconds, which keeps the server awake.

## 🔒 Privacy and safety

- While someone pairs, the **server briefly handles their WhatsApp login** to make a Session ID. It sends the Session ID **only** to that person's own WhatsApp chat, never shows it on a page, never logs it, and deletes its copy a few seconds later
- Only the pages listed in `PAIR_ALLOWED_ORIGINS` can use the server from a browser. `*` is **not** accepted
- Each visitor gets a few tries per hour, and only a few pairings run at once
- Only run this if you are happy to take that responsibility. Tell people plainly what it does, as the page does
- To turn it off, delete the Render service

## 🛠️ Problems

| Problem | Fix |
|---|---|
| Page says "The pairing server is not answering" | The server is still waking up, or the address in `config.js` is wrong. Open `https://YOUR-SERVICE.onrender.com/healthz` in your browser |
| Page loads, then fails right away on every try | `PAIR_ALLOWED_ORIGINS` does not match the page's address. It must be exactly the scheme and host, like `https://xonezone.github.io` |
| "The pairing service is turned off" | `ENABLE_SESSION_PAIR` is set to `false`. Remove it or set `true` |
| "Too many tries" | Wait an hour, or raise `PAIR_MAX_PER_HOUR` |
| "The pairing service is busy" | Wait a minute, or raise `PAIR_MAX_CONCURRENT` |
| Render build fails | Open the build log, copy the red error, and [open an issue](../../../issues/new/choose) |
| The code does not work in WhatsApp | It expires in about 2 minutes. Get a new one and type it quickly |
