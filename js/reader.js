'use strict';
// Read together: e-book import, pages, comments

// ---------- read together ----------
const bookFile = id => 'RFC-' + String(1000 + hash(String(id)) % 9000) + '.md';
function bookTabLabel(){
  if (!book) return '';
  const n = bookFile(book.id).slice(4, 8);
  if (skin === 'excel') return 'Ref-' + n;
  if (skin === 'notion') return 'RFC ' + n;
  if (skin === 'terminal') return `${rooms.length + (recipeOpen ? 1 : 0)}:less`;
  return bookFile(book.id);
}
function decodeText(buf){
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes);
  for (const enc of ['utf-8', 'gb18030', 'big5', 'shift_jis']) { try { return new TextDecoder(enc, { fatal: true }).decode(bytes); } catch(e){} }
  return new TextDecoder('utf-8').decode(bytes);
}

// ---------- e-book import: txt / epub / mobi / azw3 / fb2 / html (all parsed in the browser) ----------
async function unzip(buf){
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a valid EPUB (zip) file');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const files = new Map(), td = new TextDecoder();
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    files.set(td.decode(u8.subarray(p + 46, p + 46 + nlen)), { method, csize, off });
    p += 46 + nlen + xlen + clen;
  }
  const lower = new Map([...files.keys()].map(k => [k.toLowerCase(), k]));
  const z = {
    has: name => files.has(name) || lower.has(name.toLowerCase()),
    async bytes(name){
      const f = files.get(name) || files.get(lower.get(name.toLowerCase())); if (!f) return null;
      const lnl = dv.getUint16(f.off + 26, true), lxl = dv.getUint16(f.off + 28, true);
      const start = f.off + 30 + lnl + lxl, data = u8.subarray(start, start + f.csize);
      if (f.method === 0) return data;
      if (f.method !== 8) throw new Error('unsupported compression inside EPUB');
      const ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(ds).arrayBuffer());
    },
    async text(name){ const b = await z.bytes(name); return b ? new TextDecoder('utf-8').decode(b) : null; },
  };
  return z;
}
function htmlToText(html){
  const h = String(html)
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\s*(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<mbp:pagebreak[^>]*>/gi, '\n')
    .replace(/<\/\s*(p|div|h[1-6]|li|tr|blockquote|section|article|dd|dt|pre|table)\s*>/gi, '\n')
    .replace(/<\s*(p|div|h[1-6]|li|blockquote|section)\b[^>]*>/gi, '\n');
  const d = new DOMParser().parseFromString('<body>' + h + '</body>', 'text/html');
  return (d.body.textContent || '').replace(/ /g, ' ');
}
const normPath = p => { const out = []; p.split('/').forEach(x => { if (x === '..') out.pop(); else if (x && x !== '.') out.push(x); }); return out.join('/'); };
async function epubToText(buf){
  const z = await unzip(buf);
  if (z.has('META-INF/encryption.xml')) {
    const enc = await z.text('META-INF/encryption.xml');
    const algs = [...enc.matchAll(/Algorithm="([^"]+)"/g)].map(m => m[1]);
    if (algs.some(a => !/obfuscation|font|embedding/i.test(a))) throw new Error('this EPUB is DRM-protected and cannot be read');
  }
  const cont = await z.text('META-INF/container.xml');
  if (!cont) throw new Error('not a valid EPUB');
  const opfPath = new DOMParser().parseFromString(cont, 'application/xml').querySelector('rootfile')?.getAttribute('full-path');
  const opfTxt = opfPath && await z.text(opfPath);
  if (!opfTxt) throw new Error('EPUB is missing its package file');
  const opf = new DOMParser().parseFromString(opfTxt, 'application/xml');
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const items = {};
  opf.querySelectorAll('manifest > item').forEach(it => { items[it.getAttribute('id')] = it.getAttribute('href'); });
  const title = (opf.getElementsByTagNameNS('*', 'title')[0]?.textContent || '').trim();
  const parts = [], chapters = [];
  for (const ref of opf.querySelectorAll('spine > itemref')) {
    const href = items[ref.getAttribute('idref')]; if (!href) continue;
    let path; try { path = normPath(base + decodeURIComponent(href.split('#')[0])); } catch (e) { path = normPath(base + href.split('#')[0]); }
    const t = await z.text(path);
    if (t) { const tx = htmlToText(t); parts.push(tx); const first = tx.split('\n').map(x => x.trim()).find(Boolean); if (first && first.length <= 40) chapters.push(first); }
  }
  if (!parts.length) throw new Error('no readable chapters found in this EPUB');
  return { title, text: parts.join('\n\n'), chapters };
}
function palmdocDecompress(src){
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i++];
    if (c === 0 || (c >= 0x09 && c <= 0x7f)) out.push(c);
    else if (c <= 0x08) { for (let k = 0; k < c && i < src.length; k++) out.push(src[i++]); }
    else if (c >= 0xc0) { out.push(0x20, c ^ 0x80); }
    else { const v = (c << 8) | src[i++]; const dist = (v >> 3) & 0x7ff, len = (v & 7) + 3; for (let k = 0; k < len; k++) out.push(out[out.length - dist]); }
  }
  return out;
}
function trailingSize(rec, extraFlags){
  const entry = end => { let num = 0; for (let k = Math.max(0, end - 4); k < end; k++) { const b = rec[k]; if (b & 0x80) num = 0; num = (num << 7) | (b & 0x7f); } return num; };
  let num = 0, flags = extraFlags >> 1;
  while (flags) { if (flags & 1) num += entry(rec.length - num); flags >>= 1; }
  if (extraFlags & 1) num += (rec[rec.length - num - 1] & 3) + 1;
  return num;
}
function mobiToText(buf){
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  const type = String.fromCharCode(...u8.subarray(60, 68));
  if (type !== 'BOOKMOBI' && type !== 'TEXtREAd') throw new Error('not a MOBI / AZW file');
  const nrec = dv.getUint16(76), off = i => dv.getUint32(78 + i * 8), end = i => (i + 1 < nrec ? off(i + 1) : u8.length);
  const r0 = off(0);
  const compression = dv.getUint16(r0), textRecs = dv.getUint16(r0 + 8), encryption = dv.getUint16(r0 + 12);
  if (encryption) throw new Error('this book is DRM-protected (e.g. bought from Amazon) and cannot be read');
  if (compression === 17480) throw new Error('this MOBI uses Huffman compression — convert it to EPUB first (e.g. with Calibre)');
  let encoding = 1252, flags = 0, title = '', isHtml = false;
  if (type === 'BOOKMOBI' && String.fromCharCode(...u8.subarray(r0 + 16, r0 + 20)) === 'MOBI') {
    isHtml = true;
    const hl = dv.getUint32(r0 + 20);
    encoding = dv.getUint32(r0 + 28);
    if (hl >= 0xE4) flags = dv.getUint16(r0 + 0xF2);
    const tOff = dv.getUint32(r0 + 84), tLen = dv.getUint32(r0 + 88);
    if (tLen && tLen < 1000) title = new TextDecoder(encoding === 65001 ? 'utf-8' : 'windows-1252').decode(u8.subarray(r0 + tOff, r0 + tOff + tLen));
  }
  const parts = []; let total = 0;
  for (let i = 1; i <= textRecs && i < nrec; i++) {
    let rec = u8.subarray(off(i), end(i));
    if (flags) rec = rec.subarray(0, Math.max(0, rec.length - trailingSize(rec, flags)));
    const outRec = compression === 2 ? Uint8Array.from(palmdocDecompress(rec)) : rec;
    parts.push(outRec); total += outRec.length;
  }
  const all = new Uint8Array(total); let p = 0; parts.forEach(x => { all.set(x, p); p += x.length; });
  const raw = new TextDecoder(encoding === 65001 ? 'utf-8' : 'windows-1252').decode(all);
  return { title: title.trim(), text: isHtml ? htmlToText(raw) : raw };
}
function fb2ToText(buf){
  const xml = new DOMParser().parseFromString(decodeText(buf), 'application/xml');
  const title = (xml.getElementsByTagNameNS('*', 'book-title')[0]?.textContent || '').trim();
  const body = xml.getElementsByTagNameNS('*', 'body')[0];
  if (!body) throw new Error('not a valid FB2 file');
  const lines = [...body.getElementsByTagNameNS('*', '*')].filter(e => ['p', 'v', 'subtitle', 'text-author'].includes(e.localName)).map(e => e.textContent);
  return { title, text: lines.join('\n') };
}
const BOOK_EXT = ['txt', 'md', 'epub', 'mobi', 'azw', 'azw3', 'prc', 'pdb', 'fb2', 'html', 'htm', 'xhtml'];
async function extractBook(file){
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  const base = file.name.replace(/\.[^.]+$/, '') || 'untitled';
  if (['pdf', 'doc', 'docx'].includes(ext)) throw new Error(`.${ext} is not supported — save it as .txt or .epub first`);
  const buf = await file.arrayBuffer();
  if (ext === 'epub') { const r = await epubToText(buf); return { title: r.title || base, text: r.text, chapters: r.chapters }; }
  if (['mobi', 'azw', 'azw3', 'prc', 'pdb'].includes(ext)) { const r = mobiToText(buf); return { title: r.title || base, text: r.text }; }
  if (ext === 'fb2') { const r = fb2ToText(buf); return { title: r.title || base, text: r.text }; }
  if (['html', 'htm', 'xhtml'].includes(ext)) return { title: base, text: htmlToText(decodeText(buf)) };
  return { title: base, text: decodeText(buf) };
}

