const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SCRAPE_URL = 'https://t.me/s/beforeredalert';
const POLL_INTERVAL = 12000;

// ─── Spam / ad detection ──────────────────────────────────
const AD_PATTERNS = [
  /תוכן\s*שיווקי/i, /תוכןשיווקי/i,
  /השקעה|השקעות|מסחר|טריידינג|trading/i,
  /שוק ההון|בורסה|מניות|קריפטו|ביטקוין/i,
  /financenews/i, /הצטרפו\s*(לערוץ|לקבוצה|עכשיו)/i,
  /👇👇👇👇/, /הזדמנות|הזדמנויות השקעה/i,
  /לכל העדכונים וכל הדרמה/i,
  /צפו בתיעוד ה-?מ-?ט-?ו-?ר-?ף/i, /תיעוד מטורף/i,
  /🚫.*🚫/, /t\.me\/\+/, /פרסומת/i,
];

// ─── Watermark patterns to strip from messages ────────────
const WATERMARKS = [
  /🔥?\s*שתפו[-–]?\s*https?:\/\/t\.me\/beforeredalert/gi,
  /שתפו\s*את\s*הקישור\s*שלנו\s*זה\s*בחינם\.?/gi,
  /https?:\/\/t\.me\/beforeredalert/gi,
  /שתפו[-–]?/g,
];

function stripWatermarks(text) {
  let clean = text;
  for (const pat of WATERMARKS) {
    clean = clean.replace(pat, '');
  }
  // Clean up leftover whitespace, emojis-only lines, multiple newlines
  clean = clean.replace(/^\s*🔥\s*$/gm, '');
  clean = clean.replace(/\n{3,}/g, '\n\n');
  return clean.trim();
}

function stripWatermarksHtml(html) {
  let clean = html;
  // Remove link tags pointing to the channel
  clean = clean.replace(/<a[^>]*href="https?:\/\/t\.me\/beforeredalert"[^>]*>.*?<\/a>/gi, '');
  for (const pat of WATERMARKS) {
    clean = clean.replace(pat, '');
  }
  clean = clean.replace(/^\s*🔥\s*$/gm, '');
  clean = clean.replace(/(<br\s*\/?>){3,}/gi, '<br>');
  return clean.trim();
}

// ─── Locations ────────────────────────────────────────────
const LOCATIONS = {
  'תל אביב':{lat:32.085,lng:34.782,r:'מרכז'},'ת"א':{lat:32.085,lng:34.782,r:'מרכז'},
  'ירושלים':{lat:31.768,lng:35.214,r:'ירושלים'},'חיפה':{lat:32.794,lng:34.990,r:'צפון'},
  'באר שבע':{lat:31.252,lng:34.791,r:'דרום'},'אשדוד':{lat:31.801,lng:34.644,r:'דרום'},
  'אשקלון':{lat:31.669,lng:34.574,r:'דרום'},'נתניה':{lat:32.322,lng:34.853,r:'שרון'},
  'הרצליה':{lat:32.163,lng:34.791,r:'מרכז'},'רעננה':{lat:32.184,lng:34.871,r:'שרון'},
  'פתח תקוה':{lat:32.084,lng:34.888,r:'מרכז'},'ראשון לציון':{lat:31.973,lng:34.793,r:'מרכז'},
  'רמת גן':{lat:32.068,lng:34.824,r:'מרכז'},'בני ברק':{lat:32.083,lng:34.834,r:'מרכז'},
  'חולון':{lat:32.012,lng:34.775,r:'מרכז'},'בת ים':{lat:32.023,lng:34.752,r:'מרכז'},
  'רחובות':{lat:31.893,lng:34.811,r:'מרכז'},'לוד':{lat:31.952,lng:34.896,r:'מרכז'},
  'מודיעין':{lat:31.897,lng:35.010,r:'מרכז'},'כפר סבא':{lat:32.175,lng:34.908,r:'שרון'},
  'שדרות':{lat:31.525,lng:34.596,r:'דרום'},'קריית גת':{lat:31.610,lng:34.764,r:'דרום'},
  'אופקים':{lat:31.316,lng:34.623,r:'דרום'},'נתיבות':{lat:31.421,lng:34.589,r:'דרום'},
  'דימונה':{lat:31.070,lng:35.033,r:'דרום'},'אילת':{lat:29.558,lng:34.952,r:'דרום'},
  'עוטף עזה':{lat:31.490,lng:34.540,r:'דרום'},'בית שמש':{lat:31.747,lng:34.987,r:'ירושלים'},
  'טבריה':{lat:32.792,lng:35.531,r:'צפון'},'צפת':{lat:32.965,lng:35.496,r:'צפון'},
  'נהריה':{lat:33.006,lng:35.098,r:'צפון'},'עכו':{lat:32.927,lng:35.076,r:'צפון'},
  'כרמיאל':{lat:32.914,lng:35.304,r:'צפון'},'קריית שמונה':{lat:33.207,lng:35.571,r:'צפון'},
  'מטולה':{lat:33.278,lng:35.574,r:'צפון'},'עפולה':{lat:32.608,lng:35.289,r:'צפון'},
  'נצרת':{lat:32.700,lng:35.304,r:'צפון'},'קצרין':{lat:32.993,lng:35.692,r:'גולן'},
  'הגולן':{lat:33.050,lng:35.750,r:'גולן'},'גולן':{lat:33.050,lng:35.750,r:'גולן'},
  'צפון':{lat:32.90,lng:35.30,r:'צפון'},'מרכז':{lat:32.05,lng:34.82,r:'מרכז'},
  'דרום':{lat:31.35,lng:34.65,r:'דרום'},'גוש דן':{lat:32.06,lng:34.82,r:'מרכז'},
  'נגב':{lat:31.00,lng:34.80,r:'דרום'},'הנגב':{lat:31.00,lng:34.80,r:'דרום'},
  'קו העימות':{lat:33.10,lng:35.55,r:'צפון'},
  'גליל עליון':{lat:33.05,lng:35.50,r:'צפון'},'גליל תחתון':{lat:32.80,lng:35.40,r:'צפון'},
  'עמק יזרעאל':{lat:32.62,lng:35.30,r:'צפון'},
  'לבנון':{lat:33.10,lng:35.40,r:'צפון'},'איראן':{lat:32.80,lng:35.20,r:'צפון'},
};

