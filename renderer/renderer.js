const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

let state = { sessions: [], settings: { persona: { name: '', work: '', prefs: '' }, theme: 'light' } };
let current = null;
let isStreaming = false;
let controller = null;
let collapsed = false;

const SESSIONS_PER_PAGE = 30;
let loadedSessionCount = 0;
let isAdvancedSearch = false;
const debug_mode = (typeof window.api !== 'undefined');

function showWelcomeScreen() {
  current = null;
  $('.chat-area').classList.add('welcome-active');
  $('#chat-title').textContent = 'New Chat';
  $('#chat-tokens').textContent = 'no tokens used';
  renderSessions();
}

// --- Utils ---
function nowISO(){ return new Date().toISOString(); }
function newSessionName(){ const d = new Date(); return `Untitled chat ${d.toTimeString().slice(0,5)}`; }
function esc(s){ return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'", '&#39;'); }
function estimateTokens(s){ if (!s) return 0; return Math.ceil(s.length/4); }
const throttledHighlight = throttle((element) => {
  if (element) Prism.highlightAllUnder(element);
}, 20);

function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
}

function getRelativeDateGroup(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (dateOnly.getTime() === today.getTime()) return 'Today';
    if (dateOnly.getTime() === yesterday.getTime()) return 'Yesterday';

    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    if (dateOnly > oneWeekAgo) return 'Previous 7 days';

    const oneMonthAgo = new Date(today);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    if (dateOnly > oneMonthAgo) return 'This Month';

    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

// --- Minimal Markdown Parser ---
function esc(s) {
  if (!s) return '';
  return s.toString()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function enhancedMarkdownParse(src) {
    let sanitizedSrc = src.trimStart();

    const boldListFixRegex = /^(\s*)\*\*(\d+\.|[*-])\s+(.*?)\*\*/gm;
    sanitizedSrc = sanitizedSrc.replace(boldListFixRegex, '$1$2 **$3**');

    const normalizedSrc = sanitizedSrc.replace(/\u00A0/g, ' ').replace(/\r\n/g, '\n');
    const codeBlocks = [];
    
    let processedSrc = normalizedSrc.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        const placeholder = `\n__CODEBLOCK_${codeBlocks.length}__\n`;
        codeBlocks.push(`<pre><code class="language-${lang || 'text'}">${esc(code.trim())}</code></pre>`);
        return placeholder;
    });

    const lines = processedSrc.split('\n');
    let html = '';
    const listStack = []; 
    let paragraphBuffer = [];

    const flushParagraph = () => {
        if (paragraphBuffer.length > 0) {
            html += `<p>${paragraphBuffer.join('<br>')}</p>`;
            paragraphBuffer = [];
        }
    };

    const closeOpenBlocks = () => {
        flushParagraph();
        while (listStack.length > 0) {
            html += `</${listStack.pop().type}>`;
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (!trimmedLine) {
            closeOpenBlocks();
            continue;
        }

        const hMatch = line.match(/^(#+)\s+(.*)/);
        const hrMatch = /^---+$/.test(trimmedLine);
        const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)/);
        const ulMatch = line.match(/^(\s*)[*-]\s+(.*)/);
        const listMatch = olMatch || ulMatch;
        const codeMatch = trimmedLine.startsWith('__CODEBLOCK_');
        
        const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
        const isTableHeader = trimmedLine.includes('|') && !listMatch && !hMatch;
        const isNextLineSeparator = isTableHeader && nextLine.includes('|') && nextLine.includes('-') && !/[^|:-\s]/.test(nextLine);

        if (isTableHeader && isNextLineSeparator) {
            closeOpenBlocks();
            let tableHtml = '<div class="table-container"><table>';
            const headers = trimmedLine.split('|').map(h => h.trim()).filter(Boolean);
            tableHtml += '<thead><tr>';
            for (const header of headers) {
                tableHtml += `<th>${parseInlineMarkdown(header)}</th>`;
            }
            tableHtml += '</tr></thead><tbody>';
            let tableRowIndex = i + 2;
            while (tableRowIndex < lines.length && lines[tableRowIndex].trim().includes('|')) {
                const cells = lines[tableRowIndex].trim().split('|').map(c => c.trim()).filter(Boolean);
                tableHtml += '<tr>';
                for (let j = 0; j < headers.length; j++) {
                    const cellContent = cells[j] || '';
                    tableHtml += `<td>${parseInlineMarkdown(cellContent)}</td>`;
                }
                tableHtml += '</tr>';
                tableRowIndex++;
            }
            tableHtml += '</tbody></table></div>';
            html += tableHtml;
            i = tableRowIndex - 1;
            continue;
        }
        
        if (listMatch) {
            flushParagraph();
            const indent = listMatch[1].length;
            const type = olMatch ? 'ol' : 'ul';
            const number = olMatch ? parseInt(olMatch[2], 10) : null;
            const content = olMatch ? olMatch[3] : ulMatch[2];
            
            while (listStack.length > 0 && listStack[listStack.length - 1].indent >= indent) {
                html += `</${listStack.pop().type}>`;
            }
            
            const lastList = listStack.length > 0 ? listStack[listStack.length - 1] : null;
            if (!lastList || indent > lastList.indent || type !== lastList.type) {
                const startAttr = (type === 'ol' && number > 1) ? ` start="${number}"` : '';
                html += `<${type}${startAttr}>`;
                listStack.push({ type, indent });
            }
            html += `<li>${parseInlineMarkdown(content)}</li>`;
        
        } else if (hMatch || hrMatch || codeMatch) {
            closeOpenBlocks();
            if (hMatch) {
                html += `<h${hMatch[1].length}>${parseInlineMarkdown(hMatch[2])}</h${hMatch[1].length}>`;
            } else if (hrMatch) {
                html += '<hr>';
            } else if (codeMatch) {
                html += trimmedLine;
            }
        } else {
             if (listStack.length > 0) {
                const lastLiPos = html.lastIndexOf('</li>');
                if (lastLiPos !== -1) {
                    html = `${html.substring(0, lastLiPos)}<br>${parseInlineMarkdown(line.trim())}</li>`;
                }
            } else {
                paragraphBuffer.push(parseInlineMarkdown(line));
            }
        }
    }

    closeOpenBlocks(); 

    let finalHtml = html;
    finalHtml = codeBlocks.reduce((acc, block, i) => {
        return acc.replace(`__CODEBLOCK_${i}__`, block);
    }, finalHtml);

    return finalHtml;
}


function parseInlineMarkdown(text) {
    if (!text) return '';

    let html = esc(text);

    html = html.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, '<u>$1</u>');

    const inlineCodeBlocks = [];
    html = html.replace(/`([^`]+?)`/g, (match, content) => {
        const placeholder = `__INLINE_CODE_${inlineCodeBlocks.length}__`;
        inlineCodeBlocks.push(`<code>${content}</code>`);
        return placeholder;
    });

    const linkRegex = /(\b(https?:\/\/|www\.)[^\s<>"'()]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}(\/[^\s<>"'()]*)*)/g;
    html = html.replace(linkRegex, (url) => {
        let href = url;
        if (!/^https?:\/\//i.test(href)) {
            href = 'https://' + href;
        }
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });

    html = inlineCodeBlocks.reduce((acc, block, i) => {
        return acc.replace(`__INLINE_CODE_${i}__`, block);
    }, html);
    
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/___(.*?)___/g, '<strong><em>$1</em></strong>');

    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');

    return html;
}

function md(src) {
  if (!src) return '';
  
  const cleanSrc = src.trim();

  return enhancedMarkdownParse(cleanSrc);
}



// --- App Logic ---
function ensureSeed(s){
  if (!s || s.seeded) return;
  if (!s.messages) s.messages = [];
  if (s.messages.length===0) s.messages.push(['ai','Halo! Saya ZenAI, asisten AI yang siap membantu Anda. Ada yang bisa saya bantu hari ini?']);
  s.seeded = true;
}

function personaSystem(){
  const { name, work, prefs } = state.settings.persona || {};
  let prompt = 'You are ZenAI, a helpful and intelligent assistant.';
  const instructions = [];
  if (name) instructions.push(`The user's name is ${name}. Address them by their name when appropriate.`);
  if (work) instructions.push(`The user works as a ${work}. Keep this professional context in mind when providing assistance.`);
  if (prefs) instructions.push(`User preferences: ${prefs}, `);

  if (instructions.length > 0) {
    prompt += '\n\n--- USER PERSONALIZATION ---\n' + instructions.join('\n');
  }
  return prompt;
}

