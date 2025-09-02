const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

let state = { sessions: [], settings: { persona: { name: '', work: '', prefs: '' }, theme: 'light' } };
let current = null;
let isStreaming = false;
let controller = null;
let collapsed = false;
const _thinkingTimers = new WeakMap();

const SESSIONS_PER_PAGE = 30;
let loadedSessionCount = 0;
let isAdvancedSearch = false;
let thinkingTimer = null;
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
function formatUserMessage(content) {
  const escaped = esc(content);
  return escaped.replace(/\n/g, '<br/>');
}
function esc(s){ return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'", '&#39;'); }
function estimateTokens(s){ if (!s) return 0; return Math.ceil(s.length/4); }

const welcomeMessages = [
  "Ready when you are. What's up?",
  "Let's untangle this. Where to start?",
  "Problem to solve, or idea to explore?",
  "Alright, let's dive in. Topic today?",
  "I'm all ears. Tell me.",
  "What's that idea stuck in your head?",
  "Need clarity or a spark?",
  "No idea's too small. Share it.",
  "Let's act on it. What's our quest?",
  "Your thoughts, my focus. Go.",
  "What's one thing to move forward?",
  "Ready to build? Start me off.",
  "Lay it on me. What's the challenge?",
  "Let's find a breakthrough. Thoughts?",
  "Circuits buzzing. What create today?",
  "How can I help right now?"
];

function getChatScroller() {
  const log = document.getElementById('chat-log');
  if (!log) return null;

  const style = getComputedStyle(log);
  const overY = style.overflowY;
  if (log.scrollHeight > log.clientHeight && (overY === 'auto' || overY === 'scroll')) {
    return log;
  }

  let el = log.parentElement;
  while (el && el !== document.body) {
    const st = getComputedStyle(el);
    const oy = st.overflowY;
    if (el.scrollHeight > el.clientHeight && (oy === 'auto' || oy === 'scroll')) {
      return el;
    }
    el = el.parentElement;
  }

  return log;
}



function scheduleThinkingText(aiNode, { shortDelay = 500, longDelay = 2000 } = {}) {
  cancelThinkingText(aiNode);

  const textEl = aiNode.querySelector('.thinking-text');
  if (!textEl) return;

  const shortId = setTimeout(() => {
    const currentTextEl = aiNode.querySelector('.thinking-text');
    if (currentTextEl) {
      currentTextEl.textContent = 'Thinking...';
    }
  }, shortDelay);

  const longId = setTimeout(() => {
    const currentTextEl = aiNode.querySelector('.thinking-text');
    if (currentTextEl) {
      currentTextEl.textContent = 'Thinking longer for better response...';
    }
  }, longDelay);

  _thinkingTimers.set(aiNode, { shortId, longId });
}

function cancelThinkingText(aiNode) {
  const t = _thinkingTimers.get(aiNode);
  if (t) {
    clearTimeout(t.shortId);
    clearTimeout(t.longId);
  }
  _thinkingTimers.delete(aiNode);
}

function isNearBottom(el, threshold = 48) {
  if (!el) return true;
  return (el.scrollTop + el.clientHeight) >= (el.scrollHeight - threshold);
}

function scrollToBottom({ force = false } = {}) {
  const scroller = getChatScroller();
  if (!scroller) return;

  const shouldScroll = force || isNearBottom(scroller);
  if (!shouldScroll) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight;
    });
  });
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

// --- Enhanced Markdown Parser with Real-time Code Block Detection ---
function esc(s) {
  if (!s) return '';
  return s.toString()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function attachCodeBlockCopyListeners(container) {
  const copyButtons = container.querySelectorAll('.copy-code-btn');
  const checkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
  const copyIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

  copyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const container = btn.closest('.code-block-container');
      const codeElement = container.querySelector('code');
      if (codeElement) {
        navigator.clipboard.writeText(codeElement.textContent).then(() => {
          const originalText = btn.querySelector('span').textContent;
          btn.innerHTML = `${checkIconSVG} <span>Copied!</span>`;
          btn.classList.add('copied');
          setTimeout(() => {
            btn.innerHTML = `${copyIconSVG} <span>${originalText}</span>`;
            btn.classList.remove('copied');
          }, 2000);
        }).catch(err => {
          btn.querySelector('span').textContent = 'Failed!';
          console.error('Failed to copy text: ', err);
        });
      }
    });
  });
}

