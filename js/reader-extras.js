'use strict';
// Reader settings, contents, find, comment list, follow mode, reading stats

// ---------- reader comfort settings (font size, spacing, width, font, contrast) ----------
const RS_DEFAULT = { fs: 16, lh: 1.8, w: 'm', ff: 'sans', soft: true, focus: false };
let rs = (() => { try { return Object.assign({}, RS_DEFAULT, JSON.parse(store.get('reader', '{}'))); } catch(e){ return { ...RS_DEFAULT }; } })();
const RS_WIDTH = { s: '560px', m: '720px', l: '920px', f: '100%' };
function saveRs(){ store.set('reader', JSON.stringify(rs)); }
function bkAttrs(){
  return `class="bk ff-${rs.ff}${rs.soft ? ' soft' : ''}" style="--bfs:${rs.fs}px;--blh:${rs.lh};--bw:${isMobile() ? '100%' : RS_WIDTH[rs.w]}"`;
}
function applyRsLive(){
  const el = editor.querySelector('.bk[data-book]');
  if (!el) return;
  const frac = editor.scrollTop / Math.max(1, editor.scrollHeight);
  el.className = `bk ff-${rs.ff}${rs.soft ? ' soft' : ''}`;
  el.style.setProperty('--bfs', rs.fs + 'px'); el.style.setProperty('--blh', rs.lh);
  el.style.setProperty('--bw', isMobile() ? '100%' : RS_WIDTH[rs.w]);
  editor.scrollTop = frac * editor.scrollHeight;
}
function applyFocus(){ document.body.classList.toggle('reading-focus', view === 'book' && !!rs.focus && !panic); }
function setRs(k, v){
  if (k === 'fs') v = Math.max(11, Math.min(28, v));
  rs[k] = v; saveRs(); applyRsLive();
}
function rsPanelHtml(){
  const seg = (k, opts) => `<span class="seg">${opts.map(([v, l]) => `<b class="${String(rs[k]) === String(v) ? 'on' : ''}" data-rs="${k}" data-v="${v}">${l}</b>`).join('')}</span>`;
  return `<div class="rs">
    <div class="row"><span>Font size</span><span class="seg"><b data-rs="fs" data-v="-1">A−</b><span class="val">${rs.fs}</span><b data-rs="fs" data-v="+1">A+</b></span></div>
    <div class="row"><span>Line height</span>${seg('lh', [[1.5, 'Tight'], [1.8, 'Normal'], [2.1, 'Loose']])}</div>
    <div class="row"><span>Width</span>${seg('w', [['s', 'Narrow'], ['m', 'Medium'], ['l', 'Wide'], ['f', 'Full']])}</div>
    <div class="row"><span>Font</span>${seg('ff', [['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono']])}</div>
    <div class="row"><span>Soft contrast</span>${seg('soft', [['true', 'On'], ['false', 'Off']])}</div>
    <div class="row"><span>Bottom panel</span>${seg('focus', [['false', 'Show'], ['true', 'Hide']])}</div>
    <div class="row"><span></span><span class="seg"><b data-rs="reset" data-v="1">Reset</b></span></div>
    <div class="tip">Keys: ← → turn pages · − = font size${rs.focus ? ' · the panel comes back when you switch to a chat tab' : ''}</div></div>`;
}
function openRsPanel(anchor){
  const dd = $('dropdown');
  menuActions = [];
  dd.innerHTML = rsPanelHtml();
  dd.hidden = false; dd.dataset.rs = '1';
  const r = anchor.getBoundingClientRect();
  dd.style.top = (r.bottom + 4) + 'px';
  dd.style.left = Math.max(4, Math.min(r.left, window.innerWidth - dd.offsetWidth - 4)) + 'px';
}
$('dropdown').addEventListener('click', e => {
  const b = e.target.closest('[data-rs]'); if (!b) return;
  e.stopPropagation();
  const k = b.dataset.rs, v = b.dataset.v;
  if (k === 'reset') { rs = { ...RS_DEFAULT }; saveRs(); applyRsLive(); applyFocus(); }
  else if (k === 'fs') setRs('fs', rs.fs + (+v));
  else if (k === 'lh') setRs('lh', +v);
  else if (k === 'soft') setRs('soft', v === 'true');
  else if (k === 'focus') { setRs('focus', v === 'true'); applyFocus(); }
  else setRs(k, v);
  $('dropdown').innerHTML = rsPanelHtml();
}, true);
// remember where on the page you were
let scrollSaveT = null;
editor.addEventListener('scroll', () => {
  if (view !== 'book' || !book) return;
  clearTimeout(scrollSaveT);
  const b = book;
  scrollSaveT = setTimeout(() => { if (book === b && view === 'book') store.set('bsc_' + b.id, `${b.page}:${(editor.scrollTop / Math.max(1, editor.scrollHeight)).toFixed(4)}`); }, 400);
});
function restoreBookScroll(){
  if (!book) return;
  const [p, f] = String(store.get('bsc_' + book.id, '')).split(':');
  if (+p === book.page && f) requestAnimationFrame(() => { editor.scrollTop = (+f) * editor.scrollHeight; });
}
// keyboard: ← → pages, − = font size (only when you're not typing somewhere)
document.addEventListener('keydown', e => {
  if (view !== 'book' || !book || panic || !$('qi').hidden) return;
  const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goPage(book.page + 1); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goPage(book.page - 1); }
  else if (e.key === '-' || e.key === '_') { e.preventDefault(); setRs('fs', rs.fs - 1); }
  else if (e.key === '=' || e.key === '+') { e.preventDefault(); setRs('fs', rs.fs + 1); }
});


