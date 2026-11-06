'use strict';
// Unread counts & alerts, room tabs, the fake terminal, quick input box

// ---------- unread + alerts ----------
let baseTitle = document.title, blinkTimer = null, toastTimer = null, toastAction = null;
const totalUnread = () => rooms.reduce((a, r) => a + r.unread, 0);
function updateUnread(){
  const n = totalUnread();
  $('probStatus').innerHTML = skin === 'excel' ? (n ? `Accessibility: Investigate (${n})` : 'Accessibility: Good to go')
    : skin === 'notion' ? (n ? `${n} new comment${n>1?'s':''}` : '')
    : skin === 'terminal' ? (n ? `[${n}]` : '')
    : `⊗ 0 &nbsp;⚠ ${n}`;
  $('probBadge').textContent = n;
  document.querySelectorAll('.tab').forEach(t => { const r = rooms[+t.dataset.i]; t.classList.toggle('unread', !!(r && r.unread)); });
  $('bell').classList.toggle('has', n > 0);
  baseTitle = windowTitle();
  if (!blinkTimer) document.title = (n ? '● ' : '') + baseTitle;
  if (n === 0) stopBlink();
}
function clearActiveUnread(){ if (cur() && cur().unread) { cur().unread = 0; updateUnread(); } }
const isAway = () => document.hidden || panic || !document.hasFocus();
function startBlink(){
  if (blinkTimer) return;
  let on = false;
  blinkTimer = setInterval(() => { on = !on; document.title = on ? `(${totalUnread()}) ● ${baseTitle}` : baseTitle; }, 1000);
}
function stopBlink(){ if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; } document.title = (totalUnread() ? '● ' : '') + baseTitle; }
function showToast(html, action){
  const t = $('toast');
  $('toastText').innerHTML = html;
  toastAction = typeof action === 'number' ? (action >= 0 ? goRoomFn(action) : null) : action || null;
  t.hidden = false; requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 5000);
}
function hideToast(){ const t = $('toast'); t.classList.remove('show'); setTimeout(() => { if (!t.classList.contains('show')) t.hidden = true; }, 200); }
$('toast').addEventListener('click', e => {
  hideToast();
  if (e.target.id === 'toastX' || !toastAction) return;
  if (panic) togglePanic(false);
  toastAction();
});
const goRoomFn = idx => () => { if (view !== 'room') view = 'room'; switchRoom(idx); renderTabs(); render(); clearActiveUnread(); };
function notify(r, newMsgs){
  if (alertMode === 'quiet' || panic) return;   // boss mode: count silently
  const mention = newMsgs.filter(mentionsMe);
  if (isMuted(r) && !mention.length) return;    // muted room: count only, unless someone @-mentions you
  const idx = rooms.indexOf(r);
  const from = [...new Set((mention.length ? mention : newMsgs).map(m => displayName(m)))].slice(0, 3).map(esc).join(', ');
  const n = newMsgs.length;
  const where = esc(tabLabel(idx));
  if (mention.length) {
    const t = skin === 'excel' ? `${from} @mentioned you in <b>${where}</b><small>Q4_order_sync.xlsx · click to view</small>`
      : skin === 'notion' ? `${from} mentioned you in <b>${where}</b><small>click to open</small>`
      : skin === 'terminal' ? `Bell in window ${where}<small>click to switch</small>`
      : `${from} requested your review<small>${where} · click to open</small>`;
    showToast(t, idx);
    const st = document.querySelector('.status');
    st.classList.remove('alert'); void st.offsetWidth; st.classList.add('alert');
    if (document.hidden || !document.hasFocus()) { startBlink(); osNotify(1, 'mention', idx); }
    return;
  }
  const text = skin === 'excel' ? `${from} edited <b>${where}</b> (${n} change${n>1?'s':''})<small>Q4_order_sync.xlsx · click to view</small>`
    : skin === 'notion' ? `${from} commented on <b>${where}</b><small>${n} new · click to open</small>`
    : skin === 'terminal' ? `Activity in window ${where}<small>${n} new line${n>1?'s':''} · click to switch</small>`
    : `Source Control: ${n} incoming change${n>1?'s':''} from ${from}<small>${where} · click to open</small>`;
  showToast(text, idx);
  const st = document.querySelector('.status');
  st.classList.remove('alert'); void st.offsetWidth; st.classList.add('alert');
  if (document.hidden || !document.hasFocus()) { startBlink(); osNotify(n, 'chat', idx); }
}
window.addEventListener('focus', () => { stopBlink(); if (!panic) clearActiveUnread(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && cur() && view === 'room') { armDivider(cur()); render(); }
  if (!document.hidden && !panic && document.hasFocus()) clearActiveUnread();
  if (document.hidden && isMobile() && !panic) togglePanic(true);   // phone: leaving the browser hides the chat
  setAway(document.hidden);
});
$('bell').addEventListener('click', () => {
  const i = rooms.findIndex(r => r.unread);
  if (i < 0) { showToast('No new notifications', null); return; }
  if (panic) togglePanic(false);
  if (view === 'recipe') view = 'room';
  switchRoom(i); renderTabs(); render(); clearActiveUnread();
});

