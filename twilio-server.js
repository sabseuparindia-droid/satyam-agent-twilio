// Twilio WhatsApp Sandbox server - Tab jaisa agent
// Chalane ke liye: node twilio-server.js  (port 3000, ya PORT env se)
// Twilio Console me "When a message comes in" me ye URL daalo:
//   https://aapka-server/twilio/whatsapp   (Method: HTTP POST)
// Sandbox number: +1 415 523 8886 (Twilio ka shared number, har account ka join code alag hota hai)
// Join: apne WhatsApp se us number par "join <aapka-code>" bhejo, phir "Namaste" likho.
// Koi bahari library nahi. Sirf Node ki built-in cheezein. Twilio SID/token is file me NAHI chahiye:
// Twilio khud reply bhejta hai (TwiML), isliye yahan sirf webhook jawab deta hai.
const http = require('http');
const querystring = require('querystring');
const { handleMessage } = require('./agent');

const PORT = process.env.PORT || 3000;

function xmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function twimlReply(text) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(text)}</Message></Response>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('Tab jaisa agent - Twilio Sandbox chal raha hai. Webhook: POST /twilio/whatsapp');
  }
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', app: 'tab-agent-twilio-sandbox' }));
  }

  // Twilio webhook: form-encoded POST, From=whatsapp:+91..., Body=message
  if (req.method === 'POST' && url.pathname === '/twilio/whatsapp') {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', async () => {
      const body = querystring.parse(raw);
      const from = (body.From || '').replace('whatsapp:', '').trim() || 'unknown';
      const text = (body.Body || '').trim();
      console.log(`[TWILIO IN] ${from}: ${text}`);
      if (!text) {
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        return res.end(twimlReply('Kuch likha nahi aaya. Dobara likhiye.'));
      }
      // Sandbox join message ko bhi agent hi jawab dega (welcome)
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
    req.on('data', c => raw += c);
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

server.listen(PORT, () => console.log(`Twilio Sandbox agent chal raha hai: http://localhost:${PORT}  (webhook: POST /twilio/whatsapp)`));