function buildMessages(){
  const msgs = [{ role:'system', content: personaSystem() }];
  if (!current || !current.messages) return msgs;
  for (const [role, content] of current.messages){
    if (role==='user') msgs.push({ role:'user', content });
    else if (role==='ai') msgs.push({ role:'assistant', content });
  }
  return msgs;
}

// --- Rendering & UI ---
function renderSessions() {
  const ul = $('#session-list'); 
  const filter = ($('#search').value || '').toLowerCase();
  
  let filteredSessions = state.sessions;
  if (filter) {
    filteredSessions = state.sessions.filter(s => {
      if (s.name === null) return true;
      const nameMatch = s.name.toLowerCase().includes(filter);
      if (isAdvancedSearch) {
        const contentMatch = s.messages.some(msg => msg[1].toLowerCase().includes(filter));
        return nameMatch || contentMatch;
      }
      return nameMatch;
    });
  }

  const sessionsToRender = filteredSessions.slice(0, loadedSessionCount);
  
  ul.innerHTML = '';
  let lastDateGroup = null;

  sessionsToRender.forEach(s => {
    const currentDateGroup = getRelativeDateGroup(s.created_at);
    if (currentDateGroup !== lastDateGroup) {
      const separator = document.createElement('div');
      separator.className = 'date-separator';
      separator.textContent = currentDateGroup;
      ul.appendChild(separator);
      lastDateGroup = currentDateGroup;
    }

    if (s.name === null) {
      const placeholder = document.createElement('li');
      placeholder.className = 'active session-placeholder';
      placeholder.innerHTML = `<span class="name">Untitled</span><div class="spinner"></div>`;
      ul.appendChild(placeholder);
      return;
    }
    
    const li = document.createElement('li');
    li.className = (s === current) ? 'active' : '';
    li.innerHTML = `
      <span class="name">${esc(s.name)}</span>
      <div class="session-meta">
        <span class="tokens"></span>
        <span class="menu">
          <button title="Delete Session">
            <svg xmlns="http://www.w.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </span>
      </div>
    `;

    li.addEventListener('click', () => setCurrent(s));
    li.querySelector('button').addEventListener('click', (ev) => {
      ev.stopPropagation();
      showConfirmationModal('Delete Session', `Are you sure you want to delete "${s.name}"?`, () => deleteSession(s));
    });
    
    ul.appendChild(li);
  });
  
  updateChatHeader();
}