function enhancedMarkdownParse(src) {
    let sanitizedSrc = src.trimStart();

    const boldListFixRegex = /^(\s*)\*\*(\d+\.|[*-])\s+(.*?)\*\*/gm;
    sanitizedSrc = sanitizedSrc.replace(boldListFixRegex, '$1$2 **$3**');

    const normalizedSrc = sanitizedSrc.replace(/\u00A0/g, ' ').replace(/\r\n/g, '\n');
    const codeBlocks = [];
    
    let processedSrc = normalizedSrc.replace(/```(\w*)\n?([\s\S]*?)(?:```|$)/g, (match, lang, code, offset, string) => {
        const placeholder = `\n__CODEBLOCK_${codeBlocks.length}__\n`;
        const isComplete = match.endsWith('```');
        const codeContent = code.trim();
        const language = lang || 'text';

        const newStructure = `
            <div class="code-block-container">
              <div class="code-block-header">
                <span class="language-name">${language}</span>
                <button class="copy-code-btn" title="Copy code">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  <span>Copy</span>
                </button>
              </div>
              <pre><code class="language-${language}">${esc(codeContent)}</code></pre>
            </div>
        `;
        
        codeBlocks.push(newStructure);
        
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
            let indent = listMatch[1].length;
            const type = olMatch ? 'ol' : 'ul';
            const number = olMatch ? parseInt(olMatch[2], 10) : null;
            const content = olMatch ? listMatch[3] : ulMatch[2];
            const lastList = listStack.length > 0 ? listStack[listStack.length - 1] : null;
            
            if (type === 'ul' && lastList && lastList.type === 'ul' && lastList.implicit && indent < lastList.indent) {
                indent = lastList.indent;
            
            } else if (type === 'ul' && lastList && lastList.type === 'ol' && indent <= lastList.indent) {
                indent = lastList.indent + 2;
            }

            while (listStack.length > 0 && 
                    (listStack[listStack.length - 1].indent > indent || 
                    (listStack[listStack.length - 1].indent === indent && listStack[listStack.length - 1].type !== type))) {
                html += `</${listStack.pop().type}>`;
            }
            
            const currentLastList = listStack.length > 0 ? listStack[listStack.length - 1] : null;
            
            if (!currentLastList || indent > currentLastList.indent || type !== currentLastList.type) {
                if (currentLastList && indent > currentLastList.indent) {
                    const lastLiPos = html.lastIndexOf('</li>');
                    if (lastLiPos !== -1) {
                        html = html.substring(0, lastLiPos);
                    }
                }
                
                const isImplicit = (type === 'ul' && currentLastList && currentLastList.type === 'ol');

                const startAttr = (type === 'ol' && number > 1) ? ` start="${number}"` : '';
                html += `<${type}${startAttr}>`;
                listStack.push({ type, indent, implicit: isImplicit });
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

// --- Typewriter Animation for Welcome Message ---
function typewriterEffect(element, text, { speed = 30, punctuationDelay = 350 } = {}) {
  element.textContent = '';
  let i = 0;
  const punctuation = '.,?!;:-–';

  function type() {
    if (i < text.length) {
      const char = text.charAt(i);
      element.textContent += char;
      i++;

      let delay = speed + Math.random() * 40;

      if (punctuation.includes(char)) {
        delay += punctuationDelay;
      }
      
      setTimeout(type, delay);
    }
  }
  
  setTimeout(type, 100);
}

// --- Thinking UX: scoped per message ---
const thinkingTimers = new WeakMap();




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
            <svg xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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

function addMessage(role, content, { final = false } = {}) {
  const log = $('#chat-log');
  const node = document.createElement('div');
  node.className = `message ${role}`;

  const copyIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
  const checkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
  const editIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
  const regenIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>`;

  const baseActions = `<div class="message-actions"></div>`;

  if (role === 'user') {
    node.innerHTML = `
      <div class="message-row">
        <div class="message-content">
          <div class="message-text">${formatUserMessage(content)}</div>
          ${baseActions}
        </div>
      </div>`;
  } else {
    const aiAvatar = `<div class="ai-avatar"><img src="../public/images/logo-chat.svg" alt="ZenAI Logo"></div>`;
    // teks thinking sudah ada dari awal, disembunyikan => align sejajar sama loader
    const thinking = `
      <div class="thinking-container">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
        <span class="thinking-text"></span>
      </div>`;

    node.innerHTML = `
      <div class="message-row">
        ${aiAvatar}
        <div class="message-content">
          <div class="message-text">${final ? md(content) : thinking}</div>
          ${baseActions}
        </div>
      </div>`;

    if (role === 'ai') {
      node.style.opacity = '0';
      node.style.transform = 'translateY(20px)';
    }
  }

  log.appendChild(node);

  if (role === 'ai') {
    requestAnimationFrame(() => {
      node.style.transition = 'opacity 0.4s ease-out, transform 0.4s ease-out';
      node.style.opacity = '1';
      node.style.transform = 'translateY(0)';
    });
  }

  const actions = node.querySelector('.message-actions');
  if (actions) {
    const renderCopy = () => {
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.title = 'Copy text';
      btn.innerHTML = copyIconSVG;
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(content).then(() => {
          btn.innerHTML = checkIconSVG;
          btn.style.color = 'var(--success)';
          setTimeout(() => { btn.innerHTML = copyIconSVG; btn.style.color = 'var(--fg-muted)'; }, 1500);
        }).catch(err => console.error('Failed to copy text: ', err));
      });
      actions.appendChild(btn);
    };

    if (role === 'user') {
      renderCopy();
      const editBtn = document.createElement('button');
      editBtn.className = 'edit-btn';
      editBtn.title = 'Edit prompt';
      editBtn.innerHTML = editIconSVG;
      editBtn.addEventListener('click', () => {
        if (isStreaming) { st('Tunggu respon selesai sebelum mengedit.'); return; }
        const input = $('#msg');
        input.value = content;
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 350)}px`;
        input.focus();
        scrollToBottom({ force: true });
      });
      actions.appendChild(editBtn);
    } else if (role === 'ai' && final) {
      renderCopy();
      const regenBtn = document.createElement('button');
      regenBtn.className = 'regen-btn';
      regenBtn.title = 'Regenerate this response (append new at bottom)';
      regenBtn.innerHTML = regenIconSVG;
      regenBtn.addEventListener('click', () => {
        if (isStreaming) { st('Sedang streaming. Coba lagi setelah selesai.'); return; }
        const idx = parseInt(node.dataset.index || '-1', 10);
        if (Number.isInteger(idx) && idx >= 0) {
          regenerateFromIndex(idx);
        }
      });
      actions.appendChild(regenBtn);
    }
  }

  scrollToBottom({ force: true });
  return node;
}