// ---------- rooms / tabs ----------
function switchRoom(i){
  if (!rooms[i]) return;
  if (view !== 'room') view = 'room';
  else if (i === active) return;
  stopTyping();
  active = i; saveRooms();
  rooms[i].unread = 0;
  armDivider(rooms[i]);
  scrollBottom = true;
  setReply(null);
  renderTabs(); render(); updateBoardBadge();
}
async function closeRoom(i){
  const r = rooms[i]; if (!r) return;
  if (r.unsub) r.unsub();
  if (r.boardUnsub) r.boardUnsub();
  leavePresence(r);
  rooms.splice(i, 1);
  if (active >= rooms.length) active = Math.max(0, rooms.length - 1);
  else if (i < active) active--;
  saveRooms(); scrollBottom = true; setReply(null); renderTabs(); render();
  termLine(`<span class="d1">closed workspace ${r.id ? r.id.slice(0,6) : ''}</span>`);
}
function openRecipe(){
  if (panic) togglePanic(false);
  recipeOpen = true; view = 'recipe';
  renderTabs(); render();
}
function closeRecipe(){
  recipeOpen = false; view = 'room'; scrollBottom = true;
  renderTabs(); render();
}
$('tabs').addEventListener('click', e => {
  const xd = e.target.closest('[data-xdoc]');
  if (xd) { e.stopPropagation(); ({ book: closeBook, board: closeBoard, notes: closeNotes, recipe: closeRecipe })[xd.dataset.xdoc](); return; }
  const x = e.target.closest('[data-x]');
  if (x) { e.stopPropagation(); closeRoom(+x.dataset.x); return; }
  const t = e.target.closest('.tab'); if (!t) return;
  if (t.dataset.doc === 'recipe') { if (view !== 'recipe') { view = 'recipe'; renderTabs(); render(); } return; }
  if (t.dataset.doc === 'book') { if (view !== 'book') { view = 'book'; renderTabs(); render(); editor.scrollTop = 0; } else togglePanic(); return; }
  if (t.dataset.doc === 'board') { if (view !== 'board') openBoard(); else togglePanic(); return; }
  if (t.dataset.doc === 'notes') { if (view !== 'notes') openNotes(); else togglePanic(); return; }
  const i = +t.dataset.i;
  if (i === active && view === 'room') togglePanic(); else switchRoom(i);
});
$('recipeFile').addEventListener('click', openRecipe);
$('boardFile').addEventListener('click', () => openBoard());
$('notesFile').addEventListener('click', () => openNotes());

