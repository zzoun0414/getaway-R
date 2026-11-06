'use strict';
// Private notes & to-dos, and the per-room message board

// ---------- private notes & to-dos (only you can read them) ----------
const todoCol = () => collection(db, 'users', myId, 'todos');
const padDoc = () => doc(db, 'users', myId, 'pad', 'main');
function subscribeMine(){
  if (!db || !myId) return;
  subscribeStats();
  todoUnsub = onSnapshot(query(todoCol(), orderBy('ts', 'asc'), limit(300)), s => {
    myTodos = s.docs.map(d => { const x = d.data({ serverTimestamps: 'estimate' }); return { id: d.id, text: String(x.text || ''), done: !!x.done, ms: x.ts?.toMillis ? x.ts.toMillis() : Date.now() }; });
    if (view === 'notes') renderNotes();
  }, e => termLine(`<span class="y1">warning: notes unavailable (${esc(e?.code || 'unknown')})</span>`));
  padUnsub = onSnapshot(padDoc(), s => {
    const x = s.exists() ? s.data({ serverTimestamps: 'estimate' }) : {};
    myPad = { text: String(x.text || ''), ms: x.ts?.toMillis ? x.ts.toMillis() : 0 };
    if (view === 'notes') renderNotes();
  }, () => {});
}
function openNotes(){
  if (!db || !myId) { termLine('<span class="r1">not signed in</span>'); return; }
  if (panic) togglePanic(false);
  notesOpen = true; view = 'notes';
  renderTabs(); render(); editor.scrollTop = 0;
}
function closeNotes(){ notesOpen = false; if (view === 'notes') { view = 'room'; scrollBottom = true; } renderTabs(); render(); }
function todoListHtml(){
  const open = myTodos.filter(t => !t.done), done = myTodos.filter(t => t.done);
  return [...open, ...done].map(t => `<div class="td${t.done ? ' done' : ''}"><span class="tdc" data-toggle="${esc(t.id)}">${t.done ? '☑' : '☐'}</span><span class="tdt">${esc(t.text)}</span><span class="bnx" data-deltodo="${esc(t.id)}" title="Delete">✕</span></div>`).join('')
    || '<div class="pads" style="padding:2px 0 4px">nothing yet</div>';
}
function renderNotes(){
  const existing = editor.querySelector('.nv');
  const stats = `${myTodos.filter(t => t.done).length}/${myTodos.length} done`;
  if (existing) {   // live update without destroying what you're typing
    $('todoList').innerHTML = todoListHtml();
    $('todoStats').textContent = stats;
    if ($('readStats')) $('readStats').innerHTML = readingHtml();
    const pad = $('padIn');
    if (document.activeElement !== pad && pad.value !== myPad.text) pad.value = myPad.text;
    return;
  }
  editor.innerHTML = `<div class="bk nv"><div class="bkhead"><span class="bkt">${esc(docName('notes'))}</span><span>private · only you can see this</span><span class="sp"></span><span id="todoStats">${stats}</span></div>
    <div class="nvsec"><div class="nvh">${skin === 'vscode' || skin === 'terminal' ? '## ' : ''}To-do</div><div id="todoList">${todoListHtml()}</div></div>
    <div class="tdadd"><input id="todoIn" maxlength="300" placeholder="+ Add a task — Enter to save" autocomplete="off"></div>
    <div class="nvsec"><div class="nvh">${skin === 'vscode' || skin === 'terminal' ? '## ' : ''}Reading</div><div id="readStats">${readingHtml()}</div></div>
    <div class="nvsec"><div class="nvh">${skin === 'vscode' || skin === 'terminal' ? '## ' : ''}Notes</div><textarea class="nvpad" id="padIn" maxlength="20000" placeholder="Anything — saved automatically, synced to your account"></textarea><div class="pads" id="padStatus">${myPad.ms ? 'saved ' + hhmm(myPad.ms) : ''}</div></div></div>`;
  $('padIn').value = myPad.text;
  $('todoIn').addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = e.target.value.trim(); if (!v) return;
    e.target.value = '';
    try { await addDoc(todoCol(), { text: v.slice(0, 300), done: false, ts: serverTimestamp() }); }
    catch (err) { termLine(`<span class="r1">error: ${esc(err?.code || 'unknown')}</span>`); }
  });
  let padTimer = null;
  $('padIn').addEventListener('input', e => {
    $('padStatus').textContent = 'editing…';
    clearTimeout(padTimer);
    padTimer = setTimeout(async () => {
      try { await setDoc(padDoc(), { text: e.target.value.slice(0, 20000), ts: serverTimestamp() }); $('padStatus') && ($('padStatus').textContent = 'saved ' + hhmm(Date.now())); }
      catch (err) { $('padStatus') && ($('padStatus').textContent = 'not saved — ' + (err?.code || 'error')); }
    }, 1200);
  });
}
async function notesClick(e){
  if (e.target.closest('#shareRead')) { shareReading(); return; }
  const tg = e.target.closest('[data-toggle]');
  if (tg) { const t = myTodos.find(x => x.id === tg.dataset.toggle); if (t) { try { await setDoc(doc(db, 'users', myId, 'todos', t.id), { text: t.text, done: !t.done, ts: serverTimestamp() }); } catch (err) {} } return; }
  const dl = e.target.closest('[data-deltodo]');
  if (dl) { try { await deleteDoc(doc(db, 'users', myId, 'todos', dl.dataset.deltodo)); } catch (err) {} }
}