// ---------- contents (table of chapters) ----------
const HEAD_RE1 = /^第\s*[0-9０-９零〇一二两三四五六七八九十百千]+\s*[章节節回卷集部篇話话幕]/;
const HEAD_RE2 = /^(序章|序言|序幕|序|前言|引子|楔子|尾声|尾聲|后记|後記|终章|終章|番外|附录|附錄)(\s|[:：.、·—\-（(]|$)/;
const HEAD_RE3 = /^((chapter|part|book)\s+([0-9]+|[ivxlc]+)\b|prologue\b|epilogue\b|interlude\b)/i;
const isHeading = t => t.length <= 40 && (HEAD_RE1.test(t) || HEAD_RE2.test(t) || HEAD_RE3.test(t) || /^番外/.test(t));
function buildToc(chunks, chapterTitles){
  const extra = new Set((chapterTitles || []).map(x => String(x).trim()).filter(x => x && x.length <= 40));
  const toc = []; let page = 0;
  chunks.forEach(c => {
    c.pageStarts.forEach((ps, lp) => {
      const pe = c.pageStarts[lp + 1] ?? c.paras.length;
      for (let i = ps; i < pe; i++) {
        const t = String(c.paras[i]).trim();
        if ((isHeading(t) || extra.has(t)) && toc.length < 500 && !(toc.length && toc[toc.length - 1].t === t)) toc.push({ t, p: page });
      }
      page++;
    });
  });
  return toc;
}
async function loadAllChunks(label){
  const b = book;
  const missing = [];
  for (let c = 0; c < b.meta.chunks; c++) if (!b.chunks.has(c)) missing.push(c);
  for (let k = 0; k < missing.length; k++) {
    if (missing.length > 1) termLine(`<span class="d1">${label}: loading part ${k + 1}/${missing.length}…</span>`);
    const s = await getDoc(doc(db, 'rooms', b.room.id, 'books', b.id, 'chunks', String(missing[k])));
    if (s.exists()) b.chunks.set(missing[k], s.data());
  }
  return b;
}
async function ensureToc(){
  const b = book;
  if (b.toc) return b.toc;
  await loadAllChunks('contents');
  const chunks = []; for (let c = 0; c < b.meta.chunks; c++) chunks.push(b.chunks.get(c) || { paras: [], pageStarts: [] });
  b.toc = buildToc(chunks, []);
  if (b.meta.uid === myId) updateDoc(doc(db, 'rooms', b.room.id, 'books', b.id), { toc: b.toc }).catch(() => {});   // save it for everyone
  return b.toc;
}
function currentChapter(){
  if (!book || !book.toc || !book.toc.length) return '';
  let cur = '';
  for (const e of book.toc) { if (e.p <= book.page) cur = e.t; else break; }
  return cur;
}
async function openToc(){
  const b = book;
  let toc;
  try { toc = await ensureToc(); } catch (e) { termLine(`<span class="r1">error: ${esc(e?.code || e?.message || 'unknown')}</span>`); return; }
  if (book !== b) return;
  if (!toc.length) { showToast('No chapters found<small>this book has no recognisable chapter headings — use Go to… or Find</small>', null); return; }
  const cur = currentChapter();
  const items = toc.map(e => ({ label: (e.t === cur ? '▸ ' : '') + e.t, detail: `p.${e.p + 1}`, value: e.p }));
  render();   // header now shows the chapter name
  const p = await quickPick(`Contents — ${b.meta.title || ''}`, items, 'Type to filter chapters');
  if (p != null && book === b) goPage(p);
}

// ---------- find in book ----------
async function searchBook(q){
  const b = book;
  q = String(q).trim(); if (!q) return;
  try { await loadAllChunks('find'); } catch (e) { termLine(`<span class="r1">error: ${esc(e?.code || 'unknown')}</span>`); return; }
  if (book !== b) return;
  const ql = q.toLowerCase(), res = [];
  let page = 0, base = 0;
  for (let c = 0; c < b.meta.chunks && res.length < 300; c++) {
    const ch = b.chunks.get(c) || { paras: [], pageStarts: [] };
    ch.pageStarts.forEach((ps, lp) => {
      const pe = ch.pageStarts[lp + 1] ?? ch.paras.length;
      for (let i = ps; i < pe && res.length < 300; i++) {
        const t = String(ch.paras[i]), k = t.toLowerCase().indexOf(ql);
        if (k >= 0) res.push({ p: page, g: base + i, snip: (k > 18 ? '…' : '') + t.slice(Math.max(0, k - 18), k + q.length + 30).replace(/\s+/g, ' ') + (k + q.length + 30 < t.length ? '…' : '') });
      }
      page++;
    });
    base += b.meta.paras[c];
  }
  b.hl = q;
  if (!res.length) { render(); showToast(`No results for “${esc(q)}”`, null); return; }
  const pickd = await quickPick(`Find “${q}” — ${res.length}${res.length >= 300 ? '+' : ''} result${res.length > 1 ? 's' : ''}`, res.map(r => ({ label: r.snip, detail: `p.${r.p + 1}`, value: r })), 'Type to narrow down');
  if (book !== b) return;
  if (pickd) goPage(pickd.p, pickd.g); else render();
}

// ---------- notes overview ----------
async function pageOfPara(g){
  const b = book;
  let acc = 0, base = 0;
  for (let c = 0; c < b.meta.paras.length; c++) {
    if (g < base + b.meta.paras[c]) {
      if (!b.chunks.has(c)) { const s = await getDoc(doc(db, 'rooms', b.room.id, 'books', b.id, 'chunks', String(c))); if (s.exists()) b.chunks.set(c, s.data()); }
      const ch = b.chunks.get(c); const local = g - base; let lp = 0;
      if (ch) ch.pageStarts.forEach((ps, i) => { if (ps <= local) lp = i; });
      return acc + lp;
    }
    acc += b.meta.pages[c]; base += b.meta.paras[c];
  }
  return b.page;
}
async function openNotesList(){
  const b = book;
  const tops = b.notes.filter(n => !n.parent).slice().sort((x, y) => x.para - y.para || x.ms - y.ms);
  if (!tops.length) { showToast('No comments yet<small>select text and click 💬 Comment, or click a paragraph number</small>', null); return; }
  const replies = id => b.notes.filter(n => n.parent === id).length;
  const items = tops.map(n => ({ label: `${displayName(n)}: ${n.text}`, detail: `¶${n.para + 1}${n.quote ? ' · “' + n.quote.slice(0, 16) + (n.quote.length > 16 ? '…' : '') + '”' : ''}${replies(n.id) ? ' · ' + replies(n.id) + ' repl' + (replies(n.id) > 1 ? 'ies' : 'y') : ''}`, value: n }));
  const n = await quickPick(`Comments — ${tops.length}`, items, 'Type to filter by name or text');
  if (n && book === b) goPage(await pageOfPara(n.para), n.para);
}

// ---------- read along with a friend ----------
let followUid = null;
function startFollow(uid){
  const p = peersOf(book.room).find(x => x.uid === uid);
  if (!p) return;
  followUid = uid;
  showToast(`Following ${esc(p.name)}<small>pages turn with theirs · turn a page yourself to stop</small>`, null);
  onBookPresence(); render();
}
function stopFollow(why){
  if (!followUid) return;
  const p = book && peersOf(book.room).find(x => x.uid === followUid);
  followUid = null;
  showToast(`Stopped following${p ? ' ' + esc(p.name) : ''}${why ? `<small>${esc(why)}</small>` : ''}`, null);
  const h = document.querySelector('.bkreaders'); if (h) h.innerHTML = readersHtml();
}
function onBookPresence(){
  if (!followUid || !book) return;
  const p = peersOf(book.room).find(x => x.uid === followUid);
  if (!p || p.rb !== book.id || !p.rp) { stopFollow('they stopped reading this book'); return; }
  if (p.rp - 1 !== book.page) goPage(p.rp - 1, null, true);
}

// ---------- reading stats (private) ----------
const dayKey = (d = new Date()) => d.toLocaleDateString('sv-SE');
let lastActivity = Date.now(), pend = null;   // pend = {bookId, title, secs, pages}
['mousemove', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(ev => document.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true, capture: true }));
const countedPages = new Set();
function pendFor(){
  if (!book) return null;
  if (!pend || pend.bookId !== book.id) { flushStats(); pend = { bookId: book.id, title: String(book.meta.title || 'untitled').slice(0, 80), secs: 0, pages: 0 }; }
  return pend;
}
function countPage(p){ const k = `${dayKey()}:${book.id}:${p}`; if (countedPages.has(k)) return; countedPages.add(k); const x = pendFor(); if (x) x.pages++; }
setInterval(() => {
  if (view === 'book' && book && !document.hidden && !panic && Date.now() - lastActivity < 120000) { const x = pendFor(); if (x) x.secs += 15; }
}, 15000);
setInterval(() => flushStats(), 60000);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushStats(); });
function flushStats(){
  if (!pend || !db || !myId || (!pend.secs && !pend.pages)) return;
  const x = pend; pend = { ...x, secs: 0, pages: 0 };
  const day = dayKey();
  setDoc(doc(db, 'users', myId, 'stats', day), { secs: increment(x.secs), pages: increment(x.pages), books: { [x.bookId]: { title: x.title, secs: increment(x.secs), pages: increment(x.pages) } } }, { merge: true }).catch(() => {});
  setDoc(doc(db, 'users', myId, 'bookstats', x.bookId), { title: x.title, secs: increment(x.secs), pages: increment(x.pages), last: serverTimestamp() }, { merge: true }).catch(() => {});
}
let myDays = [], myBookStats = [];
function subscribeStats(){
  onSnapshot(query(collection(db, 'users', myId, 'stats'), orderBy(documentId(), 'desc'), limit(14)), s => {
    myDays = s.docs.map(d => ({ day: d.id, secs: +d.data().secs || 0, pages: +d.data().pages || 0, books: d.data().books || {} }));
    if (view === 'notes') renderNotes();
  }, () => {});
  onSnapshot(query(collection(db, 'users', myId, 'bookstats'), orderBy('last', 'desc'), limit(12)), s => {
    myBookStats = s.docs.map(d => { const x = d.data({ serverTimestamps: 'estimate' }); return { id: d.id, title: String(x.title || ''), secs: +x.secs || 0, pages: +x.pages || 0, ms: x.last?.toMillis ? x.last.toMillis() : 0 }; });
    if (view === 'notes') renderNotes();
  }, () => {});
}
const fmtMin = secs => secs >= 3600 ? `${Math.floor(secs / 3600)} h ${Math.round(secs % 3600 / 60)} min` : `${Math.round(secs / 60)} min`;
function readingHtml(){
  const today = myDays.find(d => d.day === dayKey()) || { secs: 0, pages: 0 };
  const live = pend && pend.secs ? pend.secs : 0, livePages = pend && pend.pages ? pend.pages : 0;
  const days = []; for (let i = 6; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5), k = dayKey(d); const x = myDays.find(y => y.day === k); days.push({ k, label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2), secs: (x ? x.secs : 0) + (k === dayKey() ? live : 0) }); }
  const max = Math.max(60, ...days.map(d => d.secs));
  const week = days.reduce((a, d) => a + d.secs, 0);
  const bars = days.map(d => `<span class="rbar" title="${d.k} · ${fmtMin(d.secs)}"><i style="height:${Math.round(d.secs / max * 100)}%"></i><b>${d.label}</b></span>`).join('');
  const books = myBookStats.slice(0, 6).map(x => `<div class="rbook"><span class="tdt">${esc(x.title)}</span><span class="pads">${fmtMin(x.secs)} · ${x.pages} p${x.ms ? ' · ' + fmtDay(x.ms) : ''}</span></div>`).join('');
  return `<div class="rtoday">Today <b>${fmtMin(today.secs + live)}</b> · <b>${today.pages + livePages}</b> pages <span class="pads">· last 7 days ${fmtMin(week)}</span></div>
    <div class="rbars">${bars}</div>${books || '<div class="pads">Open a book with File › Read Together… — time and pages are counted while you read.</div>'}
    ${today.secs + live > 0 ? '<span class="bkb" id="shareRead">Share today’s reading to the board</span>' : ''}`;
}
async function shareReading(){
  const r = cur();
  if (!r?.id) { termLine('<span class="r1">open a workspace first</span>'); return; }
  flushStats();
  const today = myDays.find(d => d.day === dayKey()) || { secs: 0, pages: 0, books: {} };
  const titles = Object.values(today.books || {}).map(b => '《' + String(b.title || '').slice(0, 30) + '》').slice(0, 4).join('、');
  const zh = secs => secs >= 3600 ? `${Math.floor(secs / 3600)} 小时 ${Math.round(secs % 3600 / 60)} 分钟` : `${Math.max(1, Math.round(secs / 60))} 分钟`;
  const text = `📖 今天读了 ${zh(today.secs)}，${today.pages} 页${titles ? '：' + titles : ''}`;
  try { await addDoc(collection(db, 'rooms', r.id, 'board'), { uid: myId, name: nick, text: text.slice(0, 2000), ts: serverTimestamp() }); showToast(`Shared to ${esc(docName('board'))}<small>${esc(tabLabel(active))}</small>`, () => openBoard()); }
  catch (e) { termLine(`<span class="r1">error: ${esc(e?.code || 'unknown')}</span>`); }
}
