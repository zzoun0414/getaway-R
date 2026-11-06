'use strict';
// Firebase wiring: presence (Realtime Database) and messages (Firestore)

// ---------- presence (Realtime Database) ----------
let presenceWarned = false;
function presenceWarn(e){
  if (presenceWarned) return; presenceWarned = true;
  termLine(`<span class="y1">warning: live share unavailable (${esc(e?.code || e?.message || 'unknown')}) — online list / typing disabled</span>`);
}
const presRefFor = r => dbRef(rtdb, `presence/${r.id}/${myId}`);
const presData = r => Object.assign({ name: (nick || 'dev').slice(0,16), typing: false, away: document.hidden, t: rtdbNow() },
  book && book.room === r ? { rb: book.id, rp: book.page + 1 } : {});
async function joinPresence(r){
  if (!rtdb || !r.id || !myId) return;
  const pr = presRefFor(r);
  try { await onDisconnect(pr).remove(); await dbSet(pr, presData(r)); }
  catch(e){ presenceWarn(e); return; }
  if (r.presOff) r.presOff();
  r.presOff = onValue(dbRef(rtdb, `presence/${r.id}`), snap => {
    r.peers = snap.val() || {};
    if (rooms[active] === r || (book && book.room === r)) updatePeers();
  }, e => presenceWarn(e));
}
function leavePresence(r){
  if (r.presOff) { r.presOff(); r.presOff = null; }
  if (rtdb && r.id && myId) dbRemove(presRefFor(r)).catch(() => {});
}
function setAway(away){
  if (!rtdb || !myId) return;
  rooms.forEach(r => r.id && dbUpdate(presRefFor(r), { away }).catch(() => {}));
}

// ---------- messages (Firestore) ----------
function mapMsg(d){
  const data = d.data({ serverTimestamps: 'estimate' });
  const re = data.re && typeof data.re === 'object' ? { id: String(data.re.id || ''), name: String(data.re.name || ''), text: String(data.re.text || '') } : null;
  return { id: d.id, uid: data.uid, name: data.name, text: typeof data.text === 'string' ? data.text : '', img: typeof data.img === 'string' ? data.img : null, re,
    at: Array.isArray(data.at) ? data.at.map(String) : null, edited: !!data.edited, recalled: !!data.recalled, ms: data.ts?.toMillis ? data.ts.toMillis() : Date.now() };
}
async function subscribe(r){
  r.id = await roomKey(r.code);
  const label = r.id.slice(0, 6);
  termLine(`<span class="d1">Connecting to remote workspace ${label}…</span>`);
  const timer = setTimeout(() => termLine(`<span class="y1">warning: ${label} is slow to respond — check your network</span>`), 10000);
  const q = query(collection(db, 'rooms', r.id, 'msgs'), orderBy('ts', 'desc'), limit(150));
  r.unsub = onSnapshot(q, snap => {
    clearTimeout(timer);
    const list = snap.docs.map(mapMsg).filter(m => m.text || m.img || m.recalled).reverse();
    let incoming = 0; const fresh = [];
    for (const m of list) {
      if (!r.seen.has(m.id)) { r.seen.add(m.id); if (!r.first) { m._new = true; if (m.uid !== myId) { incoming++; fresh.push(m); } } }
    }
    r.msgs = list;
    const isActive = rooms[active] === r;
    if (r.first) armDivider(r);
    if (r.first && isActive) scrollBottom = true;
    if (incoming && (!isActive || view === 'recipe' || isAway())) { r.unread += incoming; updateUnread(); notify(r, fresh); }
    if (r.first) termLine(`<span class="g1">✔ connected</span> <span class="d1">${label} (${list.length} entries)</span>`);
    r.first = false;
    if (isActive && view === 'room') { render(); $('roomLabel').textContent = roomLabelText(); }
  }, err => {
    clearTimeout(timer);
    termLine(`<span class="r1">error: ${label} disconnected (${esc(err?.code||'unknown')}) — reload to reconnect</span>`);
  });
  joinPresence(r);
  subscribeBoard(r);
}
async function addRoom(code){
  const id = await roomKey(code);
  const existing = rooms.findIndex(r => r.id === id || r.code === code);
  if (existing >= 0) { switchRoom(existing); termLine('<span class="d1">workspace already open — switched tab</span>'); return; }
  if (rooms.length >= MAX_ROOMS) { termLine(`<span class="r1">error: too many open editors (max ${MAX_ROOMS}) — :close one first</span>`); return; }
  const r = newRoom(code);
  rooms.push(r);
  stopTyping();
  active = rooms.length - 1; saveRooms();
  view = 'room'; scrollBottom = true; setReply(null); renderTabs(); render();
  await subscribe(r);
  renderTabs();
}
