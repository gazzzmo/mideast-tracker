# Middle East Crisis — Financial Impact Monitor

A React SPA that uses Claude AI to generate plausible historical financial data
covering the 2026 US-Israel-Iran conflict period (1 Feb – 28 Mar 2026).

Tracks: Brent Crude, WTI, Gold, VIX, US 10Y Yield, S&P 500, ASX 200, AUD/USD, EU Gas (TTF).

---

## Project structure

```
mideast-tracker/
├── src/
│   ├── App.jsx          ← Main React app
│   ├── main.jsx         ← React entry point
│   └── index.css        ← Global reset
├── functions/
│   └── api/
│       └── chat.js      ← Cloudflare Pages Function (API proxy)
├── worker/
│   └── index.js         ← Standalone Worker (alternative deployment)
├── public/
│   ├── favicon.svg
│   └── _redirects       ← SPA routing for Cloudflare Pages
├── index.html
├── vite.config.js
├── wrangler.toml
└── package.json
```

---

## Deployment (Cloudflare Pages — recommended)

This is the simplest path. The `functions/api/chat.js` file is automatically
picked up by Cloudflare Pages as a serverless function — no separate Worker needed.

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create mideast-tracker --public --push --source=.
```

### 2. Create a Cloudflare Pages project

1. Go to https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages**
2. Connect your GitHub account and select the `mideast-tracker` repo
3. Set build settings:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Click **Save and Deploy**

### 3. Add your Anthropic API key

1. In your Pages project → **Settings** → **Environment variables**
2. Click **Add variable**
   - Variable name: `ANTHROPIC_API_KEY`
   - Value: your key from https://console.anthropic.com
   - ✅ Tick **Encrypt** (makes it a secret)
3. Add it for both **Production** and **Preview** environments
4. **Redeploy** the project (Settings → Deployments → Retry deployment)

That's it. Your app will be live at `https://mideast-tracker.pages.dev`
(or whatever Cloudflare assigns — you can add a custom domain later).

---

## Local development

```bash
npm install

# Option A: run Vite only (API calls will fail without a local worker)
npm run dev

# Option B: run Vite + Cloudflare Pages Functions locally (recommended)
npx wrangler pages dev dist --compatibility-date=2024-01-01
# In a second terminal:
npm run build -- --watch
```

For Option B you'll need to set the secret locally:
```bash
# Create a .dev.vars file (gitignored)
echo "ANTHROPIC_API_KEY=sk-ant-..." > .dev.vars
```

---

## Alternative: standalone Worker deployment

If you prefer to keep the Worker separate from Pages:

```bash
npm install -g wrangler
wrangler login
wrangler secret put ANTHROPIC_API_KEY   # paste your key when prompted
wrangler deploy worker/index.js
```

Then update `ALLOWED_ORIGIN` in `worker/index.js` to your Pages domain,
and update `API_URL` in `src/App.jsx` to point to your Worker URL.

---

## Costs

- **Cloudflare Pages**: Free (unlimited requests)
- **Cloudflare Pages Functions**: Free tier = 100,000 requests/day
- **Anthropic API**: ~$0.003 per indicator fetch (9 indicators ≈ $0.027 per full load)

---

## Security notes

- Your `ANTHROPIC_API_KEY` never touches the browser — it lives only in Cloudflare's
  encrypted environment variables and is injected at runtime by the Pages Function.
- The Function strips any `api_key` field from client requests before forwarding.
- For extra safety, set a monthly spend limit on your Anthropic account at
  https://console.anthropic.com/settings/limits

---

## Customisation

- **Add indicators**: Edit the `INDICATORS` array in `src/App.jsx`
- **Change date range**: Update the prompt in `fetchIndicatorData()`
- **Tighten CORS**: Set `ALLOWED_ORIGIN` in `functions/api/chat.js` to your exact domain