const PAGE_CHARS = 1500, CHUNK_CHARS = 150000;
function paginate(text){
  const paras = [];
  text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').forEach(line => {
    const p = line.replace(/^[\s　]+|\s+$/g, '');
    if (!p) return;
    for (let i = 0; i < p.length; i += 1200) paras.push(p.slice(i, i + 1200));   // very long lines become several paragraphs
  });
  const pageStarts = []; let acc = Infinity;
  paras.forEach((p, i) => { if (acc >= PAGE_CHARS) { pageStarts.push(i); acc = 0; } acc += p.length; });
  const chunks = []; let c = null, cchars = 0;
  pageStarts.forEach((ps, pi) => {
    const pe = pageStarts[pi + 1] ?? paras.length;
    const len = paras.slice(ps, pe).reduce((a, x) => a + x.length, 0);
    if (!c || cchars + len > CHUNK_CHARS || pe - c.start > 4000) { c = { start: ps, end: ps, pageStarts: [] }; chunks.push(c); cchars = 0; }
    c.pageStarts.push(ps - c.start); c.end = pe; cchars += len;
  });
  return chunks.map(x => ({ paras: paras.slice(x.start, x.end), pageStarts: x.pageStarts }));
}
async function uploadBook(file){
  const r = cur();
  if (!file) return;
  if (!db || !r?.id || !myId) { termLine('<span class="r1">fatal: not connected — open a workspace first</span>'); return; }
  const isPlain = /\.(txt|md)$/i.test(file.name);
  if (file.size > (isPlain ? 8 : 40) * 1024 * 1024) { termLine(`<span class="r1">error: file too large (max ${isPlain ? 8 : 40} MB)</span>`); return; }
  termLine(`<span class="d1">reading ${esc(file.name)}…</span>`);
  try {
    const book0 = await extractBook(file);
    const text = book0.text;
    const chunks = paginate(text);
    if (!chunks.length) { termLine('<span class="r1">error: no text found in this file</span>'); return; }
    if (chunks.length > 60) { termLine('<span class="r1">error: book too long</span>'); return; }
    const title = String(book0.title || 'untitled').replace(/\s+/g, ' ').trim().slice(0, 80) || 'untitled';
    const meta = { uid: myId, name: nick, title, ts: serverTimestamp(), chunks: chunks.length,
      pages: chunks.map(c => c.pageStarts.length), paras: chunks.map(c => c.paras.length), chars: text.length,
      toc: buildToc(chunks, book0.chapters) };
    const ref = await addDoc(collection(db, 'rooms', r.id, 'books'), meta);
    for (let i = 0; i < chunks.length; i++) {
      termLine(`<span class="d1">uploading part ${i + 1}/${chunks.length}…</span>`);
      await setDoc(doc(db, 'rooms', r.id, 'books', ref.id, 'chunks', String(i)), chunks[i]);
    }
    termLine(`<span class="g1">✔ uploaded</span> <span class="d1">${meta.pages.reduce((a, b) => a + b, 0)} pages</span>`);
    await openBook(r, ref.id);
  } catch (e) { termLine(`<span class="r1">error: ${esc(e?.code || e?.message || 'upload failed')}</span>`); }
}
$('bookIn').addEventListener('change', () => { const f = $('bookIn').files[0]; $('bookIn').value = ''; uploadBook(f); });

