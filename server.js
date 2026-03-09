const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const CHANNEL = 'beforeredalert';
const SCRAPE_URL = `https://t.me/s/${CHANNEL}`;
const POLL_INTERVAL = 12000;

// ─── Israeli locations → coordinates ──────────────────────
const LOCATIONS = {
  'תל אביב': { lat: 32.0853, lng: 34.7818, region: 'מרכז' },
  'ת"א': { lat: 32.0853, lng: 34.7818, region: 'מרכז' },
  'ירושלים': { lat: 31.7683, lng: 35.2137, region: 'ירושלים' },
  'חיפה': { lat: 32.7940, lng: 34.9896, region: 'צפון' },
  'באר שבע': { lat: 31.2518, lng: 34.7913, region: 'דרום' },
  'אשדוד': { lat: 31.8014, lng: 34.6437, region: 'דרום' },
  'אשקלון': { lat: 31.6688, lng: 34.5743, region: 'דרום' },
  'נתניה': { lat: 32.3215, lng: 34.8532, region: 'שרון' },
  'הרצליה': { lat: 32.1629, lng: 34.7914, region: 'מרכז' },
  'רעננה': { lat: 32.1836, lng: 34.8706, region: 'שרון' },
  'פתח תקוה': { lat: 32.0841, lng: 34.8878, region: 'מרכז' },
  'ראשון לציון': { lat: 31.9730, lng: 34.7925, region: 'מרכז' },
  'רמת גן': { lat: 32.0680, lng: 34.8241, region: 'מרכז' },
  'בני ברק': { lat: 32.0834, lng: 34.8344, region: 'מרכז' },
  'חולון': { lat: 32.0117, lng: 34.7748, region: 'מרכז' },
  'בת ים': { lat: 32.0231, lng: 34.7515, region: 'מרכז' },
  'רחובות': { lat: 31.8928, lng: 34.8113, region: 'מרכז' },
  'לוד': { lat: 31.9515, lng: 34.8955, region: 'מרכז' },
  'רמלה': { lat: 31.9279, lng: 34.8625, region: 'מרכז' },
  'מודיעין': { lat: 31.8969, lng: 35.0104, region: 'מרכז' },
  'כפר סבא': { lat: 32.1751, lng: 34.9077, region: 'שרון' },
  'הוד השרון': { lat: 32.1547, lng: 34.8888, region: 'שרון' },
  'שדרות': { lat: 31.5250, lng: 34.5963, region: 'דרום' },
  'קריית גת': { lat: 31.6100, lng: 34.7642, region: 'דרום' },
  'אופקים': { lat: 31.3162, lng: 34.6228, region: 'דרום' },
  'נתיבות': { lat: 31.4211, lng: 34.5885, region: 'דרום' },
  'דימונה': { lat: 31.0700, lng: 35.0333, region: 'דרום' },
  'ערד': { lat: 31.2589, lng: 35.2126, region: 'דרום' },
  'אילת': { lat: 29.5577, lng: 34.9519, region: 'דרום' },
  'עוטף עזה': { lat: 31.4900, lng: 34.5400, region: 'דרום' },
  'בית שמש': { lat: 31.7468, lng: 34.9868, region: 'ירושלים' },
  'טבריה': { lat: 32.7922, lng: 35.5312, region: 'צפון' },
  'צפת': { lat: 32.9646, lng: 35.4960, region: 'צפון' },
  'נהריה': { lat: 33.0061, lng: 35.0981, region: 'צפון' },
  'עכו': { lat: 32.9266, lng: 35.0764, region: 'צפון' },
  'כרמיאל': { lat: 32.9136, lng: 35.3040, region: 'צפון' },
  'קריית שמונה': { lat: 33.2073, lng: 35.5710, region: 'צפון' },
  'מטולה': { lat: 33.2778, lng: 35.5736, region: 'צפון' },
  'עפולה': { lat: 32.6084, lng: 35.2891, region: 'צפון' },
  'נצרת': { lat: 32.6997, lng: 35.3035, region: 'צפון' },
  'קצרין': { lat: 32.9926, lng: 35.6921, region: 'גולן' },
  'הגולן': { lat: 33.0500, lng: 35.7500, region: 'גולן' },
  'גולן': { lat: 33.0500, lng: 35.7500, region: 'גולן' },
  'גליל עליון': { lat: 33.05, lng: 35.50, region: 'צפון' },
  'גליל תחתון': { lat: 32.80, lng: 35.40, region: 'צפון' },
  'עמק יזרעאל': { lat: 32.62, lng: 35.30, region: 'צפון' },
  'גוש דן': { lat: 32.06, lng: 34.82, region: 'מרכז' },
  'נגב': { lat: 31.00, lng: 34.80, region: 'דרום' },
  'הנגב': { lat: 31.00, lng: 34.80, region: 'דרום' },
  'קו העימות': { lat: 33.10, lng: 35.55, region: 'צפון' },
};

