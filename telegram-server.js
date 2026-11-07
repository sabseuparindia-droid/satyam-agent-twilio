// Telegram bot server - Tab jaisa agent (aur Twilio bhi isi me chalega)
// Chalane ke liye: node telegram-server.js  (port 3000, ya PORT env se)
// Token Render me Environment variable me daalo: TELEGRAM_BOT_TOKEN
// Webhook khud set ho jayega (server start hote hi): POST /telegram/webhook
// Twilio webhook bhi isi server me hai: POST /twilio/whatsapp
// Koi bahari library nahi. Sirf Node ki built-in cheezein.
const http = require('http');
const https = require('https');
const querystring = require('querystring');
const { handleMessage } = require('./agent');

const PORT = process.env.PORT || 3000;
const TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
// Render apne aap RENDER_EXTERNAL_URL deta hai, jaise https://satyam-agent-twilio.onrender.com
const BASE_URL = (process.env.TELEGRAM_WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');

function xmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function twimlReply(text) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(text)}</Message></Response>`;
}

// Telegram ko reply bhejna: POST https://api.telegram.org/bot<TOKEN>/sendMessage
function tgSend(chatId, text) {
  return new Promise((resolve) => {
    if (!TOKEN) { console.log('[TELEGRAM] TOKEN nahi hai, reply nahi bheja.'); return resolve(false); }
    const payload = JSON.stringify({ chat_id: chatId, text: String(text || '').slice(0, 4000) });
    const req = https.request(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        if (res.statusCode !== 200) console.log('[TELEGRAM] send fail:', res.statusCode, raw.slice(0, 200));
        resolve(res.statusCode === 200);
      });
    });
    req.on('error', (e) => { console.log('[TELEGRAM] send error:', e.message); resolve(false); });
    req.write(payload);
    req.end();
  });
}

// Webhook khud set karna: POST https://api.telegram.org/bot<TOKEN>/setWebhook
function tgSetWebhook() {
  return new Promise((resolve) => {
    if (!TOKEN || !BASE_URL) {
      console.log('[TELEGRAM] Webhook auto-set nahi hua: TOKEN ya BASE_URL nahi mila.');
      return resolve(false);
    }
    const url = `${BASE_URL}/telegram/webhook`;
    const payload = JSON.stringify({ url });
    const req = https.request(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        console.log('[TELEGRAM] setWebhook:', res.statusCode, raw.slice(0, 200));
        resolve(res.statusCode === 200);
      });
    });
    req.on('error', (e) => { console.log('[TELEGRAM] setWebhook error:', e.message); resolve(false); });
    req.write(payload);
    req.end();
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('Tab jaisa agent chal raha hai. Telegram webhook: POST /telegram/webhook | Twilio webhook: POST /twilio/whatsapp');
  }
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', app: 'tab-agent-telegram', telegram: TOKEN ? 'token-set' : 'token-missing' }));
  }

  // Telegram webhook: JSON POST { message: { chat: { id }, text, photo, document, ... } }
  if (req.method === 'POST' && url.pathname === '/telegram/webhook') {
    let raw = '';
    req.on('data', (c) => raw += c);
    req.on('end', async () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      let update = {};
      try { update = JSON.parse(raw || '{}'); } catch {}
      const msg = update.message || update.edited_message || {};
      const chatId = msg.chat && msg.chat.id;
      if (!chatId) return;
      let text = (msg.text || msg.caption || '').trim();
      let type = 'text';
      if (msg.photo) { type = 'photo'; text = text || 'photo'; }
      if (msg.document) { type = 'document'; text = text || 'document'; }
      if (msg.voice) { type = 'voice'; text = text || 'voice'; }
      console.log(`[TELEGRAM IN] ${chatId}: ${text}`);
      if (!text) return;
      const reply = await handleMessage(String(chatId), { text, type });
      console.log(`[TELEGRAM OUT] ${chatId}: ${reply.slice(0, 80)}`);
      await tgSend(chatId, reply);
    });
    return;
  }

  // Twilio webhook: form-encoded POST, From=whatsapp:+91..., Body=message
  if (req.method === 'POST' && url.pathname === '/twilio/whatsapp') {
    let raw = '';
    req.on('data', (c) => raw += c);
    req.on('end', async () => {
      const body = querystring.parse(raw);
      const from = (body.From || '').replace('whatsapp:', '').trim() || 'unknown';
      const text = (body.Body || '').trim();
      console.log(`[TWILIO IN] ${from}: ${text}`);
      if (!text) {
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        return res.end(twimlReply('Kuch likha nahi aaya. Dobara likhiye.'));
      }
      const reply = await handleMessage(from, { text, type: 'text' });
      console.log(`[TWILIO OUT] ${from}: ${reply.slice(0, 80)}`);
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      return res.end(twimlReply(reply));
    });
    return;
  }

  // Test ke liye seedha POST: { "from": "919999999999", "text": "namaste" }
  if (req.method === 'POST' && url.pathname === '/test') {
    let raw = '';
    req.on('data', (c) => raw += c);
    req.on('end', async () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch {}
      const reply = await handleMessage(body.from || 'test', { text: body.text || '', type: 'text' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ reply }));
    });
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, async () => {
  console.log(`Tab jaisa agent chal raha hai: http://localhost:${PORT}  (Telegram webhook: POST /telegram/webhook, Twilio webhook: POST /twilio/whatsapp)`);
  await tgSetWebhook();
});
