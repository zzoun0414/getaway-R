'use strict';
// Chat: message actions, mentions, mute, search, reply, images, invites, commands, typing, boss key

// ---------- message actions: reply / copy / edit / recall ----------
function msgMenu(m, x, y){
  const dd = $('dropdown');
  menuActions = [];
  const items = [['Reply', () => setReply(m)], ['Copy Text', () => copyText(m.text || '')]];
  if (m.uid === myId) items.push('-', ['Edit…', () => editMsg(m)], ['Recall', () => recallMsg(m)]);
  dd.innerHTML = itemsHtml(items);
  dd.hidden = false;
  dd.style.left = Math.max(4, Math.min(x, window.innerWidth - dd.offsetWidth - 4)) + 'px';
  dd.style.top = Math.max(4, Math.min(y + 6, window.innerHeight - dd.offsetHeight - 4)) + 'px';
}
async function copyText(t){
  try { await navigator.clipboard.writeText(t); showToast('Copied', null); } catch (e) { await ask('Copy this text', '', t); }
}
async function editMsg(m){
  const r = cur(); if (!r?.id) return;
  const t = await ask('Edit message', 'New text', m.text || '');
  if (t == null || t === m.text) return;
  try { await updateDoc(doc(db, 'rooms', r.id, 'msgs', m.id), { text: t.slice(0, 600), edited: true }); }
  catch (e) { termLine(`<span class="r1">error: edit failed (${esc(e?.code || 'unknown')})</span>`); }
}
async function recallMsg(m){
  const r = cur(); if (!r?.id) return;
  try {
    await updateDoc(doc(db, 'rooms', r.id, 'msgs', m.id), { text: '', recalled: true });
    if (m.img) deleteDoc(doc(db, 'rooms', r.id, 'imgs', m.img)).catch(() => {});
  } catch (e) { termLine(`<span class="r1">error: recall failed (${esc(e?.code || 'unknown')})</span>`); }
}

// ---------- @mentions ----------
function mentionedUids(text){
  const byName = new Map([...roomMembers(cur()).entries()].map(([uid, n]) => [n.toLowerCase(), uid]));
  const out = new Set();
  for (const mm of text.matchAll(/@([^\s@]{1,16})/g)) { const uid = byName.get(mm[1].toLowerCase()); if (uid && uid !== myId) out.add(uid); }
  return [...out].slice(0, 10);
}
let atState = null;   // {start, items, sel}
function closeAt(){ if (atState) { atState = null; if (!$('dropdown').hidden && $('dropdown').dataset.at) closeMenu(); } }
function drawAt(){
  const dd = $('dropdown');
  menuActions = [];
  dd.dataset.at = '1';
  dd.innerHTML = atState.items.map((it, i) => `<div class="mi${i === atState.sel ? ' atsel' : ''}" data-atpick="${i}"><span><span style="color:${colorOfUid(it.uid, it.name)}">●</span> ${esc(it.name)}</span><span class="kb">${i === atState.sel ? '↵' : ''}</span></div>`).join('');
  dd.hidden = false;
  const r = inp.getBoundingClientRect();
  dd.style.left = Math.max(4, Math.min(r.left, window.innerWidth - dd.offsetWidth - 4)) + 'px';
  dd.style.top = (r.top > 220 ? r.top - dd.offsetHeight - 6 : r.bottom + 6) + 'px';
}
function updateAt(){
  const upto = inp.value.slice(0, inp.selectionStart ?? inp.value.length);
  const mt = /(^|\s)@([^\s@]{0,16})$/.exec(upto);
  if (!mt || inp.value.startsWith(':') || view !== 'room') { closeAt(); return; }
  const q = mt[2].toLowerCase();
  const items = [...roomMembers(cur()).entries()].filter(([uid, n]) => uid !== myId && n.toLowerCase().includes(q))
    .map(([uid, name]) => ({ uid, name })).sort((a, b) => (b.name.toLowerCase().startsWith(q)) - (a.name.toLowerCase().startsWith(q))).slice(0, 8);
  if (!items.length) { closeAt(); return; }
  atState = { start: upto.length - mt[2].length - 1, items, sel: Math.min(atState?.sel || 0, items.length - 1) };
  drawAt();
}
function pickAt(i){
  if (!atState) return;
  const it = atState.items[i]; if (!it) return;
  const caret = inp.selectionStart ?? inp.value.length;
  inp.value = inp.value.slice(0, atState.start) + '@' + it.name + ' ' + inp.value.slice(caret);
  const pos = atState.start + it.name.length + 2;
  closeAt(); inp.focus(); inp.setSelectionRange(pos, pos);
}
inp.addEventListener('input', updateAt);
inp.addEventListener('keydown', e => {
  if (!atState || $('dropdown').hidden) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); atState.sel = (atState.sel + 1) % atState.items.length; drawAt(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); atState.sel = (atState.sel - 1 + atState.items.length) % atState.items.length; drawAt(); }
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); pickAt(atState.sel); }
});
$('dropdown').addEventListener('mousedown', e => { const p = e.target.closest('[data-atpick]'); if (p) { e.preventDefault(); e.stopPropagation(); pickAt(+p.dataset.atpick); } }, true);

