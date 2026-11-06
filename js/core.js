'use strict';
// Shared helpers, fake code, skins, app state, colours, presence helpers

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const editor = $('editor'), term = $('term'), inp = $('inp');
const store = {
  get(k, d){ try{ const v = localStorage.getItem('sc_'+k); return v==null?d:v }catch(e){ return d } },
  set(k, v){ try{ localStorage.setItem('sc_'+k, v) }catch(e){} },
  del(k){ try{ localStorage.removeItem('sc_'+k) }catch(e){} }
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const hash = s => { let h = 2166136261; for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h,16777619) } return h>>>0 };
const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ seed>>>15, 1|seed); t = t + Math.imul(t ^ t>>>7, 61|t) ^ t; return ((t ^ t>>>14)>>>0)/4294967296 };
const hex7 = () => Math.random().toString(16).slice(2,9);
const hhmm = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0') };
const hhmmss = ms => new Date(ms).toTimeString().slice(0,8);
const isMobile = () => window.matchMedia('(max-width:760px)').matches;
async function roomKey(code){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('stealth-chat:' + code.trim()));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('').slice(0, 32);
}
const b64u = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64u = s => decodeURIComponent(escape(atob(s.replace(/-/g,'+').replace(/_/g,'/'))));

// ---------- invite link in the URL: read it, then wipe it from the address bar ----------
let inviteCode = null;
try {
  const m = location.hash.match(/^#j=([A-Za-z0-9_-]+)/);
  if (m) { inviteCode = unb64u(m[1]).slice(0, 200); history.replaceState(null, '', location.pathname + location.search); }
} catch(e){ inviteCode = null; }

// ---------- syntax highlight ----------
const KW = 'import|from|export|const|let|var|function|return|if|else|await|async|new|class|extends|implements|interface|type|for|of|in|try|catch|finally|throw|this|private|public|protected|readonly|static|while|break|continue|switch|case|default|null|undefined|true|false|void|as';
const CTRL = /^(import|from|export|return|if|else|await|for|of|in|try|catch|finally|throw|while|break|continue|switch|case|default)$/;
const RE = new RegExp(`(\\/\\/.*$)|('(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|\`[^\`]*\`)|\\b(${KW})\\b|\\b(\\d+)\\b|(@[A-Za-z]+)|\\b([A-Z][A-Za-z0-9_]*)\\b|\\b([a-zA-Z_$][\\w$]*)(?=\\s*[(<])`, 'g');
function hl(line){
  let out = '', last = 0, m;
  RE.lastIndex = 0;
  while ((m = RE.exec(line))){
    out += esc(line.slice(last, m.index));
    const t = m[0];
    if (m[1]) out += `<span class="cm">${esc(t)}</span>`;
    else if (m[2]) out += `<span class="s">${esc(t)}</span>`;
    else if (m[3]) out += `<span class="${CTRL.test(t)?'k2':'k'}">${t}</span>`;
    else if (m[4]) out += `<span class="n">${t}</span>`;
    else if (m[5]) out += `<span class="fn">${esc(t)}</span>`;
    else if (m[6]) out += `<span class="t">${esc(t)}</span>`;
    else if (m[7]) out += `<span class="fn">${esc(t)}</span>`;
    last = m.index + t.length;
    if (t.length === 0) RE.lastIndex++;
  }
  return out + esc(line.slice(last));
}

// ---------- fake code ----------
const HEADER = [
  "import { Injectable, Logger } from '@nestjs/common';",
  "import { RedisService } from '../infra/redis.service';",
  "import { OrderRepository } from './order.repository';",
  "import { MetricsService } from '../shared/metrics';",
  "import type { SyncPayload, RetryPolicy, SyncResult } from './types';",
  "",
  "const DEFAULT_RETRY: RetryPolicy = { attempts: 3, backoffMs: 250 };",
  "const BATCH_SIZE = 50;",
  "",
  "@Injectable()",
  "export class SyncService {",
  "  private readonly logger = new Logger(SyncService.name);",
  "",
  "  constructor(",
  "    private readonly redis: RedisService,",
  "    private readonly orders: OrderRepository,",
  "    private readonly metrics: MetricsService,",
  "  ) {}",
  "",
];
const METHODS = [
  "  async processQueue(batch: SyncPayload[]): Promise<SyncResult> {",
  "  private async reconcile(orderId: string, policy = DEFAULT_RETRY) {",
  "  async flushPending(limit = BATCH_SIZE): Promise<number> {",
  "  private buildCacheKey(tenant: string, id: string): string {",
  "  async handleWebhook(event: SyncPayload): Promise<void> {",
  "  private async withRetry<T>(fn: () => Promise<T>, policy: RetryPolicy): Promise<T> {",
  "  async rebuildIndex(tenantId: string): Promise<void> {",
];
const BLOCKS = [
  ["const started = Date.now();"],
  ["const key = this.buildCacheKey(payload.tenant, payload.id);"],
  ["const cached = await this.redis.get(key);", "if (cached) return JSON.parse(cached);"],
  ["if (!batch?.length) {", "  return { processed: 0, failed: 0 };", "}"],
  ["this.metrics.increment('sync.batch', { size: batch.length });"],
  ["const pending = await this.orders.findPending({ limit });"],
  ["for (const item of batch) {", "  await this.reconcile(item.orderId);", "}"],
  ["const result = await this.withRetry(() => this.orders.upsert(payload), DEFAULT_RETRY);"],
  ["await this.redis.set(key, JSON.stringify(result), 'EX', 300);"],
  ["this.logger.debug(`reconciled ${orderId} in ${Date.now() - started}ms`);"],
  ["try {", "  await this.orders.markSynced(ids);", "} catch (err) {", "  this.logger.warn(`markSynced failed: ${err.message}`);", "}"],
  ["const chunks = chunk(pending, BATCH_SIZE);"],
  ["if (attempt >= policy.attempts) throw err;"],
  ["await sleep(policy.backoffMs * 2 ** attempt);"],
  ["const failed = results.filter((r) => r.status === 'rejected').length;"],
  ["const tenant = event.headers['x-tenant-id'] ?? 'default';"],
  ["this.metrics.timing('sync.latency', Date.now() - started);"],
  ["const ids = pending.map((o) => o.id);"],
  [""],
  [""],
];
const CLOSERS = [["return { processed: batch.length, failed };"], ["return result;"], ["return ids.length;"], []];

// ---------- skins ----------
const SKINS = ['vscode', 'excel', 'notion', 'terminal'];
const FILES = [
  ['sync.service.ts', 'orders', 'SyncService'],
  ['order.repository.ts', 'orders', 'OrderRepository'],
  ['auth.guard.ts', 'auth', 'AuthGuard'],
  ['redis.service.ts', 'infra', 'RedisService'],
  ['tenant.middleware.ts', 'shared', 'TenantMiddleware'],
  ['metrics.service.ts', 'shared', 'MetricsService'],
];
const SHEETS = ['Orders', 'Inventory', 'Q4 Summary', 'Pivot', 'Returns', 'Forecast'];
const PAGES = ['Q4 Sync Notes', 'Order Pipeline Review', 'Auth Migration Plan', 'Infra Weekly', 'Tenant Onboarding', 'Metrics Roadmap'];
const TMUX = ['sync', 'orders', 'auth', 'redis', 'tenant', 'metrics'];
const MAX_ROOMS = FILES.length;
const fileOf = i => FILES[i % FILES.length];
const MENU_LABELS = {
  vscode:   ['File', 'Edit', 'Selection', 'View', 'Go', 'Run', 'Terminal', 'Help'],
  excel:    ['File', 'Home', 'Insert', 'View', 'Formulas', 'Data', 'Review', 'Help'],
  notion:   ['File', 'Edit', '', 'View', '', '', '', 'Help'],
  terminal: ['Shell', 'Edit', '', 'View', '', '', 'Window', 'Help'],
};
function tabLabel(i){
  if (skin === 'excel') return SHEETS[i % SHEETS.length];
  if (skin === 'notion') return PAGES[i % PAGES.length];
  if (skin === 'terminal') return `${i}:${TMUX[i % TMUX.length]}`;
  return fileOf(i)[0];
}
function docName(v){   // what a document tab is called in the current skin
  const n = { board: { vscode: 'CHANGELOG.md', excel: 'Changelog', notion: 'Team Updates', terminal: 'git-log' },
              notes: { vscode: 'TODO.md', excel: 'Tasks', notion: 'My Tasks', terminal: 'todo' },
              recipe: { vscode: 'recipe.md', excel: 'recipe', notion: 'recipe', terminal: 'recipe' } }[v];
  if (n) return n[skin];
  if (v === 'book' && book) return skin === 'vscode' ? bookFile(book.id) : bookTabLabel();
  return '';
}
function shownName(){ return view === 'room' ? (skin === 'notion' ? PAGES[active % PAGES.length] : fileOf(active)[0]) : docName(view); }
function windowTitle(){
  if (skin === 'excel') return 'Q4_order_sync.xlsx - Excel';
  if (skin === 'notion') return shownName();
  if (skin === 'terminal') return 'zsh — api-gateway';
  return `${shownName()} — api-gateway — Visual Studio Code`;
}

// ---------- state ----------
let myId = null, db = null, rtdb = null;
let style = store.get('style', 'comment');
let skin = SKINS.includes(store.get('skin', '')) ? store.get('skin', '') : 'vscode';
let nick = '';            // = account display name (fixed at registration)
let auth = null;
let boardOpen = false, notesOpen = false;
let myTodos = [], myPad = { text: '', ms: 0 }, padUnsub = null, todoUnsub = null;
let book = null;          // open book: {room, id, meta, chunks, page, total, notes, seen, first, unsub}
let panic = false, scrollBottom = true;
let view = 'room', recipeOpen = false;
let alertMode = store.get('alert', 'on');
let replyTo = null;
// rooms: [{code, id, msgs, seen, first, unread, unsub, peers, presOff}]
let rooms = [];
let active = 0;
(() => {
  let codes = [];
  try { codes = JSON.parse(store.get('rooms', '[]')) || []; } catch(e){}
  const legacy = store.get('room', '');
  if (!codes.length && legacy) codes = [legacy];
  rooms = codes.slice(0, MAX_ROOMS).map(newRoom);
  active = Math.min(+store.get('active', '0') || 0, Math.max(0, rooms.length - 1));
})();
function newRoom(code){ return { code, id: null, msgs: [], seen: new Set(), first: true, unread: 0, unsub: null, peers: {}, presOff: null, board: [], boardSeen: new Set(), boardFirst: true, boardUnsub: null }; }
function cur(){ return rooms[active]; }
const saveRooms = () => { store.set('rooms', JSON.stringify(rooms.map(r => r.code))); store.set('active', String(active)); store.del('room'); };

// ---------- colours ----------
const MY_COLOR = '#6cb6ff';
const PALETTE = ['#89c26d', '#e5a35f', '#e08cc4', '#d4c160', '#b79cf2', '#f08a7e', '#6fd1bd'];
// each friend gets the least-used colour the first time they appear, then keeps it (remembered in this browser)
const colorMap = (() => { try { return JSON.parse(store.get('colors', '{}')) || {}; } catch(e){ return {}; } })();
function colorOfUid(uid, name){
  if (uid && uid === myId) return MY_COLOR;
  if (!uid) return PALETTE[hash(String(name)) % PALETTE.length];
  if (!(uid in colorMap)) {
    const counts = PALETTE.map((_, i) => Object.values(colorMap).filter(v => v === i).length);
    colorMap[uid] = counts.indexOf(Math.min(...counts));
    store.set('colors', JSON.stringify(colorMap));
  }
  return PALETTE[colorMap[uid] % PALETTE.length];
}
const colorOf = m => colorOfUid(m.uid, m.name);
const displayName = m => String(m.name || 'dev').slice(0, 16);
const imgName = id => 'IMG_' + String(1000 + hash(String(id)) % 9000);

// ---------- presence (who is here / typing) ----------
function peersOf(r){
  const p = (r && r.peers) || {};
  return Object.entries(p).filter(([, v]) => v && typeof v === 'object').map(([uid, v]) => ({ uid, name: String(v.name || 'dev').slice(0,16), typing: !!v.typing, away: !!v.away, rb: typeof v.rb === 'string' ? v.rb : null, rp: typeof v.rp === 'number' ? v.rp : null }));
}
function typers(){
  if (panic || view !== 'room') return [];
  return peersOf(cur()).filter(p => p.typing && p.uid !== myId);
}
let lastTypersKey = '';
function updatePeers(){
  const ps = peersOf(cur());
  $('peerN').textContent = Math.max(1, ps.length || (myId ? 1 : 0));
  const key = typers().map(p => p.uid).join(',');
  if (key !== lastTypersKey) { lastTypersKey = key; render(); }
  else if (view === 'book') { const h = document.querySelector('.bkreaders'); if (h) h.innerHTML = readersHtml(); onBookPresence(); }
}
