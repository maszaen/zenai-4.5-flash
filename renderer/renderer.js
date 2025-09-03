const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

let state = { sessions: [], settings: { persona: { name: '', work: '', prefs: '' }, theme: 'light' } };
let current = null;
let collapsed = false;
const _thinkingTimers = new WeakMap();

const SESSIONS_PER_PAGE = 30;
let loadedSessionCount = 0;
let isAdvancedSearch = false;

// --- FIX KRUSIAL: Logika debug_mode dibalik ---
const debug_mode = (typeof window.api === 'undefined');

const DEMO_RESPONSE = `# Arsitektur UI Chat Modern: Performa, Aksesibilitas, dan Skalabilitas 

Kualitas pengalaman chat bukan cuma soal "jawaban cepat". Di balik layar ada orkestrasi rendering, state, jaringan, serta strategi fallback. Berikut ringkasan keputusan arsitektural yang terbukti praktis pada aplikasi chat skala menengah–besar.

## Prioritas Performa di Lintasan Render

Sasaran utama: *responsiveness* stabil di bawah 100–150 ms untuk interaksi umum. Strategi inti:

* **Defer pekerjaan berat** ke *idle* atau *next tick*:

  * Streaming token meng-update DOM per chunk? Batasi via \`requestAnimationFrame\` atau *batching* setiap N karakter.
  * Syntax highlight: jalankan \`Prism.highlightAllUnder(container)\` **setelah** \`innerHTML\` final untuk mencegah listener hilang saat re-render.
* **Hindari layout thrash**:

  * Pakai kelas utilitas untuk show/hide (alih-alih set gaya inline berulang).
  * Kunci tinggi textarea sebelum animasi, lepas setelah transisi selesai.
* **Minimalkan repaint**:

  * Gunakan *delegasi event* pada \`document\` untuk tombol dinamis seperti \`.copy-code-btn\` dan \`.regenerate\`, sehingga tidak perlu rebind setiap render.

### Checklist mikro yang sering dilupakan

1. Cache node yang sering diakses (mis. container chat).
2. Pakai \`dataset.index\` untuk mengikat elemen ke message index.
3. Tangani kasus gagal jaringan dengan placeholder yang bisa diregenerate.

## Aksesibilitas: Small Things, Big Impact

* **Fokus & keyboard**:

  * Pastikan tombol *"Send"* dapat di-trigger \`Enter\` dan \`Space\`.
  * Escape harus menutup modal aktif terlebih dahulu, lalu menu.
* **Teks hidup (live region)**:

  * Buat SR-only status "assistant mengetik..." saat stream aktif.
* **Kontras dan tema**:

  * Pastikan minimum kontras WCAG saat dark mode.
  * Slider tema harus sinkron dengan kelas \`dark-theme\`/\`light-theme\`.

### Contoh aturan warna dasar (CSS)

\`\`\`css
/* Palet netral dengan kontras aman */
:root {
  --bg: #0b0f14;
  --panel: #121821;
  --text: #e6edf3;
  --muted: #9fb0c0;
  --accent: #4da3ff;
  --success: #3ddc97;
  --danger: #ff6b6b;
}

/* Container chat */
.chat-log-container {
  background: var(--bg);
  color: var(--text);
  overflow-y: auto;
  scrollbar-gutter: stable; /* mengurangi layout shift saat scrollbar muncul */
}

/* Tombol copy sederhana */
.copy-code-btn {
  display: inline-flex;
  gap: .5rem;
  align-items: center;
  border: 1px solid color-mix(in oklab, var(--accent) 40%, transparent);
  padding: .35rem .6rem;
  border-radius: .6rem;
  font-size: .85rem;
  cursor: pointer;
}

.copy-code-btn.copied {
  outline: 2px solid var(--success);
  outline-offset: 2px;
}
\`\`\`

## Skalabilitas State dan Stream

Arsitektur stream perlu memikirkan *cancelation*, *recovery*, dan *partial renders*.

1. **Manajemen Stream**:

   * Satu *controller* per stream; pastikan \`cancel()\` membersihkan timer/interval.
   * State \`activeStreams\` berupa map \`{ streamId: { controller, session, messageIndex, ... } }\`.

2. **Aturan interaksi**:

   * **Satu stream per sesi** untuk menghindari interleaving pesan.
   * *Regenerate* men-truncate pesan setelah indeks AI terakhir, lalu memulai stream baru.

3. **Fallback**:

   * Mode demo/latensi: gunakan interval yang mengalirkan chunk teks per 20–40 ms.
   * Kegagalan 50% progres: tampilkan UI "regenerate" non-destruktif.

### Pseudo-utility untuk stream yang aman (JS)

\`\`\`js
function withStreamBatchedRender({ onChunk, onDone, onError }) {
  let queue = '';
  let scheduled = false;

  const scheduleFlush = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (queue) { onChunk(queue); queue = ''; }
    });
  };

  return {
    handle(data) {
      if (data === null) return onDone?.();
      if (typeof data === 'string') { queue += data; scheduleFlush(); }
      else if (data?.error) onError?.(data.error);
    }
  };
}
\`\`\`

## Pola Interaksi dan UX Mikro

* **Pesan panjang** sebaiknya dipotong menjadi paragraf dengan transisi halus.
* **Copy code** memberi umpan balik visual singkat (ikon ✅ lalu kembali ke ikon 📄).
* **Welcome screen** muncul ketika belum ada sesi aktif, atau setelah pengguna menghapus semuanya.

### Hierarki tugas konten

* H1 untuk tema utama,
* H2 untuk subbagian,
* H3 untuk detail implementasi atau catatan lanjutan.

## Contoh Daftar & Penomoran

* Kapan *debounce* cocok:

  * Input pencarian sesi.
  * Resize textarea.
* Kapan *throttle* lebih pas:

  * Scroll handler pada kontainer chat.
  * Batch write untuk stream.

1. Urutan render pesan:

   1. Tambah node user (final).
   2. Sisipkan placeholder AI (non-final).
   3. Jalankan stream → update placeholder.
   4. Finalisasi: apply highlight, aktifkan aksi (copy, regenerate).
2. Urutan hapus sesi:

   1. Tampilkan konfirmasi.
   2. Hentikan stream aktif.
   3. Hapus sesi dari state.
   4. Tampilkan welcome page.

## Ringkasan Parameter Kritis

| Parameter           | Rekomendasi                       | Dampak Utama                     |
| ------------------- | --------------------------------- | -------------------------------- |
| Batch render chunk  | 16–64 karakter per frame          | Mengurangi jank saat streaming   |
| Debounce input      | 150–250 ms                        | Stabilkan pencarian & resize     |
| Kontras teks (dark) | WCAG AA/AAA                       | Keterbacaan di low light         |
| Strategi listener   | Delegasi di \`document\`            | Tahan terhadap re-render dinamis |
| Welcome state       | \`current = null\` + render welcome | UX bersih setelah "Delete all"   |

## Catatan Penutup

Keputusan kecil (delegasi event, *batching* render, tema terstandar) bikin UI chat jauh lebih tangguh. Selama rantai "input → stream → render → aksi" konsisten dan dapat dipulihkan, pengalaman pengguna bakal terasa mulus, bahkan saat jaringan lagi moody.
`;6