function updateChatHeader() {
  if (current && current.name) {
    $('#chat-title').textContent = current.name;
    const tokenCount = current.tokens_used || 0;
    $('#chat-tokens').textContent = `${tokenCount > 0 ? tokenCount : 'No'} tokens used`;
  } else {
    $('#chat-title').textContent = 'ZenAI 4.5 Flash';
    $('#chat-tokens').textContent = 'Talk whatever you want';
  }
}

function addMessage(role, content, {final=false}={}){
  const log = $('#chat-log');
  const node = document.createElement('div');
  node.className = `message ${role}`;

  const copyIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
  const checkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
  
  const copyButtonHTML = `
    <div class="message-actions">
      <button class="copy-btn" title="Copy text">
        ${copyIconSVG}
      </button>
    </div>
  `;
  
  if (role === 'user') {
    node.innerHTML = `<div class="message-row"><div class="message-content"><div class="message-text">${md(content)}</div>${copyButtonHTML}</div></div>`;
  } else {
    const aiAvatar = `<div class="ai-avatar"><img src="../public/images/logo-chat.svg" alt="ZenAI Logo"></div>`;
    const thinkingIndicator = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
    node.innerHTML = `<div class="message-row">${aiAvatar}<div class="message-content"><div class="message-text">${final ? md(content) : thinkingIndicator}</div>${final ? copyButtonHTML : ''}</div></div>`;
  }
  
  log.appendChild(node);
  
  const copyBtn = node.querySelector('.copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(content).then(() => {
        copyBtn.innerHTML = checkIconSVG;
        copyBtn.style.color = 'var(--success)';
        setTimeout(() => {
          copyBtn.innerHTML = copyIconSVG;
          copyBtn.style.color = 'var(--fg-muted)';
        }, 1500);
      }).catch(err => {
        console.error('Failed to copy text: ', err);
      });
    });
  }

  log.scrollTop = log.scrollHeight;
  return node;
}

