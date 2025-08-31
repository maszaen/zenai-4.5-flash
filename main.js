// Main process: window, persistence, streaming via https (bypass CORS), title suggest, settings.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

function createWindow(){
  const win = new BrowserWindow({
    width: 1200, height: 800,
    frame: false,
    minWidth: 850,
    minHeight: 400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });

  ipcMain.on('window:minimize', () => win.minimize());
  ipcMain.on('window:maximize', () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window:close', () => win.close());

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---------- Persistence (sessions + settings) ----------
const dataFile = path.join(app.getPath('userData'), 'chat_data.json');

ipcMain.handle('sessions:load', async () => {
  try{
    if (!fs.existsSync(dataFile)) return { sessions: [], settings: { persona: {} } };
    const raw = fs.readFileSync(dataFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { sessions: parsed, settings: { persona: {} } }; // legacy
    if (parsed && typeof parsed === 'object') {
        if (typeof parsed.settings.persona === 'string') {
            parsed.settings.persona = { name: '', work: '', preferences: parsed.settings.persona };
        }
        return parsed;
    }
    return { sessions: [], settings: { persona: {} } };
  }catch(e){
    console.error('load error', e);
    return { sessions: [], settings: { persona: {} } };
  }
});
ipcMain.handle('sessions:save', async (_evt, data) => {
  try{
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  }catch(e){
    console.error('save error', e);
    return false;
  }
});

// ---------- Helpers ----------
function joinEndpoint(base, p){
  const b = String(base || '').replace(/\/+$/, '');
  const s = String(p || '').replace(/^\/+/, '');
  return `${b}/${s}`;
}

// ---------- Streaming from MAIN (SSE) ----------
const activeStreams = new Map(); // id -> req
ipcMain.on('chat:stream-start', (event, payload) => {
  const reqId = payload.reqId;
  const messages = payload.messages || [];
  const model = payload.model || 'glm-4.5-flash';

  const BASE_URL = process.env.BASE_URL || 'https://api.z.ai/api/paas/v4/';
  const API_KEY  = process.env.Z_API_KEY || process.env.OPENAI_API_KEY || '';
  const url = new URL(joinEndpoint(BASE_URL, 'chat/completions'));

  const body = JSON.stringify({ model, messages, stream: true });
  const options = {
    method: 'POST',
    hostname: url.hostname,
    path: url.pathname + url.search,
    protocol: url.protocol,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  const req = https.request(options, (res) => {
    if (res.statusCode < 200 || res.statusCode >= 300){
      let err = '';
      res.on('data', d => err += d.toString('utf-8'));
      res.on('end', () => {
        event.sender.send(`chat:error-${reqId}`, `HTTP ${res.statusCode} ${res.statusMessage} — ${err.slice(0,200)}`);
      });
      return;
    }
    res.setEncoding('utf8');
    let buffer = '';
    res.on('data', chunk => {
      buffer += chunk;
      let m;
      while ((m = buffer.search(/\r?\n\r?\n/)) !== -1){
        const piece = buffer.slice(0, m).trim();
        buffer = buffer.slice(m + (buffer[m] === '\r' ? 4 : 2));
        const lines = piece.split(/\r?\n/).map(l => l.replace(/^data:\s?/, ''));
        for (const line of lines){
          if (!line || line === '[DONE]') continue;
          try{
            const j = JSON.parse(line);
            const delta = j?.choices?.[0]?.delta?.content;
            if (delta) event.sender.send(`chat:chunk-${reqId}`, delta);
          }catch{}
        }
      }
    });
    res.on('end', () => {
      event.sender.send(`chat:done-${reqId}`);
      activeStreams.delete(reqId);
    });
  });
  req.on('error', e => {
    event.sender.send(`chat:error-${reqId}`, e.message || String(e));
    activeStreams.delete(reqId);
  });
  req.write(body); req.end();
  activeStreams.set(reqId, req);
});
ipcMain.on('chat:stream-cancel', (event, reqId) => {
  const r = activeStreams.get(reqId);
  if (r){ try{ r.destroy(new Error('Cancelled')); }catch{} activeStreams.delete(reqId); }
});


// ---------- Title suggestion (non-stream) ----------
ipcMain.handle('chat:title', async (_evt, payload) => {
  const text = (payload && payload.text) || '';
  const model = (payload && payload.model) || 'glm-4.5-flash';
  const messages = [
    { role: 'system', content: 'You are a title generator. Create a specific, 3-6 word title in Title Case for the following user query. Do not use quotes or periods. Your response must not exceed 6 words, you can simply summarize what the user said into a title, your response is just a title. If the query contains code, summarize the code\'s purpose instead of including any code in the title.' },
    { role: 'user', content: text }
  ];
  const BASE_URL = process.env.BASE_URL || 'https://api.z.ai/api/paas/v4/';
  const API_KEY  = process.env.Z_API_KEY || process.env.OPENAI_API_KEY || '';
  const url = new URL(joinEndpoint(BASE_URL, 'chat/completions'));
  const body = JSON.stringify({ model, messages, stream: false });

  const options = {
    method: 'POST', hostname: url.hostname, path: url.pathname + url.search, protocol: url.protocol,
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json', 'Accept': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  };
  const resText = await new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let acc=''; res.setEncoding('utf8');
      res.on('data', d => acc += d); res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(acc);
        else reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage} — ${acc.slice(0,200)}`));
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
  try{
    const j = JSON.parse(resText);
    const title = j?.choices?.[0]?.message?.content?.trim();
    return title || text.split(/\s+/).slice(0,6).join(' ') || 'New Chat';
  }catch{
    return text.split(/\s+/).slice(0,6).join(' ') || 'New Chat';
  }
});