// ---------- mute a room ----------
const mutedSet = new Set((() => { try { return JSON.parse(store.get('muted', '[]')) || []; } catch(e){ return []; } })());
const isMuted = r => !!(r?.id && mutedSet.has(r.id));
function setMuted(on){
  const r = cur(); if (!r?.id) return;
  if (on) mutedSet.add(r.id); else mutedSet.delete(r.id);
  store.set('muted', JSON.stringify([...mutedSet]));
  renderTabs();
  showToast(on ? `Muted ${esc(tabLabel(active))}<small>unread is still counted · @mentions still notify you</small>` : `Unmuted ${esc(tabLabel(active))}`, null);
}

// ---------- search chat history ----------
async function searchChat(q){
  const r = cur();
  q = String(q || '').trim();
  if (!q || !db || !r?.id) return;
  termLine(`<span class="d1">searching ${esc(tabLabel(active))} for “${esc(q)}”…</span>`);
  let list = [];
  try { const s = await getDocs(query(collection(db, 'rooms', r.id, 'msgs'), orderBy('ts', 'desc'), limit(500))); list = s.docs.map(mapMsg); }
  catch (e) { termLine(`<span class="r1">error: search failed (${esc(e?.code || 'unknown')})</span>`); return; }
  const ql = q.toLowerCase();
  const hits = list.filter(m => !m.recalled && (m.text || '').toLowerCase().includes(ql)).slice(0, 200);
  if (!hits.length) { showToast(`No messages match “${esc(q)}”<small>searched the latest ${list.length} in ${esc(tabLabel(active))}</small>`, null); return; }
  const snip = t => { const k = t.toLowerCase().indexOf(ql); return (k > 20 ? '…' : '') + t.slice(Math.max(0, k - 20), k + q.length + 40).replace(/\s+/g, ' ') + (k + q.length + 40 < t.length ? '…' : ''); };
  const v = await quickPick(`Search “${q}” — ${hits.length} result${hits.length > 1 ? 's' : ''} in ${tabLabel(active)}`,
    hits.map(m => ({ label: `${displayName(m)}: ${snip(m.text)}`, detail: fmtDay(m.ms), value: m })), 'Type to narrow down');
  if (!v) return;
  if (panic) togglePanic(false);
  if (view !== 'room') { view = 'room'; renderTabs(); render(); }
  const el = editor.querySelector(`[data-mid="${CSS.escape(v.id)}"]`);
  if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('hitflash'); setTimeout(() => el.classList.remove('hitflash'), 2200); }
  else showToast(`${esc(displayName(v))} · ${fmtDay(v.ms)}<small>${esc(v.text.slice(0, 240))}</small>`, null);
}

// ---------- reply ----------
function setReply(m){
  if (!m) { replyTo = null; $('replyChip').hidden = true; return; }
  replyTo = { id: String(m.id).slice(0,40), name: displayName(m), text: (m.text || (m.img ? '[' + imgName(m.img) + '.jpg]' : '')).slice(0, 60) };
  $('replyText').textContent = `↳ ${replyTo.name}: ${replyTo.text}`;
  $('replyChip').hidden = false;
  if (!isMobile()) inp.focus();
}
$('replyX').addEventListener('click', e => { e.preventDefault(); setReply(null); });