function clearLog(){ $('#chat-log').innerHTML=''; }
function renderHistory(){
  clearLog(); 
  if (!current || !current.messages) return;
  current.messages.forEach(([role, content]) => {
    addMessage(role, content, {final: true});
  });
  Prism.highlightAll();
}

function setCurrent(s){ 
  if (current === s) return;
  current = s; 
  ensureSeed(current); 
  $('.chat-area').classList.remove('welcome-active');
  renderSessions(); 
  renderHistory(); 
  updateInputState(); 
}

// --- Data Management & Actions ---
async function load(){
  try {
    const data = (typeof window.api !== 'undefined') ? await window.api.sessions.load() : JSON.parse(localStorage.getItem('zenai-data'));
    if (data) {
        state.sessions = data.sessions || [];
        state.settings = { ...state.settings, ...(data.settings || {}) };
    }
  } catch(e) { console.error("Failed to load data", e); }
  
  if (state.sessions.length === 0) {
    const s = { name: newSessionName(), created_at: nowISO(), messages: [], tokens_used: 0, seeded: false };
    ensureSeed(s); 
    state.sessions.push(s); 
  }

  state.sessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  applyTheme(state.settings.theme || 'light');

  loadedSessionCount = SESSIONS_PER_PAGE;
  renderSessions();
  showWelcomeScreen();
  await save();
  st("load executed!")

  setTimeout(recoverUntitledSessions, 1500);
}

async function save(){ 
  try {
    const dataToSave = { sessions: state.sessions, settings: state.settings };
    if (typeof window.api !== 'undefined') {
      await window.api.sessions.save(dataToSave);
    } else {
      localStorage.setItem('zenai-data', JSON.stringify(dataToSave));
    }
  } catch(e) { console.error("Failed to save data", e); }
}

function updateInputState(){
  const disabled = !current || isStreaming;
  $('#msg').disabled = disabled; 
  $('#send').disabled = disabled;
}

async function send(){
  const input = $('#msg'); 
  const text = (input.value || '').trim();
  if (!text || isStreaming || !current) return;
  
  isStreaming = true; 
  updateInputState();

  current.messages.push(['user', text]);
  addMessage('user', text, {final: true});
  input.value = '';
  input.style.height = 'auto';
  await save();

  const aiMessageNode = addMessage('ai', '', {final: false});
  const contentDiv = aiMessageNode.querySelector('.message-text');
  let fullResponse = '';
  const messages = buildMessages();

  const streamHandler = (evt) => {
    if (evt === null) {
      current.messages.push(['ai', fullResponse]);
      current.tokens_used = (current.tokens_used || 0) + estimateTokens(text) + estimateTokens(fullResponse);
      isStreaming = false; 
      updateInputState(); 
      controller = null;
      Prism.highlightAllUnder(contentDiv); 
      save();
      return;
    }
    if (evt && typeof evt === 'object' && evt.error) {
      contentDiv.innerHTML = `<span style="color:var(--danger)">[Error] ${esc(evt.error)}</span>`;
      isStreaming = false; 
      updateInputState();
      controller = null; 
      return;
    }
    const token = String(evt); 
    fullResponse += token; 
    contentDiv.innerHTML = md(fullResponse);
    throttledHighlight(contentDiv);
    $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
  };

  if (typeof window.api === 'undefined') { 
      const demoResponse = "This is a simulated response in demo mode. \
It is intentionally made longer to resemble a real API response, \
including multiple sentences, some detailed explanation, and \
structured formatting. In actual usage, this might contain \
JSON data, user messages, or system information depending on \
the context of the demo. Please note that this is only a mock \
response and does not represent real data from the backend.";

      const chunks = demoResponse.split(' ');
      let i = 0;
      const interval = setInterval(() => {
          if (i < chunks.length) {
              streamHandler(chunks[i] + ' ');
              i++;
          } else {
              clearInterval(interval);
              streamHandler(null);
          }
      }, 100);
  } else { controller = window.api.chat.stream(messages, 'glm-4.5-flash', streamHandler); }
}

