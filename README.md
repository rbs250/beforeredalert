# 🚨 Before Red Alert — Live Dashboard

Real-time alert dashboard that pulls from the [@beforeredalert](https://t.me/beforeredalert) Telegram channel and displays alerts with severity classification, sound notifications, and auto-refresh.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run
node server.js

# 3. Open browser
# http://localhost:3000
```

That's it. No bot token needed — it scrapes the public Telegram preview page.

## How it Works

```
┌──────────────┐    scrape every    ┌──────────────┐     SSE stream     ┌──────────────┐
│   Telegram    │ ──── 15 sec ────► │  Node.js     │ ──────────────────► │   Browser    │
│   Channel     │                   │  Server      │                     │   Dashboard  │
│  t.me/s/...   │                   │  :3000       │  ◄── fallback ──── │              │
└──────────────┘                    └──────────────┘     polling         └──────────────┘
```

- **Server** scrapes `t.me/s/beforeredalert` every 15 seconds
- **SSE (Server-Sent Events)** pushes new alerts to the browser in real-time
- **Fallback polling** kicks in if SSE disconnects
- **Alert classification** — auto-tags messages as שיגור/אזהרה/יירוט based on keywords
- **Sound alerts** — optional beep on new critical alerts (click 🔇 to enable)

## Optional: Telegram Bot API Mode

For more reliable updates, you can use a Telegram Bot:

```bash
# 1. Create a bot via @BotFather on Telegram
# 2. Add the bot to the channel as admin
# 3. Get the channel ID (e.g., -1001234567890)

# 4. Run with env vars:
TELEGRAM_BOT_TOKEN=123456:ABCdef TELEGRAM_CHANNEL_ID=-1001234567890 node server.js
```

The server will try Bot API first, and fall back to scraping if no token is provided.

## Deploy to Render (Free, 2 minutes)

### Option A: One-Click Deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### Option B: Manual

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Settings auto-detected from `render.yaml`
5. Click **Create Web Service**
6. Get your URL → open on iPhone, bookmark, done ✅

### Other platforms

**Railway:**
```bash
npm install -g @railway/cli
railway login && railway init && railway up
```

**Docker:**
```bash
docker build -t beforeredalert .
docker run -p 3000:3000 beforeredalert
```

**VPS (PM2):**
```bash
npm install -g pm2
pm2 start server.js --name beforeredalert
pm2 save
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `TELEGRAM_BOT_TOKEN` | — | Optional: Telegram Bot API token |
| `TELEGRAM_CHANNEL_ID` | — | Optional: Channel ID for Bot API mode |

## ⚠️ Disclaimer

This is **not an official source**. Always follow **IDF Home Front Command** (פיקוד העורף) instructions. This dashboard is an additional information layer only.

## License

MIT — stay safe 🇮🇱
