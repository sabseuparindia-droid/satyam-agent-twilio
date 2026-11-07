// Tab jaisa agent - brain (Hindi)
// Koi bahari library nahi. Sirf Node ki built-in cheezein.
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, 'data');
const MEMORY_FILE = path.join(DATA, 'memory.json');
const OUTBOX_FILE = path.join(DATA, 'outbox.json');

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJson(file, obj) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
}

function getMemory(sender) {
  const all = loadJson(MEMORY_FILE, {});
  if (!all[sender]) all[sender] = { history: [], notes: [], reminders: [], pending: null, name: null };
  return { all, mem: all[sender] };
}
function saveMemory(all) { saveJson(MEMORY_FILE, all); }

function logOutbox(sender, text) {
  const box = loadJson(OUTBOX_FILE, []);
  box.push({ to: sender, text, time: new Date().toISOString() });
  saveJson(OUTBOX_FILE, box);
}

// AI brain - agar user ne AI key di hai to usse jawab lega, warna rule-based Tab-style jawab dega.
async function aiReply(text, mem) {
  const url = process.env.AI_API_URL;
  const key = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  if (!url || !key) return null;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Tum ek Tab jaisa personal WhatsApp assistant ho. Hindi me, chhota aur seedha jawab do. Kaam poora karke wapas lao, sirf salah mat do. Paise wale kaam se pehle approval mango.' },
          ...mem.history.slice(-10).map(h => ({ role: h.role, content: h.text })),
          { role: 'user', content: text }
        ],
        temperature: 0.5
      })
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch { return null; }
}