const streamManager = {
  activeStreams: {},

  startStream(streamId, data) {
    this.activeStreams[streamId] = { ...data, fullResponse: "" };
    updateInputState();
  },

  stopStream(streamId) {
    console.log('[SM_DEBUG] stopStream dipanggil untuk ID:', streamId);
    console.log('[SM_DEBUG] ID stream yang aktif SEBELUM dihapus:', Object.keys(this.activeStreams));
    
    if (this.activeStreams[streamId]) {
      this.activeStreams[streamId].controller?.cancel();
      const { [streamId]: _, ...rest } = this.activeStreams;
      this.activeStreams = rest;
      console.log(`[SM_DEBUG] Stream dengan ID ${streamId} telah dihapus.`);
    } else {
      console.warn(`[SM_DEBUG] stopStream dipanggil, tapi ID ${streamId} tidak ditemukan di activeStreams.`);
    }
    
    console.log('[SM_DEBUG] ID stream yang aktif SETELAH dihapus:', Object.keys(this.activeStreams));
    updateInputState();
  },

  isStreaming() {
    return Object.keys(this.activeStreams).length > 0;
  },
  
  isStreamingInSession(session) {
    if (!session) return false;
    for (const streamId in this.activeStreams) {
      if (this.activeStreams[streamId].session === session) {
        return true;
      }
    }
    return false;
  },

  shutdownGracefully() {
    if (!this.isStreaming()) return;
    for (const streamId in this.activeStreams) {
      const stream = this.activeStreams[streamId];
      stream.controller?.cancel();
    }
    this.activeStreams = {};
    save();
    updateInputState();
  }
};

function showWelcomeScreen() {
  current = null;
  $('.chat-area').classList.add('welcome-active');
  $('#chat-title').textContent = 'New Chat';
  $('#chat-tokens').textContent = 'no tokens used';
  renderSessions();
  updateInputState();
  console.log('%c[ZEN_AI] showWelcomeScreen: Switched to Welcome Page. Current session set to null.', 'color: #8a2be2');
}

// --- Utils ---
function nowISO(){ return new Date().toISOString(); }
function newSessionName(){ const d = new Date(); return `Untitled chat ${d.toTimeString().slice(0,5)}`; }
function formatUserMessage(content) {
  return esc(content).replace(/\n/g, '<br/>');
}
function esc(s){ 
  if (!s) return '';
  return s.toString().replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'", '&#39;'); 
}
function estimateTokens(s){ if (!s) return 0; return Math.ceil(s.length/4); }

const welcomeMessages = ["Ready when you are. What's up?", "Let's untangle this. Where to start?", "Problem to solve, or idea to explore?", "Alright, let's dive in. Topic today?", "I'm all ears. Tell me.", "What's that idea stuck in your head?", "Need clarity or a spark?", "No idea's too small. Share it.", "Let's act on it. What's our quest?", "Your thoughts, my focus. Go.", "What's one thing to move forward?", "Ready to build? Start me off.", "Lay it on me. What's the challenge?", "Let's find a breakthrough. Thoughts?", "Circuits buzzing. What create today?", "How can I help right now?"];

function getChatScroller() {
  return document.querySelector('.chat-log-container');
}

function scheduleThinkingText(aiNode, { shortDelay = 500, longDelay = 2000 } = {}) {
  cancelThinkingText(aiNode);
  const textEl = aiNode.querySelector('.thinking-text');
  if (!textEl) return;
  const shortId = setTimeout(() => {
    const currentTextEl = aiNode.querySelector('.thinking-text');
    if (currentTextEl) currentTextEl.textContent = 'Thinking...';
  }, shortDelay);
  const longId = setTimeout(() => {
    const currentTextEl = aiNode.querySelector('.thinking-text');
    if (currentTextEl) currentTextEl.textContent = 'Littlebit complex response, thinking longer...';
  }, longDelay);
  _thinkingTimers.set(aiNode, { shortId, longId });
}

