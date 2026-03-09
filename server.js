const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Config ───────────────────────────────────────────────
const CHANNEL = 'beforeredalert';
const SCRAPE_URL = `https://t.me/s/${CHANNEL}`;
const POLL_INTERVAL = 15000; // 15 seconds
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || null; // Optional
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || null; // e.g. -1001234567890

// ─── In-memory store ──────────────────────────────────────
let alertCache = [];
let lastUpdate = null;
let connectionStatus = 'connecting';

// ─── Scrape t.me/s/ public preview (no bot needed) ───────
async function scrapeChannel() {
  try {
    const res = await fetch(SCRAPE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);
    const messages = [];

    $('.tgme_widget_message_wrap').each((i, el) => {
      const $msg = $(el);
      const $bubble = $msg.find('.tgme_widget_message_bubble');
      const msgId = $bubble.attr('data-post') || '';
      const textEl = $bubble.find('.tgme_widget_message_text');
      const text = textEl.html() || '';
      const plainText = textEl.text() || '';
      const timeEl = $bubble.find('.tgme_widget_message_date time');
      const datetime = timeEl.attr('datetime') || '';
      const views = $bubble.find('.tgme_widget_message_views').text().trim();

      if (plainText.trim()) {
        messages.push({
          id: msgId,
          html: text,
          text: plainText.trim(),
          datetime,
          timestamp: datetime ? new Date(datetime).getTime() : Date.now(),
          views,
        });
      }
    });

    // Sort newest first
    messages.sort((a, b) => b.timestamp - a.timestamp);

    if (messages.length > 0) {
      alertCache = messages;
      lastUpdate = new Date().toISOString();
      connectionStatus = 'live';
    }

    return messages;
  } catch (err) {
    console.error('[scrape] Error:', err.message);
    connectionStatus = 'error';
    return [];
  }
}

// ─── Bot API approach (if token provided) ─────────────────
async function fetchViaBotAPI() {
  if (!BOT_TOKEN || !CHANNEL_ID) return null;

  try {
    // getChat to verify
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?allowed_updates=["channel_post"]&limit=50`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok) throw new Error(data.description);

    const messages = (data.result || [])
      .filter(u => u.channel_post && String(u.channel_post.chat.id) === String(CHANNEL_ID))
      .map(u => {
        const p = u.channel_post;
        return {
          id: `${p.chat.id}_${p.message_id}`,
          html: p.text || p.caption || '',
          text: p.text || p.caption || '',
          datetime: new Date(p.date * 1000).toISOString(),
          timestamp: p.date * 1000,
          views: '',
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);

    if (messages.length > 0) {
      alertCache = messages;
      lastUpdate = new Date().toISOString();
      connectionStatus = 'live';
    }

    return messages;
  } catch (err) {
    console.error('[bot-api] Error:', err.message);
    return null;
  }
}

// ─── Polling loop ─────────────────────────────────────────
async function poll() {
  // Try bot API first, fall back to scraping
  const botResult = await fetchViaBotAPI();
  if (!botResult) {
    await scrapeChannel();
  }
}

// ─── Alert classification ─────────────────────────────────
function classifyAlert(text) {
  const t = text.toLowerCase();
  if (t.includes('שיגור') || t.includes('טיל') || t.includes('רקטה') || t.includes('ירי') || t.includes('launch') || t.includes('missile'))
    return 'critical';
  if (t.includes('אזעקה') || t.includes('צבע אדום') || t.includes('red alert') || t.includes('אזהרה'))
    return 'warning';
  if (t.includes('ירוט') || t.includes('יירוט') || t.includes('intercept'))
    return 'info';
  return 'default';
}

// ─── API Routes ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// SSE endpoint for real-time push
app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send current state
  res.write(`data: ${JSON.stringify({ type: 'init', alerts: alertCache.slice(0, 50), status: connectionStatus, lastUpdate })}\n\n`);

  // Set up interval to push updates
  const interval = setInterval(async () => {
    const oldTop = alertCache[0]?.id;
    await poll();
    const newTop = alertCache[0]?.id;

    if (newTop !== oldTop) {
      res.write(`data: ${JSON.stringify({ type: 'update', alerts: alertCache.slice(0, 50), status: connectionStatus, lastUpdate })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', status: connectionStatus, lastUpdate })}\n\n`);
    }
  }, POLL_INTERVAL);

  req.on('close', () => clearInterval(interval));
});

// REST endpoint
app.get('/api/alerts', (req, res) => {
  res.json({
    status: connectionStatus,
    lastUpdate,
    count: alertCache.length,
    alerts: alertCache.slice(0, 50).map(a => ({
      ...a,
      severity: classifyAlert(a.text),
    })),
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: connectionStatus, lastUpdate, cached: alertCache.length });
});

// ─── Start ────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚨 Before Red Alert Dashboard`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Mode: ${BOT_TOKEN ? 'Telegram Bot API' : 'Public scrape'}`);
  console.log(`   Polling every ${POLL_INTERVAL / 1000}s\n`);

  // Initial fetch
  await poll();
  console.log(`   Loaded ${alertCache.length} alerts\n`);
});