async function recoverUntitledSessions() {
  st("Recover executed!")
  const untitledSessions = state.sessions.filter(s => s.name === 'Untitled' || null && s.messages.length > 0);
  if (untitledSessions.length === 0) return;

  st(`Mendeteksi ${untitledSessions.length} sesi "Untitled", memulai proses pemulihan...`);

  for (const session of untitledSessions) {
    try {
      const userPrompt = session.messages.find(msg => msg[0] === 'user')?.[1];
      if (!userPrompt) continue;

      const aiResponse = session.messages.find(msg => msg[0] === 'ai')?.[1];
      const context = userPrompt + (aiResponse ? `\n\n${aiResponse}` : '');
      
      let newTitle = null;
      if (typeof window.api !== 'undefined') {
        const suggestedTitle = await window.api.chat.titleSuggest(context);
        st("title requested", 6000)
        if (suggestedTitle) newTitle = suggestedTitle;
      } else {
        const words = context.split(' ').slice(0, 3).join(' ');
        newTitle = `(recovered) ${words}...`;
      }
      
      if (newTitle) {
        session.name = newTitle;
        st(`Judul untuk sesi ${session.created_at} berhasil dipulihkan: "${newTitle}"`);
      }
    } catch (e) {
      console.error(`Gagal memulihkan judul untuk sesi ${session.created_at}:`, e);
    }
  }

  renderSessions();
  await save();
}

function renameNullTitleSessions() {
  let renamed = false;
  st("renameNullTitleSessions executed!")
  state.sessions.forEach(session => {
    if (session.name === null) {
      session.name = "Untitled";
      st("null title found")
      renamed = true;
    }
  });
  if (renamed) {
    st("renamed successfully!")
    renderSessions();
    save();
  }
}

async function sendFromWelcome() {
  const input = $('#msg-central');
  const text = (input.value || '').trim();
  if (!text) return;

  isStreaming = true;
  const tempId = `temp_${Date.now()}`;

  const s = { 
    name: null,
    created_at: nowISO(), 
    messages: [['user', text]],
    tokens_used: 0, 
    seeded: true,
    tempId: tempId
  };
  state.sessions.unshift(s);
  
  setCurrent(s);
  input.value = '';
  const aiMessageNode = addMessage('ai', '', {final: false});

  const suggestTitle = async () => {
    let title = 'Untitled chat';
    try {
      if (typeof window.api !== 'undefined') {
        const suggested = await window.api.chat.titleSuggest(text);
        if (suggested) title = suggested;
      } else {
        const words = text.split(' ').slice(0, 3).join(' ');
        title = words.length > 20 ? words.substring(0, 20) + '...' : words;
      }
    } catch (e) {
      console.error("Failed to generate title", e);
    } finally {
      const sessionToUpdate = state.sessions.find(ses => ses.tempId === tempId);
      if (sessionToUpdate) {
        sessionToUpdate.name = title;
        delete sessionToUpdate.tempId;
        renderSessions();
        updateChatHeader();
        await save();
      }
    }
  };


  const getChatResponse = async () => {
    const contentDiv = aiMessageNode.querySelector('.message-text');
    let fullResponse = '';
    const messages = buildMessages();
    
    const streamHandler = (evt) => {
        if (evt === null) {
            s.messages.push(['ai', fullResponse]);
            s.tokens_used = (s.tokens_used || 0) + estimateTokens(text) + estimateTokens(fullResponse);
            isStreaming = false;
            updateInputState();
            controller = null;
            save();
            return;
        }
        if (evt && typeof evt === 'object' && evt.error) {
            contentDiv.innerHTML = `<span style="color:var(--danger)">[Error] ${esc(evt.error)}</span>`;
            isStreaming = false;
            updateInputState();
            controller = null;
            return;
        }
        const token = String(evt);
        fullResponse += token;
        contentDiv.innerHTML = md(fullResponse);
        $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
    };
    
    if (typeof window.api === 'undefined') {
      const demoResponse = "This is a simulated response for your new chat. \
It is designed to look more natural and descriptive, \
providing multiple sentences that mimic a real backend response. \
In an actual application, this text could represent JSON data, \
API messages, or detailed information sent from the server. \
Remember, this is only a mock response used for demo purposes, \
and should not be considered as real data.";

      const chunks = demoResponse.split(' ');
      let i = 0;
      const interval = setInterval(() => {
          if (i < chunks.length) {
              streamHandler(chunks[i] + ' ');
              i++;
          } else {
              clearInterval(interval);
              streamHandler(null);
          }
      }, 100);
    } else {
        controller = window.api.chat.stream(messages, 'glm-4.5-flash', streamHandler);
    }
  };

  suggestTitle();
  getChatResponse();
}