let alertCache = [], lastUpdate = null, connectionStatus = 'connecting';

function isAd(t){ return AD_PATTERNS.some(p => p.test(t)); }

function classify(t){
  if(/שיגור|טיל|רקטה|ירי|באליסטי|missile|launch|מל"ט|drone|טילים/.test(t)) return 'critical';
  if(/אזעקה|צבע אדום|התרעה|אזהרה|red alert|סכנה/.test(t)) return 'warning';
  if(/יירוט|ירוט|intercept|הדף|נפל/.test(t)) return 'info';
  if(/חדל|סיום|שגרה|ירידה/.test(t)) return 'clear';
  return 'default';
}

function extractLocs(text){
  const found=[], seen=new Set();
  for(const [name,data] of Object.entries(LOCATIONS)){
    if(text.includes(name)&&!seen.has(`${data.lat},${data.lng}`)){
      found.push({name,lat:data.lat,lng:data.lng,region:data.r});
      seen.add(`${data.lat},${data.lng}`);
    }
  }
  return found;
}

async function scrape(){
  try{
    const res=await fetch(SCRAPE_URL,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36','Accept-Language':'he-IL,he;q=0.9'}});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const $=cheerio.load(await res.text());
    const msgs=[];
    $('.tgme_widget_message_wrap').each((i,el)=>{
      const $b=$(el).find('.tgme_widget_message_bubble');
      const id=$b.attr('data-post')||`m${i}`;
      const tEl=$b.find('.tgme_widget_message_text');
      let html=tEl.html()||'', plain=tEl.text()||'';
      const dt=$b.find('.tgme_widget_message_date time').attr('datetime')||'';
      const views=$b.find('.tgme_widget_message_views').text().trim();

      if(!plain.trim()||isAd(plain)) return;

      // Strip watermarks
      plain = stripWatermarks(plain);
      html = stripWatermarksHtml(html);

      if(!plain.trim()) return; // Empty after stripping

      const ts=dt?new Date(dt).getTime():Date.now();
      const locs=extractLocs(plain);
      msgs.push({id,html,text:plain,datetime:dt,timestamp:ts,
        age:Math.round((Date.now()-ts)/60000),
        views,severity:classify(plain),locations:locs,region:locs[0]?.region||null});
    });
    msgs.sort((a,b)=>b.timestamp-a.timestamp);
    if(msgs.length>0){alertCache=msgs;lastUpdate=new Date().toISOString();connectionStatus='live';}
  }catch(e){console.error('[scrape]',e.message);connectionStatus='error';}
}

app.use(express.static(path.join(__dirname,'public')));

app.get('/api/stream',(req,res)=>{
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive','Access-Control-Allow-Origin':'*'});
  const send=d=>res.write(`data: ${JSON.stringify(d)}\n\n`);
  send({type:'init',alerts:alertCache.slice(0,80),status:connectionStatus,lastUpdate});
  const iv=setInterval(async()=>{
    const old=alertCache[0]?.id; await scrape();
    alertCache.forEach(a=>a.age=Math.round((Date.now()-a.timestamp)/60000));
    if(alertCache[0]?.id!==old) send({type:'update',alerts:alertCache.slice(0,80),status:connectionStatus,lastUpdate});
    else send({type:'heartbeat',alerts:alertCache.slice(0,80),status:connectionStatus,lastUpdate});
  },POLL_INTERVAL);
  req.on('close',()=>clearInterval(iv));
});

app.get('/api/alerts',(req,res)=>res.json({status:connectionStatus,lastUpdate,alerts:alertCache.slice(0,80)}));

app.listen(PORT,async()=>{
  console.log(`\n🚨 SIGINT v5 — http://localhost:${PORT}\n`);
  await scrape();
  console.log(`   ${alertCache.length} alerts loaded\n`);
});