// ---------- fake terminal ----------
const ROUTES = ['/api/v1/orders','/api/v1/orders/sync','/api/v1/auth/refresh','/api/v1/tenants','/healthz','/api/v1/inventory','/api/v1/webhooks/stripe'];
const TESTS = ['sync.service.spec.ts','order.repository.spec.ts','auth.guard.spec.ts','retry.util.spec.ts','tenant.middleware.spec.ts','cache.key.spec.ts'];
const pick = a => a[Math.floor(Math.random()*a.length)];
const now8 = () => new Date().toTimeString().slice(0,8);
const GEN = [
  () => `<span class="d1">[${now8()}]</span> <span class="g1">GET</span>  ${pick(ROUTES)} <span class="g1">200</span> <span class="d1">${(Math.random()*40+3|0)}ms</span>`,
  () => `<span class="d1">[${now8()}]</span> <span class="y1">POST</span> ${pick(ROUTES)} <span class="g1">201</span> <span class="d1">${(Math.random()*90+10|0)}ms</span>`,
  () => `<span class="g1">[Nest]</span> ${40000+(Math.random()*999|0)}  - <span class="d1">${new Date().toLocaleString('en-US')}</span>     <span class="g1">LOG</span> <span class="y1">[SyncService]</span> <span class="g1">batch processed: ${Math.random()*50|0} items</span>`,
  () => `<span class="b1">webpack</span> compiled <span class="g1">successfully</span> in ${(Math.random()*1800+300|0)} ms`,
  () => `<span class="g1"> PASS </span> test/${pick(TESTS)} <span class="d1">(${(Math.random()*4+.4).toFixed(2)} s)</span>`,
  () => `<span class="d1">[redis]</span> cache ${Math.random()>.3?'<span class="g1">HIT</span>':'<span class="y1">MISS</span>'} orders:${(Math.random()*1e6|0).toString(36)}`,
  () => `<span class="m1">prisma:query</span> SELECT "public"."Order"."id", "public"."Order"."status" FROM "public"."Order" WHERE "status" = $1 LIMIT $2`,
  () => `<span class="d1">[${now8()}]</span> <span class="y1">WARN</span>  retry ${1+(Math.random()*2|0)}/3 reconcile(${(Math.random()*1e8|0).toString(16)}) — upstream timeout`,
  () => `<span class="d1">  ✓ ${pick(['should retry on 503','should skip empty batch','handles duplicate webhook','builds tenant-scoped key','marks synced after upsert'])} (${Math.random()*30|0} ms)</span>`,
  () => `<span class="b1">[tsc]</span> File change detected. Starting incremental compilation...`,
  () => `<span class="b1">[tsc]</span> Found 0 errors. Watching for file changes.`,
];
function termLine(html){
  const near = term.scrollHeight - term.scrollTop - term.clientHeight < 40;
  const d = document.createElement('div'); d.innerHTML = html; term.appendChild(d);
  while (term.childElementCount > 300) term.firstChild.remove();
  if (near) term.scrollTop = term.scrollHeight;
}
const SPEEDS = { off: null, slow: [2500, 4500], normal: [900, 2200], fast: [250, 1300] };
let logSpeed = store.get('logs', 'slow');
(function tick(){
  const sp = SPEEDS[logSpeed];
  if (sp) termLine(pick(GEN)());
  setTimeout(tick, sp ? sp[0] + Math.random()*sp[1] : 1000);
})();
for (let i=0;i<8;i++) termLine(pick(GEN)());

// ---------- quick input ----------
let qiCancel = null;
$('qiX').addEventListener('mousedown', e => { e.preventDefault(); qiCancel && qiCancel(); });
document.addEventListener('mousedown', e => { if (!$('qi').hidden && qiCancel && !$('qi').contains(e.target)) qiCancel(); });
function ask(title, placeholder, value='', password=false){
  return new Promise(resolve => {
    const qi = $('qi'), qin = $('qiInput');
    $('qiTitle').textContent = title;
    qin.placeholder = placeholder; qin.value = value; qin.type = password ? 'password' : 'text';
    $('qiList').hidden = true; $('qiTitle').classList.remove('err');
    qi.hidden = false; qin.focus(); if (value) qin.select(); setTimeout(() => { if (document.activeElement !== qin) qin.focus(); }, 0);
    const done = v => { qi.hidden = true; qiCancel = null; qin.removeEventListener('keydown', onKey); resolve(v); };
    qiCancel = () => done(null);
    const onKey = e => {
      e.stopPropagation();
      if (e.key === 'Enter' && qin.value.trim()) done(qin.value.trim());
      if (e.key === 'Escape') done(null);
    };
    qin.addEventListener('keydown', onKey);
  });
}