async function deleteSession(sessionToDelete) {
  if (!sessionToDelete) return;
  const idx = state.sessions.findIndex(s => s === sessionToDelete);
  if (idx < 0) return;

  state.sessions.splice(idx, 1);

  if (current === sessionToDelete) {
    showWelcomeScreen();
  } else {
    renderSessions();
  }
  
  await save();
}

async function deleteCurrentSession() {
  if (!current) return;
  showConfirmationModal('Delete Current Session', `Are you sure you want to delete "${current.name}"?`, () => deleteSession(current));
}

// --- Theme & Modal ---
function applyTheme(theme) {
  document.body.className = theme === 'dark' ? 'dark-theme' : 'light-theme';
  $('#theme-slider').checked = theme === 'dark';
  $('#theme-label').textContent = theme === 'dark' ? 'Dark' : 'Light';
  state.settings.theme = theme;
}

function toggleTheme() {
  const newTheme = state.settings.theme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
  save();
}

function showConfirmationModal(title, message, onConfirm) {
  const modal = $('#confirm-modal');
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  modal.classList.remove('hidden');

  const okBtn = $('#confirm-ok');
  const newOkBtn = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newOkBtn, okBtn);

  const close = () => modal.classList.add('hidden');
  newOkBtn.addEventListener('click', () => { onConfirm(); close(); });
  $('#confirm-cancel').onclick = close;
  modal.querySelector('.modal-overlay').onclick = close;
}

// --- Mobile Sidebar & Textarea ---
function handleSidebarToggle() {
  if (window.innerWidth <= 768) {
    $('#sidebar').classList.toggle('open');
  } else {
    collapsed = !collapsed;
    $('#app').classList.toggle('sidebar-collapsed', collapsed);
  }
}

function setupMobileSidebar() {
  const toggleBtn = $('#toggle-sidebar');
  const newBtn = toggleBtn.cloneNode(true);
  toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);
  newBtn.addEventListener('click', handleSidebarToggle);

  const toggleBtn2 = $('#toggle-sidebar-2');
  const newBtn2 = toggleBtn2.cloneNode(true);
  toggleBtn2.parentNode.replaceChild(newBtn2, toggleBtn2);
  newBtn2.addEventListener('click', handleSidebarToggle);
}

function setupTextareaResize() {
  const msgInput = $('#msg');
  msgInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = `${Math.min(this.scrollHeight, 150)}px`;
  });
}