let alertCache = [];
let lastUpdate = null;
let connectionStatus = 'connecting';

function classify(text) {
  const t = text;
  if (/שיגור|טיל|רקטה|ירי|באליסטי|missile|launch|מל"ט|drone/.test(t)) return 'critical';
  if (/אזעקה|צבע אדום|התרעה|אזהרה|red alert/.test(t)) return 'warning';
  if (/יירוט|ירוט|intercept|הדף/.test(t)) return 'info';
  if (/חדל|סיום|שגרה|ירידה/.test(t)) return 'clear';
  return 'default';
}

function extractLocations(text) {
  const found = [];
  const seen = new Set();
  for (const [name, data] of Object.entries(LOCATIONS)) {
    if (text.includes(name) && !seen.has(`${data.lat},${data.lng}`)) {
      found.push({ name, ...data });
      seen.add(`${data.lat},${data.lng}`);
    }
  }
  return found;
}

async function scrapeChannel() {
  try {
    const res = await fetch(SCRAPE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'he-IL,he;q=0.9' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const messages = [];

    $('.tgme_widget_message_wrap').each((i, el) => {
      const $b = $(el).find('.tgme_widget_message_bubble');
      const msgId = $b.attr('data-post') || `m${i}`;
      const textEl = $b.find('.tgme_widget_message_text');
      const htmlC = textEl.html() || '';
      const plain = textEl.text() || '';
      const dt = $b.find('.tgme_widget_message_date time').attr('datetime') || '';
      const views = $b.find('.tgme_widget_message_views').text().trim();

      if (plain.trim()) {
        const severity = classify(plain);
        const locations = extractLocations(plain);
        messages.push({
          id: msgId, html: htmlC, text: plain.trim(), datetime: dt,
          timestamp: dt ? new Date(dt).getTime() : Date.now(),
          views, severity, locations, region: locations[0]?.region || null,
        });
      }
    });

    messages.sort((a, b) => b.timestamp - a.timestamp);
    if (messages.length > 0) { alertCache = messages; lastUpdate = new Date().toISOString(); connectionStatus = 'live'; }
  } catch (err) { console.error('[scrape]', err.message); connectionStatus = 'error'; }
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
  const send = (d) => res.write(`data: ${JSON.stringify(d)}\n\n`);
  send({ type: 'init', alerts: alertCache.slice(0, 80), status: connectionStatus, lastUpdate });
  const iv = setInterval(async () => {
    const old = alertCache[0]?.id;
    await scrapeChannel();
    if (alertCache[0]?.id !== old) send({ type: 'update', alerts: alertCache.slice(0, 80), status: connectionStatus, lastUpdate });
    else send({ type: 'heartbeat', status: connectionStatus, lastUpdate });
  }, POLL_INTERVAL);
  req.on('close', () => clearInterval(iv));
});

app.get('/api/alerts', (req, res) => {
  res.json({ status: connectionStatus, lastUpdate, count: alertCache.length, alerts: alertCache.slice(0, 80) });
});

app.listen(PORT, async () => {
  console.log(`\n🚨 COMMAND CENTER — http://localhost:${PORT}\n`);
  await scrapeChannel();
  console.log(`   ${alertCache.length} alerts loaded\n`);
});
