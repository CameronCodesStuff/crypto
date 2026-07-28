# Deploying without the CLI (Cloudflare dashboard only)

## 1. Deploy the Worker (hides your pumpdev.io key)

1. Go to https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Create Worker**.
2. Name it whatever you like (e.g. `crypto`), then click **Deploy** to scaffold it.
3. Click **Edit code** (opens the online editor).
4. Delete the placeholder code and paste in the full contents of `worker.js` from this zip.
5. Click **Save and deploy**.
6. Go to the Worker's **Settings → Variables and Secrets**.
7. Click **Add** → set:
   - **Type:** Secret
   - **Name:** `PUMPDEV_KEY`
   - **Value:** `lM_tDUvAYGYziqavoCBwbmLAH1ogat1xS_2X121TKWAf9gisWUWbyKA4nb0qCgZ0`
8. Save. The Worker will redeploy automatically with the secret attached.
9. Go to **Settings → Domains & Routes** and confirm/add a route so the Worker is reachable at:
   `crypto.detlaffcameron.workers.dev`
   (if that's your `workers.dev` subdomain, it's usually live by default — check under **Settings → Domains & Routes → workers.dev**, toggle it on if needed).

Your feed proxy is now live at `wss://crypto.detlaffcameron.workers.dev` — no key ever touches the browser.

## 2. Host the frontend (index.html, style.css, script.js)

Any static host works. Two easy options:

**Option A — Cloudflare Pages (dashboard only, matches your Worker setup)**
1. Dashboard → **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
2. Drag in `index.html`, `style.css`, and `script.js` from this zip.
3. Deploy. You'll get a `*.pages.dev` URL.

**Option B — GitHub Pages** (fits your usual workflow)
1. Create a new repo (or a folder in an existing one).
2. Upload `index.html`, `style.css`, `script.js`.
3. Repo → **Settings → Pages** → set source to that branch/folder.
4. Your site is live at `https://CameronCodesStuff.github.io/<repo>/`.

## 3. Verify

1. Open the deployed site.
2. The status dot next to **PUMPDEV://TERMINAL** should turn green ("live") once the WebSocket connects through the Worker.
3. Open browser dev tools → Network → WS to confirm the connection is going to `crypto.detlaffcameron.workers.dev` (never to `pumpdev.io` directly — that's the whole point of the proxy).

## Notes / things to double check

- **Message schema**: `handleFeedMessage()` in `script.js` assumes field names like `mint`, `symbol`, `price`, `change24h`. Watch a real message in dev tools and adjust field names if pumpdev.io's actual payload differs.
- **Sell amounts**: the sell path currently expects raw token base units, not a human amount — you'll likely want to pull the token's decimals + your wallet balance before wiring sells up for real.
- **Rotate the key** if you ever paste it somewhere public again (chat logs, GitHub, etc.) — treat it like a password from here on.