// --- UI Event Listeners ---
function setupEventListeners() {
  $('#minimize-btn').addEventListener('click', () => window.api?.window.minimize());
  $('#maximize-btn').addEventListener('click', () => window.api?.window.maximize());
  $('#close-btn').addEventListener('click', () => window.api?.window.close());

  $('#msg').addEventListener('keydown', (e) => { if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); }});
  $('#send').addEventListener('click', send);
  
  $('#new-chat').addEventListener('click', showWelcomeScreen);
  $('#trigger-delete-session').addEventListener('click', deleteCurrentSession);

  $('#open-settings').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#settings-menu').classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!$('#settings-container').contains(e.target)) {
      $('#settings-menu').classList.add('hidden');
    }
  });

  $('#open-persona-settings').addEventListener('click', () => {
    const { name, work, prefs } = state.settings.persona;
    $('#persona-name').value = name || '';
    $('#persona-work').value = work || '';
    $('#persona-prefs').value = prefs || '';
    $('#settings-modal').classList.remove('hidden'); 
    $('#settings-menu').classList.add('hidden');
  });

  $('#close-modal').addEventListener('click', () => $('#settings-modal').classList.add('hidden'));

  $('#close-settings').addEventListener('click', () => $('#settings-modal').classList.add('hidden'));
  $('#save-settings').addEventListener('click', async () => { 
    state.settings.persona = {
      name: ($('#persona-name').value||'').trim(),
      work: ($('#persona-work').value||'').trim(),
      prefs: ($('#persona-prefs').value||'').trim(),
    };
    await save(); 
    $('#settings-modal').classList.add('hidden'); 
  });
  
  $('#delete-all').addEventListener('click', () => {
    showConfirmationModal('Delete All Sessions', 'Are you sure?', async () => {
      state.sessions = [];
      const s = { name: newSessionName(), created_at: nowISO(), messages: [], seeded: false };
      ensureSeed(s); 
      state.sessions.push(s); 
      setCurrent(state.sessions[0]);
      await save();
      $('#settings-modal').classList.add('hidden');
    });
  });

  $('#search').addEventListener('input', () => {
    loadedSessionCount = SESSIONS_PER_PAGE;
    renderSessions();
  });
  
  $('#advanced-search-switch').addEventListener('change', (e) => {
    isAdvancedSearch = e.target.checked;
    $('#search').placeholder = isAdvancedSearch ? 'Advanced search' : 'Search chats';
    loadedSessionCount = SESSIONS_PER_PAGE;
    renderSessions();
  });
  
  $('.sessions-container').addEventListener('scroll', () => {
    const container = $('.sessions-container');
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
      const filter = ($('#search').value || '').toLowerCase();
      const currentFilteredCount = filter ? state.sessions.filter(s => s.name.toLowerCase().includes(filter)).length : state.sessions.length;
      if (loadedSessionCount < currentFilteredCount) {
        loadedSessionCount += SESSIONS_PER_PAGE;
        renderSessions();
      }
    }
  });
  
  $('#theme-slider').addEventListener('change', toggleTheme);

  $('#settings-modal .modal-overlay').addEventListener('click', () => $('#settings-modal').classList.add('hidden'));
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $('#settings-modal').classList.add('hidden');
      $('#confirm-modal').classList.add('hidden');
      $('#settings-menu').classList.add('hidden');
    }
  });

  $('#msg-central').addEventListener('keydown', (e) => { if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendFromWelcome(); }});
  $('#send-central').addEventListener('click', sendFromWelcome);
}

function setupResponsiveHandlers() {
  let isMobile = window.innerWidth <= 768;
  window.addEventListener('resize', () => {
    const stillMobile = window.innerWidth <= 768;
    if (isMobile !== stillMobile) {
        isMobile = stillMobile;
        $('#app').classList.remove('sidebar-collapsed');
        $('#sidebar').classList.remove('open');
    }
  });
}

function st(message, duration = 10000) {
  if (debug_mode) { return; }

  const container = document.getElementById('toast-container');
  let toast = container.querySelector('.toast-msg'); // cek apakah sudah ada toast

  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.style.cssText = `
      background: #535353ff;
      color: #fff;
      padding: 5px 15px;
      margin-top: 5px;
      border-radius: 7px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      font-size: 15px;
      pointer-events: auto;
      opacity: 0;
      transition: opacity 0.3s;
    `;
    container.appendChild(toast);
  }

  // update pesan
  toast.textContent = message;

  toast.style.opacity = '0';
  requestAnimationFrame(() => { toast.style.opacity = '1'; });

  clearTimeout(toast._timeoutId);
  toast._timeoutId = setTimeout(() => {
    toast.style.opacity = '0';
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}


// --- Initialization ---
async function initializeApp() { // Tambahkan async
  setupEventListeners();
  setupMobileSidebar();
  setupTextareaResize();
  setupResponsiveHandlers();
  st("initialize...");
  await load();
  renameNullTitleSessions();
}

document.addEventListener('DOMContentLoaded', initializeApp);