function clearLog(){ $('#chat-log').innerHTML=''; }

function renderHistory() {
  clearLog();
  if (!current || !current.messages) return;

  for (let i = 0; i < current.messages.length; i++) {
    const [role, content] = current.messages[i];
    const n = addMessage(role, content, { final: true });
    n.dataset.index = String(i);
  }

  Prism.highlightAll();
  attachCodeBlockCopyListeners($('#chat-log'));
  scrollToBottom({ force: true });
}

function buildMessagesUpTo(indexInclusive) {
  const msgs = [{ role: 'system', content: personaSystem() }];
  if (!current || !current.messages) return msgs;
  const upto = Math.max(0, Math.min(indexInclusive, current.messages.length - 1));
  for (let i = 0; i <= upto; i++) {
    const [role, content] = current.messages[i];
    if (role === 'user') msgs.push({ role: 'user', content });
    if (role === 'ai')   msgs.push({ role: 'assistant', content });
  }
  return msgs;
}

async function regenerateFromIndex(aiIndex) {
  if (!current || isStreaming) return;
  if (current.messages[aiIndex]?.[0] !== 'ai') { st('Target regen bukan AI response.'); return; }

  isStreaming = true;
  updateInputState();

  const aiNode = addMessage('ai', '', { final: false });

  scheduleThinkingText(aiNode, { shortDelay: 1000, longDelay: 3000 });

  const contentDiv = aiNode.querySelector('.message-text');
  let fullResponse = '';

  const messages = buildMessagesUpTo(aiIndex);

  const streamHandler = (evt) => {
    cancelThinkingText(aiNode);

    if (evt === null) {
      contentDiv.innerHTML = md(fullResponse);
      Prism.highlightAllUnder(contentDiv);
      attachCodeBlockCopyListeners(contentDiv);

      current.messages.push(['ai', fullResponse]);
      const newIndex = current.messages.length - 1;
      aiNode.dataset.index = String(newIndex);

      const actions = aiNode.querySelector('.message-actions');
      if (actions) actions.innerHTML = ''; 
      
      const copyIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
      const regenIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>`;
      const checkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.title = 'Copy text';
      copyBtn.innerHTML = copyIconSVG;
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(fullResponse).then(() => {
          copyBtn.innerHTML = checkIconSVG;
          copyBtn.style.color = 'var(--success)';
          setTimeout(() => { copyBtn.innerHTML = copyIconSVG; copyBtn.style.color = 'var(--fg-muted)'; }, 1500);
        });
      });
      actions.appendChild(copyBtn);

      const regenBtn = document.createElement('button');
      regenBtn.className = 'regen-btn';
      regenBtn.title = 'Regenerate this response (append new at bottom)';
      regenBtn.innerHTML = regenIconSVG;
      regenBtn.addEventListener('click', () => {
        if (!isStreaming) regenerateFromIndex(newIndex);
      });
      actions.appendChild(regenBtn);

      current.tokens_used = (current.tokens_used || 0) + estimateTokens(fullResponse);
      isStreaming = false;
      updateInputState();
      controller = null;
      save();
      scrollToBottom({ force: true });
      return;
    }

    if (evt && typeof evt === 'object' && evt.error) {
      contentDiv.innerHTML = `<span style="color:var(--danger)">[Error] ${esc(evt.error)}</span>`;
      isStreaming = false;
      updateInputState();
      controller = null;
      scrollToBottom({ force: true });
      return;
    }

    const token = String(evt);
    fullResponse += token;
    if (fullResponse.trim().length > 0) contentDiv.innerHTML = md(fullResponse);
    if (token.includes('```') || contentDiv.querySelector('code')) Prism.highlightAllUnder(contentDiv);
    scrollToBottom();
  };

  if (typeof window.api === 'undefined') {
    const demoResponse = "Regenerated response (demo mode). This block simulates a fresh answer based on truncated history.";
    const chunks = demoResponse.split(' ');
    let i = 0;
    const interval = setInterval(() => {
      if (i < chunks.length) { streamHandler(chunks[i] + ' '); i++; }
      else { clearInterval(interval); streamHandler(null); }
    }, 80);
  } else {
    controller = window.api.chat.stream(messages, 'glm-4.5-flash', streamHandler);
  }
}

function setupScrollHardener() {
  if (window.__scrollHardenerAttached) return;
  window.__scrollHardenerAttached = true;

  const chatRoot = document.getElementById('chat-log');
  const scroller = (typeof getChatScroller === 'function')
    ? getChatScroller()
    : chatRoot;

  if (!chatRoot || !scroller) return;

  let autoStick = true;
  const nearBottom = () =>
    (scroller.scrollTop + scroller.clientHeight) >= (scroller.scrollHeight - 48);

  scroller.addEventListener('scroll', () => {
    autoStick = nearBottom();
  }, { passive: true });

  const ro = new ResizeObserver(() => {
    if (autoStick) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        scroller.scrollTop = scroller.scrollHeight;
      }));
    }
  });
  ro.observe(scroller);

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
        m.addedNodes.forEach(n => {
          if (n.nodeType === 1 && n.querySelectorAll) {
            n.querySelectorAll('img').forEach(img => {
              if (!img.complete) {
                img.addEventListener('load', () => {
                  if (autoStick) {
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                      scroller.scrollTop = scroller.scrollHeight;
                    }));
                  }
                }, { once: true });
              }
            });
          }
        });
      }
    }

    if (autoStick) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        scroller.scrollTop = scroller.scrollHeight;
      }));
    }
  });

  mo.observe(chatRoot, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });

  try { document.documentElement.style.setProperty('overflow-anchor', 'auto'); } catch {}

  window.__scrollHardenerTeardown = () => {
    try { ro.disconnect(); } catch {}
    try { mo.disconnect(); } catch {}
    try { scroller.removeEventListener('scroll', () => {}); } catch {}
    window.__scrollHardenerAttached = false;
  };
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

  const idx = Math.floor(Math.random() * welcomeMessages.length);
  state.sessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  applyTheme(state.settings.theme || 'light');

  loadedSessionCount = SESSIONS_PER_PAGE;
  renderSessions();
  showWelcomeScreen();
  
  const welcomeElement = document.getElementById("welcome-message");
  typewriterEffect(welcomeElement, welcomeMessages[idx]);
  
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
  const userNode = addMessage('user', text, { final: true });
  userNode.dataset.index = String(current.messages.length - 1);

  input.value = '';
  input.style.height = 'auto';
  await save();

  const aiNode = addMessage('ai', '', { final: false });

  // ⬇️ tampilkan teks thinking secara progresif (loader tidak diubah)
  scheduleThinkingText(aiNode, { shortDelay: 1000, longDelay: 3000 });

  const contentDiv = aiNode.querySelector('.message-text');
  let fullResponse = '';
  const messages = buildMessages();

  scrollToBottom({ force: true });

  const streamHandler = (evt) => {
    // apapun eventnya, bersihkan indikator teks (biar gak nyangkut)
    cancelThinkingText(aiNode);

    if (evt === null) {
      contentDiv.innerHTML = md(fullResponse);
      Prism.highlightAllUnder(contentDiv);
      attachCodeBlockCopyListeners(contentDiv);

      current.messages.push(['ai', fullResponse]);
      const aiIndex = current.messages.length - 1;
      aiNode.dataset.index = String(aiIndex);

      const actions = aiNode.querySelector('.message-actions');
      if (actions) actions.innerHTML = '';
      const copyIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
      const regenIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>`;
      const checkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.title = 'Copy text';
      copyBtn.innerHTML = copyIconSVG;
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(fullResponse).then(() => {
          copyBtn.innerHTML = checkIconSVG;
          copyBtn.style.color = 'var(--success)';
          setTimeout(() => { copyBtn.innerHTML = copyIconSVG; copyBtn.style.color = 'var(--fg-muted)'; }, 1500);
        });
      });
      actions.appendChild(copyBtn);

      const regenBtn = document.createElement('button');
      regenBtn.className = 'regen-btn';
      regenBtn.title = 'Regenerate this response (append new at bottom)';
      regenBtn.innerHTML = regenIconSVG;
      regenBtn.addEventListener('click', () => {
        if (!isStreaming) regenerateFromIndex(aiIndex);
      });
      actions.appendChild(regenBtn);

      current.tokens_used = (current.tokens_used || 0) + estimateTokens(text) + estimateTokens(fullResponse);
      isStreaming = false; 
      updateInputState(); 
      controller = null;
      save();
      scrollToBottom({ force: true });
      return;
    }
    
    if (evt && typeof evt === 'object' && evt.error) {
      contentDiv.innerHTML = `<span style="color:var(--danger)">[Error] ${esc(evt.error)}</span>`;
      isStreaming = false; 
      updateInputState(); 
      controller = null;
      scrollToBottom({ force: true });
      return;
    }

    const token = String(evt);
    fullResponse += token;
    if (fullResponse.trim().length > 0) contentDiv.innerHTML = md(fullResponse);
    if (token.includes('```') || contentDiv.querySelector('code')) Prism.highlightAllUnder(contentDiv);
    scrollToBottom();
  };

  if (typeof window.api === 'undefined') {
    const demoResponse = "This is a simulated response in demo mode. It is intentionally made longer to resemble a real API response, including multiple sentences, some detailed explanation, and structured formatting.";
    const chunks = demoResponse.split(' ');
    let i = 0;
    const interval = setInterval(() => {
        if (i < chunks.length) { streamHandler(chunks[i] + ' '); i++; }
        else { clearInterval(interval); streamHandler(null); }
    }, 100);
  } else { 
    controller = window.api.chat.stream(messages, 'glm-4.5-flash', streamHandler); 
  }
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

  // Placeholder AI
  const aiNode = addMessage('ai', '', { final: false });

  // ⬇️ progresif
  scheduleThinkingText(aiNode, { shortDelay: 1000, longDelay: 3000 });

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
    const contentDiv = aiNode.querySelector('.message-text');
    let fullResponse = '';
    const messages = buildMessages();

    scrollToBottom({ force: true });

    const streamHandler = (evt) => {
      cancelThinkingText(aiNode);

      if (evt === null) {
        s.messages.push(['ai', fullResponse]);
        const aiIndex = s.messages.length - 1;
        aiNode.dataset.index = String(aiIndex);

        contentDiv.innerHTML = md(fullResponse);
        Prism.highlightAllUnder(contentDiv);
        attachCodeBlockCopyListeners(contentDiv);

        // actions untuk AI final
        const actions = aiNode.querySelector('.message-actions');
        if (actions) actions.innerHTML = '';
        const copyIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
        const regenIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>`;
        const checkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.title = 'Copy text';
        copyBtn.innerHTML = copyIconSVG;
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(fullResponse).then(() => {
            copyBtn.innerHTML = checkIconSVG;
            copyBtn.style.color = 'var(--success)';
            setTimeout(() => { copyBtn.innerHTML = copyIconSVG; copyBtn.style.color = 'var(--fg-muted)'; }, 1500);
          });
        });
        actions.appendChild(copyBtn);

        const regenBtn = document.createElement('button');
        regenBtn.className = 'regen-btn';
        regenBtn.title = 'Regenerate this response (append new at bottom)';
        regenBtn.innerHTML = regenIconSVG;
        regenBtn.addEventListener('click', () => {
          if (!isStreaming) regenerateFromIndex(aiIndex);
        });
        actions.appendChild(regenBtn);

        s.tokens_used = (s.tokens_used || 0) + estimateTokens(text) + estimateTokens(fullResponse);
        isStreaming = false;
        updateInputState();
        controller = null;

        save();
        scrollToBottom({ force: true });
        return;
      }
      if (evt && typeof evt === 'object' && evt.error) {
        contentDiv.innerHTML = `<span style="color:var(--danger)">[Error] ${esc(evt.error)}</span>`;
        isStreaming = false;
        updateInputState();
        controller = null;
        scrollToBottom({ force: true });
        return;
      }
      const token = String(evt);
      fullResponse += token;

      if (fullResponse.trim().length > 0) contentDiv.innerHTML = md(fullResponse);
      if (token.includes('```') || contentDiv.querySelector('code')) Prism.highlightAllUnder(contentDiv);
      scrollToBottom();
    };

    if (typeof window.api === 'undefined') {
      const demoResponse = "This is a simulated response for your new chat. It is designed to look more natural and descriptive, providing multiple sentences that mimic a real backend response.";
      const chunks = demoResponse.split(' ');
      let i = 0;
      const interval = setInterval(() => {
        if (i < chunks.length) { streamHandler(chunks[i] + ' '); i++; }
        else { clearInterval(interval); streamHandler(null); }
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
    const sidebar = $('#sidebar');
    sidebar.classList.toggle('open');
    
    if (sidebar.classList.contains('open')) {
      setTimeout(() => {
        const closeOnClickOutside = (e) => {
          if (!sidebar.contains(e.target) && !$('#toggle-sidebar-2').contains(e.target)) {
            sidebar.classList.remove('open');
            document.removeEventListener('click', closeOnClickOutside);
          }
        };
        document.addEventListener('click', closeOnClickOutside);
      }, 100);
    }
  } else {
    collapsed = !collapsed;
    const app = $('#app');
    app.classList.toggle('sidebar-collapsed', collapsed);
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
    this.style.height = `${Math.min(this.scrollHeight, 350)}px`;
  });
}

function setupTextareaCentralResize() {
  const msgCentral = $('#msg-central');
  msgCentral.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = `${Math.min(this.scrollHeight, 350)}px`;
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
  let toast = container.querySelector('.toast-msg');

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
async function initializeApp() {
  setupEventListeners();
  setupMobileSidebar();
  setupTextareaResize();
  setupTextareaCentralResize();
  setupResponsiveHandlers();
  st("initialize...");
  await load();
  renameNullTitleSessions();
}

document.addEventListener('DOMContentLoaded', () => {
  setupScrollHardener();
}, { once: true });
document.addEventListener('DOMContentLoaded', initializeApp);