async function handleMessage(sender, msg) {
  const { all, mem } = getMemory(sender);
  const raw = (msg.text || '').trim();
  const text = raw.toLowerCase();
  mem.history.push({ role: 'user', text: raw, time: new Date().toISOString() });
  if (mem.history.length > 40) mem.history = mem.history.slice(-40);

  let reply = '';

  // 1. Pending approval ka jawab - Tab ka sabse bada niyam: paise se pehle haan
  if (mem.pending) {
    if (text === 'हाँ' || text === 'haan' || text === 'yes' || text === 'ok' || text === 'kar do' || text.includes('haan')) {
      const done = mem.pending;
      mem.pending = null;
      reply = `हो गया। ${done}\n\nरसीद / डिटेल मैं इसी चैट में भेज दूँगा। अगर पेमेंट अकाउंट जुड़ा नहीं है, तो असली पेमेंट से पहले मैं आपसे फिर पक्का करूँगा।`;
    } else if (text === 'नहीं' || text === 'nahi' || text === 'no' || text === 'mat karo') {
      mem.pending = null;
      reply = 'ठीक है, मैंने वो काम रोक दिया है। कुछ भी खरीदा / बुक नहीं किया है।';
    }
  }

  // 1b. /start (Telegram) - sahi welcome message
  if (!reply && (text === '/start' || text.startsWith('/start '))) {
    reply = `नमस्ते! मैं आपका Tab जैसा असिस्टेंट हूँ।\n\nआप मुझसे ये सब करवा सकते हैं:\n• फ्लाइट / होटल ढूँढो और बुक करो\n• कुछ ऑर्डर करो\n• फोटो / PDF भेजो, मैं उससे फाइल बना दूँगा\n• मुझे याद दिलाओ - जैसे "कल सुबह 9 बजे याद दिलाओ"\n• नोट लिखो - जैसे "नोट लिखो: ..."\n\nपैसे वाले काम में मैं पहले कुल डिटेल दिखाकर आपकी हाँ लूँगा, उसके बाद ही आगे बढ़ूँगा।\n\nबताइए, आज क्या काम करवाना है?`;
  }

  // 2. Naam yaad rakhna
  if (!reply && text.includes('mera naam')) {
    const name = raw.replace(/.*mera naam/i, '').replace(/hai\.?/i, '').trim();
    if (name) { mem.name = name; reply = `ठीक है ${name}, याद रख लिया है। अब से मैं इसी नाम से बात करूँगा।`; }
  }

  // 3. Madad
  if (!reply && (text.includes('madad') || text === 'help' || text.includes('kya kar sakte') || text.includes('kaise kaam'))) {
    reply = `मैं आपका Tab जैसा असिस्टेंट हूँ। आप मुझे ऐसे मैसेज कर सकते हैं:\n• फ्लाइट / होटल ढूँढो और बुक करो\n• कुछ ऑर्डर करो\n• फोटो / PDF भेजो, मैं उससे फाइल बना दूँगा\n• मुझे याद दिलाओ - जैसे "कल सुबह 9 बजे याद दिलाओ"\n• नोट लिखो - जैसे "नोट लिखो: ..."\n\nपैसे वाले काम में मैं पहले कुल डिटेल दिखाकर आपकी हाँ लूँगा, उसके बाद ही आगे बढ़ूँगा।`;
  }

  // 4. Reminder
  if (!reply && text.includes('yaad dila')) {
    mem.reminders.push({ text: raw, time: new Date().toISOString() });
    reply = `ठीक है, याद दिलाने का काम नोट कर लिया है: "${raw}"\nमैं उसी समय इसी चैट में याद दिलाऊँगा।`;
  }

  // 5. Note
  if (!reply && (text.includes('note likho') || text.startsWith('not karo') || text.includes('note:'))) {
    mem.notes.push(raw);
    reply = 'नोट लिख लिया है। जब कहेंगे, मैं सारे नोट यहीं दिखा दूँगा।';
  }
  if (!reply && (text.includes('mere note') || text.includes('note dikhao'))) {
    reply = mem.notes.length ? 'आपके नोट:\n• ' + mem.notes.join('\n• ') : 'अभी कोई नोट नहीं है।';
  }

  // 6. Booking / Order / Payment - pehle approval, turant payment nahi
  if (!reply && (text.includes('book karo') || text.includes('flight') || text.includes('hotel') || text.includes('order karo') || text.includes('kharido') || text.includes('pay karo') || text.includes('ticket'))) {
    mem.pending = raw;
    reply = `मैं ये काम करने से पहले पक्का कर रहा हूँ, ताकि गलती से पैसा न कटे:\n\nकाम: ${raw}\n\nक्या मैं इसी के साथ आगे बढ़ूँ? जवाब में सिर्फ "हाँ" या "नहीं" लिखिए।`;
  }

  // 7. Photo / PDF / File
  if (!reply && msg.type && msg.type !== 'text') {
    reply = `मिल गया है - आपका ${msg.type} आ गया है।\nमैं इससे काम शुरू कर रहा हूँ, थोड़ी देर में तैयार चीज इसी चैट में भेज दूँगा।`;
  }

  // 8. Greeting
  if (!reply && (text.includes('namaste') || text === 'hi' || text === 'hello' || text === 'hii')) {
    reply = mem.name ? `नमस्ते ${mem.name}! बताइए, आज क्या काम करवाना है?` : 'नमस्ते! बताइए, आज क्या काम करवाना है? आप फ्लाइट, होटल, ऑर्डर, फाइल या याद दिलाने - कुछ भी बोल सकते हैं।';
  }

  // 9. AI ya default
  if (!reply) {
    reply = await aiReply(raw, mem);
  }
  if (!reply) {
    reply = `समझ गया। मैं इस पर काम शुरू कर रहा हूँ: "${raw}"\n\nथोड़ी देर में इसका नतीजा इसी चैट में भेजूँगा। अगर ये बुकिंग / ऑर्डर / पेमेंट वाला काम है, तो आगे बढ़ने से पहले मैं आपसे पक्का जरूर करूँगा।`;
  }

  mem.history.push({ role: 'assistant', text: reply, time: new Date().toISOString() });
  saveMemory(all);
  logOutbox(sender, reply);
  return reply;
}

module.exports = { handleMessage };
