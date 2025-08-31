# Electron Chat – Precise Build

Features:
- User bubble kanan (max 80%), AI full-width tanpa bubble.
- **Realtime Markdown streaming** (throttled per frame).
- **Auto-title** dari pesan pertama user.
- **Full history** terkirim ke API (user/assistant + system persona).
- Sidebar **expand/collapse**, **Search chats**, **Settings** (persona) + **Delete all**.
- **Delete session** via menu `⋯` pada hover.
- **Seed greeting** saat session kosong.
- **Token used** per session (estimasi ≈ chars/4).

## Run
```bash
npm install
# macOS/Linux
BASE_URL="https://api.z.ai/api/paas/v4/" Z_API_KEY="sk-..." npm run start
# Windows (PowerShell)
$env:BASE_URL="https://api.z.ai/api/paas/v4/"; $env:Z_API_KEY="sk-..."; npm run start
```

> Note: request dilakukan di **main process** (HTTPS) untuk menghindari CORS. Jangan commit API key.