function cancelThinkingText(aiNode) {
  const t = _thinkingTimers.get(aiNode);
  if (t) { clearTimeout(t.shortId); clearTimeout(t.longId); }
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
  if (shouldScroll) {
    requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
  }
}

function getThinkingMarkup() {
  return `<div class="thinking-container">
    <div class="typing-indicator"><span></span><span></span><span></span></div>
    <span class="thinking-text"></span>
  </div>`;
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
    let processedSrc = normalizedSrc.replace(/```(\w*)\n?([\s\S]*?)(?:```|$)/g, (match, lang, code) => {
        const placeholder = `\n__CODEBLOCK_${codeBlocks.length}__\n`;
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
            </div>`;
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
        while (listStack.length > 0) html += `</${listStack.pop().type}>`;
    };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        if (!trimmedLine) { closeOpenBlocks(); continue; }
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
            for (const header of headers) tableHtml += `<th>${parseInlineMarkdown(header)}</th>`;
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
            if (type === 'ul' && lastList?.type === 'ul' && lastList.implicit && indent < lastList.indent) indent = lastList.indent;
            else if (type === 'ul' && lastList?.type === 'ol' && indent <= lastList.indent) indent = lastList.indent + 2;
            while (listStack.length > 0 && (listStack[listStack.length - 1].indent > indent || (listStack[listStack.length - 1].indent === indent && listStack[listStack.length - 1].type !== type))) {
                html += `</${listStack.pop().type}>`;
            }
            const currentLastList = listStack.length > 0 ? listStack[listStack.length - 1] : null;
            if (!currentLastList || indent > currentLastList.indent || type !== currentLastList.type) {
                if (currentLastList && indent > currentLastList.indent) {
                    const lastLiPos = html.lastIndexOf('</li>');
                    if (lastLiPos !== -1) html = html.substring(0, lastLiPos);
                }
                const isImplicit = (type === 'ul' && currentLastList?.type === 'ol');
                const startAttr = (type === 'ol' && number > 1) ? ` start="${number}"` : '';
                html += `<${type}${startAttr}>`;
                listStack.push({ type, indent, implicit: isImplicit });
            }
            html += `<li>${parseInlineMarkdown(content)}</li>`;
        } else if (hMatch || hrMatch || codeMatch) {
            closeOpenBlocks();
            if (hMatch) html += `<h${hMatch[1].length}>${parseInlineMarkdown(hMatch[2])}</h${hMatch[1].length}>`;
            else if (hrMatch) html += '<hr>';
            else if (codeMatch) html += trimmedLine;
        } else {
            if (listStack.length > 0) {
                const lastLiPos = html.lastIndexOf('</li>');
                if (lastLiPos !== -1) html = `${html.substring(0, lastLiPos)}<br>${parseInlineMarkdown(line.trim())}</li>`;
            } else {
                paragraphBuffer.push(parseInlineMarkdown(line));
            }
        }
    }
    closeOpenBlocks(); 
    return codeBlocks.reduce((acc, block, i) => acc.replace(`__CODEBLOCK_${i}__`, block), html);
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
        if (!/^https?:\/\//i.test(href)) href = 'https://' + href;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
    html = inlineCodeBlocks.reduce((acc, block, i) => acc.replace(`__INLINE_CODE_${i}__`, block), html);
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>').replace(/___(.*?)___/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/__(.*?)__/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/_([^_]+)_/g, '<em>$1</em>');
    html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
    return html;
}

function md(src) {
  if (!src) return '';
  const cleanSrc = src.trim();
  const html = enhancedMarkdownParse(cleanSrc);
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  if (tempDiv.querySelector('pre code')) Prism.highlightAllUnder(tempDiv);
  attachCodeBlockCopyListeners(tempDiv);
  return tempDiv.innerHTML;
}

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
      if (punctuation.includes(char)) delay += punctuationDelay;
      setTimeout(type, delay);
    }
  }
  setTimeout(type, 100);
}

// function ensureSeed(s){
//   if (!s || s.seeded) return;
//   if (!s.messages) s.messages = [];
//   if (s.messages.length===0) s.messages.push(['ai','Halo! Saya ZenAI, asisten AI yang siap membantu Anda. Ada yang bisa saya bantu hari ini?']);
//   s.seeded = true;
// }

function personaSystem(){
  const { name, work, prefs } = state.settings.persona || {};
  let prompt = 'You are ZenAI, a helpful and intelligent assistant.';
  const instructions = [];
  if (name) instructions.push(`The user's name is ${name}.`);
  if (work) instructions.push(`The user works as a ${work}.`);
  if (prefs) instructions.push(`User preferences: ${prefs}`);
  if (instructions.length > 0) prompt += '\n\n--- USER PERSONALIZATION ---\n' + instructions.join('\n');
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

function buildMessagesUpTo(indexInclusive) {
  const msgs = [{ role: 'system', content: personaSystem() }];
  if (!current || !current.messages) return msgs;
  const upto = Math.max(0, Math.min(indexInclusive, current.messages.length - 1));
  for (let i = 0; i <= upto; i++) {
    const [role, content] = current.messages[i];
    if (role === 'user') msgs.push({ role: 'user', content });
    else if (role === 'ai') msgs.push({ role: 'assistant', content });
  }
  return msgs;
}

function renderSessions() {
  const ul = $('#session-list'); 
  const filter = ($('#search').value || '').toLowerCase();
  let filteredSessions = state.sessions.filter(s => s.name === null || s.name);

  if (filter) {
    filteredSessions = filteredSessions.filter(s => {
      if (s.name === null) return true;
      const nameMatch = s.name.toLowerCase().includes(filter);
      if (isAdvancedSearch) {
        const contentMatch = s.messages.some(msg => msg[1].toLowerCase().includes(filter));
        return nameMatch || contentMatch;
      }
      return nameMatch;
    });
  }
  
  ul.innerHTML = '';
  let lastDateGroup = null;

  filteredSessions.forEach(s => {
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
      placeholder.className = (s === current) ? 'active session-placeholder' : 'session-placeholder';
      placeholder.innerHTML = `<span class="name">Generating title...</span><div class="spinner"></div>`;
      placeholder.addEventListener('click', () => setCurrent(s));
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
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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
}

function updateChatHeader() {
  if (current?.name) {
    $('#chat-title').textContent = current.name;
    $('#chat-tokens').textContent = `${current.tokens_used || 0} tokens`;
  } else {
    $('#chat-title').textContent = 'ZenAI Chat';
    $('#chat-tokens').textContent = 'no tokens used';
  }
}

function addMessage(role, content, { final = false, index = -1 } = {}) {
  const log = $('#chat-log');
  const node = document.createElement('div');
  node.className = `message ${role}`;
  const copyIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
  const checkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
  const editIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
  const regenIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>`;
  const baseActions = `<div class="message-actions"></div>`;
  if (role === 'user') {
    node.innerHTML = `<div class="message-row"><div class="message-content"><div class="message-text">${formatUserMessage(content)}</div>${baseActions}</div></div>`;
  } else if (role === 'ai_cancelled') {
    const aiAvatar = `<div class="ai-avatar"><img src="../public/images/logo-chat.svg" alt="ZenAI Logo"></div>`;
    node.innerHTML = `<div class="message-row">${aiAvatar}<div class="message-content"><div class="message-text"><div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;"><span style="color: var(--fg-muted); font-style: italic;">${content}</span><button class="primary-btn regenerate-cancelled" data-session-created="${current.created_at}" data-message-index="${index}" style="height: 32px; font-size: 13px;">Regenerate?</button></div></div></div></div>`;
  } else {
    const aiAvatar = `<div class="ai-avatar"><img src="../public/images/logo-chat.svg" alt="ZenAI Logo"></div>`;
    const thinking = `<div class="thinking-container"><div class="typing-indicator"><span></span><span></span><span></span></div><span class="thinking-text"></span></div>`;
    node.innerHTML = `<div class="message-row">${aiAvatar}<div class="message-content"><div class="message-text">${final ? md(content) : thinking}</div>${baseActions}</div></div>`;
    if (role === 'ai' && !final) {
      node.style.opacity = '0';
      node.style.transform = 'translateY(20px)';
    }
  }
  log.appendChild(node);
  if (role === 'ai' && !final) {
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
      btn.className = 'copy-btn'; btn.title = 'Copy text'; btn.innerHTML = copyIconSVG;
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
      editBtn.className = 'edit-btn'; editBtn.title = 'Edit prompt'; editBtn.innerHTML = editIconSVG;
      editBtn.addEventListener('click', () => {
        if (streamManager.isStreamingInSession(current)) return;
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
      regenBtn.className = 'regen-btn'; regenBtn.title = 'Regenerate this response'; regenBtn.innerHTML = regenIconSVG;
      regenBtn.addEventListener('click', () => {
        if (streamManager.isStreamingInSession(current)) return;
        const idx = parseInt(node.dataset.index || '-1', 10);
        if (Number.isInteger(idx) && idx >= 0) regenerateFromIndex(idx);
      });
      actions.appendChild(regenBtn);
    }
  }
  scrollToBottom({ force: true });
  return node;
}

function clearLog(){ $('#chat-log').innerHTML=''; }

function renderHistory() {
  console.log(`[ZEN_AI] renderHistory: Rendering ${current?.messages?.length || 0} messages for session "${current?.name || 'none'}"`);

  clearLog();
  if (!current || !current.messages) return;
  for (let i = 0; i < current.messages.length; i++) {
    const [role, content] = current.messages[i];
    const n = addMessage(role, content, { final: true, index: i });
    n.dataset.index = String(i);
  }
  scrollToBottom({ force: true });
}

function setCurrent(s){
  console.log(`%c[ZEN_AI] setCurrent: Attempting to switch to session "${s?.name || 'undefined'}"`, 'color: #32cd32');
  if (current === s) { 
    console.log('[ZEN_AI] setCurrent: Session is already current. Aborting switch.');
    return;
  }
  current = s; 
  // ensureSeed(current); 
  $('.chat-area').classList.remove('welcome-active');
  renderHistory();
  for (const streamId in streamManager.activeStreams) {
    const stream = streamManager.activeStreams[streamId];
    if (stream.session === s) {
      const newNode = $(`#chat-log .message[data-index="${stream.messageIndex}"]`);
      if (newNode) {
        stream.aiNode = newNode;
        const contentDiv = newNode.querySelector('.message-text');
        if (contentDiv) {
          if (stream.fullResponse && stream.fullResponse.trim() !== '') {
            contentDiv.innerHTML = md(stream.fullResponse);
            if (contentDiv.querySelector('pre code')) Prism.highlightAllUnder(contentDiv);
          } else {
            contentDiv.innerHTML = getThinkingMarkup();
            scheduleThinkingText(newNode);
          }
          scrollToBottom({ force: true });
        }
      }
    }
  }
  renderSessions(); 
  updateInputState();
  console.log(`[ZEN_AI] setCurrent: Successfully switched. 'current' is now "${current.name}".`);

}

async function load(){
  try {
    console.log('[ZEN_AI] load: Attempting to load data...');
    const data = debug_mode ? JSON.parse(localStorage.getItem('zenai-data')) : await window.api.sessions.load();
    if (data) {
        state.sessions = data.sessions || [];
        state.settings = { ...state.settings, ...(data.settings || {}) };
    }
  } catch(e) { 
    console.error('[ZEN_AI] load: Failed to load data.', e);
  }
  // if (state.sessions.length === 0) {
  //   const s = { name: newSessionName(), created_at: nowISO(), messages: [], seeded: false };
  //   ensureSeed(s); 
  //   state.sessions.push(s); 
  // }
  state.sessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  console.log(`[ZEN_AI] load: Success. Loaded ${state.sessions.length} sessions.`)
  applyTheme(state.settings.theme || 'light');
  renderSessions();
  showWelcomeScreen();
  typewriterEffect($("#welcome-message"), welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)]);
  await save();
}

async function save(){ 
  try {
    console.log(`[ZEN_AI] save: Attempting to save ${state.sessions.length} sessions...`);
    const dataToSave = { sessions: state.sessions, settings: state.settings };
    if (debug_mode) {
      localStorage.setItem('zenai-data', JSON.stringify(dataToSave));
    } else {
      await window.api.sessions.save(dataToSave);
    }
  } catch(e) { console.error('[ZEN_AI] save: Failed to save data.', e); }
}

async function regenerateFromCancelled(targetButton) {
    if (!current || streamManager.isStreamingInSession(current)) return;

    const messageNode = targetButton.closest('.message.ai_cancelled');
    if (!messageNode) return;

    const messageIndex = parseInt(targetButton.dataset.messageIndex, 10);
    if (isNaN(messageIndex)) return;

    // Temukan prompt pengguna terakhir sebelum pesan yang dibatalkan ini
    const userMessages = current.messages.slice(0, messageIndex).filter(m => m[0] === 'user');
    const lastUserMessage = userMessages.pop();
    if (!lastUserMessage) return;
    const text = lastUserMessage[1];

    // Ganti placeholder 'ai_cancelled' dengan placeholder 'ai' yang kosong di state
    current.messages[messageIndex] = ['ai', ''];
    await save();

    // Buat bubble AI "thinking" yang baru
    const newNode = addMessage('ai', '', { final: false, index: messageIndex });
    newNode.dataset.index = String(messageIndex);
    
    // Ganti node placeholder lama dengan node "thinking" yang baru di DOM
    messageNode.parentNode.replaceChild(newNode, messageNode);

    // Jadwalkan teks "Thinking..." dan mulai stream baru
    scheduleThinkingText(newNode);
    const isFirstInteraction = messageIndex === 1;
    startStream(current, text, newNode, messageIndex, isFirstInteraction);
}

function updateInputState(){
  // --- LOG DIAGNOSTIK DIMULAI ---
  const isStreaming = streamManager.isStreamingInSession(current);
  const isCurrentNull = !current;
  const isDisabled = isStreaming || isCurrentNull;

  console.groupCollapsed(`%c[UI_DEBUG] updateInputState Triggered -> Form Disabled: ${isDisabled}`, 'color: #e67e22; font-weight: bold;');
  console.log(`Timestamp: ${new Date().toLocaleTimeString()}`);
  console.log(`Current Session: "${current?.name || 'null (Welcome Screen)'}"`);
  console.log(`Is Streaming in Session?: ${isStreaming}`);
  console.log(`Is Current Session Null?: ${isCurrentNull}`);
  console.groupEnd();
  // --- AKHIR LOG DIAGNOSTIK ---

  $('#msg').disabled = isDisabled;
  $('#send').disabled = isDisabled;
  if (isCurrentNull) {
      $('#msg').placeholder = "Select a session to start";
  } else if (isStreaming) {
      $('#msg').placeholder = "AI is responding...";
  } else {
      $('#msg').placeholder = "Ask anything";
  }

  const msgCentral = $('#msg-central');
  const sendCentral = $('#send-central');
  if (msgCentral && sendCentral) {
    msgCentral.disabled = false;
    sendCentral.disabled = false;
    msgCentral.placeholder = "Type to start a new chat";
  }
}


async function generateAndSetTitle(session) {
    if (!session || !session.messages || session.messages.length < 2) return;

    try {
        const userPrompt = session.messages.find(m => m[0] === 'user')?.[1] || '';
        if (!userPrompt) return; 

        let generatedTitle;
        if (debug_mode) {
            generatedTitle = `Debug: ${userPrompt.substring(0, 20)}`;
        } else {
            generatedTitle = await window.api.chat.titleSuggest(userPrompt, 'glm-4.5-flash');
        }

        if (generatedTitle) {
            session.name = generatedTitle.replace(/^(Title:\s*)|["']/g, '').trim();
            // PURE ANIMASI: Panggil updateChatHeader dan renderSessions
            // untuk mengganti placeholder spinner dengan judul baru.
            updateChatHeader();
            renderSessions();
            await save();
        }
    } catch (e) {
        console.error("Failed to generate title, but the app will continue:", e);
        // Fallback jika gagal, beri judul default agar tidak null selamanya
        if (session.name === null) {
            session.name = "Untitled Chat";
            updateChatHeader();
            renderSessions();
            await save();
        }
    }
}


// Ganti seluruh fungsi ini di renderer.js
function createStreamHandler(streamId, text, isFirstInteraction = false) {
    let fullResponse = '';
    let silenceTimer = null;
    console.log(`[STREAM_DEBUG] Handler created for stream: ${streamId}`);

    const cleanupAndSave = () => {
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
        streamManager.stopStream(streamId);
        save();
    };

    const finalize = (error = null) => {
        console.log(`[STREAM_DEBUG] FINALIZE CALLED for stream: ${streamId}`);
        const stream = streamManager.activeStreams[streamId];
        if (!stream) {
            cleanupAndSave();
            return;
        }

        const { session, aiNode, messageIndex } = stream;

        try {
            if (error) {
                console.error("Stream failed with error:", error);
                
                // FIX: Logika interrupt dipindahkan ke sini
                const placeholderText = "The response was interrupted.";
                // 1. Update state/data terlebih dahulu
                session.messages[messageIndex] = ['ai_cancelled', placeholderText];

                // 2. Buat bubble placeholder yang baru dan "fresh"
                const newNode = addMessage('ai_cancelled', placeholderText, { final: true, index: messageIndex });
                newNode.dataset.index = String(messageIndex);

                // 3. Ganti bubble "thinking" yang lama dengan placeholder yang baru
                if (aiNode && aiNode.parentNode) {
                    aiNode.parentNode.replaceChild(newNode, aiNode);
                }

            } else {
                session.messages[messageIndex] = ['ai', fullResponse];
                session.tokens_used = (session.tokens_used || 0) + estimateTokens(text) + estimateTokens(fullResponse);

                if (isFirstInteraction) {
                    generateAndSetTitle(session);
                }

                const contentDiv = aiNode.querySelector('.message-text');
                if (contentDiv) {
                    contentDiv.innerHTML = md(fullResponse);
                    if (contentDiv.querySelector('pre code')) Prism.highlightAllUnder(contentDiv);
                }
                
                const actionsContainer = aiNode.querySelector('.message-actions');
                if (actionsContainer) {
                    actionsContainer.innerHTML = '';
                    const regenBtn = document.createElement('button');
                    regenBtn.className = 'regen-btn';
                    regenBtn.title = 'Regenerate this response';
                    regenBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>`;
                    regenBtn.addEventListener('click', () => regenerateFromIndex(messageIndex));
                    
                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'copy-btn';
                    copyBtn.title = 'Copy text';
                    copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
                    copyBtn.addEventListener('click', () => {
                        navigator.clipboard.writeText(fullResponse).then(() => {
                          copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
                          copyBtn.style.color = 'var(--success)';
                          setTimeout(() => {
                              copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
                              copyBtn.style.color = 'var(--fg-muted)';
                          }, 1500);
                        });
                    });

                    actionsContainer.appendChild(copyBtn);
                    actionsContainer.appendChild(regenBtn);
                }
            }
        } catch (e) {
            console.error("Error during stream finalization UI update:", e);
            if (!error && session && session.messages) {
                session.messages[messageIndex] = ['ai', fullResponse];
            }
        } finally {
            console.log(`[STREAM_DEBUG] FINALLY BLOCK EXECUTED for stream: ${streamId}`);
            cleanupAndSave();
        }
    };
    
    const bumpSilence = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        console.log(`[STREAM_DEBUG] Silence timer triggered for stream: ${streamId}`);
        finalize(null);
      }, 1500);
    };

    return (evt) => {
      const isDone = evt === null || evt === '[DONE]' || (typeof evt === 'object' && (evt.done === true || evt.type === 'done' || evt.event === 'done'));
      if (isDone) {
        console.log(`[STREAM_DEBUG] 'isDone' signal received for stream: ${streamId}`);
        finalize(null);
        return;
      }

      if (evt && evt.error) {
        finalize(evt.error);
        return;
      }

      const stream = streamManager.activeStreams[streamId];
      if (!stream || !stream.aiNode) return;

      let token = '';
      if (typeof evt === 'string') {
        token = evt;
      } else if (evt && typeof evt === 'object') {
        if (evt.delta?.content) token = evt.delta.content;
        else if (evt.choices?.[0]?.delta?.content) token = evt.choices[0].delta.content;
        else if (evt.content) token = evt.content;
        else if (typeof evt.data === 'string') token = evt.data;
        else return;
      } else {
        return;
      }

      const contentDiv = stream.aiNode.querySelector('.message-text');
      if (contentDiv) {
        cancelThinkingText(stream.aiNode);
        fullResponse += String(token);
        stream.fullResponse = fullResponse;
        contentDiv.innerHTML = md(fullResponse);
        if (contentDiv.querySelector('pre code')) Prism.highlightAllUnder(contentDiv);

        bumpSilence();
        scrollToBottom();
      }
    };
}


async function startStream(session, text, aiNode, aiMessageIndex, isFirstInteraction = false) {
    const streamId = `${session.created_at}-${aiMessageIndex}`;
    console.log(`[ZEN_AI] startStream: Starting stream for session "${session.name}". ID: ${streamId}`);

    const messages = buildMessagesUpTo(aiMessageIndex - 1);
    const streamHandler = createStreamHandler(streamId, text, isFirstInteraction);
    if (debug_mode) {
        const isSlow = /slow/.test(text);
        const isImmediateError = /error/.test(text) && !/\d+error/.test(text);
        const errorMatch = text.match(/(\d+)error/);
        const delay = isSlow ? 250 : 80;
        const failAtPercent = errorMatch ? parseInt(errorMatch[1], 10) : null;
        if (isImmediateError) { setTimeout(() => streamHandler({ error: 'Simulated failure.' }), 500); return; }
        const chunks = DEMO_RESPONSE.split(' ');
        const failAtIndex = failAtPercent ? Math.floor(chunks.length * (failAtPercent / 100)) : -1;
        let i = 0;
        const interval = setInterval(() => {
            if (failAtIndex !== -1 && i >= failAtIndex) {
                clearInterval(interval); streamHandler({ error: `Simulated failure at ${failAtPercent}%.` }); return;
            }
            if (i < chunks.length) { streamHandler(chunks[i] + ' '); i++; } 
            else { clearInterval(interval); streamHandler(null); }
        }, delay);
        // FIX: Ubah .abort menjadi .cancel agar konsisten
        const simulatedController = { cancel: () => clearInterval(interval) };
        streamManager.startStream(streamId, { controller: simulatedController, aiNode, session, messageIndex: aiMessageIndex });
    } else {
        const controller = window.api.chat.stream(messages, 'glm-4.5-flash', streamHandler);
        streamManager.startStream(streamId, { controller, aiNode, session, messageIndex: aiMessageIndex });
    }
}

// Ganti seluruh fungsi ini di renderer.js
async function send() {
  const input = $('#msg');
  // FIX: Deklarasi 'text' dipindahkan ke atas sebelum digunakan.
  const text = (input.value || '').trim();

  console.log(`[ZEN_AI] send: Sending message in session "${current.name}". Text: "${text.substring(0, 50)}..."`);

  if (!text || !current || streamManager.isStreamingInSession(current)) return;

  current.messages.push(['user', text]);
  const userIndex = current.messages.length - 1;
  await save();

  addMessage('user', text, { final: true, index: userIndex });

  input.value = '';
  input.style.height = 'auto';

  const aiMessageIndex = current.messages.length;
  current.messages.push(['ai', '']);
  const aiNode = addMessage('ai', '', { final: false, index: aiMessageIndex });
  aiNode.dataset.index = String(aiMessageIndex);

  scheduleThinkingText(aiNode);
  const isFirstInteraction = current.messages.filter(m => m[0] === 'ai' && m[1]).length === 0;
  startStream(current, text, aiNode, aiMessageIndex, isFirstInteraction);
}


// Ganti seluruh fungsi ini di renderer.js
async function sendFromWelcome() {
    const input = $('#msg-central');  
    const text = (input.value || '').trim();

    console.log(`[ZEN_AI] sendFromWelcome: Creating new session from welcome page. Text: "${text.substring(0, 50)}..."`);
    
    if (!text || streamManager.isStreaming()) return; 

    // PURE ANIMASI: Buat sesi dengan name: null untuk memicu placeholder loading
    const s = { 
      name: null, 
      created_at: nowISO(), 
      messages: [['user', text]], 
      seeded: true 
    };
    state.sessions.unshift(s);
    
    // Langsung setCurrent agar placeholder muncul dan aktif
    setCurrent(s); 
    await save();
    input.value = '';

    const aiMessageIndex = s.messages.length;
    s.messages.push(['ai', '']);
    const aiNode = addMessage('ai', '', { final: false, index: aiMessageIndex });
    aiNode.dataset.index = String(aiMessageIndex);
    
    scheduleThinkingText(aiNode);
    startStream(s, text, aiNode, aiMessageIndex, true);
}

// Ganti seluruh fungsi ini di renderer.js
async function regenerateFromIndex(aiIndex) {
    if (!current || streamManager.isStreamingInSession(current)) return;

    const userMessages = current.messages.slice(0, aiIndex).filter(m => m[0] === 'user');
    const lastUserMessage = userMessages.pop();
    if (!lastUserMessage) return;

    const text = lastUserMessage[1];
    
    current.messages.length = aiIndex;
    
    await save();
    renderHistory();

    const newAiMessageIndex = current.messages.length;
    current.messages.push(['ai', '']);
    const aiNode = addMessage('ai', '', { final: false, index: newAiMessageIndex });
    aiNode.dataset.index = String(newAiMessageIndex);
    
    scheduleThinkingText(aiNode);
    const isFirstInteraction = aiIndex === 1;
    startStream(current, text, aiNode, newAiMessageIndex, isFirstInteraction);
}

function deleteSession(sessionToDelete) {
    if (!sessionToDelete) return;
    state.sessions = state.sessions.filter(s => s !== sessionToDelete);
    if (current === sessionToDelete) showWelcomeScreen();
    else renderSessions();
    save();
}

function deleteCurrentSession() {
    if (!current) return;
    showConfirmationModal('Delete Current Session', `Are you sure you want to delete "${current.name}"?`, () => deleteSession(current));
}

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

// Helper kecil buat logging yang rapi + timestamp
function trace(action, meta = {}) {
    try {
        const base = { ts: new Date().toISOString(), ...meta };
        console.log(`[UI] ${action}`, base);
    } catch {
        console.log(`[UI] ${action}`);
    }
}

function setupEventListeners() {
    $('#minimize-btn').addEventListener('click', () => {
        trace('click:minimize', { id: 'minimize-btn' });
        window.api?.window.minimize();
    });

    $('#maximize-btn').addEventListener('click', () => {
        trace('click:maximize', { id: 'maximize-btn' });
        window.api?.window.maximize();
    });

    $('#close-btn').addEventListener('click', () => {
        trace('click:close', { id: 'close-btn' });
        window.api?.window.close();
    });

    $('#msg').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            trace('keydown:msg -> send()', { id: 'msg', key: e.key, shift: e.shiftKey });
            send();
        }
    });

    $('#send').addEventListener('click', () => {
        trace('click:send', { id: 'send' });
        send();
    });

    $('#new-chat').addEventListener('click', () => {
        trace('click:new-chat', { id: 'new-chat' });
        showWelcomeScreen();
    });

    $('#trigger-delete-session').addEventListener('click', () => {
        trace('click:trigger-delete-session', { id: 'trigger-delete-session' });
        deleteCurrentSession();
    });

    $('#open-settings').addEventListener('click', (e) => {
        e.stopPropagation();
        const willShow = $('#settings-menu').classList.contains('hidden');
        trace('click:open-settings -> toggle menu', { id: 'open-settings', willShow });
        $('#settings-menu').classList.toggle('hidden');
    });

    $('#open-persona-settings').addEventListener('click', () => {
        const { name, work, prefs } = state.settings.persona;
        trace('click:open-persona-settings', { hasName: !!name, hasWork: !!work, hasPrefs: !!prefs });
        $('#persona-name').value = name || '';
        $('#persona-work').value = work || '';
        $('#persona-prefs').value = prefs || '';
        $('#settings-modal').classList.remove('hidden');
        $('#settings-menu').classList.add('hidden');
    });

    $('#close-modal').addEventListener('click', () => {
        trace('click:close-modal', { id: 'close-modal' });
        $('#settings-modal').classList.add('hidden');
    });

    $('#close-settings').addEventListener('click', () => {
        trace('click:close-settings', { id: 'close-settings' });
        $('#settings-modal').classList.add('hidden');
    });

    $('#save-settings').addEventListener('click', async () => {
        const persona = {
            name: $('#persona-name').value.trim(),
            work: $('#persona-work').value.trim(),
            prefs: $('#persona-prefs').value.trim(),
        };
        trace('click:save-settings -> save()', { hasName: !!persona.name, hasWork: !!persona.work, hasPrefs: !!persona.prefs });
        state.settings.persona = persona;
        await save();
        $('#settings-modal').classList.add('hidden');
        trace('save-settings:done -> modal hidden');
    });

    $('#delete-all').addEventListener('click', () => {
        trace('click:delete-all -> confirm');
        showConfirmationModal('Delete All Sessions', 'Are you sure?', async () => {
          trace('confirm:delete-all:accepted');

          streamManager.shutdownGracefully();

          state.sessions = [];
          current = null;

          await save();

          $('#settings-modal').classList.add('hidden');
          showWelcomeScreen();

          trace('delete-all:completed -> sessions cleared & switched to welcome', { sessionsCount: state.sessions.length });
        });
    });

    $('#search').addEventListener('input', () => {
        trace('input:search -> renderSessions', { valueLength: $('#search').value.length });
        renderSessions();
    });

    $('#advanced-search-switch').addEventListener('change', (e) => {
        isAdvancedSearch = e.target.checked;
        trace('change:advanced-search-switch', { checked: isAdvancedSearch });
        renderSessions();
    });

    $('#theme-slider').addEventListener('change', () => {
        trace('change:theme-slider -> toggleTheme');
        toggleTheme();
    });

    $('#settings-modal .modal-overlay').addEventListener('click', () => {
        trace('click:modal-overlay -> hide settings-modal');
        $('#settings-modal').classList.add('hidden');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            trace('keydown:Escape -> close modals/menus');
            $('#settings-modal').classList.add('hidden');
            $('#confirm-modal').classList.add('hidden');
            $('#settings-menu').classList.add('hidden');
        }
    });

    $('#msg-central').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            trace('keydown:msg-central -> sendFromWelcome()', { key: e.key, shift: e.shiftKey });
            sendFromWelcome();
        }
    });

    $('#send-central').addEventListener('click', () => {
        trace('click:send-central -> sendFromWelcome');
        sendFromWelcome();
    });

    document.addEventListener('click', (event) => {
        const copyBtn = event.target.closest('.copy-code-btn');
        if (copyBtn) {
          const block = copyBtn.closest('.code-block-container');
          const codeEl = block?.querySelector('pre code');

          const checkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
          const copyIconSVG  = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

          if (!codeEl) return;

          const originalLabel = copyBtn.querySelector('span')?.textContent || 'Copy';
          navigator.clipboard.writeText(codeEl.textContent).then(() => {
            copyBtn.innerHTML = `${checkIconSVG} <span>Copied!</span>`;
            copyBtn.classList.add('copied');
            setTimeout(() => {
              copyBtn.innerHTML = `${copyIconSVG} <span>${originalLabel}</span>`;
              copyBtn.classList.remove('copied');
            }, 2000);
          }).catch(err => {
            console.error('Failed to copy text: ', err);
            const span = copyBtn.querySelector('span');
            if (span) span.textContent = 'Failed!';
          });
        }

        if (!$('#settings-container').contains(event.target)) {
            trace('doc:click outside settings -> hide menu', { targetId: event.target?.id || null });
            $('#settings-menu').classList.add('hidden');
        }

        const regenCancelledTarget = event.target.closest('.regenerate-cancelled');
        if (regenCancelledTarget) {
            const messageIndex = parseInt(regenCancelledTarget.dataset.messageIndex, 10);
            trace('click:.regenerate-cancelled -> regenerateFromCancelled', { messageIndex });
            regenerateFromCancelled(regenCancelledTarget);
        }
    });

    trace('setupEventListeners:initialized');
}


function initializeApp() {
  console.log('%c[ZEN_AI] App Initializing...', 'color: #007acc; font-weight: bold;');

  setupEventListeners();
  setupMobileSidebar();
  setupTextareaResize();
  setupTextareaCentralResize();
  setupResponsiveHandlers();
  window.addEventListener('beforeunload', () => { streamManager.shutdownGracefully(); });
  load();
}

document.addEventListener('DOMContentLoaded', initializeApp);