// ---------- images ----------
const imgCache = new Map();
async function loadImg(id){
  if (imgCache.has(id)) return imgCache.get(id);
  const p = (async () => {
    const snap = await getDoc(doc(db, 'rooms', cur().id, 'imgs', id));
    if (!snap.exists()) throw new Error('missing');
    return snap.data().data;
  })();
  imgCache.set(id, p);
  p.catch(() => imgCache.delete(id));
  return p;
}
async function compressImage(file){
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  let q = 0.72, out = '';
  for (let tries = 0; tries < 8; tries++) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
    out = c.toDataURL('image/jpeg', q);
    if (out.length < 650000) return out;
    if (q > 0.4) q -= 0.12; else scale *= 0.75;
  }
  throw new Error('image too large');
}
async function sendImage(file){
  if (!file || !/^image\//.test(file.type)) return;
  const roomId = cur()?.id;
  if (!db || !roomId || !myId) { termLine('<span class="r1">fatal: not connected to remote</span>'); return; }
  const caption = inp.value.trim().startsWith(':') ? '' : inp.value.trim().slice(0, 600);
  inp.value = '';
  termLine(`<span class="d1">uploading ${esc(file.name || 'image')}…</span>`);
  try {
    const data = await compressImage(file);
    const ref = await addDoc(collection(db, 'rooms', roomId, 'imgs'), { uid: myId, data, ts: serverTimestamp() });
    imgCache.set(ref.id, Promise.resolve(data));
    const msg = { uid: myId, name: (nick || 'dev').slice(0,16), text: caption, img: ref.id, ts: serverTimestamp() };
    if (replyTo) msg.re = replyTo;
    await addDoc(collection(db, 'rooms', roomId, 'msgs'), msg);
    setReply(null); stopTyping();
    termLine(`<span class="d1">[main ${hex7()}] chore: add asset ${imgName(ref.id)}.jpg</span>`);
  } catch (e) {
    termLine(`<span class="r1">error: upload failed (${esc(e?.code || e?.message || 'unknown')})</span>`);
  }
}
$('fileIn').addEventListener('change', () => { const f = $('fileIn').files[0]; $('fileIn').value = ''; sendImage(f); });
inp.addEventListener('paste', e => {
  const item = [...(e.clipboardData?.items || [])].find(it => it.type.startsWith('image/'));
  if (item) { e.preventDefault(); sendImage(item.getAsFile()); }
});
document.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
document.addEventListener('drop', e => {
  const f = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
  if (f) { e.preventDefault(); sendImage(f); }
});
// hover preview (desktop) + lightbox (click / tap)
let popFor = null;
editor.addEventListener('mouseover', async e => {
  const el = e.target.closest('[data-img]');
  if (!el || isMobile() || panic) return;
  popFor = el.dataset.img;
  const pop = $('imgPop');
  const r = el.getBoundingClientRect();
  pop.style.left = Math.min(r.left, window.innerWidth - 340) + 'px';
  pop.style.top = (r.bottom + 6 + 260 > window.innerHeight ? r.top - 266 : r.bottom + 6) + 'px';
  pop.innerHTML = '<span class="d1">loading…</span>'; pop.hidden = false;
  try { const src = await loadImg(popFor); if (popFor === el.dataset.img && !pop.hidden) pop.innerHTML = `<img src="${src}">`; }
  catch(err){ pop.innerHTML = '<span class="r1">image not found</span>'; }
});
editor.addEventListener('mouseout', e => { if (e.target.closest('[data-img]')) { popFor = null; $('imgPop').hidden = true; } });
async function openLightbox(id){
  const lb = $('lightbox');
  lb.innerHTML = '<span class="d1">loading…</span>'; lb.hidden = false;
  try { const src = await loadImg(id); if (!lb.hidden) lb.innerHTML = `<img src="${src}"><div class="lbcap">${imgName(id)}.jpg · click anywhere to close</div>`; }
  catch(err){ lb.innerHTML = '<span class="r1">image not found</span>'; }
}
$('lightbox').addEventListener('click', () => { $('lightbox').hidden = true; });

// click a message = reply to it; click an image = open it
editor.addEventListener('click', e => {
  if (panic || view === 'recipe') return;
  if (view === 'book') { bookClick(e); return; }
  if (view === 'board') { boardClick(e); return; }
  if (view === 'notes') { notesClick(e); return; }
  const img = e.target.closest('[data-img]');
  if (img) { $('imgPop').hidden = true; openLightbox(img.dataset.img); return; }
  const sel = window.getSelection && String(window.getSelection());
  if (sel) return;
  const row = e.target.closest('[data-mid]'); if (!row) return;
  const m = (cur()?.msgs || []).find(x => x.id === row.dataset.mid);
  if (m && !m.recalled) { e.stopPropagation(); msgMenu(m, e.clientX, e.clientY); }
});

// ---------- invite ----------
const inviteLink = code => location.origin + location.pathname + '#j=' + b64u(code);
async function copyInvite(){
  const r = cur();
  if (!r) { termLine('<span class="r1">no workspace open — :room first</span>'); return; }
  const link = inviteLink(r.code);
  try { await navigator.clipboard.writeText(link); showToast(`Invite link copied<small>anyone with this link joins ${esc(tabLabel(active))}</small>`, null); termLine('<span class="g1">✔ invite link copied to clipboard</span>'); }
  catch(e){ await ask('Copy this invite link', '', link); }
}

// ---------- commands ----------
const HELP = [
  '<span class="help">commands:</span>',
  '<span class="help">  :read                   read together: open / upload a book in this room</span>',
  '<span class="help">  :p &lt;n&gt;                  jump to page n of the open book</span>',
  '<span class="help">  :toc / :find &lt;word&gt;     contents / search in the open book</span>',
  '<span class="help">  :board                  message board for this room</span>',
  '<span class="help">  :search &lt;word&gt;          search this room\'s chat history</span>',
  '<span class="help">  :mute / :unmute         silence this room (still counts unread, @mentions still notify)</span>',
  '<span class="help">  :todo                   your private notes &amp; to-dos</span>',
  '<span class="help">  :signout                sign out / switch account</span>',
  '<span class="help">  :skin vscode|excel|notion|terminal   change the disguise</span>',
  '<span class="help">  :style comment|log|str  how messages look in VS Code</span>',
  '<span class="help">  :logs off|slow|normal|fast  terminal log speed</span>',
  '<span class="help">  :room                   open another room in a new tab (up to 6)</span>',
  '<span class="help">  :close                  close the current tab (rejoin later with its code)</span>',
  '<span class="help">  :invite                 copy an invite link for this room</span>',
  '<span class="help">  :img                    pick an image to send (or paste / drag one in)</span>',
  '<span class="help">  :clear                  delete all of YOUR messages in this room (asks first)</span>',
  '<span class="help">  :alert on|quiet         new-message alerts: flash + popup, or count only</span>',
  '<span class="help">  :recipe                 open the guide</span>',
  '<span class="help">  click a message         reply / copy / edit / recall</span>',
  '<span class="help">  @name                   mention someone (Tab or Enter picks from the list)</span>',
  '<span class="help">  click a tab             switch room; click the current tab = boss key</span>',
  '<span class="help">  Esc                     boss key: hide all chat lines / show again</span>',
  '<span class="help">  Ctrl+`                  focus this input</span>',
];
async function command(c){
  const [cmd, ...rest] = c.slice(1).trim().split(/\s+/); const arg = rest.join(' ');
  if (cmd === 'help' || cmd === 'h') HELP.forEach(termLine);
  else if (cmd === 'nick') termLine(`<span class="d1">your name is your account name: ${esc(nick)} — use :signout to switch account</span>`);
  else if (cmd === 'signout' || cmd === 'logout') await doSignOut();
  else if (cmd === 'whoami') termLine(`<span class="d1">${esc(nick)}</span>`);
  else if (cmd === 'read') await readTogether();
  else if (cmd === 'board') openBoard();
  else if (cmd === 'search') { const q = arg || await ask(`Search ${tabLabel(active)}`, 'Word or phrase'); if (q) searchChat(q); }
  else if (cmd === 'mute') setMuted(true);
  else if (cmd === 'unmute') setMuted(false);
  else if (cmd === 'todo' || cmd === 'notes') openNotes();
  else if (cmd === 'book') $('bookIn').click();
  else if ((cmd === 'find' || cmd === 'search') && view === 'book' && book) { if (arg) searchBook(arg); else { const q = await ask('Find in book', 'Word or phrase'); if (q) searchBook(q); } }
  else if (cmd === 'toc' && view === 'book' && book) openToc();
  else if (cmd === 'p' || cmd === 'page') { if (view === 'book' && book) goPage((parseInt(arg, 10) || 1) - 1); else termLine('<span class="r1">no book open — :read first</span>'); }
  else if (cmd === 'style') {
    if (['comment','log','str'].includes(arg)) { style = arg; store.set('style', style); render(); termLine(`<span class="d1">✔ style → ${arg}</span>`); }
    else termLine('<span class="r1">usage: :style comment|log|str</span>');
  }
  else if (cmd === 'skin') {
    if (SKINS.includes(arg)) { skin = arg; store.set('skin', skin); applySkin(); termLine(`<span class="d1">✔ skin → ${arg}</span>`); }
    else termLine('<span class="r1">usage: :skin vscode|excel|notion|terminal</span>');
  }
  else if (cmd === 'logs') {
    if (arg in SPEEDS) { logSpeed = arg; store.set('logs', arg); termLine(`<span class="d1">✔ logs → ${arg}</span>`); }
    else termLine('<span class="r1">usage: :logs off|slow|normal|fast</span>');
  }
  else if (cmd === 'room' || cmd === 'open') {
    if (!db) { termLine('<span class="r1">fatal: not connected to remote</span>'); return; }
    if (rooms.length >= MAX_ROOMS) { termLine(`<span class="r1">error: too many open editors (max ${MAX_ROOMS}) — :close one first</span>`); return; }
    const code = await ask('Connect to Remote Workspace', 'Enter workspace token', '', true);
    if (code) await addRoom(code);
    if (!isMobile()) inp.focus();
  }
  else if (cmd === 'close') { if (rooms.length) await closeRoom(active); }
  else if (cmd === 'invite') await copyInvite();
  else if (cmd === 'img' || cmd === 'image') $('fileIn').click();
  else if (cmd === 'recipe') openRecipe();
  else if (cmd === 'alert') {
    if (['on','quiet'].includes(arg)) { alertMode = arg; store.set('alert', arg); termLine(`<span class="d1">✔ alert → ${arg}</span>`); }
    else termLine('<span class="r1">usage: :alert on|quiet</span>');
  }
  else if (cmd === 'clear') {
    const roomId = cur()?.id;
    if (!db || !roomId || !myId) return;
    const ok = await ask(`Delete ALL your messages in ${tabLabel(active)}?`, "Type 'yes' to confirm — this cannot be undone");
    if (!ok || ok.toLowerCase() !== 'yes') { termLine('<span class="d1">cancelled</span>'); return; }
    let n = 0;
    for (const sub of ['msgs', 'imgs']) {
      const snap = await getDocs(query(collection(db, 'rooms', roomId, sub), where('uid', '==', myId)));
      for (const d of snap.docs) { try { await deleteDoc(d.ref); if (sub === 'msgs') n++; } catch(e){} }
    }
    termLine(`<span class="g1">✔ removed ${n} entries</span>`);
  }
  else termLine(`<span class="r1">zsh: command not found: ${esc(cmd)}</span>`);
}

async function send(text){
  const roomId = cur()?.id;
  if (!db || !roomId || !myId) { termLine('<span class="r1">fatal: not connected to remote — type :room to open a workspace</span>'); return; }
  const msg = { uid: myId, name: (nick || 'dev').slice(0,16), text: text.slice(0,600), ts: serverTimestamp() };
  if (replyTo) msg.re = replyTo;
  const at = mentionedUids(text);
  if (at.length) msg.at = at;
  setReply(null); stopTyping(); closeAt();
  cur().dividerAt = Infinity;
  try {
    await addDoc(collection(db, 'rooms', roomId, 'msgs'), msg);
    termLine(`<span class="d1">[main ${hex7()}] chore: update sync config</span>`);
    termLine(`<span class="d1"> 1 file changed, ${1+(Math.random()*3|0)} insertions(+)</span>`);
  } catch (e) {
    termLine(`<span class="r1">error: push failed (${esc(e?.code||'unknown')})</span>`);
  }
}

$('form').addEventListener('submit', e => {
  e.preventDefault();
  const v = inp.value.trim(); inp.value = '';
  if (!v) return;
  if (v.startsWith(':')) command(v);
  else { if (view !== 'room') { view = 'room'; scrollBottom = true; renderTabs(); render(); } send(v); }
});

// ---------- typing indicator ----------
let amTyping = null, typTimer = null;
function stopTyping(){
  clearTimeout(typTimer);
  if (amTyping && rtdb && myId) dbUpdate(presRefFor(amTyping), { typing: false }).catch(() => {});
  amTyping = null;
}
inp.addEventListener('input', () => {
  const r = cur();
  const typing = inp.value.trim() && !inp.value.startsWith(':');
  if (!typing || !r?.id || !rtdb || !myId) { stopTyping(); return; }
  if (amTyping !== r) { stopTyping(); amTyping = r; dbUpdate(presRefFor(r), { typing: true }).catch(() => {}); }
  clearTimeout(typTimer); typTimer = setTimeout(stopTyping, 4000);
});

// ---------- boss key ----------
function togglePanic(force){
  panic = force ?? !panic;
  inp.value = '';
  closeMenu(); hideToast(); stopTyping();
  $('imgPop').hidden = true; $('lightbox').hidden = true;
  $('cbtn').hidden = true;
  if (panic) { setReply(null); if (view !== 'room') { view = 'room'; renderTabs(); } }
  render();
  if (panic) { editor.scrollTop = Math.max(0, editor.scrollHeight * 0.4); inp.blur(); }
  else { clearActiveUnread(); editor.scrollTop = editor.scrollHeight; if (!isMobile()) inp.focus(); }
}
document.addEventListener('keydown', e => {
  if (!$('qi').hidden) { if (e.key === 'Escape' && qiCancel) { e.preventDefault(); qiCancel(); } return; }
  if (e.key === 'Escape' && !$('dropdown').hidden) { e.preventDefault(); closeMenu(); return; }
  if (e.key === 'Escape') { e.preventDefault(); togglePanic(); }
  if (e.key === '`' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (panic) togglePanic(false); inp.focus(); }
});
$('panicBtn').addEventListener('click', () => togglePanic());
// keep layout above the on-screen keyboard (iOS / Android)
if (window.visualViewport) {
  const fit = () => {
    document.documentElement.style.setProperty('--vh', window.visualViewport.height + 'px');
    window.scrollTo(0, 0);
    if (document.activeElement === inp) { editor.scrollTop = editor.scrollHeight; term.scrollTop = term.scrollHeight; }
  };
  window.visualViewport.addEventListener('resize', fit);
  fit();
}
$('styleBtn').addEventListener('click', () => { const o = ['comment','log','str']; style = o[(o.indexOf(style)+1)%3]; store.set('style', style); render(); });
$('liveBtn').addEventListener('click', () => command(':room'));
$('acctBtn').addEventListener('click', e => { e.stopPropagation(); openMenu($('acctBtn'), ['Account']); const dd = $('dropdown'), r = $('acctBtn').getBoundingClientRect(); dd.style.top = Math.max(4, r.bottom - dd.offsetHeight) + 'px'; dd.style.left = (r.right + 4) + 'px'; });
$('fsBtn').addEventListener('click', async () => {
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); }
  catch(e){ termLine('<span class="d1">fullscreen not allowed — use the browser\'s fullscreen (F11 / ⌃⌘F)</span>'); }
});
$('peersBtn').addEventListener('click', e => {
  e.stopPropagation();
  const ps = peersOf(cur());
  const dd = $('dropdown');
  menuActions = [];
  dd.innerHTML = `<div class="grp">${skin === 'vscode' ? 'Live Share · participants' : 'Here now'}</div>` + (ps.length ? ps.map(p =>
    `<div class="mi" style="cursor:default"><span><span style="color:${colorOfUid(p.uid, p.name)}">●</span> ${esc(p.name)}${p.uid === myId ? ' (you)' : ''}</span><span class="kb">${p.typing ? 'typing…' : p.away ? 'away' : 'online'}</span></div>`).join('')
    : `<div class="mi" style="cursor:default"><span>${rtdb ? 'just you' : 'presence unavailable'}</span></div>`);
  dd.hidden = false;
  const r = $('peersBtn').getBoundingClientRect();
  dd.style.top = Math.max(4, r.top - dd.offsetHeight - 4) + 'px';
  dd.style.left = Math.max(4, Math.min(r.left, window.innerWidth - dd.offsetWidth - 4)) + 'px';
});

// resizable panel
(() => {
  const sash = $('sash'), work = $('work'); let drag = false;
  sash.addEventListener('mousedown', () => { drag = true; document.body.style.userSelect = 'none'; });
  window.addEventListener('mouseup', () => { drag = false; document.body.style.userSelect = ''; });
  window.addEventListener('mousemove', e => {
    if (!drag) return; const r = work.getBoundingClientRect();
    work.style.setProperty('--panel', Math.min(r.height - 140, Math.max(90, r.bottom - e.clientY)) + 'px');
  });
})();