// ---------- message board (per room) ----------
const boardKey = r => `bs_${myId}_${r?.id}`;
const boardLastSeen = r => +store.get(boardKey(r), '0') || 0;
function boardUnreadCount(r){
  if (!r || !r.board) return 0;
  const seen = boardLastSeen(r);
  return r.board.filter(p => !p.parent && p.uid !== myId && p.ms > seen).length;
}
function markBoardSeen(r){ if (r?.id) { store.set(boardKey(r), String(Date.now())); updateBoardBadge(); } }
function updateBoardBadge(){
  const n = boardUnreadCount(cur());
  $('boardBadge').textContent = n ? String(n) : '';
  document.querySelectorAll('.tab[data-doc="board"]').forEach(t => t.classList.toggle('unread', n > 0));
}
function subscribeBoard(r){
  if (!db || !r.id) return;
  if (r.boardUnsub) r.boardUnsub();
  r.boardUnsub = onSnapshot(query(collection(db, 'rooms', r.id, 'board'), orderBy('ts', 'desc'), limit(150)), s => {
    const list = s.docs.map(d => { const x = d.data({ serverTimestamps: 'estimate' });
      return { id: d.id, uid: x.uid, name: x.name, text: String(x.text || ''), to: x.to || null, toName: x.toName || null, parent: x.parent || null, ms: x.ts?.toMillis ? x.ts.toMillis() : Date.now() }; });
    const fresh = list.filter(p => !r.boardSeen.has(p.id)); fresh.forEach(p => r.boardSeen.add(p.id));
    r.board = list;
    if (r.boardFirst) {
      r.boardFirst = false;
      const n = boardUnreadCount(r);
      if (n && alertMode !== 'quiet') showToast(`${esc(docName('board'))}: ${n} new entr${n > 1 ? 'ies' : 'y'} since your last visit<small>${esc(tabLabel(rooms.indexOf(r)))} · click to open</small>`, () => { switchRoom(rooms.indexOf(r)); openBoard(); });
    } else {
      const others = fresh.filter(p => p.uid !== myId);
      const isHere = view === 'board' && cur() === r && !isAway();
      if (others.length && !isHere) notifyBoard(r, others);
      if (isHere) markBoardSeen(r);
    }
    updateBoardBadge();
    if (view === 'board' && cur() === r) renderBoard();
  }, e => termLine(`<span class="y1">warning: board unavailable (${esc(e?.code || 'unknown')})</span>`));
}
function notifyBoard(r, posts){
  if (alertMode === 'quiet' || panic) return;
  const forMe = posts.some(p => p.to === myId);
  const from = [...new Set(posts.map(p => displayName(p)))].slice(0, 3).map(esc).join(', ');
  const name = esc(docName('board'));
  const text = skin === 'terminal' ? `${from} pushed to ${name}${forMe ? ' (mentions you)' : ''}<small>click to view</small>`
    : `${from} updated ${name}${forMe ? ' — <b>for you</b>' : ''}<small>${esc(tabLabel(rooms.indexOf(r)))} · click to open</small>`;
  showToast(text, () => { switchRoom(rooms.indexOf(r)); openBoard(); });
  const st = document.querySelector('.status');
  st.classList.remove('alert'); void st.offsetWidth; st.classList.add('alert');
  if (document.hidden || !document.hasFocus()) { startBlink(); osNotify(posts.length, 'board'); }
}
function openBoard(){
  const r = cur();
  if (!db || !r?.id) { termLine('<span class="r1">open a workspace first (:room)</span>'); return; }
  if (panic) togglePanic(false);
  boardOpen = true; view = 'board';
  r._boardSeenAtOpen = boardLastSeen(r);   // keep "new" marks visible while you're reading
  renderTabs(); render(); editor.scrollTop = 0;
  markBoardSeen(r);
}
function closeBoard(){ boardOpen = false; if (view === 'board') { view = 'room'; scrollBottom = true; } renderTabs(); render(); }
function boardMembers(r){
  const m = new Map();
  (r.msgs || []).forEach(x => x.uid && x.uid !== myId && m.set(x.uid, displayName(x)));
  (r.board || []).forEach(x => x.uid && x.uid !== myId && m.set(x.uid, displayName(x)));
  peersOf(r).forEach(p => p.uid !== myId && m.set(p.uid, p.name));
  return [...m.entries()];
}
function fmtDay(ms){ const d = new Date(ms); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + hhmm(ms); }
function boardListHtml(r){
  const seen = r._boardSeenAtOpen ?? boardLastSeen(r);
  const tops = r.board.filter(p => !p.parent), reps = r.board.filter(p => p.parent).slice().reverse();
  if (!tops.length) return '<div class="bkempty">No entries yet — leave the first note for your friends.</div>';
  return tops.map(p => {
    const isNew = p.uid !== myId && p.ms > seen;
    return `<div class="bvp${isNew ? ' unseen' : ''}${p.to === myId ? ' forme' : ''}" style="--mc:${colorOf(p)}">
      <div class="bvhash">commit ${hash(p.id).toString(16).padStart(8, '0')}${hash(p.id + 'x').toString(16).slice(0, 4)}</div>
      <div class="bnh"><span class="bav">${esc(displayName(p).slice(0, 1).toUpperCase())}</span><b>${esc(displayName(p))}</b>${p.toName ? `<span class="bvto">→ <b>${esc(p.toName)}</b></span>` : ''}<span class="bnt">${fmtDay(p.ms)}</span>${isNew ? '<span class="bvnewtag">new</span>' : ''}${p.uid === myId ? `<span class="bnx" data-delpost="${esc(p.id)}" title="Delete">✕</span>` : ''}</div>
      <div class="bnb">${esc(p.text)}</div>
      ${reps.filter(x => x.parent === p.id).map(x => `<div class="bnr2" style="--mc:${colorOf(x)}"><b>${esc(displayName(x))}</b><span class="tx">${esc(x.text)}</span>${x.uid === myId ? `<span class="bnx" data-delpost="${esc(x.id)}" title="Delete">✕</span>` : ''}</div>`).join('')}
      <span class="bnrep" data-breply="${esc(p.id)}">Reply</span></div>`;
  }).join('');
}
function renderBoard(){
  const r = cur();
  if (!r) { view = 'room'; render(); return; }
  const existing = editor.querySelector('.bv');
  if (existing && existing.dataset.room === r.id) {
    $('bvList').innerHTML = boardListHtml(r);
    $('bvCount').textContent = `${r.board.filter(p => !p.parent).length} entries`;
    return;
  }
  const opts = boardMembers(r).map(([uid, n]) => `<option value="${esc(uid)}">to: ${esc(n)}</option>`).join('');
  editor.innerHTML = `<div class="bk bv" data-room="${esc(r.id)}"><div class="bkhead"><span class="bkt">${esc(docName('board'))}</span><span>${esc(tabLabel(active))}</span><span class="sp"></span><span id="bvCount">${r.board.filter(p => !p.parent).length} entries</span></div>
    <div class="bvnew"><textarea id="boardIn" maxlength="2000" placeholder="Leave a note for the group… (${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to post)"></textarea>
      <div class="bvbar"><select id="boardTo"><option value="">to: everyone</option>${opts}</select><span class="sp"></span><span class="bkb" id="boardPost">Post</span></div></div>
    <div id="bvList">${boardListHtml(r)}</div></div>`;
  const post = async () => {
    const ta = $('boardIn'), v = ta.value.trim(); if (!v) return;
    const sel = $('boardTo'), to = sel.value;
    const d = { uid: myId, name: nick, text: v.slice(0, 2000), ts: serverTimestamp() };
    if (to) { d.to = to; d.toName = sel.options[sel.selectedIndex].text.replace(/^to: /, '').slice(0, 16); }
    ta.value = '';
    try { await addDoc(collection(db, 'rooms', r.id, 'board'), d); }
    catch (err) { ta.value = v; termLine(`<span class="r1">error: post failed (${esc(err?.code || 'unknown')})</span>`); }
  };
  $('boardPost').addEventListener('click', post);
  $('boardIn').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); post(); } });
}
async function boardClick(e){
  const r = cur(); if (!r) return;
  const rp = e.target.closest('[data-breply]');
  if (rp) {
    const p = r.board.find(x => x.id === rp.dataset.breply);
    const t = await ask(`Reply to ${p ? displayName(p) : ''}`, 'Your reply');
    if (t && p) { try { await addDoc(collection(db, 'rooms', r.id, 'board'), { uid: myId, name: nick, text: t.slice(0, 2000), parent: p.id, ts: serverTimestamp() }); } catch (err) { termLine(`<span class="r1">error: ${esc(err?.code || 'unknown')}</span>`); } }
    return;
  }
  const dl = e.target.closest('[data-delpost]');
  if (dl) { try { await deleteDoc(doc(db, 'rooms', r.id, 'board', dl.dataset.delpost)); } catch (err) { termLine(`<span class="r1">error: ${esc(err?.code || 'unknown')}</span>`); } }
}