async function readTogether(){
  const r = cur();
  if (!db || !r?.id) { termLine('<span class="r1">open a workspace first (:room)</span>'); return; }
  let items = [];
  try {
    const s = await getDocs(query(collection(db, 'rooms', r.id, 'books'), orderBy('ts', 'desc'), limit(30)));
    items = s.docs.map(d => { const x = d.data(); return { label: String(x.title || 'untitled'), detail: `${x.name || ''} · ${(x.pages || []).reduce((a, b) => a + b, 0)} pages`, value: { id: d.id } }; });
  } catch (e) { termLine(`<span class="r1">error: could not list books (${esc(e?.code || 'unknown')})</span>`); }
  items.push({ label: '＋ Upload a book…', detail: 'EPUB · MOBI · AZW3 · TXT · FB2 · HTML', value: { upload: true }, always: true });
  const v = await quickPick(`Read together — ${tabLabel(active)}`, items, items.length > 1 ? 'Pick a book' : 'No books yet — upload one');
  if (!v) { if (!isMobile()) inp.focus(); return; }
  if (v.upload) $('bookIn').click(); else await openBook(r, v.id);
}
function pageLoc(p){
  let c = 0, base = 0, acc = 0;
  for (; c < book.meta.pages.length; c++) {
    if (p < acc + book.meta.pages[c]) break;
    acc += book.meta.pages[c]; base += book.meta.paras[c];
  }
  return { c: Math.min(c, book.meta.pages.length - 1), lp: p - acc, base };
}
async function ensurePage(){
  const L = pageLoc(book.page);
  if (book.chunks.has(L.c)) return;
  const b = book;
  const snap = await getDoc(doc(db, 'rooms', b.room.id, 'books', b.id, 'chunks', String(L.c)));
  if (snap.exists()) b.chunks.set(L.c, snap.data());
}
async function openBook(r, id){
  if (book && book.unsub) book.unsub();
  let snap;
  try { snap = await getDoc(doc(db, 'rooms', r.id, 'books', id)); } catch (e) { termLine(`<span class="r1">error: ${esc(e?.code || 'unknown')}</span>`); return; }
  if (!snap.exists()) { termLine('<span class="r1">error: book not found</span>'); return; }
  const meta = snap.data();
  flushStats(); followUid = null;
  book = { room: r, id, meta, chunks: new Map(), page: 0, total: (meta.pages || []).reduce((a, b) => a + b, 0), notes: [], seen: new Set(), first: true, unsub: null, toc: Array.isArray(meta.toc) ? meta.toc : null, hl: null };
  book.page = Math.max(0, Math.min(+store.get('bp_' + id, '0') || 0, book.total - 1));
  const b = book;
  b.unsub = onSnapshot(query(collection(db, 'rooms', r.id, 'books', id, 'notes'), orderBy('ts', 'asc'), limit(1000)), s => {
    const list = s.docs.map(d => { const x = d.data({ serverTimestamps: 'estimate' });
      return { id: d.id, uid: x.uid, name: x.name, para: x.para, quote: x.quote || '', text: x.text || '', parent: x.parent || null, ms: x.ts?.toMillis ? x.ts.toMillis() : Date.now() }; });
    const fresh = list.filter(n => !b.seen.has(n.id)); fresh.forEach(n => b.seen.add(n.id));
    b.notes = list;
    if (!b.first) { const others = fresh.filter(n => n.uid !== myId); if (others.length && (view !== 'book' || isAway())) notifyNote(b, others); }
    b.first = false;
    if (view === 'book' && book === b) render();
  }, e => termLine(`<span class="r1">error: notes unavailable (${esc(e?.code || 'unknown')})</span>`));
  if (panic) togglePanic(false);
  view = 'book'; scrollBottom = false;
  renderTabs(); render(); editor.scrollTop = 0;
  setReading();
  ensurePage().then(() => { if (view === 'book' && book === b) { render(); restoreBookScroll(); } }).catch(() => {});
}
function closeBook(){
  if (!book) return;
  flushStats(); followUid = null;
  if (book.unsub) book.unsub();
  if (rtdb && myId && book.room.id) dbUpdate(presRefFor(book.room), { rb: null, rp: null }).catch(() => {});
  book = null; view = 'room'; scrollBottom = true;
  $('cbtn').hidden = true;
  renderTabs(); render();
}
function setReading(){
  if (!book || !rtdb || !myId || !book.room.id) return;
  dbUpdate(presRefFor(book.room), { rb: book.id, rp: book.page + 1 }).catch(() => {});
}
async function goPage(p, para = null, fromFollow = false){
  if (!book) return;
  if (!fromFollow && followUid) stopFollow('you turned the page');
  const old = book.page;
  book.page = Math.max(0, Math.min(p, book.total - 1));
  store.set('bp_' + book.id, String(book.page));
  if (book.page > old) countPage(book.page);
  render(); editor.scrollTop = 0;
  if (para != null) {
    const b = book;
    const go = () => { const el = editor.querySelector(`.bp[data-p="${para}"]`); if (el) el.scrollIntoView({ block: 'center' }); };
    if (book.chunks.has(pageLoc(book.page).c)) requestAnimationFrame(go);
    else ensurePage().then(() => { if (book === b) { render(); requestAnimationFrame(go); } });
  }
  setReading();
}
function readersHtml(){
  if (!book) return '';
  const rs = peersOf(book.room).filter(p => p.rb === book.id && p.uid !== myId && p.rp);
  return rs.map(p => `<span class="bkr" style="--mc:${colorOfUid(p.uid, p.name)}" data-jump="${p.rp - 1}" title="Jump to their page">● ${esc(p.name)} p.${p.rp}</span><span class="bkfol${followUid === p.uid ? ' on' : ''}" data-follow="${esc(p.uid)}" title="${followUid === p.uid ? 'Stop following' : 'Turn pages together with ' + esc(p.name)}">${followUid === p.uid ? 'following ✓' : 'follow'}</span>`).join(' ');
}
function escFind(t){
  const q = book && book.hl;
  if (!q) return esc(t);
  const lo = t.toLowerCase(), ql = q.toLowerCase();
  let out = '', pos = 0, i;
  while ((i = lo.indexOf(ql, pos)) >= 0) { out += esc(t.slice(pos, i)) + `<mark class="bfind">${esc(t.slice(i, i + q.length))}</mark>`; pos = i + q.length; }
  return out + esc(t.slice(pos));
}
function highlightPara(text, notes){
  const ranges = notes.filter(n => n.quote).map(n => { const i = text.indexOf(n.quote); return i < 0 ? null : { s: i, e: i + n.quote.length, n }; })
    .filter(Boolean).sort((a, b) => a.s - b.s);
  let out = '', pos = 0;
  for (const r of ranges) {
    if (r.s < pos) continue;
    out += escFind(text.slice(pos, r.s)) + `<mark class="bm" style="--mc:${colorOf(r.n)}">${escFind(text.slice(r.s, r.e))}</mark>`;
    pos = r.e;
  }
  return out + escFind(text.slice(pos));
}
function renderBook(){
  if (!book) { view = 'room'; render(); return; }
  const L = pageLoc(book.page);
  const ch = book.chunks.get(L.c);
  const pct = Math.round((book.page + 1) / Math.max(1, book.total) * 100);
  const nav = `<span class="bkb" data-nav="-1">‹ Prev</span><span>${book.page + 1} / ${book.total} <span class="bkpct">· ${pct}%</span></span><span class="bkb" data-nav="1">Next ›</span><span class="bkb" data-nav="go">Go to…</span>`;
  const chap = currentChapter();
  const nNotes = book.notes.filter(n => !n.parent).length;
  const head = `<div class="bkhead"><span class="bkt">${esc(book.meta.title || 'untitled')}</span>${chap ? `<span class="bkch" title="${esc(chap)}">${esc(chap)}</span>` : ''}${nav}`
    + `<span class="bkb" data-toc="1">Contents</span><span class="bkb" data-find="1">Find</span><span class="bkb" data-notes="1">Notes${nNotes ? ' (' + nNotes + ')' : ''}</span>`
    + (book.hl ? `<span class="bkhl" data-clearhl="1" title="Clear search highlight">“${esc(book.hl)}” ✕</span>` : '')
    + `<span class="bkaa" data-aa="1" title="Reading settings">Aa</span><span class="sp"></span><span class="bkreaders">${readersHtml()}</span></div>`;
  if (!ch) {
    editor.innerHTML = `<div ${bkAttrs()} data-book="1">${head}<div class="bkempty">loading…</div></div>`;
    const b = book;
    ensurePage().then(() => { if (view === 'book' && book === b) render(); }).catch(e => { editor.innerHTML = `<div class="bk">${head}<div class="bkempty">could not load (${esc(e?.code || 'error')})</div></div>`; });
    return;
  }
  const s = ch.pageStarts[L.lp], e = ch.pageStarts[L.lp + 1] ?? ch.paras.length;
  const tops = book.notes.filter(n => !n.parent), reps = book.notes.filter(n => n.parent);
  const rows = [];
  for (let i = s; i < e; i++) {
    const g = L.base + i;
    const ns = tops.filter(n => n.para === g);
    rows.push(`<div class="bp${isHeading(String(ch.paras[i]).trim()) ? ' bph' : ''}" data-p="${g}"><span class="bpn${ns.length ? ' has' : ''}" data-pcomment="${g}" title="Comment on this paragraph">${g + 1}</span><span class="bpt">${highlightPara(String(ch.paras[i]), ns)}</span></div>`);
    if (ns.length) rows.push(`<div class="bth">${ns.map(n => `<div class="bn" style="--mc:${colorOf(n)}"><div class="bnh"><span class="bav">${esc(displayName(n).slice(0, 1).toUpperCase())}</span><b>${esc(displayName(n))}</b><span class="bnt">${hhmm(n.ms)}</span>${n.uid === myId ? `<span class="bnx" data-delnote="${esc(n.id)}" title="Delete">✕</span>` : ''}</div>${n.quote ? `<div class="bnq">“${esc(n.quote)}”</div>` : ''}<div class="bnb">${esc(n.text)}</div>${reps.filter(x => x.parent === n.id).map(x => `<div class="bnr2" style="--mc:${colorOf(x)}"><b>${esc(displayName(x))}</b><span class="tx">${esc(x.text)}</span>${x.uid === myId ? `<span class="bnx" data-delnote="${esc(x.id)}" title="Delete">✕</span>` : ''}</div>`).join('')}<span class="bnrep" data-reply="${esc(n.id)}">Reply</span></div>`).join('')}</div>`);
  }
  editor.innerHTML = `<div ${bkAttrs()} data-book="1">${head}<div class="bkbody">${rows.join('')}</div><div class="bknav">${nav}</div></div>`;
  $('cursorPos').textContent = skin === 'vscode' ? `Ln ${s + 1}, Col 1` : '';
}
async function addNote(para, quote, text, parent){
  if (!book || !db || !myId) return;
  const d = { uid: myId, name: nick, para, quote: (quote || '').slice(0, 300), text: text.slice(0, 1000), ts: serverTimestamp() };
  if (parent) d.parent = parent;
  try { await addDoc(collection(db, 'rooms', book.room.id, 'books', book.id, 'notes'), d); }
  catch (e) { termLine(`<span class="r1">error: comment failed (${esc(e?.code || 'unknown')})</span>`); }
}
async function bookClick(e){
  const aa = e.target.closest('[data-aa]');
  if (aa) { e.stopPropagation(); if (!$('dropdown').hidden && $('dropdown').dataset.rs) closeMenu(); else openRsPanel(aa); return; }
  const nav = e.target.closest('[data-nav]');
  if (nav) {
    const v = nav.dataset.nav;
    if (v === 'go') { const p = await ask(`Go to page (1–${book.total})`, 'Page number'); if (p) goPage((parseInt(p, 10) || 1) - 1); }
    else goPage(book.page + (+v));
    return;
  }
  const fo = e.target.closest('[data-follow]'); if (fo) { if (followUid === fo.dataset.follow) stopFollow(); else startFollow(fo.dataset.follow); return; }
  const j = e.target.closest('[data-jump]'); if (j) { goPage(+j.dataset.jump); return; }
  if (e.target.closest('[data-toc]')) { openToc(); return; }
  if (e.target.closest('[data-find]')) { const q = await ask('Find in book', 'Word or phrase', book.hl || ''); if (q) searchBook(q); return; }
  if (e.target.closest('[data-notes]')) { openNotesList(); return; }
  if (e.target.closest('[data-clearhl]')) { book.hl = null; render(); return; }
  const del = e.target.closest('[data-delnote]');
  if (del) { try { await deleteDoc(doc(db, 'rooms', book.room.id, 'books', book.id, 'notes', del.dataset.delnote)); } catch (err) { termLine(`<span class="r1">error: ${esc(err?.code || 'unknown')}</span>`); } return; }
  const rp = e.target.closest('[data-reply]');
  if (rp) { const n = book.notes.find(x => x.id === rp.dataset.reply); const t = await ask(`Reply to ${n ? displayName(n) : ''}`, 'Your reply'); if (t && n) addNote(n.para, '', t, n.id); return; }
  const pc = e.target.closest('[data-pcomment]');
  if (pc) { const g = +pc.dataset.pcomment; const t = await ask(`Comment on paragraph ${g + 1}`, 'Your comment'); if (t) addNote(g, '', t); }
}
// select text in the book -> floating "Comment" button
let pendingSel = null;
function checkSelection(){
  if (view !== 'book' || panic || !book) { $('cbtn').hidden = true; return; }
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) { $('cbtn').hidden = true; pendingSel = null; return; }
  const a = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest('.bp');
  const f = sel.focusNode && (sel.focusNode.nodeType === 1 ? sel.focusNode : sel.focusNode.parentElement)?.closest('.bp');
  const quote = sel.toString().trim();
  if (!a || a !== f || !quote) { $('cbtn').hidden = true; pendingSel = null; return; }
  pendingSel = { para: +a.dataset.p, quote: quote.slice(0, 300) };
  const r = sel.getRangeAt(0).getBoundingClientRect();
  const btn = $('cbtn'); btn.hidden = false;
  btn.style.left = Math.min(window.innerWidth - 110, Math.max(4, r.right - 40)) + 'px';
  btn.style.top = Math.min(window.innerHeight - 40, r.bottom + 6) + 'px';
}
document.addEventListener('selectionchange', () => { clearTimeout(checkSelection.t); checkSelection.t = setTimeout(checkSelection, 120); });
$('cbtn').addEventListener('mousedown', e => e.preventDefault());
$('cbtn').addEventListener('click', async () => {
  const p = pendingSel; $('cbtn').hidden = true;
  if (!p) return;
  const t = await ask(`Comment on “${p.quote.slice(0, 24)}${p.quote.length > 24 ? '…' : ''}”`, 'Your comment');
  window.getSelection()?.removeAllRanges();
  if (t) addNote(p.para, p.quote, t);
});
function notifyNote(b, notes){
  if (alertMode === 'quiet' || panic) return;
  const from = [...new Set(notes.map(n => displayName(n)))].slice(0, 3).map(esc).join(', ');
  const p = notes[notes.length - 1];
  const label = esc(bookFile(b.id));
  const text = skin === 'excel' ? `${from} added a comment<small>Ref-${label.slice(4, 8)} · click to view</small>`
    : skin === 'notion' ? `${from} commented on <b>RFC ${label.slice(4, 8)}</b><small>click to open</small>`
    : skin === 'terminal' ? `Activity in window less<small>${notes.length} new · click to switch</small>`
    : `Review: ${from} commented on ${label}<small>click to open</small>`;
  showToast(text, async () => {
    if (book !== b) return;
    view = 'book'; renderTabs();
    goPage(await pageOfPara(p.para), p.para);
  });
  const st = document.querySelector('.status');
  st.classList.remove('alert'); void st.offsetWidth; st.classList.add('alert');
  if (document.hidden || !document.hasFocus()) { startBlink(); osNotify(notes.length, 'note'); }
}
async function deleteBook(){
  if (!book || book.meta.uid !== myId) return;
  const ok = await ask(`Delete “${book.meta.title}” and all its comments?`, "Type 'yes' to confirm — this cannot be undone");
  if (!ok || ok.toLowerCase() !== 'yes') return;
  const b = book;
  try {
    const ns = await getDocs(collection(db, 'rooms', b.room.id, 'books', b.id, 'notes'));
    for (const d of ns.docs) await deleteDoc(d.ref);
    for (let i = 0; i < b.meta.chunks; i++) await deleteDoc(doc(db, 'rooms', b.room.id, 'books', b.id, 'chunks', String(i)));
    await deleteDoc(doc(db, 'rooms', b.room.id, 'books', b.id));
    closeBook(); termLine('<span class="g1">✔ book deleted</span>');
  } catch (e) { termLine(`<span class="r1">error: delete failed (${esc(e?.code || 'unknown')})</span>`); }
}
